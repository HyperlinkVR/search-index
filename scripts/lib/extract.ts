import type { WorldEntry, WorldMetadata, SearchDocument } from "./types.js";

export const to_document = (entry: WorldEntry, metadata: WorldMetadata): SearchDocument => {
    const tags = metadata.tags ?? [];
    return {
        id: entry.slug,
        title: metadata.title ?? "",
        author: metadata.author?.username ?? "",
        author_sig: metadata.author?.signature ?? "",
        tags,
        tags_text: tags.join(" "),
        description: metadata.description ?? "",
        category: metadata.category ?? null,
        thumbnail: metadata.thumbnail ?? null,
        url: entry.url
    };
};
