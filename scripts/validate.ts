import { resolve } from "node:path";
import { get_validator, format_errors } from "./lib/schema.js";
import { read_entry } from "./lib/entries.js";
import { fetch_metadata } from "./lib/fetch-metadata.js";
import {is_valid_slug, SUPPORTED_SCHEMA_VERSION} from "./lib/config.js";

const files = process.argv.slice(2).filter(f => f.endsWith(".json"));
if (files.length === 0) {
    console.log("no world entry files to validate");
    process.exit(0);
}

const validate = await get_validator();
let failed = 0;

// validate metadata of all files in a pr
for (const file of files) {
    try {
        const entry = await read_entry(resolve(process.cwd(), file));

        if (!is_valid_slug(entry.slug)) {
            throw new Error(`filename must be a lowercase slug (a-z, 0-9, hyphens): "${entry.slug}"`);
        }

        const result = await fetch_metadata(entry, null);
        if (result.status !== "ok") {
            throw new Error(`could not fetch metadata: ${result.status === "error" ? result.error : result.status}`);
        }

        const meta = result.metadata;
        if (typeof meta.version === "number" && meta.version > SUPPORTED_SCHEMA_VERSION) {
            throw new Error(`declares metadata version ${meta.version}; indexer supports up to ${SUPPORTED_SCHEMA_VERSION}`);
        }
        if (!validate(meta)) {
            throw new Error(`metadata failed schema validation:\n${format_errors(validate.errors)}`);
        }
        if (!meta.title) throw new Error("metadata has no title (required to be indexable)");

        console.log(`✓ ${file} (${entry.url}): "${meta.title}"`);
    } catch (err) {
        failed++;
        console.error(`✗ ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
}

if (failed > 0) {
    console.error(`\n${failed} of ${files.length} entries failed validation`);
    process.exit(1);
}
console.log(`\nall ${files.length} entries valid`);
