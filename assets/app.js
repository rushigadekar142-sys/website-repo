import { subscribeMember, getMemberState, login, register, verifyEmail, logout } from "/js/wix/member-store.js";
import { startGoogleLogin } from "/js/wix/auth.js";
import { queryItems, insertItem, patchItemFields } from "/js/wix/items.js";

const COL={projects:"EkdantProjects",contacts:"EkdantContacts",activity:"EkdantActivity"};
const S={INTERESTED:"Interested",NOT_INTERESTED:"Not Interested",NOT_PICKED:"Not Picked",WRONG_NUMBER:"Wrong Number",NEW:"New"};
const V={overview:"Overview",projects:"Projects",all:"All contacts",followup:"Follow-up",waiting:"Waiting list",dead:"Dead clients",trash:"Trash numbers",team:"Team",reports:"Reports"};
const $=q=>document.querySelector(q);
const state={member:null,view:"overview",projects:[],contacts:[],activities:[],invites:[],projectId:"",search:"",category:"all",columnFilters:{},importRows:[],loading:true};
const now=()=>new Date().toISOString();
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function toast(t){let x=document.createElement("div");x.className="toast";x.textContent=t;$("#toast-stack").append(x);setTimeout(()=>x.remove(),3500)}
function fmt(t){return t?new Intl.DateTimeFormat("en-IN",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Kolkata"}).format(new Date(t)):"—"}
function elapsed(t){if(!t)return"—";let m=Math.max(0,Math.floor((Date.now()-new Date(t).getTime())/60000)),d=Math.floor(m/1440),h=Math.floor(m%1440/60);return d?d+"d "+h+"h":h?h+"h "+m%60+"m":m+"m"}
function gate(s){let app=$("#app"),a=$("#auth-root");if(s.loading){app.style.display="none";authScreen("Checking your team session…",false);return}if(!s.loggedIn){app.style.display="none";authScreen("Sign in to your Ekdant workspace",true);return}if(a)a.style.display="none";app.style.display="";state.member=s.member||{};$("#user-name").textContent=state.member.displayName||state.member.firstName||"Team member";$("#user-email").textContent=state.member.loginEmail||"";$("#user-avatar").textContent=(state.member.displayName||"EK").slice(0,2).toUpperCase();loadCloud()}
function authScreen(sub,forms){let old=$("#auth-root");if(!old){old=document.createElement("main");old.id="auth-root";old.className="auth-shell";document.body.append(old)}old.style.display="grid";old.innerHTML='<section class="auth-card glass"><a class="brand" href="/"><span class="brand-mark">E</span><span><strong>EKDANT</strong><small>LEADDESK</small></span></a><span class="eyebrow">PRIVATE TEAM WORKSPACE</span><h1>One workspace.<br><em>Every call in order.</em></h1><p class="auth-sub">'+esc(sub)+'</p>'+(forms?'<div class="auth-tabs"><button class="auth-tab active" data-tab="login">Sign in</button><button class="auth-tab" data-tab="register">Create account</button></div><button type="button" class="btn btn-google auth-google" data-action="google-login"><span class="google-mark">G</span><span>Continue with Google</span></button><div class="auth-divider"><span>OR CONTINUE WITH EMAIL</span></div><form id="login-form"><label>Email address<input name="email" type="email" required autocomplete="email"></label><label>Password<input name="password" type="password" required autocomplete="current-password"></label><div class="auth-error" id="login-error"></div><button class="btn btn-primary auth-submit">Sign in</button></form><form id="register-form" hidden><div class="auth-two"><label>First name<input name="firstName" required></label><label>Last name<input name="lastName"></label></div><label>Work email<input name="email" type="email" required></label><label>Password<input name="password" type="password" minlength="8" required></label><div class="auth-error" id="register-error"></div><button class="btn btn-primary auth-submit">Create account</button></form><form id="verify-form" hidden><label>Verification code<input name="code" required></label><div class="auth-error" id="verify-error"></div><button class="btn btn-primary auth-submit">Verify email</button></form><div class="auth-foot">Team members must be approved in Wix before accessing shared contacts.</div>':'<div class="auth-error">'+esc(sub)+'</div>')+'</section>';if(!forms)return;const googleButton=old.querySelector("[data-action=google-login]");if(googleButton)googleButton.addEventListener("click",async e=>{e.preventDefault();e.stopPropagation();const b=e.currentTarget;b.disabled=true;const label=b.querySelector("span:last-child");if(label)label.textContent="Connecting to Google…";const err=old.querySelector("#login-error");if(err)err.textContent="";try{await startGoogleLogin("/")}catch(x){b.disabled=false;if(label)label.textContent="Continue with Google";if(err)err.textContent=x&&x.message?x.message:"Google sign-in could not start."}});old.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{old.querySelectorAll(".auth-tab").forEach(x=>x.classList.toggle("active",x===b));$("#login-form").hidden=b.dataset.tab!=="login";$("#register-form").hidden=b.dataset.tab!=="register"});$("#login-form").onsubmit=async e=>{e.preventDefault();await authSubmit(e.target,login(e.target.email.value,e.target.password.value),"login-error")};$("#register-form").onsubmit=async e=>{e.preventDefault();await authSubmit(e.target,register(e.target.email.value,e.target.password.value,{firstName:e.target.firstName.value,lastName:e.target.lastName.value}),"register-error")};$("#verify-form").onsubmit=async e=>{e.preventDefault();await authSubmit(e.target,verifyEmail(e.target.code.value),"verify-error")}}
async function authSubmit(f,p,id){let b=f.querySelector("button[type=submit]");if(b)b.disabled=true;try{let r=await p;if(r.state==="SUCCESS"){toast("Signed in");return}if(r.state==="EMAIL_VERIFICATION_REQUIRED"){$("#register-form").hidden=true;$("#verify-form").hidden=false;return}if(r.state==="OWNER_APPROVAL_REQUIRED"){$("#"+id).textContent="Membership pending owner approval.";return}$("#"+id).textContent=r.error||r.errorCode||"Unable to sign in."}catch(e){$("#"+id).textContent=e.message||"Sign-in failed"}finally{if(b)b.disabled=false}}
async function queryAll(collectionId){let items=[],skip=0,limit=100,page;do{page=await queryItems(collectionId,{limit,skip});items.push(...(page.items||[]));skip+=limit}while(page.hasNext);return items}
let cloudRecoveryRunning=false;
async function withCloudRetry(task,attempts=4){let last;for(let n=0;n<attempts;n++){try{return await task()}catch(e){last=e;if(n===attempts-1)break;const wait=Math.min(6000,900*Math.pow(2,n));$("#sync-state").textContent="Connection interrupted · retrying "+(n+1)+"/"+(attempts-1);await new Promise(resolve=>setTimeout(resolve,wait));}}throw last}
async function loadCloud(){if(cloudRecoveryRunning)return;cloudRecoveryRunning=true;state.loading=true;$("#sync-state").textContent="Connecting to Wix cloud…";try{let [p,c,a]=await withCloudRetry(()=>Promise.all([queryAll(COL.projects),queryAll(COL.contacts),queryAll(COL.activity)]));state.projects=p;const allowedProjectIds=new Set(p.filter(project=>projectRole(project)!=="none").map(project=>project._id));state.contacts=c.filter(x=>allowedProjectIds.has(x.projectId)).map(x=>({...x,id:x._id,status:x.status||S.NEW}));state.activities=a.filter(x=>allowedProjectIds.has(x.projectId));state.loading=false;$("#sync-state").textContent="Wix cloud connected";$("#sync-caption").textContent=state.contacts.length+" contacts · "+state.projects.length+" projects synced";render()}catch(e){state.loading=false;$("#sync-state").textContent="Cloud unavailable · retry when online";$("#sync-caption").textContent=e.message||"Could not load";render();toast("Cloud connection failed after automatic retries. Your CRM data was not changed.")}finally{cloudRecoveryRunning=false}}
async function refresh(){await loadCloud()}
function nav(v){state.view=v;document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===v));$("#crumb-current").textContent=V[v];render()}
function head(k,t,d,a=""){return '<div class="page-head"><div><span class="eyebrow">'+k+'</span><h1>'+t+'</h1><p>'+d+'</p></div><div class="head-actions">'+a+'</div></div>'}
function stat(l,n,f,i){return '<div class="stat-card"><div class="stat-top">'+l+'<span class="stat-icon">'+i+'</span></div><div class="stat-value">'+n+'</div><div class="stat-foot">'+f+'</div></div>'}
function emailKey(v){return String(v||"").trim().toLowerCase()}
function projectRole(p){const me=emailKey(state.member&&state.member.loginEmail);if(!p||!me)return "none";if(emailKey(p.createdBy)===me)return "owner";const shares=Array.isArray(p.memberEmails)?p.memberEmails:[];const entry=shares.find(x=>emailKey(String(x).split("::")[0])===me);return entry?String(entry).split("::")[1]||"viewer":"none"}
function canEditProject(id){const p=state.projects.find(x=>x._id===id);return ["owner","editor"].includes(projectRole(p))}
function records(ignoreColumnFilters){let allowed=new Set(state.projects.filter(p=>projectRole(p)!=="none").map(p=>p._id));let c=state.contacts.filter(x=>allowed.has(x.projectId)&&(!state.projectId||x.projectId===state.projectId)),v=state.view;if(v==="followup")c=c.filter(x=>x.status===S.INTERESTED);if(v==="waiting")c=c.filter(x=>x.status===S.NEW||x.status===S.NOT_PICKED);if(v==="dead")c=c.filter(x=>x.status===S.NOT_INTERESTED);if(v==="trash")c=c.filter(x=>x.status===S.WRONG_NUMBER);if(state.search){let q=state.search.toLowerCase();c=c.filter(x=>[x.businessName,x.contactPerson,x.phone,x.category,x.area,x.remark].some(y=>String(y||"").toLowerCase().includes(q)))}if(state.category!=="all")c=c.filter(x=>x.category===state.category);if(!ignoreColumnFilters){for(const [k,val] of Object.entries(state.columnFilters||{})){if(val)c=c.filter(x=>columnValue(x,k)===val)}}return c}
function tally(){let c=records();return{all:c.length,interested:c.filter(x=>x.status===S.INTERESTED).length,waiting:c.filter(x=>x.status===S.NEW||x.status===S.NOT_PICKED).length,dead:c.filter(x=>x.status===S.NOT_INTERESTED).length,trash:c.filter(x=>x.status===S.WRONG_NUMBER).length}}
function render(){let n=tally(),v=state.view;$("#page-content").innerHTML=v==="overview"?overview(n):v==="projects"?projects():v==="team"?team():v==="reports"?reports(n):contacts(v)}
function overview(n){let acts=state.activities.slice().sort((a,b)=>new Date(b.happenedAt||b._createdDate)-new Date(a.happenedAt||a._createdDate)).slice(0,5);return head("WORKSPACE OVERVIEW","Welcome, "+esc(state.member.displayName||"Team"),"Live project and contact workspace.",'<button class="btn btn-secondary" data-action="new-project">＋ New project</button><button class="btn btn-primary" data-action="import">⇧ Upload contacts</button>')+'<div class="grid stats-grid">'+stat("Total contacts",n.all,"Selected projects","☷")+stat("Interested",n.interested,"Follow-up queue","↗")+stat("Waiting list",n.waiting,"New or not picked","◷")+stat("Dead / invalid",n.dead+n.trash,"Not interested + wrong","⊘")+'</div><div class="grid overview-grid"><section class="panel"><div class="panel-head"><div><div class="panel-title">Disposition overview</div><div class="panel-sub">Live contact distribution</div></div><button class="panel-action" data-view-link="all">View contacts →</button></div><div class="pipeline-bars">'+[["New / Waiting",n.waiting],["Interested",n.interested],["Not interested",n.dead],["Wrong number",n.trash]].map(x=>'<div class="pipeline-row"><span>'+x[0]+'</span><div class="bar-track"><div class="bar-fill" style="width:'+(x[1]/Math.max(1,n.all)*100)+'%"></div></div><b>'+x[1]+'</b></div>').join("")+'</div></section><section class="panel"><div class="panel-head"><div><div class="panel-title">Recent activity</div><div class="panel-sub">Latest contact changes</div></div></div>'+(acts.length?'<div class="activity-list">'+acts.map(a=>'<div class="activity-row"><span class="activity-dot"></span><div><p><b>'+esc(a.contactId||"Contact")+'</b> · '+esc(a.newStatus||a.activityType||"Updated")+'</p><small>'+fmt(a.happenedAt||a._createdDate)+' · '+esc(a.remark||"")+'</small></div></div>').join("")+'</div>':'<div class="empty-state"><div class="empty-icon">◷</div><b>No activity yet</b><p>Updates will appear here.</p></div>')+'</section></div><section class="panel"><div class="panel-head"><div><div class="panel-title">Your projects</div><div class="panel-sub">Cloud projects shared on this site</div></div><button class="panel-action" data-view-link="projects">All projects →</button></div><div class="grid projects-grid">'+state.projects.map(projectCard).join("")+'</div></section>'}
function projectCard(p){if(projectRole(p)==="none")return "";let n=state.contacts.filter(c=>c.projectId===p._id).length,role=projectRole(p);return '<article class="project-card"><div class="project-top"><span class="project-symbol">▦</span><span class="tag">'+esc(role)+'</span></div><h3>'+esc(p.name)+'</h3><p>'+esc(p.description||"Calling campaign")+'</p><div class="project-meta"><span><b>'+n+'</b> contacts</span><span><b>Live</b> data</span></div>'+(role==="owner"?'<button class="panel-action" data-action="share-project" data-id="'+p._id+'">Share access</button> ':'')+'<button class="project-open" data-action="open-project" data-id="'+p._id+'">↗</button></article>'}
function projects(){return head("PROJECT MANAGEMENT","Projects","Create separate calling campaigns. Projects save to Wix cloud.",'<button class="btn btn-primary" data-action="new-project">＋ Create project</button>')+'<div class="grid projects-grid">'+state.projects.map(projectCard).join("")+'</div>'}
function columnValue(c,k){if(k==="srNo")return String(c.srNo||"—");if(k==="name")return String(c.businessName||c.contactPerson||"Unnamed contact");if(k==="address")return String(c.address||c.area||"—");if(k==="phone")return String(c.phone||"No number");if(k==="status")return String(c.status||S.NEW);if(k==="remark")return String(c.remark||"—");if(k==="followUp")return c.followUpAt?new Date(c.followUpAt).toLocaleDateString("en-IN"):"—";return "—"}
function columnFilterSelect(k,rows){let vals=[...new Set(rows.map(x=>columnValue(x,k)))].sort();return "<select class=select-control data-column-filter="+k+"><option value=\"\">All</option>"+vals.map(v=>"<option value=\""+esc(v)+"\" "+(state.columnFilters[k]===v?"selected":"")+">"+esc(v)+"</option>").join("")+"</select>"}
function filteredHeaders(v,rows){return "<thead><tr><th>Sr. No. "+columnFilterSelect("srNo",rows)+"</th><th>Name "+columnFilterSelect("name",rows)+"</th><th>Address "+columnFilterSelect("address",rows)+"</th><th>Phone No. "+columnFilterSelect("phone",rows)+"</th><th>Status "+columnFilterSelect("status",rows)+"</th><th>"+(v==="followup"?"Time since interested":"Remark")+" "+columnFilterSelect("remark",rows)+"</th><th>Next follow-up "+columnFilterSelect("followUp",rows)+"</th><th>Change status</th></tr></thead>"}
function contacts(v){let l={all:["CONTACT DATABASE","All contacts","Search and update the disposition of every contact."],followup:["INTERESTED PROSPECTS","Follow-up list","Elapsed time since each contact became interested."],waiting:["CALL BACK QUEUE","Waiting list","New leads and contacts that were not picked up."],dead:["CLOSED PROSPECTS","Dead clients","Not interested contacts; status can be updated."],trash:["INVALID CONTACTS","Trash numbers","Wrong numbers; status can be updated if corrected."]}[v],rows=records(),baseRows=records(true),cats=[...new Set(state.contacts.map(x=>x.category).filter(Boolean))];return head(l[0],l[1],l[2],'<button class="btn btn-secondary" data-action="export">⇩ Export</button><button class="btn btn-primary" data-action="import">⇧ Upload contacts</button>')+'<div class="panel table-panel"><div class="table-toolbar"><div class="table-toolbar-left"><label class="table-search"><span>⌕</span><input id="table-search" placeholder="Search this list…" value="'+esc(state.search)+'"></label><select class="select-control" id="category-filter"><option value="all">All categories</option>'+cats.map(x=>'<option value="'+esc(x)+'" '+(state.category===x?"selected":"")+'>'+esc(x)+'</option>').join("")+'</select><select class="select-control" id="project-filter"><option value="">All projects</option>'+state.projects.map(p=>'<option value="'+p._id+'" '+(state.projectId===p._id?"selected":"")+'>'+esc(p.name)+'</option>').join("")+'</select></div></div>'+(rows.length?'<div class="table-scroll"><table>'+filteredHeaders(v,baseRows)+'<tbody>'+rows.map(contactRow).join("")+'</tbody></table></div><div class="table-footer"><span>'+rows.length+' contacts</span><span>Saved to Wix cloud</span></div>':'<div class="empty-state"><div class="empty-icon">☷</div><b>No contacts here yet</b><p>Upload a contact list to get started.</p><button class="btn btn-secondary" data-action="import">Upload contacts</button></div>')+'</div>'}
function contactRow(c){let cl=c.status===S.INTERESTED?"s-interested":c.status===S.NOT_INTERESTED?"s-not-interested":c.status===S.NOT_PICKED||c.status===S.NEW?"s-not-picked":"s-wrong-number";return '<tr><td>'+esc(c.srNo||"—")+'</td><td><span class="contact-name">'+esc(c.businessName||c.contactPerson||"Unnamed contact")+'</span><span class="contact-sub">'+esc(c.contactPerson||c.category||"")+'</span></td><td>'+esc(c.address||c.area||"—")+'</td><td><a class="phone-link" href="tel:'+esc(c.phone||"")+'">'+esc(c.phone||"No number")+'</a></td><td><span class="status-pill '+cl+'">'+esc(c.status||S.NEW)+'</span></td><td class="'+(c.status===S.INTERESTED?"follow-time":"remark-cell")+'">'+(c.status===S.INTERESTED?elapsed(c.statusChangedAt):esc(c.remark||"—"))+'</td><td>'+fmt(c.followUpAt)+'</td><td><select class="select-control status-change" data-id="'+c.id+'"><option value="">Change…</option>'+Object.values(S).map(s=>'<option value="'+s+'" '+(c.status===s?"disabled":"")+'>'+s+'</option>').join("")+'</select></td></tr>'}
function team(){const cards=state.projects.filter(p=>projectRole(p)!=="none").map(p=>{const shares=Array.isArray(p.memberEmails)?p.memberEmails:[];return '<div class="team-row"><div class="team-avatar">▦</div><div><b>'+esc(p.name)+'</b><small>'+(projectRole(p)==="owner"?'Owner':'Shared with you · '+esc(projectRole(p)))+'</small>'+(shares.length?'<small>'+shares.map(x=>{let a=String(x).split("::");return esc(a[0])+" — "+esc(a[1]||"Viewer")}).join(" · ")+'</small>':'')+'</div>'+(projectRole(p)==="owner"?'<button class="btn btn-secondary" data-action="share-project" data-id="'+p._id+'">Share</button>':'')+'</div>'}).join("");return head("COLLABORATION","Share projects","Add people by email and choose Viewer or Editor access. Sharing is currently interface-level only; see the access warning below.","")+'<section class="panel"><div class="panel-title">Project access</div><p>Share each project with a teammate’s sign-in email. They must create/sign into a LeadDesk account with the same email.</p><div class="notice">Security limitation: Viewer/Editor checks currently run in the app interface only. Wix CMS permissions still allow every approved site member to read and write the shared collections directly. This is not yet equivalent to secure Google Sheets sharing. Do not use this for sensitive customer data until server-side access enforcement is added.</div>'+cards+'</section>'}
function reports(n){return head("PERFORMANCE","Reports","Live summary from Wix cloud records.",'<button class="btn btn-secondary" data-action="export">⇩ Export</button>')+'<div class="grid stats-grid">'+stat("Total contacts",n.all,"Selected projects","☷")+stat("Status changes",state.activities.length,"Logged activity","↻")+stat("Interested",n.interested,"Follow-up prospects","↗")+stat("Follow-ups due",state.contacts.filter(x=>x.status===S.INTERESTED&&x.followUpAt&&new Date(x.followUpAt)<=new Date()).length,"Due time passed","◷")+'</div><section class="panel"><div class="panel-title">Disposition counts</div>'+Object.values(S).map(s=>'<div class="metric-row"><span>'+s+'</span><strong>'+state.contacts.filter(x=>x.status===s).length+'</strong></div>').join("")+'</section>'}
function showModal(t,k,b){$("#modal-title").textContent=t;$("#modal-kicker").textContent=k;$("#modal-body").innerHTML=b;$("#modal-backdrop").classList.add("open")}
function closeModal(){$("#modal-backdrop").classList.remove("open")}
function newProject(){showModal("Create new project","PROJECT SETUP",'<form id="project-form"><div class="field"><label>Project name *</label><input name="name" required></div><div class="field"><label>Description</label><textarea name="description"></textarea></div><div class="modal-actions"><button type="button" class="btn btn-quiet" data-action="close">Cancel</button><button class="btn btn-primary">Create project</button></div></form>')}
function importModal(){
  const editableProjects=state.projects.filter(p=>canEditProject(p._id));
  if(!editableProjects.length){toast("You have Viewer access only. Ask the owner for Editor access.");return}
  state.importRows=[];state.importRawRows=[];state.importHeaders=[];state.importMapping={};
  const selectedProject=editableProjects.some(p=>p._id===state.projectId)?state.projectId:(editableProjects.length===1?editableProjects[0]._id:"");
  showModal("Import contacts","SMART FILE IMPORT",'<form id="import-form"><div class="field"><label>Project *</label><select name="projectId" required><option value="">Select a project</option>'+editableProjects.map(p=>'<option value="'+p._id+'" '+(selectedProject===p._id?'selected':'')+'>'+esc(p.name)+'</option>').join("")+'</select></div><div class="upload-drop" id="drop-zone"><div class="upload-icon">⇧</div><b>Upload your contact file</b><small>CSV · TSV · XLSX · XLS · PDF · TXT · JSON · VCF</small></div><input id="import-file-picker" type="file" multiple hidden accept=".csv,.tsv,.xlsx,.xls,.pdf,.txt,.json,.vcf"><div id="upload-files" class="upload-files"></div><div id="import-preview"></div><div class="notice">Review the detected columns before importing. Phone numbers are kept as text to preserve leading zeroes and +91. Scanned/image-only PDFs need OCR; text PDFs are supported. Nothing is saved until you click Import.</div><div class="modal-actions"><button type="button" class="btn btn-quiet" data-action="close">Cancel</button><button type="submit" id="import-submit" class="btn btn-primary" disabled>Import contacts</button></div></form>');
  $("#drop-zone").onclick=()=>$("#import-file-picker").click();
  $("#drop-zone").addEventListener("dragover",e=>{e.preventDefault();e.currentTarget.classList.add("dragging")});
  $("#drop-zone").addEventListener("dragleave",e=>e.currentTarget.classList.remove("dragging"));
  $("#drop-zone").addEventListener("drop",e=>{e.preventDefault();e.currentTarget.classList.remove("dragging");handleFiles(e.dataTransfer.files)});
  $("#import-file-picker").onchange=e=>handleFiles(e.target.files);
}

function cleanHeader(v){return String(v??"").trim().toLowerCase().replace(/[._-]+/g," ").replace(/[^a-z0-9 +]/g," ").replace(/\s+/g," ").trim()}
const FIELD_ALIASES={
  srNo:["sr no","sr no.","sr number","serial no","serial number","s no","s no.","no","id","index"],
  businessName:["name","business name","company name","clinic name","hospital name","doctor name","school name","preschool name","school preschool name","school preschool","organisation","organization","firm name","contact name","customer name","client name","party name","establishment name"],
  contactPerson:["contact person","person name","owner name","proprietor","owner","principal","manager","doctor","person"],
  address:["address","full address","office address","business address","location","complete address","postal address","street address","area address"],
  phone:["phone","phone no","phone number","public phone number","mobile","mobile no","mobile number","contact no","contact number","contact mobile","telephone","tel","whatsapp","whatsapp number","cell","cell number","primary phone","primary mobile","number","mob no","mob"],
  email:["email","email id","email address","e mail"],
  category:["category","type","business type","industry"],
  area:["area","locality","city","town","district","location area"],
  remark:["remark","remarks","notes","comment","comments","follow up notes","followup notes","follow up note"],availability:["contact availability"],sourceDirectory:["source directory"],website:["instagram website","instagram","website"],status:["status","lead status","call status","disposition","call outcome"]
};
function splitPhoneNumbers(v){
  let raw=String(v??"").trim();if(!raw)return [];
  return raw.split(/[\/;,|\n]+/).map(part=>part.trim()).filter(Boolean).map(part=>{let digits=part.replace(/\D/g,"");return {raw:part,digits}}).filter(x=>x.digits.length>=8&&x.digits.length<=15).map(x=>x.raw);
}
function normalizePhone(v){
  if(v===null||v===undefined||String(v).trim()==="")return "";
  let candidates=splitPhoneNumbers(v);if(candidates.length>1)v=candidates[0];
  let s=String(v).trim().replace(/\u00a0/g," ").replace(/\s+/g,"");
  if(/[eE][+-]?\d+$/.test(s)&&/^\+?[\d.]+[eE][+-]?\d+$/.test(s)){let n=Number(s);if(Number.isFinite(n))s=String(Math.round(n))}
  let prefix=s.startsWith("+")?"+":"";
  let digits=s.replace(/\D/g,"");
  if(!digits)return "";
  if(prefix)return "+"+digits;
  if(digits.length===12&&digits.startsWith("91"))return "+"+digits;
  if(digits.length===10)return digits;
  if(digits.length===11&&digits.startsWith("0"))return digits;
  if(digits.length>=8&&digits.length<=15)return digits;
  return String(v).trim();
}
function phoneScore(v){
  let s=String(v??"").trim();if(!s)return 0;
  let candidates=splitPhoneNumbers(s);if(candidates.length)return Math.max(...candidates.map(x=>{let d=x.replace(/\D/g,"");return d.length===10||(d.length===12&&d.startsWith("91"))?5:(d.length===11&&d.startsWith("0"))?4:2}));
  let d=s.replace(/\D/g,"");
  if(d.length===10)return 5;
  if(d.length===12&&d.startsWith("91"))return 5;
  if(d.length===11&&d.startsWith("0"))return 4;
  if(d.length>=8&&d.length<=15&&/[0-9]/.test(s))return 2;
  return 0;
}
function headerScore(row){
  let score=0;for(let cell of row){let h=cleanHeader(cell);for(let [field,aliases] of Object.entries(FIELD_ALIASES)){if(aliases.includes(h)){score+=field==="phone"?5:field==="businessName"?4:2;break}}}return score;
}
function detectHeaderIndex(grid){
  let best={index:0,score:0};for(let i=0;i<Math.min(grid.length,12);i++){let s=headerScore(grid[i]||[]);if(s>best.score)best={index:i,score:s}}
  return best.score>=3?best.index:-1;
}
function makeHeaders(row){return row.map((v,i)=>String(v??"").trim()||"Column "+(i+1))}
function inferMapping(headers,rows){
  let map={};for(let field of Object.keys(FIELD_ALIASES)){let idx=headers.findIndex(h=>FIELD_ALIASES[field].includes(cleanHeader(h)));if(idx>=0)map[field]=headers[idx]}
  if(!map.phone){let best={h:null,s:0};for(let h of headers){let score=rows.slice(0,30).reduce((a,r)=>a+phoneScore(r[h]),0);if(score>best.s)best={h,s:score}}if(best.h&&best.s>=5)map.phone=best.h}
  if(!map.businessName){let best={h:null,s:0};for(let h of headers){if(h===map.phone)continue;let vals=rows.slice(0,20).map(r=>String(r[h]??"").trim()).filter(Boolean);let score=vals.filter(v=>/[a-zA-Z]/.test(v)&&v.length>2&&!/^(address|mobile|phone|email)$/i.test(v)).length;if(score>best.s)best={h,s:score}}if(best.h)map.businessName=best.h}
  if(!map.address){let h=headers.find(h=>/address|location|locality/i.test(h));if(h)map.address=h}
  return map;
}
function gridToRows(grid,fileName){
  let clean=grid.filter(r=>Array.isArray(r)&&r.some(v=>String(v??"").trim()!==""));
  if(!clean.length)return[];
  let hi=detectHeaderIndex(clean),headers=hi>=0?makeHeaders(clean[hi]):makeHeaders(clean[0].map((_,i)=>"Column "+(i+1)));
  let data=clean.slice(hi>=0?hi+1:0);
  // Headerless lists retain the first contact row.
  return data.map((r,i)=>{let o={};headers.forEach((h,j)=>o[h]=r[j]??"");o.__source=fileName;return o}).filter(o=>Object.values(o).some(v=>String(v??"").trim()!==""));
}
function parseCsvSmart(text){
  let candidates=[",",";","\t","|"],best=null;
  for(let d of candidates){let rows=[],row=[],cell="",quoted=false;for(let i=0;i<text.length;i++){let c=text[i],n=text[i+1];if(c==='"'&&quoted&&n==='"'){cell+='"';i++}else if(c==='"')quoted=!quoted;else if(c===d&&!quoted){row.push(cell);cell=""}else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&n==="\n")i++;row.push(cell);if(row.some(x=>String(x).trim()))rows.push(row);row=[];cell=""}else cell+=c}row.push(cell);if(row.some(x=>String(x).trim()))rows.push(row);let widths=rows.slice(0,20).map(r=>r.length),consistent=widths.length?widths.filter(x=>x===widths[0]).length/widths.length:0;let score=(rows[0]?.length||0)*2+consistent*5;if(!best||score>best.score)best={rows,score}}
  return best?.rows||[];
}
function parsePdfRows(text,fileName){
  let out=[];for(let line of text.split(/\r?\n/)){let l=line.trim();if(!l)continue;let matches=l.match(/(?:\+?\d[\d ()-]{7,}\d)/g);if(matches){let phone=matches.sort((a,b)=>phoneScore(b)-phoneScore(a))[0];let name=l.replace(phone,"").replace(/[|,;–—-]+$/,"").trim();out.push({"Name":name||"PDF contact","Phone No":phone,"Address":"","__source":fileName})}}
  return out;
}
function vcardRows(text,fileName){return text.split(/END:VCARD/i).map(b=>({"Name":(b.match(/^FN[^:]*:(.*)$/im)||[])[1]||"","Phone No":(b.match(/^TEL[^:]*:(.*)$/im)||[])[1]||"","Email":(b.match(/^EMAIL[^:]*:(.*)$/im)||[])[1]||"","Address":(b.match(/^ADR[^:]*:(.*)$/im)||[])[1]||"","__source":fileName})).filter(x=>x["Name"]||x["Phone No"])}
async function handleFiles(fileList){
  state.importRows=[];state.importRawRows=[];state.importHeaders=[];state.importMapping={};
  let files=[...fileList];if(!files.length)return;
  const button=$("#import-submit");if(button){button.disabled=true;button.textContent="Import contacts"}
  $("#upload-files").innerHTML=files.map(f=>'<div class="file-row"><span>'+esc(f.name)+'</span><small>'+Math.round(f.size/1024)+' KB</small></div>').join("");
  let all=[];
  for(let f of files){try{
    let ext=f.name.split(".").pop().toLowerCase(),rows=[];
    if(["csv","tsv","txt"].includes(ext)){let t=await f.text();rows=gridToRows(parseCsvSmart(t),f.name)}
    else if(["xlsx","xls"].includes(ext)){
      if(!window.XLSX)throw Error("Excel reader failed to load. Refresh the page and retry.");
      let wb=XLSX.read(await f.arrayBuffer(),{type:"array",cellDates:false});
      for(let sn of wb.SheetNames){let grid=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:"",raw:false});rows.push(...gridToRows(grid,f.name+" / "+sn))}
    }else if(ext==="pdf"){
      if(!window.pdfjsLib)throw Error("PDF reader failed to load. Refresh and retry.");
      let pdf=await pdfjsLib.getDocument({data:await f.arrayBuffer()}).promise,lines=[];
      for(let p=1;p<=pdf.numPages;p++){let page=await pdf.getPage(p),content=await page.getTextContent();lines.push(content.items.map(x=>x.str).join(" "))}
      rows=parsePdfRows(lines.join("\n"),f.name);
      if(!rows.length)toast(f.name+": no selectable text/phone numbers found; scanned PDF needs OCR.");
    }else if(ext==="json"){
      let j=JSON.parse(await f.text()),arr=Array.isArray(j)?j:(j.contacts||j.data||j.results||[]);
      rows=arr.map(x=>({...x,__source:f.name}));
    }else if(ext==="vcf")rows=vcardRows(await f.text(),f.name);
    else throw Error("Unsupported file type: "+ext);
    all.push(...rows);
  }catch(e){toast(f.name+": "+e.message)}}
  state.importRawRows=all;
  state.importHeaders=[...new Set(all.flatMap(r=>Object.keys(r).filter(k=>!k.startsWith("__"))))];
  if(!state.importHeaders.length){$("#import-preview").innerHTML='<div class="notice">No contact rows could be detected. Check the file format or use a text-based PDF/CSV/Excel file.</div>';return}
  state.importMapping=inferMapping(state.importHeaders,all);
  renderImportPreview();
}
function renderImportPreview(){
  const fields=[["srNo","Sr. No."],["businessName","Business / contact name"],["contactPerson","Contact person"],["address","Address"],["phone","Phone number (required)"],["email","Email"],["category","Category"],["remark","Remark"],["status","Status"]];
  const selects=fields.map(([key,label])=>'<div class="field"><label>'+label+'</label><select class="import-map" data-field="'+key+'"><option value="">— Not mapped —</option>'+state.importHeaders.map(h=>'<option value="'+esc(h)+'" '+(state.importMapping[key]===h?"selected":"")+'>'+esc(h)+'</option>').join("")+'</select></div>').join("");
  const preview=state.importRawRows.slice(0,5).map((r,i)=>{const v=k=>state.importMapping[k]?r[state.importMapping[k]]:"";return '<tr><td>'+(i+1)+'</td><td>'+esc(v("businessName")||v("contactPerson")||"—")+'</td><td>'+esc(v("address")||"—")+'</td><td>'+esc(normalizePhone(v("phone"))||"—")+'</td></tr>'}).join("");
  const phones=state.importRawRows.filter(r=>state.importMapping.phone&&phoneScore(r[state.importMapping.phone])>0).length;
  const phoneMapped=Boolean(state.importMapping.phone);
  $("#import-preview").innerHTML='<div class="success-note">'+state.importRawRows.length+' rows detected · '+phones+' rows contain a phone-like number</div><div class="grid import-mapping-grid">'+selects+'</div><div class="table-scroll import-preview-table"><table><thead><tr><th>Sr. No.</th><th>Name</th><th>Address</th><th>Phone No.</th></tr></thead><tbody>'+preview+'</tbody></table></div>'+(phoneMapped?'':'<div class="notice">Select the correct phone-number column to enable importing.</div>');
  const button=$("#import-submit");
  if(button){button.disabled=!state.importRawRows.length||!phoneMapped;button.textContent=phoneMapped?"Import "+state.importRawRows.length+" contacts":"Select phone column"}
}

function mapChanged(e){if(!e.target.matches(".import-map"))return;state.importMapping[e.target.dataset.field]=e.target.value;renderImportPreview()}
function normalizeStatus(v){let s=String(v||"").trim().toLowerCase();if(!s)return S.NEW;if(["interested","hot","positive","follow up","follow-up"].includes(s))return S.INTERESTED;if(["not interested","not-interested","negative","closed","dead"].includes(s))return S.NOT_INTERESTED;if(["not picked","not answered","no answer","unanswered","busy","call back","callback","waiting"].includes(s))return S.NOT_PICKED;if(["wrong number","invalid","invalid number","wrong contact"].includes(s))return S.WRONG_NUMBER;return S.NEW}
function makeContact(r,i,pid,src){
  let get=k=>state.importMapping[k]?r[state.importMapping[k]]:"";
  let rawPhone=get("phone"),phone=normalizePhone(rawPhone);
  let rawSr=get("srNo");
  let name=get("businessName")||get("contactPerson")||"Unnamed contact";
  let alternates=splitPhoneNumbers(rawPhone).slice(1);
  let notes=[get("remark"),get("availability")?"Contact availability: "+get("availability"):"",get("sourceDirectory")?"Source directory: "+get("sourceDirectory"):"",get("website")?"Website / Instagram: "+get("website"):"",alternates.length?"Alternate phone numbers: "+alternates.join(" / "):""];
  let category=get("category")||(/school|preschool/i.test(name+" "+(src||""))?"Preschool":"Other");
  return {projectId:pid,srNo:String(rawSr||i+1),businessName:String(name).trim(),contactPerson:String(get("contactPerson")||"").trim(),address:String(get("address")||"").trim(),area:String(get("area")||"").trim(),phone,email:String(get("email")||"").trim(),category:String(category).trim(),remark:notes.filter(Boolean).join(" | ").trim(),source:src||r.__source||"File import",status:normalizeStatus(get("status")),statusChangedAt:new Date(),importedAt:new Date(),doNotContact:false,verificationStatus:phone?"Needs verification":"Missing phone"};
}
async function saveImport(form){
  if(!canEditProject(new FormData(form).get("projectId")))throw Error("You have Viewer access. Ask the project owner for Editor access.");
  if(!state.importRawRows.length)throw Error("Choose a file and wait for its preview.");
  if(!state.importMapping.phone)throw Error("No readable phone-number column detected.");
  let fd=new FormData(form),pid=fd.get("projectId");if(!pid)throw Error("Create or select a project first.");
  let created=0,failed=0,missingPhone=0,duplicates=0,exactDuplicates=0;
  const existing=state.contacts;
  const leadKey=(name,phone)=>String(name||"").trim().toLowerCase().replace(/\s+/g," ")+"|"+String(phone||"").replace(/\D/g,"");
  const seenLeads=new Set(existing.map(c=>leadKey(c.businessName||c.contactPerson,c.phone)));
  const seenPhones=new Set(existing.map(c=>String(c.phone||"").replace(/\D/g,"")).filter(Boolean));
  for(let i=0;i<state.importRawRows.length;i++){
    let r=state.importRawRows[i],item=makeContact(r,i,pid,r.__source||"File import");
    if(!item.phone)missingPhone++;
    let phoneKey=item.phone.replace(/\D/g,""),key=leadKey(item.businessName,phoneKey);
    if(phoneKey&&seenLeads.has(key)){exactDuplicates++;continue}
    if(phoneKey&&seenPhones.has(phoneKey)){duplicates++;continue}
    try{await insertItem(COL.contacts,item);created++;if(phoneKey){seenLeads.add(key);seenPhones.add(phoneKey)}}catch(e){failed++}
  }
  await insertItem(COL.activity,{projectId:pid,contactId:"",activityType:"Import",oldStatus:"",newStatus:"Imported",remark:"Imported "+created+" contacts; skipped "+missingPhone+" without phone; duplicates "+duplicates+"; failed "+failed,actorEmail:state.member.loginEmail||"",happenedAt:new Date()});
  closeModal();toast("Imported "+created+" · exact duplicates skipped "+exactDuplicates+" · shared numbers flagged "+duplicates+" · missing phone "+missingPhone+" · failed "+failed);await refresh();
}
async function changeStatus(c,s){if(!canEditProject(c.projectId)){toast("You have Viewer access. Ask the owner for Editor access.");return}let old=c.status||S.NEW,at=new Date(),history=[...(c.statusHistory||[]),{from:old,to:s,at:at.toISOString(),by:state.member.loginEmail||""}],follow=c.followUpAt;if(s===S.INTERESTED&&!follow)follow=new Date(Date.now()+86400000);await patchItemFields(COL.contacts,c.id,{status:s,statusChangedAt:at,lastCalledAt:at,followUpAt:follow,statusHistory:history});await insertItem(COL.activity,{projectId:c.projectId,contactId:c.id,activityType:"Status change",oldStatus:old,newStatus:s,remark:c.remark||"",actorEmail:state.member.loginEmail||"",happenedAt:at});toast(c.businessName+" moved to "+s);await refresh()}
function exportCsv(){let k=["businessName","contactPerson","phone","email","category","specialty","area","address","status","remark","followUpAt","statusChangedAt","source","verificationStatus"],r=records(),csv=[k.join(","),...r.map(x=>k.map(y=>'"'+String(x[y]??"").replace(/"/g,'""')+'"').join(","))].join("\r\n"),b=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="ekdant-leads.csv";a.click();URL.revokeObjectURL(u)}
function shareProjectModal(id){const p=state.projects.find(x=>x._id===id);if(!p||projectRole(p)!=="owner"){toast("Only the project owner can manage sharing.");return}const entries=(Array.isArray(p.memberEmails)?p.memberEmails:[]).map(x=>{const a=String(x).split("::");return {email:a[0],role:a[1]||"viewer"}});showModal("Share “"+p.name+"”","PROJECT SHARING",'<form id="share-form" data-id="'+p._id+'"><div class="field"><label>Person’s email address *</label><input name="email" type="email" placeholder="person@example.com" required></div><div class="field"><label>General access</label><select name="role"><option value="viewer">Viewer — can view project contacts</option><option value="editor">Editor — can update and add contacts</option></select></div><div class="notice">These role checks are currently enforced in the interface, not at the Wix data API layer. All approved site members can still access the shared CMS collections directly.</div><div class="modal-actions"><button type="button" class="btn btn-quiet" data-action="close">Cancel</button><button class="btn btn-primary">Share project</button></div></form><div class="panel-title" style="margin-top:20px">People with access</div>'+(entries.length?entries.map(x=>'<div class="team-row"><div><b>'+esc(x.email)+'</b><small>'+esc(x.role)+'</small></div><button class="btn btn-quiet" data-action="remove-share" data-id="'+p._id+'" data-email="'+esc(x.email)+'">Remove</button></div>').join(""):'<p>No one else has access yet.</p>'))}
function inviteModal(){const p=state.projects.find(x=>projectRole(x)==="owner");if(p){shareProjectModal(p._id);return}toast("Create a project first, or ask its owner to share it with you.")}
function click(e){let b=e.target.closest("[data-action]");if(b){let a=b.dataset.action;if(a==="google-login"){b.disabled=true;b.querySelector("span:last-child").textContent="Connecting to Google…";startGoogleLogin("/").catch(x=>{b.disabled=false;b.querySelector("span:last-child").textContent="Continue with Google";const err=$("#login-error");if(err)err.textContent=x.message||"Google sign-in failed"})}if(a==="new-project")newProject();if(a==="import")importModal();if(a==="close")closeModal();if(a==="open-project"){state.projectId=b.dataset.id;nav("all")}if(a==="export")exportCsv();if(a==="invite")inviteModal();if(a==="share-project")shareProjectModal(b.dataset.id);if(a==="remove-share"){const p=state.projects.find(x=>x._id===b.dataset.id);if(p&&projectRole(p)==="owner"){const next=(p.memberEmails||[]).filter(x=>emailKey(String(x).split("::")[0])!==emailKey(b.dataset.email));patchItemFields(COL.projects,p._id,{memberEmails:next}).then(()=>refresh()).then(()=>{shareProjectModal(p._id);toast("Access removed")}).catch(x=>toast("Could not remove access: "+x.message))}}}let l=e.target.closest("[data-view-link]");if(l)nav(l.dataset.viewLink)}
async function submit(e){
  if(e.target.id==="project-form"){
    e.preventDefault();
    const form=e.target,button=form.querySelector("button[type=submit],button:not([type])"),data=new FormData(form),name=String(data.get("name")||"").trim(),description=String(data.get("description")||"").trim();
    if(!name){toast("Enter a project name.");return}
    if(button){button.disabled=true;button.textContent="Saving project…"}
    let saved;
    try{
      saved=await insertItem(COL.projects,{name,description,createdBy:state.member.loginEmail||"",memberEmails:[],createdAt:new Date(),status:"Active"});
      if(!saved||!saved._id)throw Error("Wix did not return a saved project ID. The project was not confirmed as saved.");
      state.projects=[saved,...state.projects.filter(p=>p._id!==saved._id)];
      state.view="projects";state.projectId="";closeModal();render();
      try{await refresh()}catch(syncError){toast("Project saved to Wix. Refresh warning: "+syncError.message);return}
      toast("Project saved successfully to Wix cloud.");
    }catch(err){
      if(button){button.disabled=false;button.textContent="Create project"}
      let box=form.querySelector(".project-save-error");if(!box){box=document.createElement("div");box.className="notice project-save-error";form.querySelector(".modal-actions").before(box)}
      box.textContent="Could not save project: "+(err.message||String(err));toast("Project not saved: "+(err.message||String(err)));
    }
    return;
  }
  if(e.target.id==="import-form"){e.preventDefault();const button=$("#import-submit");if(button){button.disabled=true;button.textContent="Importing…"}try{await saveImport(e.target)}catch(x){if(button){button.disabled=false;button.textContent="Import "+state.importRawRows.length+" contacts"}toast(x.message)}return}
  if(e.target.id==="share-form"){e.preventDefault();const f=e.target,p=state.projects.find(x=>x._id===f.dataset.id),email=emailKey(new FormData(f).get("email")),role=String(new FormData(f).get("role")||"viewer");if(!p||projectRole(p)!=="owner"){toast("Only the owner can share this project.");return}if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){toast("Enter a valid email address.");return}if(email===emailKey(p.createdBy)){toast("This person is already the owner.");return}const list=(p.memberEmails||[]).filter(x=>emailKey(String(x).split("::")[0])!==email);list.push(email+"::"+role);const btn=f.querySelector("button[type=submit],button:not([type])");if(btn){btn.disabled=true;btn.textContent="Saving access…"}try{await patchItemFields(COL.projects,p._id,{memberEmails:list});await refresh();const inviteUrl=location.origin+"/";const subject="You have been invited to a shared Ekdant LeadDesk project";const body="Hello,\n\nYou have been granted "+role+" access to the project: "+p.name+".\nSign in or create an account at: "+inviteUrl+"\nUse this exact email address: "+email+".\n\nEkdant Digital Marketing";window.location.href="mailto:"+encodeURIComponent(email)+"?subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent(body);closeModal();toast("Access saved. Send the invitation email from your email app.")}catch(err){if(btn){btn.disabled=false;btn.textContent="Share project"}toast("Could not save sharing: "+err.message)}return}
}
function change(e){
  const t=e.target;
  if(t.matches(".import-map")){mapChanged(e);return}
  if(t.id==="category-filter"){state.category=t.value||"all";render();return}
  if(t.id==="project-filter"){state.projectId=t.value||"";render();return}if(t.matches("[data-column-filter]")){let k=t.dataset.columnFilter;if(t.value)state.columnFilters[k]=t.value;else delete state.columnFilters[k];render();return}
  if(t.matches(".status-change")){const c=state.contacts.find(x=>(x.id||x._id)===t.dataset.id);const next=t.value;t.value="";if(c&&next)changeStatus(c,next).catch(err=>toast("Status update failed: "+(err.message||String(err))));return}
}
function inputChange(e){if(e.target.id==="table-search"){state.search=e.target.value;const pos=e.target.selectionStart;render();const input=$("#table-search");if(input){input.focus();try{input.setSelectionRange(pos,pos)}catch(_){}}}}
function bind(){document.querySelectorAll(".nav-item").forEach(b=>b.onclick=()=>nav(b.dataset.view));$("#page-content").addEventListener("click",click);$("#page-content").addEventListener("change",change);$("#page-content").addEventListener("input",inputChange);$("#page-content").addEventListener("submit",submit);$("#modal-body").addEventListener("submit",submit);$("#modal-body").addEventListener("change",change);$("#modal-body").addEventListener("click",click);$("#quick-add").onclick=importModal;$("#export-btn").onclick=exportCsv;$("#modal-close").onclick=closeModal;$("#modal-backdrop").onclick=e=>{if(e.target.id==="modal-backdrop")closeModal()};$("#file-picker").onchange=e=>handleFiles(e.target.files);$("#global-search").oninput=e=>{state.search=e.target.value;render()};$("#logout-btn").onclick=()=>logout("/").catch(e=>toast(e.message));document.addEventListener("keydown",e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k")$("#global-search").focus();if(e.key==="Escape")closeModal()})}
function start(){bind();window.addEventListener("online",()=>{if(state.member){toast("Internet restored · reconnecting CRM…");loadCloud()}});window.addEventListener("offline",()=>{$("#sync-state").textContent="Internet disconnected · waiting to reconnect";toast("You are offline. Ekdant LeadDesk will retry when internet returns.")});subscribeMember(gate);if(!getMemberState().loading)gate(getMemberState())}
start();
