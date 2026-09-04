import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { get_validator, format_errors } from "./lib/schema.js";
import { read_entry } from "./lib/entries.js";
import { fetch_metadata } from "./lib/fetch-metadata.js";
import { is_valid_slug, MAX_SLUG_LENGTH, SUPPORTED_SCHEMA_VERSION, DOCS_BASE_URL } from "./lib/config.js";
import type { FetchResult } from "./lib/types.js";

const REPORT_PATH = resolve(process.cwd(), "validation-report.md");
const MARKER = "<!-- hvr-validation -->";
const DOCS_BASE = (process.env.DOCS_BASE_URL ?? DOCS_BASE_URL).replace(/\/+$/, "");

// human readable explanation of a validation failure, used in the PR comment and report
interface Diagnosis {
    label: string; // short label for the summary table and section heading
    explanation: string; // markdown sentence(s) shown in the detail section
    docs?: string;
}

// carries a Diagnosis up through the per-file try/catch
class ValidationError extends Error {
    constructor(public diagnosis: Diagnosis) {
        super(diagnosis.label);
    }
}

// map a failed metadata fetch to a friendly explanation based on the HTTP status
const diagnose_fetch = (result: Extract<FetchResult, { status: "error" }>, url: string): Diagnosis => {
    const status = result.http_status;

    if (status === 403) {
        return {
            label: "Access denied",
            explanation:
                `The request for \`hvr-world.json\` at \`${url}\` was refused with **HTTP 403 Forbidden**. ` +
                "If this resource is protected by authentication, it cannot be used in the index. " +
                "Otherwise, this almost always means a WAF or bot-protection service (such as Cloudflare Bot Fight Mode) " +
                "challenged the indexer rather than the file being missing. The world host needs to allow the " +
                "indexer through. See the guide below for how to fix this.",
            docs: "waf-block.md"
        };
    }
    if (status === 404) {
        return {
            label: "Metadata not found",
            explanation:
                `No \`hvr-world.json\` was found for \`${url}\` (**HTTP 404 Not Found**). ` +
                "Check that the world URL is correct and that `hvr-world.json` is published next to it."
        };
    }
    if (status !== undefined && status >= 500) {
        return {
            label: "Temporary server error",
            explanation:
                `\`${url}\` returned **HTTP ${status}**, a temporary server-side problem. ` +
                "This is usually transient. Wait a moment and push again (or re-run the check) to retry."
        };
    }
    if (status !== undefined && status >= 400) {
        return {
            label: `Request rejected (HTTP ${status})`,
            explanation:
                `\`${url}\` returned **HTTP ${status}** when fetching \`hvr-world.json\`. ` +
                "Check that the file is publicly reachable at that path."
        };
    }
    // no HTTP status: network error, timeout, or invalid JSON
    return {
        label: "Could not read metadata",
        explanation:
            `The indexer could not read valid metadata for \`${url}\`.\n\n\`\`\`\n${result.error}\n\`\`\``
    };
};

interface FileResult {
    file: string;
    url?: string;
    ok: boolean;
    title?: string;
    diagnosis?: Diagnosis;
}

const render_report = (results: FileResult[]): string => {
    const failed = results.filter(r => !r.ok);
    const lines: string[] = [MARKER, "## World entry validation", ""];

    if (results.length === 0) {
        lines.push("No world entries were changed in this PR.", "");
        return lines.join("\n");
    }

    const noun = results.length === 1 ? "entry" : "entries";
    if (failed.length === 0) {
        lines.push(`✅ All ${results.length} ${noun} passed validation.`, "");
    } else {
        lines.push(`❌ **${failed.length} of ${results.length} ${noun} failed validation.**`, "");
    }

    lines.push("| Entry | Result |", "| --- | --- |");
    for (const r of results) {
        const result = r.ok ? `✅ ${r.title ? `"${r.title}"` : "valid"}` : `❌ ${r.diagnosis!.label}`;
        lines.push(`| \`${r.file}\` | ${result} |`);
    }
    lines.push("");

    for (const r of failed) {
        const d = r.diagnosis!;
        lines.push(`### \`${r.file}\` — ${d.label}`, "");
        if (r.url) lines.push(`World URL: \`${r.url}\``, "");
        lines.push(d.explanation, "");
        if (d.docs) lines.push(`[How to fix this →](${DOCS_BASE}/${d.docs})`, "");
    }

    return lines.join("\n");
};

const files = process.argv.slice(2).filter(f => f.endsWith(".json"));

const validate = await get_validator();
const results: FileResult[] = [];

// validate metadata of all changed files in a pr, collecting a diagnosis per failure
for (const file of files) {
    let url: string | undefined;
    try {
        const entry = await read_entry(resolve(process.cwd(), file));
        url = entry.url;

        if (!is_valid_slug(entry.slug)) {
            throw new ValidationError({
                label: "Invalid filename",
                explanation:
                    `The filename must be a lowercase slug (\`a-z\`, \`0-9\`, hyphens), 1–${MAX_SLUG_LENGTH} characters. ` +
                    `Got \`${entry.slug}\`.`
            });
        }

        const result = await fetch_metadata(entry, null);
        if (result.status === "error") {
            throw new ValidationError(diagnose_fetch(result, entry.url));
        }
        // not-modified can't happen with a null snapshot, but keep the type check honest
        if (result.status !== "ok") {
            throw new ValidationError({
                label: "Could not read metadata",
                explanation: `Unexpected fetch result \`${result.status}\` for \`${entry.url}\`.`
            });
        }

        const meta = result.metadata;
        if (typeof meta.version === "number" && meta.version > SUPPORTED_SCHEMA_VERSION) {
            throw new ValidationError({
                label: "Unsupported metadata version",
                explanation:
                    `This entry declares metadata version ${meta.version}, but the indexer supports up to ` +
                    `${SUPPORTED_SCHEMA_VERSION}. Update the indexer or lower the declared version.`
            });
        }
        if (!validate(meta)) {
            throw new ValidationError({
                label: "Failed schema validation",
                explanation:
                    "The metadata does not match the required schema:\n\n```\n" +
                    format_errors(validate.errors) +
                    "\n```"
            });
        }
        if (!meta.title) {
            throw new ValidationError({
                label: "Missing title",
                explanation: "The metadata has no `title`, which is required for a world to be indexable."
            });
        }

        results.push({ file, url, ok: true, title: meta.title });
        console.log(`✓ ${file} (${entry.url}): "${meta.title}"`);
    } catch (err) {
        const diagnosis =
            err instanceof ValidationError
                ? err.diagnosis
                : { label: "Unexpected error", explanation: String(err instanceof Error ? err.message : err) };
        results.push({ file, url, ok: false, diagnosis });
        console.error(`✗ ${file}: ${diagnosis.label}`);
    }
}

writeFileSync(REPORT_PATH, render_report(results));

const failed = results.filter(r => !r.ok).length;
if (failed > 0) {
    console.error(`\n${failed} of ${results.length} entries failed validation`);
    process.exit(1);
}
console.log(`\nall ${results.length} entries valid`);
