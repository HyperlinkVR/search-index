import MiniSearch from "minisearch";
import pLimit from "p-limit";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { get_validator, format_errors } from "./lib/schema.js";
import { read_entries, read_snapshot, write_snapshot } from "./lib/entries.js";
import { fetch_metadata } from "./lib/fetch-metadata.js";
import { to_document } from "./lib/extract.js";
import {
    DIST_DIR, HOST_CONCURRENCY, PER_HOST_DELAY_MS, JITTER_MS, SUPPORTED_SCHEMA_VERSION,
    MINISEARCH_FIELDS, MINISEARCH_STORE, MINISEARCH_SEARCH_OPTIONS, is_valid_slug, SLUG_RE, MAX_SLUG_LENGTH
} from "./lib/config.js";
import type { WorldEntry, SearchDocument, FetchResult } from "./lib/types.js";

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));
const host_of = (url: string): string => { try { return new URL(url).host; } catch { return url; } };

const validate = await get_validator();
const all_entries = await read_entries();

const entries = all_entries.filter(e => {
    if (is_valid_slug(e.slug)) return true;
    console.warn(`! ${e.slug}: not a valid lowercase slug - skipped`);
    return false;
});

const stats = { fresh: 0, unchanged: 0, stale_kept: 0, dropped: 0, skipped: all_entries.length - entries.length };
const docs: SearchDocument[] = [];

const process_entry = async (entry: WorldEntry): Promise<void> => {
    const prior = await read_snapshot(entry.slug);

    let result: FetchResult;
    try {
        result = await fetch_metadata(entry, prior);
    } catch (err) {
        result = { status: "error", error: err instanceof Error ? err.message : String(err) };
    }

    if (result.status === "not-modified" && prior?.doc) {
        docs.push(prior.doc);
        stats.unchanged++;
        return;
    }

    if (result.status === "ok") {
        const meta = result.metadata;
        const version_ok = !(typeof meta.version === "number" && meta.version > SUPPORTED_SCHEMA_VERSION);
        if (version_ok && validate(meta) && meta.title) {
            const doc = to_document(entry, meta);
            docs.push(doc);
            stats.fresh++;
            await write_snapshot(entry.slug, {
                slug: entry.slug,
                url: entry.url,
                metadata_url: result.metadata_url,
                etag: result.etag,
                last_modified: result.last_modified,
                content_hash: result.content_hash,
                fetched_at: new Date().toISOString(),
                stale: false,
                doc
            });
            return;
        }

        // fetched but unusable so fall through to error handler
        result = {
            status: "error",
            error: !version_ok
                ? `unsupported metadata version ${meta.version}`
                : (!meta.title ? "no title" : `schema errors:\n${format_errors(validate.errors)}`)
        };
    }

    // keep last good snapshot if we have one, else drop from index
    const error = result.status === "error" ? result.error : "not modified but no cached doc";
    if (prior?.doc) {
        docs.push(prior.doc);
        stats.stale_kept++;
        await write_snapshot(entry.slug, { ...prior, stale: true, last_error: error, checked_at: new Date().toISOString() });
        console.warn(`! ${entry.slug}: ${error} - keeping last-good snapshot`);
    } else {
        stats.dropped++;
        console.warn(`! ${entry.slug}: ${error} - no prior snapshot, dropped from index`);
    }
};

// group by host so we can limit concurrency per host to prevent hammering any one server too hard
const groups = new Map<string, WorldEntry[]>();
for (const entry of entries) {
    const host = host_of(entry.url);
    if (!groups.has(host)) groups.set(host, []);
    groups.get(host)!.push(entry);
}

const limit = pLimit(HOST_CONCURRENCY);
await Promise.all([...groups.values()].map(items => limit(async () => {
    for (const entry of items) {
        await process_entry(entry);
        await sleep(PER_HOST_DELAY_MS + Math.random() * JITTER_MS);
    }
})));


// build search index
const mini = new MiniSearch({
    idField: "id",
    fields: MINISEARCH_FIELDS,
    storeFields: MINISEARCH_STORE,
    searchOptions: MINISEARCH_SEARCH_OPTIONS
});
mini.addAll(docs);

await mkdir(DIST_DIR, { recursive: true });
await writeFile(resolve(DIST_DIR, "search-index.json"), JSON.stringify(mini) + "\n");


// build a slug resolution table to allow searching by slug, as well as determining the slug for a given world url
const by_slug = Object.fromEntries(
    [...docs]
        .sort((a, b) => a.id.localeCompare(b.id))   // stable key order for clean diffs / prefix scans
        .map(d => [d.id, { slug: d.id, title: d.title, author: d.author, url: d.url, thumbnail: d.thumbnail }])
);
await writeFile(resolve(DIST_DIR, "by-slug.json"), JSON.stringify(by_slug) + "\n");
await writeFile(resolve(DIST_DIR, "manifest.json"), JSON.stringify({
    built_at: new Date().toISOString(),
    count: docs.length,
    schema_version: SUPPORTED_SCHEMA_VERSION,
    slug_pattern: SLUG_RE.source,
    max_slug_length: MAX_SLUG_LENGTH,
    minisearch: {
        idField: "id",
        fields: MINISEARCH_FIELDS,
        storeFields: MINISEARCH_STORE,
        searchOptions: MINISEARCH_SEARCH_OPTIONS
    }
}, null, 2) + "\n");

console.log(`\nindexed ${docs.length} worlds (fresh ${stats.fresh}, unchanged ${stats.unchanged}, stale kept ${stats.stale_kept}, dropped ${stats.dropped}, skipped ${stats.skipped})`);
