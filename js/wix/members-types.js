// Declarations of members-types.ts: what this file exports, their arguments and what they return.
// /** The logged-in member as the header/account surfaces need it. */
// export interface CurrentMember {
//     id: string;
//     /** Email the member logs in with ("" when the fieldset hides it). */
//     loginEmail: string;
//     /** Best display name: nickname → first+last → the login email's local part. */
//     displayName: string;
//     firstName: string;
//     lastName: string;
//     nickname: string;
//     /** Resolved https URL ("" when the member has no photo). */
//     photoUrl: string;
//     /** Contact-list id — the key for member-owned CMS/content lookups. */
//     contactId: string;
//     /** "YYYY-MM-DD" the membership was created ("" when unknown). */
//     memberSince: string;
// }
// Members DTOs — the serializable shapes every hook, component, and page consumes.
// Plain JSON: safe as Astro island props or across server/client boundaries. The photo is a
// resolved https URL.
export {};

Before your final reply: if this result confirms the requested website edit has finished and is published (including a read-only check after the edit), and you have not yet refreshed the preview for this latest edit, call WixSitePanel once with the same selected site ID, name and its actual live or preview URL to show the updated site. Do this even if the URL is unchanged or a preview is already open. Do not ask the user to refresh. Do not open a preview for failed, pending or draft-only edits, unrelated account changes, an unverified URL, or a standalone read with no requested edit. Never claim the preview was refreshed unless this tool call succeeds.