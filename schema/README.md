# Vendored schema

`WorldMetadata_v1.json` is a pinned copy of the published World Metadata JSON Schema
(`https://hyperlink.surf/schemas/WorldMetadata_v1.json`), which is generated from the
`WorldMetadataSchema` zod in the main repo (`packages/vr-engine-schemas`).

Pinned to keep the CI deterministic and avoid relying on fetching it each time (theoretically the schema should not change without renumbering anyway).

Refresh it (e.g. when adopting a new schema version) with:

```sh
pnpm run vendor-schema
```

If this file is absent, the loader falls back to fetching the schema live at build time (with a warning).
