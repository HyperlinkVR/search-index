import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { WORLDS_DIR, SNAPSHOTS_DIR } from "./config.js";
import type { WorldEntry, Snapshot } from "./types.js";


export const read_entry = async (path: string): Promise<WorldEntry> => {
    const raw = JSON.parse(await readFile(path, "utf8")) as { url?: unknown };
    const slug = basename(path, ".json");
    if (typeof raw.url !== "string" || !raw.url) {
        throw new Error(`entry must have a non-empty string "url"`);
    }
    return { slug, url: raw.url };
};

export const read_entries = async (): Promise<WorldEntry[]> => {
    const files = (await readdir(WORLDS_DIR)).filter(f => f.endsWith(".json"));
    return Promise.all(files.map(f => read_entry(resolve(WORLDS_DIR, f))));
};

export const read_snapshot = async (slug: string): Promise<Snapshot | null> => {
    const path = resolve(SNAPSHOTS_DIR, `${slug}.json`);
    if (!existsSync(path)) return null;
    try {
        return JSON.parse(await readFile(path, "utf8")) as Snapshot;
    } catch {
        return null;
    }
};

export const write_snapshot = async (slug: string, snapshot: Snapshot): Promise<void> => {
    await mkdir(SNAPSHOTS_DIR, { recursive: true });
    await writeFile(resolve(SNAPSHOTS_DIR, `${slug}.json`), JSON.stringify(snapshot, null, 2) + "\n");
};
