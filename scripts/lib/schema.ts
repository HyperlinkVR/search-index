import _Ajv2020 from "ajv/dist/2020.js";
import type { ValidateFunction, ErrorObject } from "ajv";
import _addFormats from "ajv-formats";

const Ajv = _Ajv2020 as unknown as typeof _Ajv2020.default;
const addFormats = _addFormats as unknown as typeof _addFormats.default;
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { SCHEMA_URL, SCHEMA_VENDOR_PATH } from "./config.js";
import type { WorldMetadata } from "./types.js";

let cached_validator: ValidateFunction<WorldMetadata> | null = null;

const load_schema_json = async (): Promise<object> => {
    // prefer the pinned vendored copy for determinism, falling back to the live URL if not present
    if (existsSync(SCHEMA_VENDOR_PATH)) {
        return JSON.parse(await readFile(SCHEMA_VENDOR_PATH, "utf8")) as object;
    }
    console.warn(`no vendored schema at ${SCHEMA_VENDOR_PATH}, fetching ${SCHEMA_URL} (run "npm run vendor-schema" to pin it)`);
    const res = await fetch(SCHEMA_URL);
    if (!res.ok) throw new Error(`could not load schema: HTTP ${res.status}`);
    return res.json() as Promise<object>;
};

export const get_validator = async (): Promise<ValidateFunction<WorldMetadata>> => {
    if (cached_validator) return cached_validator;
    const schema = await load_schema_json();
    // $data: the schema uses $data references (e.g. maximum: { $data: "1/max_players" }).
    const ajv = new Ajv({ allErrors: true, strict: false, $data: true });
    addFormats(ajv);
    const validator = ajv.compile<WorldMetadata>(schema);
    cached_validator = validator;
    return validator;
};

export const format_errors = (errors: ErrorObject[] | null | undefined): string => {
    if (!errors?.length) return "unknown validation error";
    return errors.map(e => `    ${e.instancePath || "/"} ${e.message}`).join("\n");
};
