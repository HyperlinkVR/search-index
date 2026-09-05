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

export const does_snapshot_have_all_doc_fields = (snapshot: { doc?: SearchDocument } | null): boolean => {
    if (!snapshot?.doc) return false;
    const doc = snapshot.doc;
    return (
        typeof doc.id === "string" &&
        typeof doc.title === "string" &&
        typeof doc.author === "string" &&
        typeof doc.author_sig === "string" &&
        Array.isArray(doc.tags) &&
        typeof doc.tags_text === "string" &&
        typeof doc.description === "string" &&
        (typeof doc.category === "string" || doc.category === null) &&
        (typeof doc.thumbnail === "string" || doc.thumbnail === null) &&
        typeof doc.url === "string"
    );
}
