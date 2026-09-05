export interface WorldEntry {
    slug: string;
    url: string;
}

export interface WorldAuthor {
    username?: string;
    signature?: string;
}

export interface WorldMetadata {
    version?: number;
    title?: string;
    author?: WorldAuthor;
    tags?: string[];
    description?: string;
    category?: string | null;
    thumbnail?: string | null;
    [key: string]: unknown;
}

// minisearch document, keep in sync with fields in config
export interface SearchDocument {
    id: string;
    title: string;
    author: string;
    author_sig: string;
    tags: string[];
    tags_text: string;
    description: string;
    category: string | null;
    thumbnail: string | null;
    url: string;
}

// machine generate cache of last-good doc + fetch headers for conditional GETs
export interface Snapshot {
    slug: string;
    url: string;
    metadata_url?: string;
    etag?: string;
    last_modified?: string;
    content_hash?: string;
    fetched_at?: string;
    stale?: boolean;
    last_error?: string;
    checked_at?: string;
    doc?: SearchDocument;
}

export type FetchResult =
    | {
          status: "ok";
          metadata_url: string;
          metadata: WorldMetadata;
          etag?: string;
          last_modified?: string;
          content_hash: string;
      }
    | { status: "not-modified"; metadata_url: string }
    | { status: "error"; error: string; http_status?: number };
