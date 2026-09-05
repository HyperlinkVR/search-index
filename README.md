# Search index

A community search index for HyperlinkVR worlds. You open a PR with a pointer to your
world. CI then fetches the world's `hvr-world.json`, checks it, and builds a
[MiniSearch](https://github.com/lucaong/minisearch) index that the app loads.

The searchable fields (title, author, tags, description) never get copied into this repo.
They're read straight from your live `hvr-world.json`. So there's nothing here to keep in
sync, and a PR can't make search say something your world doesn't. Change your world's
metadata and the index catches up on the next build
(runs on a best-effort hourly schedule, so allow some time for it to be reflected in search).

## Add your world

Open a PR with a file at `worlds/<slug>.json`:

```json
{
  "url": "https://your-host.example/worlds/your-world/"
}
```

`url` is where your world lives, the same URL the app loads. CI looks for `hvr-world.json`
next to it.

The filename is your slug. Keep it lowercase, using letters, numbers, and hyphens, like
`worlds/space-station.json`. The validator will reject anything else.

## Slugs and shortcodes

The slug is just the filename, and it's your world's short name inside this index. It
doesn't go in your `hvr-world.json`, and it means nothing outside the index. Your world's
real identity is its URL. Two worlds can have the same title, but the slug is always
unique here.

The slug is what makes `^slug` work in the app's search bar:

- Type `^space-station` and you jump straight to that world. It's an exact match, not a fuzzy search, so you always land on the one you meant.
- Start typing `^spa` and the app can suggest matching slugs as you go.
- Click a world tile and the app can show you its slug, so you can share `^space-station` instead of pasting a long URL.

These features work by resolving against `by-slug.json`, which ships next to the index and maps each slug to its world.

Note that the slug/shortcode belongs to this index, so `^space-station` only means something relative to whatever index the app is pointed at.
HyperlinkVR lets you switch the indexing source if you want to, and if you do, shortcodes point at that index's slugs instead.
The world URL is the part that stays the same no matter which index you use.

## How it works

`validate-pr` runs when you open a PR. It checks the world files you changed against the
[schema](./schema/) and the slug rules, and it fails if a world can't be reached or doesn't
look right.

`build-index` runs when a PR merges to `main`, once an hour, and whenever you trigger it by
hand. It rechecks every world (with conditional requests, so unchanged worlds come back as
cheap `304`s), builds the index, and publishes `dist/` to the `gh-pages` branch. The
per-world cache in `snapshots/` lives in the Actions cache between runs and isn't
committed. Nothing gets written back to `main`.

When you edit a world, the change shows up in search within about an hour. If a world goes
down for a bit, it keeps its last good snapshot instead of vanishing.

## Using the index in the app

```ts
import MiniSearch from "minisearch";

const base = "https://search.hyperlink.surf";

const manifest = await fetch("/manifest.json").then(r => r.json());
const version = encodeURIComponent(manifest.built_at);

// cache bust indices
const [json, by_slug] = await Promise.all([
  fetch(`/search-index.json?v=${version}`).then(r => r.text()),
  fetch(`/by-slug.json?v=${version}`).then(r => r.json())
]);

// load with the same options the build used (they're in manifest.minisearch)
const index = MiniSearch.loadJSON(json, manifest.minisearch);

// normal fuzzy search
const results = index.search("space station"); // each result carries the storeFields

// exact ^slug lookup, plus the reverse (url back to slug)
const by_url = new Map(Object.values(by_slug).map(w => [w.url, w.slug]));

const world = by_slug["space-station"];   // ^slug to a world
const slug = by_url.get(some_world.url);  // a world url back to its slug
```

Each result already carries the stored fields (title, author, tags, thumbnail, url, and so
on), so you can render a card without another fetch. Only grab the live `hvr-world.json`
when someone actually clicks on a world.

## Future work

Auto-merge. Right now PRs get checked but merged by hand. Automatic merging comes later,
probably built on the world pubkey signing. That signing could also give us shortcodes tied
to a world's key, which would work across any index, unlike `^slug`.

## Running it locally

```sh
pnpm install
pnpm run vendor-schema        # pin the JSON schema (optional, otherwise it's fetched live)
pnpm run validate -- worlds/clubhouse.json
pnpm run build
pnpm run typecheck            # tsc --noEmit
```

## Forking

Forking is permitted, although keep in mind this may fragment the userbase. The search index can be overriden in HyperlinkVR in the "Sources" settings tab.

When hosting a fork, configure caching on the manifest.json file to have a short TTL (such as 1 minute) and the search-index.json and by-slug.json to have a long TTL (e.g. a year). This allows HyperlinkVR to access the small manifest file frequently, using the build date as a cache bust for the indices, meaning they will only be fetched in full when necessary.
