import { subscribeMember, getMemberState } from "/js/wix/member-store.js";
import { queryItems, insertItem, patchItemFields } from "/js/wix/items.js";
import { accessToken } from "/js/wix/client.js";
import { safeExternalUrl } from "/js/utils/safe-url.js";

const COL = { projects: "EkdantProjects", contacts: "EkdantContacts", activity: "EkdantActivity" };
const CRM_API_BASE = "https://ekdant-leaddesk-api-staging.okaymockup.workers.dev";
const STAGES = ["New Lead", "Attempted", "Connected", "Interested", "Proposal Sent", "Negotiation", "Converted / Won", "Lost"];
const OUTCOMES = ["Interested", "Not Interested", "No Answer", "Busy", "Switch Off", "Wrong Number", "Call Back Later", "Meeting Scheduled", "Converted", "Lost"];
const $ = (s, root = document) => root.querySelector(s);
const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dateFmt = v => { if (!v) return "—"; const d = new Date(v); return Number.isNaN(d.getTime()) ? "—" : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d); };
const dayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const state = { member: null, projects: [], contacts: [], activities: [], tasks: [], view: "overview", trash: [], query: "", projectId: "", stage: "all", sourceFilter: "all", assigneeFilter: "all", sortBy: "created", sortDirection: "desc" };
let mounted = false;

async function allItems(collection) {
  const out = [];
  let skip = 0, page;
  do {
    page = await queryItems(collection, { limit: 200, skip });
    const batch = page.items || [];
    out.push(...batch);
    if (!page.hasNext || batch.length === 0) break;
    skip += batch.length;
  } while (true);
  return out;
}
async function taskApi(path, method = "GET", body) {
  const token = await accessToken();
  const res = await fetch(CRM_API_BASE + path, {
    method,
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let payload;
  try { payload = await res.json(); } catch { payload = {}; }
  if (!res.ok) throw new Error(payload.detail || payload.error || ("Task API failed (" + res.status + ")."));
  return payload;
}

function role(p) {
  const me = String(state.member && state.member.loginEmail || "").toLowerCase();
  if (!p || !me) return "none";
  if (String(p.createdBy || "").toLowerCase() === me) return "owner";
  const share = (p.memberEmails || []).find(x => String(x).split("::")[0].toLowerCase() === me);
  return share ? String(share).split("::")[1] || "viewer" : "none";
}
function allowedProjects() { return state.projects.filter(p => role(p) !== "none"); }
function leads() {
  const ids = new Set(allowedProjects().map(p => p._id));
  let rows = state.contacts.filter(c => ids.has(c.projectId));
  if (state.projectId) rows = rows.filter(c => c.projectId === state.projectId);
  if (state.query) {
    const q = state.query.toLowerCase();
    rows = rows.filter(c => [c.leadId, c.businessName, c.company, c.contactPerson, c.phone, c.whatsapp, c.email, c.city, c.source, c.campaign, c.assignedTo].some(v => String(v || "").toLowerCase().includes(q)));
  }
  if (state.stage !== "all") rows = rows.filter(c => (c.status || "New Lead") === state.stage);
  if (state.sourceFilter !== "all") rows = rows.filter(c => (c.source || "Unspecified") === state.sourceFilter);
  if (state.assigneeFilter !== "all") rows = rows.filter(c => (c.assignedTo || "Unassigned") === state.assigneeFilter);
  const key = state.sortKey || "created", dir = state.sortDir === "asc" ? 1 : -1;
  const value = c => key === "name" ? String(c.businessName || c.contactPerson || "").toLocaleLowerCase()
    : key === "created" ? (new Date(c._createdDate || c.createdAt || c.importedAt || 0).getTime() || 0)
    : key === "followup" ? (new Date(c.followUpAt || 0).getTime() || 0)
    : key === "stage" ? String(c.status || "New Lead").toLocaleLowerCase()
    : key === "assignee" ? String(c.assignedTo || "Unassigned").toLocaleLowerCase()
    : key === "leadId" ? String(c.leadId || c.srNo || "").toLocaleLowerCase()
    : String(c[key] || "").toLocaleLowerCase();
  rows.sort((a,b) => { const av=value(a), bv=value(b); const cmp = typeof av === "number" && typeof bv === "number" ? av-bv : String(av).localeCompare(String(bv), "en", {numeric:true,sensitivity:"base"}); return cmp * dir; });
  return rows;
}
async function reload() {
  const [projects, contacts, activities, taskPage, trashPage] = await Promise.all([allItems(COL.projects), allItems(COL.contacts), allItems(COL.activity), taskApi("/api/tasks?limit=200"), taskApi("/api/trash?limit=200")]);
  state.projects = projects;
  const ids = new Set(allowedProjects().map(p => p._id));
  state.contacts = contacts.filter(c => ids.has(c.projectId)).map(c => ({ ...c, id: c._id, status: c.status || "New Lead" }));
  state.activities = activities.filter(a => ids.has(a.projectId));
  state.tasks = (taskPage.items || []).map(t => ({ ...t, _id: t.id, projectId: t.project_id, contactId: t.contact_id, assignedTo: t.assigned_to, dueAt: t.due_at }));
   state.trash = trashPage.items || [];
  render();
}
function toast(message) {
  const stack = $("#toast-stack");
  if (!stack) return;
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;
  stack.append(item);
  setTimeout(() => item.remove(), 3500);
}
function syncMobileNavAccessibility(open = false) {
  const sidebar = $(".sidebar");
  const scrim = $("#crm-mobile-nav-scrim");
  const isMobile = window.matchMedia("(max-width: 760px)").matches;
  if (sidebar) sidebar.inert = isMobile && !open;
  if (scrim) scrim.setAttribute("aria-hidden", String(!isMobile || !open));
}
function closeMobileNav() {
  const sidebar = $(".sidebar");
  const scrim = $("#crm-mobile-nav-scrim");
  const toggle = $("#crm-mobile-menu-toggle");
  const wasOpen = !!(sidebar && sidebar.classList.contains("mobile-open"));
  if (sidebar) sidebar.classList.remove("mobile-open");
  if (scrim) scrim.classList.remove("open");
  if (toggle) {
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open navigation");
    if (wasOpen) toggle.focus();
  }
  syncMobileNavAccessibility(false);
}
function setView(view) {
  state.view = view;
  document.querySelectorAll("[data-crm-view]").forEach(b => {
    const active = b.dataset.crmView === view;
    b.classList.toggle("crm-active", active);
    if (active) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  render();
  closeMobileNav();
}
function head(kicker, title, description, actions) {
  return '<div class="crm-head"><div><span class="eyebrow">' + kicker + '</span><h1>' + title + '</h1><p>' + description + '</p></div><div class="crm-head-actions">' + (actions || "") + '</div></div>';
}
function stat(label, value, hint, view) {
  return '<button class="crm-stat" data-crm-nav="' + view + '"><span>' + label + '</span><b>' + value + '</b><small>' + hint + '</small></button>';
}
function projectSelect() {
  return '<select id="crm-project-filter" class="select-control"><option value="">All projects</option>' + allowedProjects().map(p => '<option value="' + esc(p._id) + '" ' + (state.projectId === p._id ? "selected" : "") + '>' + esc(p.name) + '</option>').join("") + '</select>';
}
function overview() {
  const rows = leads(), today = dayStart(), tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const due = rows.filter(c => c.followUpAt && new Date(c.followUpAt) >= today && new Date(c.followUpAt) < tomorrow);
  const overdue = rows.filter(c => c.followUpAt && new Date(c.followUpAt) < today && !["Converted / Won", "Lost", "Not Interested", "Wrong Number"].includes(c.status));
  const calls = state.activities.filter(a => a.activityType === "Call");
  const count = s => rows.filter(c => c.status === s).length;
  const sourceCounts = {};
  rows.forEach(c => { const k = c.source || "Unspecified"; sourceCounts[k] = (sourceCounts[k] || 0) + 1; });
  const recent = state.activities.slice().sort((a, b) => new Date(b.happenedAt || 0) - new Date(a.happenedAt || 0)).slice(0, 6);
  return head("CRM OVERVIEW", "Ekdant LeadDesk", "Your sales activity, lead pipeline and follow-ups in one workspace.", '<button class="btn btn-secondary" data-crm-action="new-project">＋ New project</button><button class="btn btn-secondary" data-crm-nav="pipeline">Open pipeline</button><button class="btn btn-primary" data-crm-action="new-lead">＋ Add lead</button>') +
    '<div class="crm-filter-row">' + projectSelect() + '<span class="crm-muted">' + rows.length + ' leads across ' + allowedProjects().length + ' projects</span></div>' +
    '<div class="crm-stats">' +
    stat("Total Leads", rows.length, "All active records", "leads") +
    stat("New Leads Today", rows.filter(c => new Date(c._createdDate || c.importedAt || 0) >= today && new Date(c._createdDate || c.importedAt || 0) < tomorrow).length, "Received today", "leads") +
    stat("Calls Completed", calls.length, "Logged call attempts", "calls") +
    stat("Interested Leads", count("Interested"), "Potential customers", "pipeline") +
    stat("Follow-ups Today", due.length, "Due today", "due") +
    stat("Overdue Follow-ups", overdue.length, "Require attention", "overdue") +
    stat("Converted Leads", count("Converted / Won"), "Successfully closed", "customers") +
    stat("Lost Leads", count("Lost") + count("Not Interested"), "Unsuccessful prospects", "leads") +
    '</div><div class="crm-two-col"><section class="panel"><div class="panel-head"><div><div class="panel-title">Lead pipeline</div><div class="panel-sub">Current distribution by stage</div></div><button class="panel-action" data-crm-nav="pipeline">View pipeline →</button></div>' +
    STAGES.map(s => { const n = count(s); return '<div class="crm-bar-row"><span>' + esc(s) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + (n / Math.max(1, rows.length) * 100) + '%"></div></div><b>' + n + '</b></div>'; }).join("") +
    '</section><section class="panel"><div class="panel-head"><div><div class="panel-title">Lead sources</div><div class="panel-sub">Where enquiries are coming from</div></div></div>' +
    Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).slice(0, 7).map(x => '<div class="crm-metric"><span>' + esc(x[0]) + '</span><b>' + x[1] + '</b></div>').join("") +
    '</section></div><section class="panel"><div class="panel-head"><div><div class="panel-title">Upcoming attention</div><div class="panel-sub">Due and overdue follow-ups</div></div><button class="panel-action" data-crm-nav="due">Open follow-ups →</button></div>' +
    (due.concat(overdue).slice(0, 6).map(c => '<div class="crm-follow-row"><div><b>' + esc(c.businessName || c.contactPerson || "Lead") + '</b><small>' + esc(c.phone || "") + ' · ' + dateFmt(c.followUpAt) + '</small></div><button class="btn btn-secondary" data-crm-action="call" data-id="' + c.id + '">Log call</button></div>').join("") || '<p class="crm-muted">No follow-ups require attention.</p>') +
    '</section><section class="panel"><div class="panel-head"><div><div class="panel-title">Recent activity</div><div class="panel-sub">Latest team updates</div></div></div>' +
    (recent.map(a => '<div class="crm-follow-row"><div><b>' + esc(a.callOutcome || a.newStatus || a.activityType || "Activity") + '</b><small>' + esc(a.actorName || a.actorEmail || "Team member") + ' · ' + dateFmt(a.happenedAt) + '</small></div><span class="crm-muted">' + esc(a.remark || "") + '</span></div>').join("") || '<p class="crm-muted">No activity recorded yet.</p>') + '</section>';
}
function leadTable(rows) {
  return '<div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>Lead ID</th><th>Business / Contact</th><th>Phone</th><th>Created</th><th>Last Updated</th><th>Source</th><th>Assigned To</th><th>Stage</th><th>Next Follow-up</th><th>Call / Action</th></tr></thead><tbody>' +
    rows.map(c => {
      const created = c._createdDate || c.importedAt || c.createdAt;
      const updated = c._updatedDate || c.updatedAt || c.statusChangedAt || created;
      const phone = String(c.phone || "").trim();
      return '<tr><td>' + esc(c.leadId || c.srNo || "—") + '</td><td><button class="crm-link" data-crm-action="detail" data-id="' + c.id + '">' + esc(c.businessName || c.contactPerson || "Unnamed") + '</button><small>' + esc(c.contactPerson || c.company || c.city || c.category || "") + '</small></td><td>' + (phone ? '<a href="tel:' + esc(phone) + '">' + esc(phone) + '</a>' : '—') + '</td><td>' + dateFmt(created) + '</td><td>' + dateFmt(updated) + '</td><td>' + esc(c.source || "—") + '</td><td>' + esc(c.assignedTo || "Unassigned") + '</td><td><span class="status-pill">' + esc(c.status || "New Lead") + '</span></td><td>' + dateFmt(c.followUpAt) + '</td><td><button class="btn btn-secondary" data-crm-action="call" data-id="' + c.id + '">Log call</button></td></tr>';
    }).join("") +
    '</tbody></table></div>';
}
function leadList() {
  const rows = leads();
  return head("LEAD MANAGEMENT", "All Leads", "Search and manage the full lead database.", '<button class="btn btn-secondary" data-crm-action="import">⇧ Import CSV / Excel</button><button class="btn btn-primary" data-crm-action="new-lead">＋ Add lead</button>') + '<input id="crm-import-file" type="file" accept=".csv,.tsv,.xlsx,.xls" hidden>' +
    '<div class="crm-filter-row"><input id="crm-search" class="input-control" placeholder="Search name, phone, company, lead ID…" value="' + esc(state.query) + '">' + projectSelect() + '<select id="crm-stage-filter" class="select-control"><option value="all">All stages</option>' + STAGES.map(s => '<option ' + (state.stage === s ? "selected" : "") + '>' + esc(s) + '</option>').join("") + '</select><select id="crm-source-filter" class="select-control"><option value="all">All sources</option>' + [...new Set(state.contacts.map(c=>c.source||"Unspecified"))].map(x=>'<option value="'+esc(x)+'" '+(state.sourceFilter===x?"selected":"")+' >'+esc(x)+'</option>').join("") + '</select><select id="crm-assignee-filter" class="select-control"><option value="all">All assignees</option>' + [...new Set(state.contacts.map(c=>c.assignedTo||"Unassigned"))].map(x=>'<option value="'+esc(x)+'" '+(state.assigneeFilter===x?"selected":"")+' >'+esc(x)+'</option>').join("") + '</select><select id="crm-sort" class="select-control" aria-label="Sort leads"><option value="created" ' + (state.sortBy === "created" ? "selected" : "") + '>Sort: Date added</option><option value="updated" ' + (state.sortBy === "updated" ? "selected" : "") + '>Sort: Last updated</option><option value="name" ' + (state.sortBy === "name" ? "selected" : "") + '>Sort: Name</option><option value="followUp" ' + (state.sortBy === "followUp" ? "selected" : "") + '>Sort: Follow-up date</option><option value="phone" ' + (state.sortBy === "phone" ? "selected" : "") + '>Sort: Phone</option><option value="status" ' + (state.sortBy === "status" ? "selected" : "") + '>Sort: Stage</option></select><button class="btn btn-secondary" type="button" data-crm-action="sort-direction">' + (state.sortDirection === "asc" ? "Ascending ↑" : "Descending ↓") + '</button><span class="crm-muted" aria-live="polite">Showing all ' + rows.length + ' matching leads · ' + state.contacts.length + ' loaded</span></div>' + (rows.length ? leadTable(rows) : '<section class="panel crm-empty"><b>No matching leads</b><p>Change the search or filters to see more records.</p></section>');
}
function pipeline() {
  const rows = leads();
  return head("SALES OPERATIONS", "Lead Pipeline", "Move prospects through the sales process and record every change.", '<button class="btn btn-primary" data-crm-action="new-lead">＋ Add lead</button>') +
    '<div class="crm-filter-row">' + projectSelect() + '</div><div class="crm-board">' +
    STAGES.map(s => '<section class="crm-stage" data-drop-stage="' + esc(s) + '"><header><b>' + esc(s) + '</b><span>' + rows.filter(c => c.status === s).length + '</span></header>' +
      rows.filter(c => c.status === s).map(c => '<article class="crm-lead-card" draggable="true" data-drag-lead="' + c.id + '"><button class="crm-link" data-crm-action="detail" data-id="' + c.id + '">' + esc(c.businessName || c.contactPerson || "Unnamed") + '</button><small>' + esc(c.phone || "No phone") + '</small><div class="crm-card-bottom"><span>' + esc(c.priority || "Normal") + '</span><select class="select-control" data-crm-status="' + c.id + '"><option value="">Move to…</option>' + STAGES.map(x => '<option ' + (x === s ? "disabled" : "") + '>' + esc(x) + '</option>').join("") + '</select></div></article>').join("") + '</section>').join("") + '</div>';
}
function followups(kind) {
  const rows = leads(), today = dayStart(), tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const filtered = rows.filter(c => {
    if (!c.followUpAt) return false;
    const d = new Date(c.followUpAt);
    return kind === "due" ? d >= today && d < tomorrow : kind === "upcoming" ? d >= tomorrow : d < today;
  }).sort((a, b) => new Date(a.followUpAt) - new Date(b.followUpAt));
  const title = kind === "due" ? "Due Today" : kind === "upcoming" ? "Upcoming" : "Overdue";
  return head("FOLLOW-UP MANAGER", title, "Every reminder is attached to its lead and assigned owner.", '<button class="btn btn-secondary" data-crm-nav="due">Due Today</button><button class="btn btn-secondary" data-crm-nav="upcoming">Upcoming</button><button class="btn btn-secondary" data-crm-nav="overdue">Overdue</button>') +
    '<div class="crm-filter-row">' + projectSelect() + '<span class="crm-muted">' + filtered.length + ' follow-ups</span></div>' +
    (filtered.length ? leadTable(filtered) : '<section class="panel crm-empty"><b>No ' + title.toLowerCase() + ' follow-ups</b><p>Scheduled reminders will appear here.</p></section>');
}
function calls() {
  const rows = state.activities.filter(a => a.activityType === "Call").sort((a, b) => new Date(b.happenedAt || 0) - new Date(a.happenedAt || 0));
  return head("CALL MANAGEMENT", "Call History", "A searchable timeline of logged calls and outcomes.", "") +
    '<div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>When</th><th>Lead</th><th>Outcome</th><th>Employee</th><th>Duration</th><th>Notes</th><th>Follow-up</th></tr></thead><tbody>' +
    rows.map(a => { const c = state.contacts.find(x => x.id === a.contactId); return '<tr><td>' + dateFmt(a.happenedAt) + '</td><td>' + esc(c ? c.businessName || c.contactPerson : a.contactId) + '</td><td>' + esc(a.callOutcome || a.newStatus || "—") + '</td><td>' + esc(a.actorName || a.actorEmail || "—") + '</td><td>' + (a.callDurationSeconds || 0) + ' sec</td><td>' + esc(a.remark || "—") + '</td><td>' + dateFmt(a.followUpAt) + '</td></tr>'; }).join("") + '</tbody></table></div>';
}
function reports() {
  const rows = leads(), total = rows.length;
  const count = s => rows.filter(c => c.status === s).length;
  const won = count("Converted / Won"), lost = count("Lost") + count("Not Interested");
  const active = Math.max(0, total - won - lost);
  const conversion = total ? Math.round(won / total * 100) : 0;
  const sourceCounts = {}, stageCounts = {};
  const geoCounts = {};
  rows.forEach(c => {
    const source = String(c.source || "Unspecified").trim() || "Unspecified";
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    const stage = c.status || "New Lead";
    stageCounts[stage] = (stageCounts[stage] || 0) + 1;
    const city = String(c.city || c.area || c.location || c.state || "Location not recorded").trim();
    geoCounts[city] = (geoCounts[city] || 0) + 1;
  });
  const allSources = Object.entries(sourceCounts).sort((a,b) => b[1]-a[1]);
  const sourceList = allSources.length > 6 ? [...allSources.slice(0,5), ["Other sources", allSources.slice(5).reduce((n,x)=>n+x[1],0)]] : allSources;
  const sourceColors = ["#0f8b68","#62b991","#9bcfb3","#8ba6d9","#c3a7e8","#e0b56e"];
  let cursor = 0;
  const gradient = sourceList.length ? sourceList.map((x,i) => {
    const from = cursor / Math.max(1,total) * 100; cursor += x[1];
    return sourceColors[i % sourceColors.length] + " " + from + "% " + (cursor / Math.max(1,total) * 100) + "%";
  }).join(",") : "#edf2ef 0% 100%";
  const geoList = Object.entries(geoCounts).sort((a,b) => b[1]-a[1]).slice(0,8);
  const maxGeo = Math.max(1,...geoList.map(x=>x[1]));
  const stageList = STAGES.map(s=>[s,stageCounts[s]||0]).filter(x=>x[1]>0);
  const maxStage = Math.max(1,...stageList.map(x=>x[1]));
  const calls = state.activities.filter(a=>a.activityType==="Call").length;
  const followups = rows.filter(c=>c.followUpAt && new Date(c.followUpAt)>=dayStart()).length;
  const meter = (label,value,sub,percent,color) => '<div class="analytics-meter"><div class="analytics-meter-head"><span>'+label+'</span><b>'+value+'</b></div><div class="analytics-meter-track"><i style="width:'+Math.max(0,Math.min(100,percent))+'%;--meter-color:'+color+'"></i></div><small>'+sub+'</small></div>';
  return head("ANALYTICS & INSIGHTS","Reports & Performance","A live visual breakdown of your current CRM records. Use the project filter to compare individual workspaces.",'<button class="btn btn-secondary" data-crm-action="export">Export CSV</button>') +
    '<div class="crm-filter-row">'+projectSelect()+'<span class="crm-muted">Based on '+total+' visible lead records</span></div>' +
    '<div class="analytics-kpis">' +
      '<article class="analytics-kpi"><span>Total leads</span><b>'+total+'</b><small>Current filtered database</small><div class="analytics-kpi-icon">◎</div></article>' +
      '<article class="analytics-kpi"><span>Converted / won</span><b>'+won+'</b><small>Successfully closed leads</small><div class="analytics-kpi-icon">↗</div></article>' +
      '<article class="analytics-kpi"><span>Call activities</span><b>'+calls+'</b><small>Logged call records</small><div class="analytics-kpi-icon">⌕</div></article>' +
      '<article class="analytics-kpi"><span>Follow-ups due</span><b>'+followups+'</b><small>Today and overdue</small><div class="analytics-kpi-icon">◷</div></article>' +
    '</div>' +
    '<div class="analytics-grid">' +
      '<section class="panel analytics-panel"><div class="panel-head"><div><div class="panel-title">Conversion performance</div><div class="panel-sub">Won leads as a share of all visible leads</div></div><span class="analytics-tag">LIVE</span></div>' +
        '<div class="conversion-layout"><div class="conversion-gauge" style="--gauge-value:'+conversion+'"><div><b>'+conversion+'%</b><small>Conversion</small></div></div><div class="conversion-legend"><div><i class="legend-dot won"></i><span>Converted / won</span><b>'+won+'</b></div><div><i class="legend-dot active"></i><span>In progress</span><b>'+active+'</b></div><div><i class="legend-dot lost"></i><span>Lost / not interested</span><b>'+lost+'</b></div></div></div>' +
        meter("Interested leads",count("Interested"),"Leads currently marked interested",total?count("Interested")/total*100:0,"#70b991") +
      '</section>' +
      '<section class="panel analytics-panel"><div class="panel-head"><div><div class="panel-title">Lead source mix</div><div class="panel-sub">Where your enquiries originate</div></div></div>' +
        '<div class="source-chart-layout"><div class="source-donut" style="background:conic-gradient('+gradient+')"><div><b>'+total+'</b><small>Leads</small></div></div><div class="source-legend">'+(sourceList.map((x,i)=>'<div><i style="background:'+sourceColors[i%sourceColors.length]+'"></i><span>'+esc(x[0])+'</span><b>'+x[1]+'</b></div>').join("")||'<small class="crm-muted">No source data recorded yet.</small>')+'</div></div>' +
      '</section>' +
    '</div>' +
    '<section class="panel analytics-panel"><div class="panel-head"><div><div class="panel-title">Pipeline distribution</div><div class="panel-sub">Lead count and share at each sales stage</div></div><span class="analytics-tag">'+stageList.length+' active stages</span></div>' +
      '<div class="pipeline-chart">'+STAGES.map(s=>{const n=stageCounts[s]||0;return '<div class="pipeline-chart-row"><div class="pipeline-chart-label">'+esc(s)+'</div><div class="pipeline-chart-track"><i style="width:'+(n/maxStage*100)+'%"></i></div><b>'+n+'</b><small>'+(total?Math.round(n/total*100):0)+'%</small></div>';}).join("")+'</div>' +
    '</section>' +
    '<section class="panel analytics-panel"><div class="panel-head"><div><div class="panel-title">Geographical lead distribution</div><div class="panel-sub">Ranked by city, area or available location field in your lead records</div></div><span class="analytics-tag">LOCATION</span></div>' +
      '<div class="geo-grid">'+(geoList.map((x,i)=>'<article class="geo-card"><div class="geo-card-top"><span class="geo-pin">⌖</span><small>#'+(i+1)+'</small></div><b>'+esc(x[0])+'</b><div class="geo-count">'+x[1]+' <span>leads</span></div><div class="geo-track"><i style="width:'+(x[1]/maxGeo*100)+'%"></i></div><small>'+ (total?Math.round(x[1]/total*100):0)+'% of visible leads</small></article>').join("")||'<p class="crm-muted">No geographical data recorded. Add city, area or location values to lead profiles to populate this section.</p>')+'</div>' +
    '</section>' +
    '<section class="panel analytics-panel"><div class="panel-head"><div><div class="panel-title">Performance meters</div><div class="panel-sub">Quick operational indicators from the current CRM data</div></div></div>' +
      meter("Converted leads",won,total+" total leads",total?won/total*100:0,"#16845f") +
      meter("Interested leads",count("Interested"),"Currently interested",total?count("Interested")/total*100:0,"#6eb88f") +
      meter("Lost / not interested",lost,"Closed without conversion",total?lost/total*100:0,"#d68b87") +
    '</section>';
}

function companies(){
 const groups={};
 leads().forEach(c=>{const k=String(c.company||c.businessName||"Unassigned company");(groups[k]||(groups[k]=[])).push(c)});
 return head("ACCOUNT MANAGEMENT","Companies & Accounts","Company groups are derived from existing lead records.",'<button class="btn btn-secondary" data-crm-action="export">Export CSV</button>')+
 '<div class="crm-filter-row">'+projectSelect()+'<span class="crm-muted">'+Object.keys(groups).length+' company groups</span></div>'+
 '<div class="crm-company-grid">'+Object.entries(groups).map(([name,rows])=>'<article class="panel crm-company-card"><h3>'+esc(name)+'</h3><b>'+rows.length+' contacts</b><div class="crm-company-people">'+rows.map(c=>'<button class="crm-link" data-crm-action="detail" data-id="'+c.id+'">'+esc(c.contactPerson||c.businessName)+'</button>').join("")+'</div></article>').join("")+'</div>';
}
function activitiesView(){
 const rows=state.activities.slice().sort((a,b)=>new Date(b.happenedAt||0)-new Date(a.happenedAt||0));
 return head("ENGAGEMENT HISTORY","Activities & Meetings","Timeline for calls, meetings, emails, tasks, status changes and notes.",'<button class="btn btn-primary" data-crm-action="new-activity">＋ Log activity</button>')+
 '<div class="crm-filter-row">'+projectSelect()+'<span class="crm-muted">'+rows.length+' activities</span></div><section class="panel">'+
 rows.map(a=>{const c=state.contacts.find(x=>x.id===a.contactId);return '<article class="crm-activity-item"><div><b>'+esc(a.activityType||"Activity")+' · '+esc(c?(c.businessName||c.contactPerson):"Workspace")+'</b><p>'+esc(a.remark||a.nextAction||a.callOutcome||a.newStatus||"Activity recorded")+'</p><small>'+dateFmt(a.happenedAt)+' · '+esc(a.actorName||a.actorEmail||"Team member")+'</small></div></article>'}).join("")+'</section>';
}
function teamView(){
 return head("TEAM & PERMISSIONS","Team access","Review project members and manage Viewer or Editor access.",'')+'<section class="panel">'+allowedProjects().map(p=>'<article class="crm-team-project"><div><b>'+esc(p.name)+'</b><small>'+esc(role(p))+'</small></div><div>'+(p.memberEmails||[]).map(x=>{const a=String(x).split("::");return '<span class="crm-member-chip">'+esc(a[0])+' · '+esc(a[1]||"viewer")+'</span>'}).join("")+'</div>'+(role(p)==="owner"?'<button class="btn btn-secondary" data-crm-action="manage-access" data-id="'+p._id+'">Manage access</button>':'')+'</article>').join("")+'<div class="crm-security-note"><b>Security limitation</b><p>Role checks currently run in the browser and are not server-side authorization. Restrict Wix CMS collection permissions before relying on roles for sensitive data.</p></div></section>';
}
function automationView(){
 const rules=[["autoFollow","Default follow-up for new leads","New lead → next-day follow-up"],["stageLog","Pipeline stage history","Stage changed → activity timeline entry"],["wonLog","Won-deal reporting","Converted / Won → preserve deal value"]];
 const p=state.projects.find(x=>x._id===state.projectId);
 return head("WORKFLOW AUTOMATION","Automation rules","Configure project workflow defaults. Scheduled jobs and outbound messaging require a backend service.",'')+'<div class="crm-filter-row">'+projectSelect()+'</div><section class="panel">'+
 (p&&["owner","editor"].includes(role(p))?rules.map(([k,t,d])=>'<label class="crm-rule-row"><div><b>'+t+'</b><small>'+d+'</small></div><input type="checkbox" data-automation-rule="'+k+'" '+((p.automationRules||{})[k]?"checked":"")+'></label>').join(""):'<p class="crm-muted">Select an editable project to configure rules.</p>')+
 '<p class="crm-muted crm-rule-footnote">Rules are stored on the project; they do not send emails, WhatsApp messages or scheduled notifications by themselves.</p></section>';
}
function newActivityModal(){
 const rows=leads();if(!rows.length){toast("Add a lead first.");return}
 openModal("Log activity",'<form id="crm-activity-form"><div class="crm-form-grid"><label>Related lead *<select name="contactId" required>'+rows.map(c=>'<option value="'+c.id+'">'+esc(c.businessName||c.contactPerson||c.phone)+'</option>').join("")+'</select></label><label>Activity type<select name="activityType"><option>Meeting</option><option>Email</option><option>Task</option><option>Note</option></select></label><label>Date & time<input name="happenedAt" type="datetime-local"></label><label>Next action<input name="nextAction"></label><label class="crm-wide">Notes<textarea name="remark"></textarea></label></div><div class="crm-modal-actions"><button type="button" class="btn btn-secondary" data-crm-action="close">Cancel</button><button class="btn btn-primary">Save activity</button></div></form>');
}
async function saveActivity(form){
 const d=new FormData(form),c=state.contacts.find(x=>x.id===String(d.get("contactId")||""));if(!c)throw Error("Lead not found.");
 if(!["owner","editor"].includes(role(state.projects.find(p=>p._id===c.projectId))))throw Error("No edit access.");
 await insertItem(COL.activity,{projectId:c.projectId,contactId:c.id,activityType:String(d.get("activityType")),happenedAt:d.get("happenedAt")?new Date(d.get("happenedAt")):new Date(),nextAction:String(d.get("nextAction")||""),remark:String(d.get("remark")||""),actorEmail:state.member.loginEmail||"",actorName:state.member.displayName||""});
 closeModal();await reload();toast("Activity saved.");
}
async function saveAutomationRule(k,v){
 const p=state.projects.find(x=>x._id===state.projectId);if(!p||!["owner","editor"].includes(role(p)))throw Error("Choose an editable project.");
 const rules={...(p.automationRules||{}),[k]:v};await patchItemFields(COL.projects,p._id,{automationRules:rules});p.automationRules=rules;toast("Workflow rule saved.");
}
function manageAccess(id){
 const p=state.projects.find(x=>x._id===id);if(!p||role(p)!=="owner")return;
 const members=(p.memberEmails||[]).map(x=>{const a=String(x).split("::");return {email:a[0],role:a[1]||"viewer"}});
 openModal("Manage project access",'<form id="crm-access-form" data-id="'+id+'"><div class="field"><label>Team member email</label><input name="email" type="email" required></div><div class="field"><label>Role</label><select name="accessRole"><option value="viewer">Viewer</option><option value="editor">Editor</option></select></div><div>'+members.map(x=>'<span class="crm-member-chip">'+esc(x.email)+' · '+esc(x.role)+'</span>').join("")+'</div><div class="crm-modal-actions"><button type="button" class="btn btn-secondary" data-crm-action="close">Cancel</button><button class="btn btn-primary">Save access</button></div></form>');
}
async function saveAccess(form){
 const p=state.projects.find(x=>x._id===form.dataset.id);if(!p||role(p)!=="owner")throw Error("Only the owner can change access.");
 const d=new FormData(form),email=String(d.get("email")||"").trim().toLowerCase(),r=String(d.get("accessRole")||"viewer");if(!email)throw Error("Email required.");
 const members=(p.memberEmails||[]).filter(x=>String(x).split("::")[0].toLowerCase()!==email);members.push(email+"::"+r);
 await patchItemFields(COL.projects,p._id,{memberEmails:members});closeModal();await reload();toast("Project access saved.");
}

function taskView() {
  const rows = state.tasks.filter(t => !state.projectId || t.projectId === state.projectId).sort((a,b) => String(a.dueAt || "9999").localeCompare(String(b.dueAt || "9999")));
  const statusLabel = { open: "Open", in_progress: "In progress", done: "Done", cancelled: "Cancelled" };
  return head("WORK MANAGEMENT", "Task Manager", "Assign follow-ups and internal work to a project, with clear ownership and status.", '<button class="btn btn-primary" data-crm-action="new-task">＋ New task</button>') +
    '<div class="crm-filter-row">' + projectSelect() + '<span class="crm-muted">' + rows.length + ' tasks</span></div>' +
    (rows.length ? '<section class="panel crm-task-list">' + rows.map(t => '<article class="crm-task-row"><div class="crm-task-main"><b>' + esc(t.title || "Untitled task") + '</b><small>' + esc(t.description || "") + '</small><small>' + esc(state.projects.find(p => p._id === t.projectId)?.name || "Project") + ' · ' + esc(t.assignedTo || "Unassigned") + ' · Due ' + dateFmt(t.dueAt) + '</small></div><select data-task-status="' + esc(t._id) + '" aria-label="Task status"><option value="open" ' + (t.status === "open" ? "selected" : "") + '>Open</option><option value="in_progress" ' + (t.status === "in_progress" ? "selected" : "") + '>In progress</option><option value="done" ' + (t.status === "done" ? "selected" : "") + '>Done</option><option value="cancelled" ' + (t.status === "cancelled" ? "selected" : "") + '>Cancelled</option></select></article>').join("") + '</section>' : '<section class="panel"><h3>No tasks yet</h3><p class="crm-muted">Create the first task for a project to track internal work and follow-ups.</p></section>');
}

function trashView() {
  const rows = state.trash.filter(c => !state.projectId || c.projectId === state.projectId);
  return head("RECOVERED RECORDS", "Trash", "Deleted leads are retained safely and can be restored. No permanent deletion is available.", '<span class="crm-muted">' + rows.length + ' items in Trash</span>') +
    '<div class="crm-filter-row">' + projectSelect() + '</div>' +
    (rows.length ? '<div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>Lead</th><th>Phone</th><th>Project</th><th>Deleted on</th><th>Action</th></tr></thead><tbody>' +
      rows.map(c => '<tr><td><b>' + esc(c.businessName || c.contactPerson || "Unnamed lead") + '</b><small>' + esc(c.company || c.city || "") + '</small></td><td>' + esc(c.phone || "—") + '</td><td>' + esc(state.projects.find(p => p._id === c.projectId)?.name || "Project") + '</td><td>' + dateFmt(c.deletedAt) + '</td><td><button class="btn btn-primary" data-crm-action="restore" data-id="' + esc(c._id) + '">Restore</button></td></tr>').join("") +
      '</tbody></table></div>' : '<section class="panel crm-empty"><b>Trash is empty</b><p>Leads you move to Trash will appear here for recovery.</p></section>');
}
async function trashContact(id) {
  const c = state.contacts.find(x => x.id === id);
  if (!c) throw new Error("Lead not found.");
  if (!["owner", "editor"].includes(role(state.projects.find(p => p._id === c.projectId)))) throw new Error("You do not have permission to move this lead to Trash.");
  if (!window.confirm("Move this lead to Trash? You can restore it later.")) return;
  await taskApi("/api/contacts/" + encodeURIComponent(id) + "/trash", "POST", {});
  closeModal(); await reload(); toast("Lead moved to Trash. It can be restored.");
}
async function restoreContact(id) {
  const c = state.trash.find(x => x._id === id);
  if (!c) throw new Error("Trashed lead not found.");
  if (!["owner", "editor"].includes(role(state.projects.find(p => p._id === c.projectId)))) throw new Error("You do not have permission to restore this lead.");
  await taskApi("/api/trash/" + encodeURIComponent(id) + "/restore", "POST", {});
  await reload(); toast("Lead restored successfully.");
}

function render() {
  const host = $("#crm-page");
  if (!host) return;
  host.innerHTML = state.view === "overview" ? overview() :
    state.view === "pipeline" ? pipeline() :
    state.view === "due" || state.view === "upcoming" || state.view === "overdue" ? followups(state.view) :
    state.view === "calls" ? calls() :
    state.view === "companies" ? companies() :
    state.view === "activities" ? activitiesView() :
    state.view === "tasks" ? taskView() :
    state.view === "automation" ? automationView() :
    state.view === "team" ? teamView() :
    state.view === "trash" ? trashView() :
    state.view === "reports" ? reports() : leadList();
  host.querySelectorAll(".crm-stats,.crm-two-col,.crm-table-wrap,.crm-board,.panel").forEach(el => el.classList.add("crm-reveal"));
  const reveal = host.querySelectorAll(".crm-reveal");
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); } }), {threshold:0.08});
    reveal.forEach(el => observer.observe(el));
  } else reveal.forEach(el => el.classList.add("is-visible"));
}
function openModal(title, content) {
  $("#crm-modal-title").textContent = title;
  $("#crm-modal-content").innerHTML = content;
  $("#crm-modal").classList.add("open");
}
function closeModal() { $("#crm-modal").classList.remove("open"); }
function newTaskModal() {
  const editable = allowedProjects().filter(p => ["owner", "editor"].includes(role(p)));
  if (!editable.length) { toast("No editable project is available for this account."); return; }
  openModal("Create task", '<form id="crm-task-form"><div class="crm-form-grid">' +
    '<label>Project *<select name="projectId" required>' + editable.map(p => '<option value="' + esc(p._id) + '">' + esc(p.name) + '</option>').join("") + '</select></label>' +
    '<label>Task title *<input name="title" required maxlength="180" placeholder="e.g. Call prospect"></label>' +
    '<label>Assigned to<input name="assignedTo" placeholder="Team member email"></label>' +
    '<label>Due date<input name="dueAt" type="datetime-local"></label>' +
    '<label>Priority<select name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label>' +
    '<label class="crm-wide">Description<textarea name="description" maxlength="1500"></textarea></label>' +
    '</div><div class="crm-modal-actions"><button type="button" class="btn btn-secondary" data-crm-action="close">Cancel</button><button class="btn btn-primary">Create task</button></div></form>');
}
async function saveTask(form) {
  const fd = new FormData(form), projectId = String(fd.get("projectId") || ""), title = String(fd.get("title") || "").trim();
  if (!title) throw new Error("A task title is required.");
  if (!["owner", "editor"].includes(role(state.projects.find(p => p._id === projectId)))) throw new Error("You do not have edit access to this project.");
  await taskApi("/api/tasks", "POST", {
    project_id: projectId,
    title,
    description: String(fd.get("description") || "").trim(),
    assigned_to: String(fd.get("assignedTo") || state.member.loginEmail || "").trim(),
    due_at: fd.get("dueAt") ? new Date(fd.get("dueAt")).toISOString() : null,
    priority: String(fd.get("priority") || "normal")
  });
  closeModal();
  await reload();
  toast("Task created successfully.");
}
async function updateTaskStatus(taskId, status) {
  if (!["open", "in_progress", "done", "cancelled"].includes(status)) throw new Error("Invalid task status.");
  await taskApi("/api/tasks/" + encodeURIComponent(taskId), "PATCH", { status });
  await reload();
  toast("Task status updated.");
}
function newProjectModal() {
  if (!allowedProjects().some(p => role(p) === "owner")) {
    toast("Only a workspace owner can create a project.");
    return;
  }
  openModal("Create project", '<form id="crm-project-form"><div class="crm-form-grid">' +
    '<label>Project name *<input name="name" required maxlength="120" placeholder="e.g. Ekdant Digital Marketing"></label>' +
    '<label class="crm-wide">Description<textarea name="description" maxlength="1000" placeholder="What is this project for?"></textarea></label>' +
    '</div><div class="crm-modal-actions"><button type="button" class="btn btn-secondary" data-crm-action="close">Cancel</button><button class="btn btn-primary">Create project</button></div></form>');
}
function newLeadModal() {
  const editable = allowedProjects().filter(p => ["owner", "editor"].includes(role(p)));
  if (!editable.length) { toast("No editable project is available for this account."); return; }
  openModal("Create lead", '<form id="crm-lead-form"><div class="crm-form-grid">' +
    '<label>Project *<select name="projectId" required>' + editable.map(p => '<option value="' + p._id + '">' + esc(p.name) + '</option>').join("") + '</select></label>' +
    '<label>Business / Full name *<input name="businessName" required></label><label>Contact person<input name="contactPerson"></label>' +
    '<label>Mobile number *<input name="phone" required></label><label>WhatsApp number<input name="whatsapp"></label>' +
    '<label>Email<input name="email" type="email"></label><label>Company<input name="company"></label><label>City<input name="city"></label>' +
    '<label>Lead source<select name="source"><option>Manual</option><option>Instagram</option><option>Facebook Ads</option><option>Google</option><option>Website</option><option>Referral</option></select></label>' +
    '<label>Campaign<input name="campaign"></label><label>Interested in<input name="category"></label><label>Industry<input name="industry"></label><label>Website<input name="website" type="url"></label><label>Tags<input name="tags" placeholder="Hot, premium, referral"></label><label>Custom field 1<input name="customField1"></label><label>Custom field 2<input name="customField2"></label><label>Assigned to<input name="assignedTo" placeholder="Employee email or name"></label>' +
    '<label>Priority<select name="priority"><option>Normal</option><option>High</option><option>Low</option></select></label><label>Lead stage<select name="status">' + STAGES.map(s => '<option>' + s + '</option>').join("") + '</select></label>' +
    '<label>Next follow-up<input name="followUpAt" type="datetime-local"></label><label>Deal value (₹)<input name="dealValue" type="number" min="0"></label>' +
    '<label class="crm-wide">Address<input name="address"></label><label class="crm-wide">Notes<textarea name="remark"></textarea></label></div>' +
    '<div class="crm-modal-actions"><button type="button" class="btn btn-secondary" data-crm-action="close">Cancel</button><button class="btn btn-primary">Save lead</button></div></form>');
}
function callModal(id) {
  const c = state.contacts.find(x => x.id === id);
  if (!c) return;
  openModal("Log call · " + (c.businessName || c.contactPerson || "Lead"), '<form id="crm-call-form" data-id="' + id + '"><div class="crm-form-grid">' +
    '<label>Call outcome *<select name="outcome" required><option value="">Select outcome</option>' + OUTCOMES.map(o => '<option>' + o + '</option>').join("") + '</select></label>' +
    '<label>Duration (seconds)<input name="duration" type="number" min="0"></label><label>Next follow-up date & time<input name="followUpAt" type="datetime-local"></label>' +
    '<label>Next action<input name="nextAction" placeholder="Send quotation / call again"></label><label class="crm-wide">Discussion notes<textarea name="notes"></textarea></label></div>' +
    '<div class="crm-modal-actions"><button type="button" class="btn btn-secondary" data-crm-action="close">Cancel</button><button class="btn btn-primary">Save call</button></div></form>');
}
function detailModal(id) {
  const c = state.contacts.find(x => x.id === id);
  if (!c) return;
  const wa = String(c.whatsapp || c.phone || "").replace(/\D/g, "");
  const website = safeExternalUrl(c.website);
  const activity = state.activities.filter(a => a.contactId === id).sort((a, b) => new Date(b.happenedAt || 0) - new Date(a.happenedAt || 0)).slice(0, 12);
  openModal(c.businessName || c.contactPerson || "Lead profile", '<div class="crm-detail-grid">' +
    [["Lead ID", c.leadId || c.srNo || id], ["Status", c.status], ["Phone", c.phone], ["WhatsApp", c.whatsapp || c.phone], ["Email", c.email], ["Company", c.company], ["City", c.city || c.area], ["Source", c.source], ["Campaign", c.campaign], ["Assigned to", c.assignedTo], ["Priority", c.priority], ["Follow-up", dateFmt(c.followUpAt)], ["Deal value", c.dealValue ? "₹" + c.dealValue : "—"], ["Payment status", c.paymentStatus], ["Industry", c.industry], ["Website", c.website], ["Tags", c.tags], ["Custom field 1", c.customField1], ["Custom field 2", c.customField2]].map(x => '<div><small>' + x[0] + '</small><b>' + esc(x[1] || "—") + '</b></div>').join("") + '</div>' +
    '<div class="crm-modal-actions"><a class="btn btn-secondary" href="tel:' + esc(c.phone || "") + '">Call</a>' + (c.email ? '<a class="btn btn-secondary" href="mailto:' + esc(c.email) + '">Email</a>' : "") + (website ? '<a class="btn btn-secondary" target="_blank" rel="noopener noreferrer" href="' + esc(website) + '">Website</a>' : "") + (wa ? '<a class="btn btn-secondary" target="_blank" rel="noopener" href="https://wa.me/' + wa + '">WhatsApp</a>' : "") + '<button class="btn btn-primary" data-crm-action="call" data-id="' + id + '">＋ Log call</button>' + (["owner", "editor"].includes(role(state.projects.find(p => p._id === c.projectId))) ? '<button class="btn btn-secondary" data-crm-action="trash" data-id="' + id + '">Move to Trash</button>' : "") + '</div>' +
    '<section class="crm-history"><b>Activity timeline</b>' + (activity.map(a => '<div><b>' + esc(a.callOutcome || a.newStatus || a.activityType) + '</b><small>' + dateFmt(a.happenedAt) + ' · ' + esc(a.remark || "") + '</small></div>').join("") || '<p>No activity yet.</p>') + '</section>');
}
function statusForOutcome(outcome) {
  return ({ "Interested": "Interested", "Not Interested": "Not Interested", "No Answer": "Not Picked", "Busy": "Not Picked", "Switch Off": "Not Picked", "Wrong Number": "Wrong Number", "Call Back Later": "Attempted", "Meeting Scheduled": "Connected", "Converted": "Converted / Won", "Lost": "Lost" })[outcome] || "Attempted";
}
async function saveProject(form) {
  if (!allowedProjects().some(p => role(p) === "owner")) throw new Error("Only a workspace owner can create a project.");
  const fd = new FormData(form);
  const name = String(fd.get("name") || "").trim();
  if (!name) throw new Error("A project name is required.");
  const project = await insertItem(COL.projects, {
    name,
    description: String(fd.get("description") || "").trim(),
    createdBy: state.member.loginEmail || "",
    memberEmails: []
  });
  state.projectId = project._id;
  closeModal();
  await reload();
  toast("Project created successfully.");
}
async function saveLead(form) {
  const fd = new FormData(form), projectId = String(fd.get("projectId") || "");
  if (!["owner", "editor"].includes(role(state.projects.find(p => p._id === projectId)))) throw new Error("You do not have edit access to this project.");
  const phone = String(fd.get("phone") || "").trim();
  if (!phone) throw new Error("A phone number is required.");
  const normalized = phone.replace(/\D/g, "");
  if (state.contacts.some(c => String(c.phone || "").replace(/\D/g, "") === normalized && c.projectId === projectId)) throw new Error("This phone number already exists in this project.");
  const payload = {
    projectId, leadId: "EKD-" + String(Date.now()).slice(-7),
    businessName: String(fd.get("businessName") || "").trim(),
    contactPerson: String(fd.get("contactPerson") || "").trim(),
    phone, whatsapp: String(fd.get("whatsapp") || "").trim(),
    email: String(fd.get("email") || "").trim(),
    company: String(fd.get("company") || "").trim(),
    city: String(fd.get("city") || "").trim(),
    source: String(fd.get("source") || "Manual"),
    campaign: String(fd.get("campaign") || "").trim(),
    category: String(fd.get("category") || "").trim(),
    industry: String(fd.get("industry") || "").trim(), website: String(fd.get("website") || "").trim(), tags: String(fd.get("tags") || "").trim(), customField1: String(fd.get("customField1") || "").trim(), customField2: String(fd.get("customField2") || "").trim(),
    assignedTo: String(fd.get("assignedTo") || state.member.loginEmail || ""),
    priority: String(fd.get("priority") || "Normal"),
    status: String(fd.get("status") || "New Lead"),
    followUpAt: fd.get("followUpAt") ? new Date(fd.get("followUpAt")) : ((state.projects.find(p=>p._id===projectId)?.automationRules||{}).autoFollow ? new Date(Date.now()+86400000) : undefined),
    dealValue: Number(fd.get("dealValue") || 0),
    address: String(fd.get("address") || "").trim(),
    remark: String(fd.get("remark") || "").trim(),
    statusChangedAt: new Date(), importedAt: new Date(), doNotContact: false
  };
  const saved = await insertItem(COL.contacts, payload);
  await insertItem(COL.activity, { projectId, contactId: saved._id, activityType: "Lead created", oldStatus: "", newStatus: payload.status, actorEmail: state.member.loginEmail || "", actorName: state.member.displayName || "", happenedAt: new Date(), remark: "Lead added manually" });
  closeModal(); await reload(); toast("Lead created successfully.");
}
async function saveCall(form) {
  const c = state.contacts.find(x => x.id === form.dataset.id);
  if (!c) throw new Error("Lead not found.");
  if (!["owner", "editor"].includes(role(state.projects.find(p => p._id === c.projectId)))) throw new Error("You do not have edit access to this project.");
  const fd = new FormData(form), outcome = String(fd.get("outcome") || ""), at = new Date(), status = statusForOutcome(outcome);
  const next = fd.get("followUpAt") ? new Date(fd.get("followUpAt")) : null;
  const notes = String(fd.get("notes") || "").trim(), action = String(fd.get("nextAction") || "").trim();
  const history = (c.statusHistory || []).concat([{ from: c.status, to: status, at: at.toISOString(), by: state.member.loginEmail || "" }]);
  const patch = { lastCalledAt: at, lastCallOutcome: outcome, status, statusChangedAt: at, statusHistory: history, nextAction: action };
  if (next) { patch.followUpAt = next; patch.nextFollowUpReason = action || "Follow-up scheduled"; }
  if (notes) patch.remark = [c.remark, notes].filter(Boolean).join("\n");
  await patchItemFields(COL.contacts, c.id, patch);
  await insertItem(COL.activity, { projectId: c.projectId, contactId: c.id, activityType: "Call", callOutcome: outcome, oldStatus: c.status || "New Lead", newStatus: status, actorEmail: state.member.loginEmail || "", actorName: state.member.displayName || "", happenedAt: at, callDurationSeconds: Number(fd.get("duration") || 0), followUpAt: next || undefined, nextAction: action, remark: notes });
  closeModal(); await reload(); toast("Call saved: " + outcome);
}
async function moveStage(id, next) {
  const c = state.contacts.find(x => x.id === id);
  if (!c || !next) return;
  if (!["owner", "editor"].includes(role(state.projects.find(p => p._id === c.projectId)))) { toast("You do not have edit access."); return; }
  const at = new Date(), history = (c.statusHistory || []).concat([{ from: c.status, to: next, at: at.toISOString(), by: state.member.loginEmail || "" }]);
  await patchItemFields(COL.contacts, id, { status: next, statusChangedAt: at, statusHistory: history });
  await insertItem(COL.activity, { projectId: c.projectId, contactId: id, activityType: "Status change", oldStatus: c.status || "New Lead", newStatus: next, actorEmail: state.member.loginEmail || "", actorName: state.member.displayName || "", happenedAt: at });
  await reload(); toast("Lead moved to " + next);
}
function normalizeImportHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function importValue(row, aliases) {
  const wanted = new Set(aliases);
  for (const [key, value] of Object.entries(row)) if (wanted.has(normalizeImportHeader(key))) return value;
  return "";
}
function parseImportDate(value) {
  if (!value) return undefined;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;
  const m = String(value).trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!m) return undefined;
  let year = Number(m[3]); if (year < 100) year += 2000;
  const date = new Date(year, Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(date.getTime()) ? undefined : date;
}
async function importSpreadsheet(file) {
  const projects = allowedProjects().filter(p => ["owner", "editor"].includes(role(p)));
  const projectId = state.projectId || (projects.length === 1 ? projects[0]._id : "");
  if (!projectId || !projects.some(p => p._id === projectId)) throw new Error("Select an editable project before importing.");
  if (!window.XLSX) throw new Error("The spreadsheet reader is not available. Export the file as CSV and try again.");
  const bytes = await file.arrayBuffer();
  const workbook = window.XLSX.read(bytes, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  if (!rows.length) throw new Error("The selected file has no lead rows.");
  const known = new Set(state.contacts.filter(c => c.projectId === projectId).map(c => String(c.phone || "").replace(/\D/g, "")).filter(Boolean));
  let imported = 0, skipped = 0, failed = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i], phone = String(importValue(row, ["phone", "mobile", "mobilenumber", "phonenumber", "contactnumber", "telephone"]) || "").trim();
    const normalized = phone.replace(/\D/g, "");
    if (!normalized || known.has(normalized)) { skipped++; continue; }
    const followUp = parseImportDate(importValue(row, ["followup", "followupdate", "nextfollowup", "followupat"]));
    const dealValue = Number(String(importValue(row, ["dealvalue", "value", "budget", "amount"]) || "0").replace(/[₹,\s]/g, "")) || 0;
    const payload = {
      projectId,
      leadId: String(importValue(row, ["leadid", "id", "srno"]) || ("EKD-" + Date.now().toString().slice(-7) + "-" + (i + 1))),
      businessName: String(importValue(row, ["businessname", "business", "organization", "companyname", "leadname", "name"]) || "").trim(),
      contactPerson: String(importValue(row, ["contactperson", "contactname", "fullname", "person"]) || "").trim(),
      phone,
      phoneNormalized: normalized,
      whatsapp: String(importValue(row, ["whatsapp", "whatsappnumber", "wa"]) || "").trim(),
      email: String(importValue(row, ["email", "emailaddress"]) || "").trim(),
      company: String(importValue(row, ["company", "organizationname"]) || "").trim(),
      city: String(importValue(row, ["city", "town"]) || "").trim(),
      area: String(importValue(row, ["area", "locality", "location"]) || "").trim(),
      address: String(importValue(row, ["address", "fulladdress"]) || "").trim(),
      source: String(importValue(row, ["source", "leadsource", "platform"]) || "Spreadsheet Import").trim(),
      campaign: String(importValue(row, ["campaign", "campaignname"]) || "").trim(),
      category: String(importValue(row, ["category", "interest", "service"]) || "").trim(),
      industry: String(importValue(row, ["industry", "businesscategory"]) || "").trim(),
      website: String(importValue(row, ["website", "url"]) || "").trim(),
      assignedTo: String(importValue(row, ["assignedto", "assignee", "owner"]) || state.member.loginEmail || "").trim(),
      status: String(importValue(row, ["status", "stage", "leadstatus"]) || "New Lead").trim(),
      priority: String(importValue(row, ["priority"]) || "Normal").trim(),
      followUpAt: followUp,
      dealValue,
      remark: String(importValue(row, ["remark", "notes", "comments", "description"]) || "").trim(),
      importedAt: new Date(),
      statusChangedAt: new Date(),
      doNotContact: false
    };
    try {
      await insertItem(COL.contacts, payload);
      known.add(normalized);
      imported++;
    } catch (e) {
      failed++;
    }
  }
  if (imported) await insertItem(COL.activity, {
    projectId,
    activityType: "Bulk import",
    actorEmail: state.member.loginEmail || "",
    actorName: state.member.displayName || "",
    happenedAt: new Date(),
    remark: imported + " leads imported from " + file.name
  });
  await reload();
  toast(imported + " leads imported · " + skipped + " skipped · " + failed + " failed");
}
function exportCsv() {
  const keys = ["leadId", "businessName", "contactPerson", "phone", "whatsapp", "email", "company", "city", "source", "campaign", "assignedTo", "status", "priority", "followUpAt", "dealValue"];
  const csv = [keys.join(","), ...leads().map(c => keys.map(k => '"' + String(c[k] == null ? "" : c[k]).replace(/"/g, '""') + '"').join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = "ekdant-leads.csv"; a.click(); URL.revokeObjectURL(url);
}
function click(e) {
  const b = e.target.closest("[data-crm-action]");
  if (b) {
    const a = b.dataset.crmAction;
    if (a === "new-project") newProjectModal();
    if (a === "import") $("#crm-import-file")?.click();
    if (a === "new-task") newTaskModal();
    if (a === "new-lead") newLeadModal();
    if (a === "new-activity") newActivityModal();
    if (a === "manage-access") manageAccess(b.dataset.id);
    if (a === "call") callModal(b.dataset.id);
    if (a === "detail") detailModal(b.dataset.id);
     if (a === "trash") trashContact(b.dataset.id).catch(err => toast("Could not move lead to Trash: " + err.message));
     if (a === "restore") restoreContact(b.dataset.id).catch(err => toast("Could not restore lead: " + err.message));
    if (a === "close") closeModal();
    if (a === "export") exportCsv();
    if (a === "sort-direction") { state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc"; render(); }
  }
  const nav = e.target.closest("[data-crm-nav]");
  if (nav) setView(nav.dataset.crmNav);
}
async function submit(e) {
  if (e.target.id === "crm-project-form") { e.preventDefault(); const button = e.target.querySelector('button[type="submit"]'); if (button) { button.disabled = true; button.textContent = "Creating…"; } try { await saveProject(e.target); } catch (err) { if (button) { button.disabled = false; button.textContent = "Create project"; } toast("Project not created: " + err.message); } }
  if (e.target.id === "crm-task-form") { e.preventDefault(); const button = e.target.querySelector('button[type="submit"]'); if (button) { button.disabled = true; button.textContent = "Creating…"; } try { await saveTask(e.target); } catch (err) { if (button) { button.disabled = false; button.textContent = "Create task"; } toast("Task not created: " + err.message); } }
  if (e.target.id === "crm-lead-form") {
    e.preventDefault(); const button = e.target.querySelector('button[type="submit"]');
    if (button) { button.disabled = true; button.textContent = "Saving…"; }
    try { await saveLead(e.target); } catch (err) { if (button) { button.disabled = false; button.textContent = "Save lead"; } toast("Lead not saved: " + err.message); }
  }
  if (e.target.id === "crm-activity-form") { e.preventDefault(); try { await saveActivity(e.target); } catch(err) { toast("Activity not saved: "+err.message); } }
  if (e.target.id === "crm-access-form") { e.preventDefault(); try { await saveAccess(e.target); } catch(err) { toast("Access not saved: "+err.message); } }
  if (e.target.id === "crm-call-form") {
    e.preventDefault(); const button = e.target.querySelector('button[type="submit"]');
    if (button) { button.disabled = true; button.textContent = "Saving…"; }
    try { await saveCall(e.target); } catch (err) { if (button) { button.disabled = false; button.textContent = "Save call"; } toast("Call not saved: " + err.message); }
  }
}
function change(e) {
  if (e.target.id === "crm-import-file" && e.target.files && e.target.files[0]) { const file = e.target.files[0]; importSpreadsheet(file).catch(err => toast("Import failed: " + err.message)).finally(() => { e.target.value = ""; }); }
  if (e.target.id === "crm-project-filter") { state.projectId = e.target.value; render(); }
  if (e.target.id === "crm-stage-filter") { state.stage = e.target.value || "all"; render(); }
  if (e.target.id === "crm-source-filter") { state.sourceFilter = e.target.value || "all"; render(); }
  if (e.target.id === "crm-assignee-filter") { state.assigneeFilter = e.target.value || "all"; render(); }
  if (e.target.id === "crm-sort") { state.sortBy = e.target.value || "created"; render(); }
  if (e.target.matches("[data-task-status]")) updateTaskStatus(e.target.dataset.taskStatus, e.target.value).catch(err => toast("Task status not updated: " + err.message));
  if (e.target.matches("[data-automation-rule]")) saveAutomationRule(e.target.dataset.automationRule,e.target.checked).catch(err=>{e.target.checked=!e.target.checked;toast(err.message)});
  if (e.target.matches("[data-crm-status]")) { const id = e.target.dataset.crmStatus, next = e.target.value; e.target.value = ""; if (next) moveStage(id, next).catch(err => toast(err.message)); }
}
function input(e) {
  if (e.target.id === "crm-search") { const pos = e.target.selectionStart; state.query = e.target.value; render(); const box = $("#crm-search"); if (box) { box.focus(); box.setSelectionRange(pos, pos); } }
}
function mount() {
  if (mounted) return; mounted = true;
  const legacyPage = $("#page-content");
  if (legacyPage) legacyPage.style.display = "none";
  const crmPage = document.createElement("div"); crmPage.id = "crm-page";
  const pageWrap = document.querySelector(".page-wrap");
  if (pageWrap) pageWrap.append(crmPage);

  const crumb = $(".crumb");
  if (crumb && !$("#crm-mobile-menu-toggle")) {
    const toggle = document.createElement("button");
    toggle.id = "crm-mobile-menu-toggle";
    toggle.className = "crm-mobile-menu-toggle";
    toggle.type = "button";
    toggle.textContent = "☰";
    toggle.title = "Open navigation";
    toggle.setAttribute("aria-label", "Open navigation");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", "crm-sidebar");
    toggle.addEventListener("click", () => {
      const sidebar = $(".sidebar");
      const scrim = $("#crm-mobile-nav-scrim");
      const open = !!sidebar && !sidebar.classList.contains("mobile-open");
      if (sidebar) sidebar.classList.toggle("mobile-open", open);
      if (scrim) scrim.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
      syncMobileNavAccessibility(open);
      if (open && sidebar) {
        const firstLink = sidebar.querySelector("[data-crm-view]");
        if (firstLink) firstLink.focus();
      }
    });
    crumb.prepend(toggle);

    const scrim = document.createElement("button");
    scrim.id = "crm-mobile-nav-scrim";
    scrim.className = "crm-mobile-nav-scrim";
    scrim.type = "button";
    scrim.setAttribute("aria-label", "Close navigation");
    scrim.setAttribute("aria-hidden", "true");
    scrim.addEventListener("click", closeMobileNav);
    document.body.append(scrim);
  }

  const sidebar = $(".sidebar");
  if (sidebar) {
    sidebar.id = "crm-sidebar";
    sidebar.setAttribute("role", "navigation");
    sidebar.setAttribute("aria-label", "CRM navigation");
  }
  const nav = $(".main-nav");
  if (nav) {
    nav.setAttribute("aria-label", "CRM sections");
    nav.querySelectorAll(":scope > .nav-item, :scope > .nav-label").forEach(el => { el.style.display = "none"; });
    const group = document.createElement("span"); group.className = "nav-label"; group.textContent = "EKDANT CRM";
    nav.append(group);
    const navItems = [
      ["overview", "CRM Overview", "◫"], ["leads", "All Leads", "☷"],
      ["pipeline", "Deal Pipeline", "▥"], ["companies", "Companies", "▦"],
      ["due", "Due Today", "◷"], ["upcoming", "Upcoming", "↗"],
      ["overdue", "Overdue", "!"], ["calls", "Call History", "☎"],
      ["activities", "Activities", "◌"], ["tasks", "Task Manager", "✓"], ["automation", "Automation", "⚙"],
      ["team", "Team & Access", "♧"], ["trash", "Trash & Restore", "⌫"], ["reports", "CRM Reports", "▤"]
    ];
    navItems.forEach(([view, label, glyph]) => {
      const button = document.createElement("button");
      button.className = "nav-item crm-nav-item";
      button.dataset.crmView = view;
      button.title = label;
      button.setAttribute("aria-label", label);
      button.setAttribute("type", "button");
      const icon = document.createElement("span");
      icon.className = "nav-ico";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = glyph;
      const text = document.createElement("span");
      text.className = "crm-nav-text";
      text.textContent = label;
      button.append(icon, text);
      if (view === state.view) button.setAttribute("aria-current", "page");
      nav.append(button);
    });
    nav.addEventListener("click", e => {
      const item = e.target.closest("[data-crm-view]");
      if (item && nav.contains(item)) setView(item.dataset.crmView);
    });
  }
  const modal = document.createElement("div"); modal.id = "crm-modal"; modal.className = "crm-modal-backdrop";
  modal.innerHTML = '<section class="crm-modal"><header><div><span class="eyebrow">EKDANT LEADDESK</span><h2 id="crm-modal-title">CRM</h2></div><button class="icon-btn" data-crm-action="close">×</button></header><div id="crm-modal-content"></div></section>';
  document.body.append(modal);
  modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
  
  $("#crm-page").addEventListener("dragstart",e=>{const c=e.target.closest("[data-drag-lead]");if(c)e.dataTransfer.setData("text/plain",c.dataset.dragLead)});
  $("#crm-page").addEventListener("dragover",e=>{if(e.target.closest("[data-drop-stage]"))e.preventDefault()});
  $("#crm-page").addEventListener("drop",e=>{const lane=e.target.closest("[data-drop-stage]");if(!lane)return;e.preventDefault();const id=e.dataTransfer.getData("text/plain");if(id)moveStage(id,lane.dataset.dropStage).catch(err=>toast(err.message))});

  $("#crm-page").addEventListener("click", click);
  $("#crm-page").addEventListener("change", change);
  $("#crm-page").addEventListener("input", input);
  $("#crm-page").addEventListener("submit", submit);
  $("#crm-modal-content").addEventListener("click", click);
  $("#crm-modal-content").addEventListener("submit", submit);
  $("#crm-modal-content").addEventListener("change", change);
  $("#export-btn").addEventListener("click", exportCsv);
  syncMobileNavAccessibility(false);
  window.addEventListener("resize", () => {
    const sidebar = $(".sidebar");
    syncMobileNavAccessibility(!!(sidebar && sidebar.classList.contains("mobile-open")));
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closeModal(); closeMobileNav(); } });
}
function onMember(s) {
  if (!s || s.loading || !s.loggedIn || !s.member) return;
  state.member = s.member;
  if (!mounted && $("#page-content")) mount();
  state.view = "overview";
  document.querySelectorAll("[data-crm-view]").forEach(b => b.classList.toggle("crm-active", b.dataset.crmView === "overview"));
  reload().catch(err => toast("CRM data could not load: " + err.message));
}
function start() {
  if (!$("#app")) return;
  mount();
  subscribeMember(onMember);
  const current = getMemberState();
  if (!current.loading) onMember(current);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
