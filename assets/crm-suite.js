import { subscribeMember, getMemberState } from "/js/wix/member-store.js";
import { queryItems, insertItem, patchItemFields } from "/js/wix/items.js";

const COL = { projects: "EkdantProjects", contacts: "EkdantContacts", activity: "EkdantActivity" };
const STAGES = ["New Lead", "Attempted", "Connected", "Interested", "Proposal Sent", "Negotiation", "Converted / Won", "Lost"];
const OUTCOMES = ["Interested", "Not Interested", "No Answer", "Busy", "Switch Off", "Wrong Number", "Call Back Later", "Meeting Scheduled", "Converted", "Lost"];
const $ = (s, root = document) => root.querySelector(s);
const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dateFmt = v => v ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(v)) : "—";
const dayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const state = { member: null, projects: [], contacts: [], activities: [], view: "overview", query: "", projectId: "", stage: "all" };
let mounted = false;

async function allItems(collection) {
  const out = [];
  let skip = 0, page;
  do {
    page = await queryItems(collection, { limit: 100, skip });
    out.push(...(page.items || []));
    skip += 100;
  } while (page.hasNext);
  return out;
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
  return rows;
}
async function reload() {
  const [projects, contacts, activities] = await Promise.all([allItems(COL.projects), allItems(COL.contacts), allItems(COL.activity)]);
  state.projects = projects;
  const ids = new Set(allowedProjects().map(p => p._id));
  state.contacts = contacts.filter(c => ids.has(c.projectId)).map(c => ({ ...c, id: c._id, status: c.status || "New Lead" }));
  state.activities = activities.filter(a => ids.has(a.projectId));
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
function setView(view) {
  state.view = view;
  document.querySelectorAll("[data-crm-view]").forEach(b => b.classList.toggle("crm-active", b.dataset.crmView === view));
  render();
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
  return head("CRM OVERVIEW", "Ekdant LeadDesk", "Your sales activity, lead pipeline and follow-ups in one workspace.", '<button class="btn btn-secondary" data-crm-nav="pipeline">Open pipeline</button><button class="btn btn-primary" data-crm-action="new-lead">＋ Add lead</button>') +
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
  return '<div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>Lead ID</th><th>Business / Contact</th><th>Phone</th><th>Source</th><th>Assigned To</th><th>Stage</th><th>Next Follow-up</th><th>Action</th></tr></thead><tbody>' +
    rows.map(c => '<tr><td>' + esc(c.leadId || c.srNo || "—") + '</td><td><button class="crm-link" data-crm-action="detail" data-id="' + c.id + '">' + esc(c.businessName || c.contactPerson || "Unnamed") + '</button><small>' + esc(c.company || c.city || c.category || "") + '</small></td><td><a href="tel:' + esc(c.phone || "") + '">' + esc(c.phone || "—") + '</a></td><td>' + esc(c.source || "—") + '</td><td>' + esc(c.assignedTo || "Unassigned") + '</td><td><span class="status-pill">' + esc(c.status || "New Lead") + '</span></td><td>' + dateFmt(c.followUpAt) + '</td><td><button class="btn btn-secondary" data-crm-action="call" data-id="' + c.id + '">Log call</button></td></tr>').join("") +
    '</tbody></table></div>';
}
function leadList() {
  const rows = leads();
  return head("LEAD MANAGEMENT", "All Leads", "Search and manage the full lead database.", '<button class="btn btn-primary" data-crm-action="new-lead">＋ Add lead</button>') +
    '<div class="crm-filter-row"><input id="crm-search" class="input-control" placeholder="Search name, phone, company, lead ID…" value="' + esc(state.query) + '">' + projectSelect() + '<select id="crm-stage-filter" class="select-control"><option value="all">All stages</option>' + STAGES.map(s => '<option ' + (state.stage === s ? "selected" : "") + '>' + esc(s) + '</option>').join("") + '</select></div>' + leadTable(rows);
}
function pipeline() {
  const rows = leads();
  return head("SALES OPERATIONS", "Lead Pipeline", "Move prospects through the sales process and record every change.", '<button class="btn btn-primary" data-crm-action="new-lead">＋ Add lead</button>') +
    '<div class="crm-filter-row">' + projectSelect() + '</div><div class="crm-board">' +
    STAGES.map(s => '<section class="crm-stage"><header><b>' + esc(s) + '</b><span>' + rows.filter(c => c.status === s).length + '</span></header>' +
      rows.filter(c => c.status === s).map(c => '<article class="crm-lead-card"><button class="crm-link" data-crm-action="detail" data-id="' + c.id + '">' + esc(c.businessName || c.contactPerson || "Unnamed") + '</button><small>' + esc(c.phone || "No phone") + '</small><div class="crm-card-bottom"><span>' + esc(c.priority || "Normal") + '</span><select class="select-control" data-crm-status="' + c.id + '"><option value="">Move to…</option>' + STAGES.map(x => '<option ' + (x === s ? "disabled" : "") + '>' + esc(x) + '</option>').join("") + '</select></div></article>').join("") + '</section>').join("") + '</div>';
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
  const sourceList = Object.entries(sourceCounts).sort((a,b) => b[1]-a[1]).slice(0,6);
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
function render() {
  const host = $("#crm-page");
  if (!host) return;
  host.innerHTML = state.view === "overview" ? overview() :
    state.view === "pipeline" ? pipeline() :
    state.view === "due" || state.view === "upcoming" || state.view === "overdue" ? followups(state.view) :
    state.view === "calls" ? calls() :
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
function newLeadModal() {
  const editable = allowedProjects().filter(p => ["owner", "editor"].includes(role(p)));
  if (!editable.length) { toast("No editable project is available for this account."); return; }
  openModal("Create lead", '<form id="crm-lead-form"><div class="crm-form-grid">' +
    '<label>Project *<select name="projectId" required>' + editable.map(p => '<option value="' + p._id + '">' + esc(p.name) + '</option>').join("") + '</select></label>' +
    '<label>Business / Full name *<input name="businessName" required></label><label>Contact person<input name="contactPerson"></label>' +
    '<label>Mobile number *<input name="phone" required></label><label>WhatsApp number<input name="whatsapp"></label>' +
    '<label>Email<input name="email" type="email"></label><label>Company<input name="company"></label><label>City<input name="city"></label>' +
    '<label>Lead source<select name="source"><option>Manual</option><option>Instagram</option><option>Facebook Ads</option><option>Google</option><option>Website</option><option>Referral</option></select></label>' +
    '<label>Campaign<input name="campaign"></label><label>Interested in<input name="category"></label><label>Assigned to<input name="assignedTo" placeholder="Employee email or name"></label>' +
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
  const activity = state.activities.filter(a => a.contactId === id).sort((a, b) => new Date(b.happenedAt || 0) - new Date(a.happenedAt || 0)).slice(0, 12);
  openModal(c.businessName || c.contactPerson || "Lead profile", '<div class="crm-detail-grid">' +
    [["Lead ID", c.leadId || c.srNo || id], ["Status", c.status], ["Phone", c.phone], ["WhatsApp", c.whatsapp || c.phone], ["Email", c.email], ["Company", c.company], ["City", c.city || c.area], ["Source", c.source], ["Campaign", c.campaign], ["Assigned to", c.assignedTo], ["Priority", c.priority], ["Follow-up", dateFmt(c.followUpAt)], ["Deal value", c.dealValue ? "₹" + c.dealValue : "—"], ["Payment status", c.paymentStatus]].map(x => '<div><small>' + x[0] + '</small><b>' + esc(x[1] || "—") + '</b></div>').join("") + '</div>' +
    '<div class="crm-modal-actions"><a class="btn btn-secondary" href="tel:' + esc(c.phone || "") + '">Call</a>' + (wa ? '<a class="btn btn-secondary" target="_blank" rel="noopener" href="https://wa.me/' + wa + '">WhatsApp</a>' : "") + '<button class="btn btn-primary" data-crm-action="call" data-id="' + id + '">＋ Log call</button></div>' +
    '<section class="crm-history"><b>Activity timeline</b>' + (activity.map(a => '<div><b>' + esc(a.callOutcome || a.newStatus || a.activityType) + '</b><small>' + dateFmt(a.happenedAt) + ' · ' + esc(a.remark || "") + '</small></div>').join("") || '<p>No activity yet.</p>') + '</section>');
}
function statusForOutcome(outcome) {
  return ({ "Interested": "Interested", "Not Interested": "Not Interested", "No Answer": "Not Picked", "Busy": "Not Picked", "Switch Off": "Not Picked", "Wrong Number": "Wrong Number", "Call Back Later": "Attempted", "Meeting Scheduled": "Connected", "Converted": "Converted / Won", "Lost": "Lost" })[outcome] || "Attempted";
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
    assignedTo: String(fd.get("assignedTo") || state.member.loginEmail || ""),
    priority: String(fd.get("priority") || "Normal"),
    status: String(fd.get("status") || "New Lead"),
    followUpAt: fd.get("followUpAt") ? new Date(fd.get("followUpAt")) : undefined,
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
    if (a === "new-lead") newLeadModal();
    if (a === "call") callModal(b.dataset.id);
    if (a === "detail") detailModal(b.dataset.id);
    if (a === "close") closeModal();
    if (a === "export") exportCsv();
  }
  const nav = e.target.closest("[data-crm-nav]");
  if (nav) setView(nav.dataset.crmNav);
}
async function submit(e) {
  if (e.target.id === "crm-lead-form") {
    e.preventDefault(); const button = e.target.querySelector('button[type="submit"]');
    if (button) { button.disabled = true; button.textContent = "Saving…"; }
    try { await saveLead(e.target); } catch (err) { if (button) { button.disabled = false; button.textContent = "Save lead"; } toast("Lead not saved: " + err.message); }
  }
  if (e.target.id === "crm-call-form") {
    e.preventDefault(); const button = e.target.querySelector('button[type="submit"]');
    if (button) { button.disabled = true; button.textContent = "Saving…"; }
    try { await saveCall(e.target); } catch (err) { if (button) { button.disabled = false; button.textContent = "Save call"; } toast("Call not saved: " + err.message); }
  }
}
function change(e) {
  if (e.target.id === "crm-project-filter") { state.projectId = e.target.value; render(); }
  if (e.target.id === "crm-stage-filter") { state.stage = e.target.value || "all"; render(); }
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
  const nav = $(".main-nav");
  if (nav) {
    nav.querySelectorAll(":scope > .nav-item, :scope > .nav-label").forEach(el => { el.style.display = "none"; });
    const group = document.createElement("span"); group.className = "nav-label"; group.textContent = "EKDANT CRM";
    nav.append(group);
    [["overview", "CRM Overview"], ["leads", "All Leads"], ["pipeline", "Lead Pipeline"], ["due", "Due Today"], ["upcoming", "Upcoming"], ["overdue", "Overdue"], ["calls", "Call History"], ["reports", "CRM Reports"]].forEach(x => {
      const button = document.createElement("button"); button.className = "nav-item crm-nav-item"; button.dataset.crmView = x[0]; button.textContent = x[1]; button.addEventListener("click", () => setView(x[0])); nav.append(button);
    });
  }
  const modal = document.createElement("div"); modal.id = "crm-modal"; modal.className = "crm-modal-backdrop";
  modal.innerHTML = '<section class="crm-modal"><header><div><span class="eyebrow">EKDANT LEADDESK</span><h2 id="crm-modal-title">CRM</h2></div><button class="icon-btn" data-crm-action="close">×</button></header><div id="crm-modal-content"></div></section>';
  document.body.append(modal);
  modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
  $("#crm-page").addEventListener("click", click);
  $("#crm-page").addEventListener("change", change);
  $("#crm-page").addEventListener("input", input);
  $("#crm-page").addEventListener("submit", submit);
  $("#crm-modal-content").addEventListener("click", click);
  $("#crm-modal-content").addEventListener("submit", submit);
  $("#crm-modal-content").addEventListener("change", change);
  $("#export-btn").addEventListener("click", exportCsv);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
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
