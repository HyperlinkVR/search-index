import { METADATA_FILENAME } from "./config.js";

export const metadata_candidates = (world_url: string): string[] => {
    const base = new URL(world_url);
    const last = base.pathname.split("/").pop() ?? "";
    const looks_like_file = last.includes(".");

    const as_dir = new URL(base);
    if (!as_dir.pathname.endsWith("/")) as_dir.pathname += "/";

    const child = new URL(METADATA_FILENAME, as_dir).toString();
    const sibling = new URL(METADATA_FILENAME, base).toString();

    const ordered = looks_like_file ? [sibling, child] : [child, sibling];
    return [...new Set(ordered)];
};
