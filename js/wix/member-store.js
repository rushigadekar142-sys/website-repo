import { supabase } from "/js/supabase/client.js";

const EMPTY = { member: null, loggedIn: false, loading: true, error: null };
let state = EMPTY;
const listeners = new Set();
let started = false;
let pendingEmail = "";

function emit(patch) {
  state = { ...state, ...patch };
  for (const listener of listeners) {
    try { listener(getMemberState()); } catch (error) { console.error("member-store listener failed", error); }
  }
}
export function getMemberState() { return state; }

async function resolveMember(user) {
  const inviteToken = new URLSearchParams(window.location.search).get("invite");
  if (inviteToken) {
    const { error } = await supabase.rpc("accept_workspace_invitation", { p_token: inviteToken });
    if (error) throw error;
    const url = new URL(window.location.href);
    url.searchParams.delete("invite");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }
  let { data: memberships, error } = await supabase.from("workspace_members")
    .select("workspace_id,role,workspaces(id,name,slug)")
    .eq("user_id", user.id).eq("status", "active");
  if (error) throw error;
  if (!memberships?.length) {
    const first = user.user_metadata?.first_name || user.email?.split("@")[0] || "My";
    const created = await supabase.rpc("create_workspace", { p_name: first + "'s Workspace" });
    if (created.error) throw created.error;
    const refreshed = await supabase.from("workspace_members")
      .select("workspace_id,role,workspaces(id,name,slug)")
      .eq("user_id", user.id).eq("status", "active");
    if (refreshed.error) throw refreshed.error;
    memberships = refreshed.data || [];
  }
  if (!memberships?.length) throw new Error("No workspace is available for this account.");
  const membership = memberships[0];
  const workspace = Array.isArray(membership.workspaces) ? membership.workspaces[0] : membership.workspaces;
  const firstName = user.user_metadata?.first_name || "";
  const lastName = user.user_metadata?.last_name || "";
  return {
    id: user.id, loginEmail: user.email || "", email: user.email || "",
    firstName, lastName,
    displayName: [firstName, lastName].filter(Boolean).join(" ") || user.email || "Team member",
    workspaceId: membership.workspace_id, workspaceName: workspace?.name || "Workspace",
    workspaceRole: membership.role
  };
}

export async function refreshMember() {
  emit({ loading: true, error: null });
  const { data, error } = await supabase.auth.getSession();
  if (error) { emit({ member: null, loggedIn: false, loading: false, error: error.message }); return; }
  const user = data.session?.user;
  if (!user) { emit({ member: null, loggedIn: false, loading: false }); return; }
  try {
    const member = await resolveMember(user);
    emit({ member, loggedIn: true, loading: false, error: null });
  } catch (e) {
    emit({ member: null, loggedIn: false, loading: false, error: e.message || String(e) });
  }
}

export function subscribeMember(fn) {
  listeners.add(fn);
  if (!started && typeof window !== "undefined") {
    started = true;
    supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) emit({ member: null, loggedIn: false, loading: false, error: null });
      else queueMicrotask(() => refreshMember());
    });
    void refreshMember();
  }
  return () => listeners.delete(fn);
}

async function resultFromAuth(response) {
  if (response.error) return { state: "FAILURE", error: response.error.message };
  if (response.data.session) { await refreshMember(); return { state: "SUCCESS" }; }
  return { state: "EMAIL_VERIFICATION_REQUIRED" };
}
export async function login(email, password) {
  return resultFromAuth(await supabase.auth.signInWithPassword({ email: email.trim(), password }));
}
export async function register(email, password, profile = {}) {
  pendingEmail = email.trim().toLowerCase();
  return resultFromAuth(await supabase.auth.signUp({
    email: pendingEmail, password,
    options: {
      data: { first_name: profile.firstName || "", last_name: profile.lastName || "" },
      emailRedirectTo: window.location.origin + "/auth/callback.html"
    }
  }));
}
export async function verifyEmail(code) {
  if (!pendingEmail) return { state: "FAILURE", error: "Register again to request a new verification email." };
  const result = await resultFromAuth(await supabase.auth.verifyOtp({ email: pendingEmail, token: String(code).trim(), type: "signup" }));
  if (result.state === "SUCCESS") pendingEmail = "";
  return result;
}
export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  emit({ member: null, loggedIn: false, loading: false, error: null });
  window.location.assign("/");
}
export async function listWorkspaceMembers() {
  const member = state.member;
  if (!member?.workspaceId) return [];
  const { data, error } = await supabase.rpc("list_workspace_members", { p_workspace_id: member.workspaceId });
  if (error) throw error;
  return data || [];
}
export async function inviteWorkspaceMember(email, role = "staff") {
  const member = state.member;
  if (!member?.workspaceId) throw new Error("Workspace not loaded.");
  const { data, error } = await supabase.rpc("invite_workspace_member", {
    p_workspace_id: member.workspaceId, p_email: email.trim().toLowerCase(), p_role: role
  });
  if (error) throw error;
  return window.location.origin + "/?invite=" + encodeURIComponent(data);
}
export async function removeWorkspaceMember(userId) {
  const { error } = await supabase.rpc("remove_workspace_member", { p_workspace_id: state.member.workspaceId, p_user_id: userId });
  if (error) throw error;
}
export async function changeWorkspaceMemberRole(userId, role) {
  const { error } = await supabase.rpc("change_workspace_member_role", { p_workspace_id: state.member.workspaceId, p_user_id: userId, p_role: role });
  if (error) throw error;
}
