import { supabase } from "/js/supabase/client.js";
import { getMemberState } from "/js/wix/member-store.js";

const TABLES = { EkdantProjects: "projects", EkdantContacts: "contacts", EkdantActivity: "activities" };
const current = () => getMemberState().member;
const tableFor = name => { const table = TABLES[name]; if (!table) throw new Error("Unknown CRM collection: " + name); return table; };
const clean = value => JSON.parse(JSON.stringify(value, (_key, v) => v instanceof Date ? v.toISOString() : v));
function fromRow(row, collectionId) {
  const item = { ...(row.data || {}), _id: row.id, _createdDate: row.created_at, _updatedDate: row.updated_at || row.created_at };
  if (collectionId === "EkdantContacts") item.id = row.id;
  if (collectionId === "EkdantProjects") {
    const member = current();
    if (member?.workspaceRole === "owner") item.createdBy = member.loginEmail;
    else item.memberEmails = [...(Array.isArray(item.memberEmails) ? item.memberEmails : []), (member?.loginEmail || "") + "::editor"];
  }
  return item;
}
async function assignedUserId(email) {
  const member = current();
  if (!email || !member?.workspaceId) return null;
  if (String(email).trim().toLowerCase() === member.loginEmail.toLowerCase()) return member.id;
  const { data, error } = await supabase.rpc("list_workspace_members", { p_workspace_id: member.workspaceId });
  if (error) return null;
  return (data || []).find(x => String(x.email).toLowerCase() === String(email).trim().toLowerCase())?.user_id || null;
}
export async function queryItems(collectionId, query = {}) {
  const member = current();
  if (!member?.workspaceId) throw new Error("Sign in and select a workspace first.");
  const table = tableFor(collectionId), limit = Math.min(Math.max(Number(query.limit || 100), 1), 500), skip = Math.max(Number(query.skip || 0), 0);
  let request = supabase.from(table).select("*").eq("workspace_id", member.workspaceId).order("created_at", { ascending: false }).range(skip, skip + limit - 1);
  for (const filter of query.filters || []) {
    if (filter.field === "_id" || filter.field === "id") request = request.eq("id", filter.value);
    else if (filter.field === "projectId") request = request.eq("project_id", filter.value);
    else if (filter.field && ["eq","ne","gt","gte","lt","lte"].includes(filter.op)) {
      const method = ({eq:"eq",ne:"neq",gt:"gt",gte:"gte",lt:"lt",lte:"lte"})[filter.op];
      request = request.filter("data->>" + filter.field, method, String(filter.value));
    }
  }
  const { data, error } = await request;
  if (error) throw error;
  const items = (data || []).map(row => fromRow(row, collectionId));
  return { items, hasNext: items.length === limit };
}
export async function insertItem(collectionId, input) {
  const member = current();
  if (!member?.workspaceId) throw new Error("Workspace not available.");
  const table = tableFor(collectionId), data = clean(input || {});
  delete data._id; delete data._createdDate; delete data._updatedDate; delete data.id;
  const row = { workspace_id: member.workspaceId, data, created_by: member.id };
  if (collectionId === "EkdantProjects") row.name = String(data.name || "Untitled project");
  if (collectionId === "EkdantContacts") {
    row.project_id = data.projectId || null;
    row.phone_normalized = String(data.phone || "").replace(/\D/g, "") || null;
    row.email_normalized = String(data.email || "").trim().toLowerCase() || null;
    row.assigned_to = await assignedUserId(data.assignedTo);
  }
  if (collectionId === "EkdantActivity") {
    row.project_id = data.projectId || null; row.contact_id = data.contactId || null; row.actor_user_id = member.id;
  }
  const { data: saved, error } = await supabase.from(table).insert(row).select("*").single();
  if (error) throw error;
  return fromRow(saved, collectionId);
}
export async function patchItemFields(collectionId, itemId, fields) {
  const member = current();
  if (!member?.workspaceId) throw new Error("Workspace not available.");
  const table = tableFor(collectionId);
  const { data: existing, error: readError } = await supabase.from(table).select("*").eq("id", itemId).eq("workspace_id", member.workspaceId).single();
  if (readError) throw readError;
  const patch = clean(fields || {});
  // Wix-style metadata is projected from Supabase columns and must never be persisted inside JSONB.
  for (const key of ["_id", "id", "_createdDate", "_updatedDate", "_owner"]) delete patch[key];
  const updates = { data: { ...(existing.data || {}), ...patch }, updated_at: new Date().toISOString() };
  if (collectionId === "EkdantContacts") {
    if (Object.prototype.hasOwnProperty.call(patch, "phone")) updates.phone_normalized = String(patch.phone || "").replace(/\D/g, "") || null;
    if (Object.prototype.hasOwnProperty.call(patch, "email")) updates.email_normalized = String(patch.email || "").trim().toLowerCase() || null;
    if (Object.prototype.hasOwnProperty.call(patch, "assignedTo")) updates.assigned_to = await assignedUserId(patch.assignedTo);
  }
  const { data: saved, error } = await supabase.from(table).update(updates).eq("id", itemId).eq("workspace_id", member.workspaceId).select("*").single();
  if (error) throw error;
  return fromRow(saved, collectionId);
}
export async function updateItem(collectionId, item) { return patchItemFields(collectionId, item._id, item); }
export async function removeItem(collectionId, itemId) {
  const member = current();
  if (!member?.workspaceId) throw new Error("Workspace not available.");
  const { data, error } = await supabase.from(tableFor(collectionId)).delete().eq("id", itemId).eq("workspace_id", member.workspaceId).select("*").maybeSingle();
  if (error) throw error;
  return data ? fromRow(data, collectionId) : null;
}
