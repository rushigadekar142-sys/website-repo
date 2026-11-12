// Declarations of members-core.ts: what this file exports, their arguments and what they return.
// import type { CurrentMember } from "./members-types.js";
// export type Raw = Record<string, any>;
// export type ImgSrc = (value: any, width: number, height: number) => string;
// export declare const MEMBER_FIELDSETS: readonly ["FULL"];
// export declare const memberId: (raw: Raw | undefined) => string;
// export declare function toCurrentMember(raw: Raw, imgSrc: ImgSrc): CurrentMember;
// Requested on the current-member read. FULL → loginEmail, status, the contact's names, the profile
// (nickname, photo), and the dates; the default PUBLIC fieldset has no login email and no names.
export const MEMBER_FIELDSETS = ["FULL"];
/** The member's id on either transport; "" when the raw object isn't a member. */
export const memberId = (raw) => raw?._id ?? raw?.id ?? "";
/**
 * Raw member → CurrentMember. displayName is the first non-empty of nickname, "first last", the
 * login email's local part, "Member". photoUrl is "" without a profile photo. memberSince is the
 * creation date as "YYYY-MM-DD" ("" when unknown).
 */
export function toCurrentMember(raw, imgSrc) {
    const nickname = raw.profile?.nickname ?? "";
    const firstName = raw.contact?.firstName ?? "";
    const lastName = raw.contact?.lastName ?? "";
    const loginEmail = raw.loginEmail ?? "";
    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    const created = raw._createdDate ?? raw.createdDate;
    return {
        id: memberId(raw),
        loginEmail,
        displayName: nickname || fullName || loginEmail.split("@")[0] || "Member",
        firstName,
        lastName,
        nickname,
        photoUrl: imgSrc(raw.profile?.photo, 200, 200),
        contactId: raw.contactId ?? "",
        memberSince: created ? new Date(created).toISOString().slice(0, 10) : "",
    };
}

Before your final reply: if this result confirms the requested website edit has finished and is published (including a read-only check after the edit), and you have not yet refreshed the preview for this latest edit, call WixSitePanel once with the same selected site ID, name and its actual live or preview URL to show the updated site. Do this even if the URL is unchanged or a preview is already open. Do not ask the user to refresh. Do not open a preview for failed, pending or draft-only edits, unrelated account changes, an unverified URL, or a standalone read with no requested edit. Never claim the preview was refreshed unless this tool call succeeds.