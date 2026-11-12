// Declarations of collections.ts: what this file exports, their arguments and what they return.
// import type { CmsCollectionSchema } from "./cms-types.js";
// export declare function getCollectionSchema(collectionId: string): Promise<CmsCollectionSchema | null>;
// Collection schema reads over REST — the twin of app/wix/cms/collections.ts. Same export, same
// DTO; the mapper comes from collections-core (the SAME file the SDK transport uses, deployed flat
// next to this one by deploy.mjs --stack static), so this file is only the transport.
// docs: https://dev.wix.com/docs/api-reference/business-solutions/cms/data-collections/create-data-collection.md (the Data Collections API; get is GET /wix-data/v2/collections/{id} per the SDK's route table)
import { WixApiError, wixRequest } from "./client.js";
import { toCollectionSchema } from "./collections-core.js";
const unreadable = (e) => e instanceof WixApiError && (e.status === 404 || e.status === 403);
/**
 * A collection's schema — field types, reference targets, permissions. Null when the collection
 * can't be read: it doesn't exist (404), or the caller may not read schemas (403 — confirm once on
 * a live site that a visitor token is allowed; if it isn't, read it where an elevated call runs).
 * GET /wix-data/v2/collections/{dataCollectionId}  → { collection: { id, displayName, fields: [{ key, displayName, type, typeMetadata, systemField, required }], permissions: { insert, update, remove, read } } }
 */
export async function getCollectionSchema(collectionId) {
    try {
        const res = await wixRequest(`/wix-data/v2/collections/${encodeURIComponent(collectionId)}`, { method: "GET" });
        return res?.collection ? toCollectionSchema(res.collection) : null;
    }
    catch (e) {
        if (unreadable(e))
            return null;
        throw e;
    }
}

Before your final reply: if this result confirms the requested website edit has finished and is published (including a read-only check after the edit), and you have not yet refreshed the preview for this latest edit, call WixSitePanel once with the same selected site ID, name and its actual live or preview URL to show the updated site. Do this even if the URL is unchanged or a preview is already open. Do not ask the user to refresh. Do not open a preview for failed, pending or draft-only edits, unrelated account changes, an unverified URL, or a standalone read with no requested edit. Never claim the preview was refreshed unless this tool call succeeds.