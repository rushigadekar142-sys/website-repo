// Declarations of collections-core.ts: what this file exports, their arguments and what they return.
// import type { CmsCollectionSchema, CmsFieldSchema, CmsFieldType } from "./cms-types.js";
// export type RawCollection = Record<string, any>;
// export declare function toFieldSchema(f: RawCollection): CmsFieldSchema;
// export declare function toCollectionSchema(raw: RawCollection): CmsCollectionSchema;
// export declare function fieldsOfType(schema: CmsCollectionSchema, type: CmsFieldType): CmsFieldSchema[];
/** A verb's role as the API spells it; ADMIN (the most restrictive reading) when absent. */
const role = (r) => (typeof r === "string" && r ? r : "ADMIN");
/** One raw field → DTO. The reference target sits under typeMetadata.reference | .multiReference. */
export function toFieldSchema(f) {
    const ref = f.typeMetadata?.reference?.referencedCollectionId ?? f.typeMetadata?.multiReference?.referencedCollectionId;
    return {
        key: f.key ?? "",
        displayName: f.displayName ?? f.key ?? "",
        type: f.type ?? "TEXT",
        systemField: f.systemField === true,
        required: f.required === true,
        ...(ref ? { referencedCollectionId: ref } : {}),
    };
}
/** A raw DataCollection → the schema DTO (id, display name, fields, the four verbs' roles). */
export function toCollectionSchema(raw) {
    const id = raw._id ?? raw.id ?? "";
    const p = raw.permissions ?? {};
    return {
        id,
        displayName: raw.displayName ?? id,
        fields: (raw.fields ?? []).map(toFieldSchema),
        permissions: { read: role(p.read), insert: role(p.insert), update: role(p.update), remove: role(p.remove) },
    };
}
/** The fields of one type — e.g. every MULTI_REFERENCE to link after an insert, every IMAGE to guard. */
export function fieldsOfType(schema, type) {
    return schema.fields.filter((f) => f.type === type);
}

Before your final reply: if this result confirms the requested website edit has finished and is published (including a read-only check after the edit), and you have not yet refreshed the preview for this latest edit, call WixSitePanel once with the same selected site ID, name and its actual live or preview URL to show the updated site. Do this even if the URL is unchanged or a preview is already open. Do not ask the user to refresh. Do not open a preview for failed, pending or draft-only edits, unrelated account changes, an unverified URL, or a standalone read with no requested edit. Never claim the preview was refreshed unless this tool call succeeds.