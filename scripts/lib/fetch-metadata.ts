import { createHash } from "node:crypto";
import { USER_AGENT, FETCH_TIMEOUT_MS } from "./config.js";
import { metadata_candidates } from "./candidates.js";
import type { WorldEntry, WorldMetadata, Snapshot, FetchResult } from "./types.js";

const sha256 = (text: string): string => "sha256:" + createHash("sha256").update(text).digest("hex");

interface ConditionalOptions {
    etag?: string;
    last_modified?: string;
    conditional?: boolean;
}

const http_get = async (url: string, { etag, last_modified, conditional }: ConditionalOptions = {}): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const headers: Record<string, string> = { "user-agent": USER_AGENT, accept: "application/json" };
    if (conditional && etag) headers["if-none-match"] = etag;
    if (conditional && last_modified) headers["if-modified-since"] = last_modified;
    try {
        return await fetch(url, { headers, signal: controller.signal, redirect: "follow" });
    } finally {
        clearTimeout(timer);
    }
};

const parse_response = async (res: Response, metadata_url: string): Promise<FetchResult> => {
    const text = await res.text();
    let metadata: WorldMetadata;
    try {
        metadata = JSON.parse(text) as WorldMetadata;
    } catch {
        return { status: "error", error: `${metadata_url} -> invalid JSON` };
    }
    return {
        status: "ok",
        metadata_url,
        metadata,
        etag: res.headers.get("etag") ?? undefined,
        last_modified: res.headers.get("last-modified") ?? undefined,
        content_hash: sha256(text)
    };
};

export const fetch_metadata = async (entry: WorldEntry, snapshot: Snapshot | null): Promise<FetchResult> => {
    if (snapshot?.metadata_url) {
        try {
            const res = await http_get(snapshot.metadata_url, {
                etag: snapshot.etag,
                last_modified: snapshot.last_modified,
                conditional: true
            });
            // etags allow the server to tell us if the content has changed since our last fetch (304 meaning no it hasnt)
            if (res.status === 304) return { status: "not-modified", metadata_url: snapshot.metadata_url };
            if (res.ok) return await parse_response(res, snapshot.metadata_url);
            // non-ok (e.g. 404): world may have moved -> re-resolve candidates below
        } catch {
            // network error -> fall through to candidate resolution
        }
    }

    let last_error = "no reachable hvr-world.json";
    for (const url of metadata_candidates(entry.url)) {
        try {
            const res = await http_get(url, { conditional: false });
            if (!res.ok) {
                last_error = `${url} -> HTTP ${res.status}`;
                continue;
            }
            return await parse_response(res, url);
        } catch (err) {
            last_error = `${url} -> ${err instanceof Error ? err.message : String(err)}`;
        }
    }
    return { status: "error", error: last_error };
};
