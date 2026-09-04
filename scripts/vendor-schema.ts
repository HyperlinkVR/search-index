import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { SCHEMA_URL, SCHEMA_VENDOR_PATH } from "./lib/config.js";

const res = await fetch(SCHEMA_URL);
if (!res.ok) {
    console.error(`failed to fetch ${SCHEMA_URL}: HTTP ${res.status}`);
    process.exit(1);
}
const schema = await res.json();
await mkdir(dirname(SCHEMA_VENDOR_PATH), { recursive: true });
await writeFile(SCHEMA_VENDOR_PATH, JSON.stringify(schema, null, 2) + "\n");
console.log(`vendored ${SCHEMA_URL} -> ${SCHEMA_VENDOR_PATH}`);
