import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, "../..");

export const WORLDS_DIR = resolve(ROOT, "worlds");
export const SNAPSHOTS_DIR = resolve(ROOT, "snapshots");
export const DIST_DIR = resolve(ROOT, "dist");
export const SCHEMA_VENDOR_PATH = resolve(ROOT, "schema/WorldMetadata_v1.json");

// the metadata schema is the same contract the app enforces, published as json schema
export const SCHEMA_URL = "https://hyperlink.surf/schemas/WorldMetadata_v1.json";
export const SUPPORTED_SCHEMA_VERSION = 1;

// hvr-world.json is resolved relative to the world url (see candidates.ts)
export const METADATA_FILENAME = "hvr-world.json";

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_SLUG_LENGTH = 32;
export const is_valid_slug = (slug: string): boolean => slug.length > 0 && slug.length <= MAX_SLUG_LENGTH && SLUG_RE.test(slug);

// base url that per-issue explainer docs are linked from in PR comments
// the CI workflow overrides this via DOCS_BASE_URL to point at the docs/ folder on the PR's target branch, this fallback is used for local runs
export const DOCS_BASE_URL = "https://github.com/hyperlinkvr/search-index/blob/main/docs";

export const USER_AGENT = "hvr-search-indexer/0.1 (+https://github.com/hyperlinkvr/search-index)";
export const FETCH_TIMEOUT_MS = 15_000;
export const HOST_CONCURRENCY = 8;    // distinct hosts fetched at once
export const PER_HOST_DELAY_MS = 250; // min gap between requests to the same host
export const JITTER_MS = 250;


export const MINISEARCH_FIELDS = ["title", "author", "tags_text", "description", "url"];
export const MINISEARCH_STORE = ["title", "author", "tags", "description", "category", "thumbnail", "url"];
export const MINISEARCH_SEARCH_OPTIONS = {
    boost: { title: 4, tags_text: 3, author: 2, description: 1, url: 1 },
    prefix: true,
    fuzzy: 0.2
};
