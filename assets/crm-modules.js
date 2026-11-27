import { CRM_MODULES, listCrmRecords, createCrmRecord, updateCrmRecord, deleteCrmRecord, convertCrmLead } from "/js/crm/records.js";
import { getMemberState, subscribeMember } from "/js/wix/member-store.js";

const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=v=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(v||0));
const date=v=>{if(!v)return "—";const d=new Date(v);return isNaN(d)?"—":d.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});};
const inputValue=(type,v)=>{if(!v)return "";if(type==="date")return String(v).slice(0,10);if(type==="datetime-local"){const d=new Date(v);return isNaN(d)?"":new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}return v;};
const navGroups=[
 {label:"SALES",items:[["leads","Leads"],["accounts","Accounts"],["deals","Deals"],["contacts","Contacts"]]},
 {label:"ACTIVITY",items:[["tasks","Tasks"],["events","Meetings & Events"],["calls","Calls"],["notes","Notes"]]},
 {label:"INVENTORY & REVENUE",items:[["products","Products"],["quotes","Quotes"]]},
 {label:"CUSTOMER SERVICE",items:[["tickets","Support Tickets"]]},
 {label:"MARKETING",items:[["campaigns","Campaigns"],["emailTemplates","Email Templates"]]},{label:"AUTOMATION & ADMIN",items:[["workflows","Workflow Rules"],["customFields","Custom Fields"],["tags","Tags"],["webforms","Web Forms"],["forecasts","Sales Forecasts"],["territories","Territories"],["approvals","Approval Requests"]]}
];
let active=null,rows=[],search="",editing=null,loading=false,importPreview=null;
function installNav(){
 const nav=$(".main-nav");if(!nav||nav.dataset.crmInstalled)return;nav.dataset.crmInstalled="1";
 navGroups.forEach(g=>{const label=document.createElement("span");label.className="nav-label";label.textContent=g.label;nav.append(label);
  g.items.forEach(([key,name])=>{const b=document.createElement("button");b.className="nav-item crm-module-nav";b.type="button";b.dataset.crmModule=key;b.innerHTML='<span class="nav-ico">◈</span>'+name;nav.append(b);});});
}
let dashboardWorkspace="";
async function loadDashboard(){
 const member=getMemberState().member;if(!member?.workspaceId)return;active=null;dashboardWorkspace=member.workspaceId;
 document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view==="overview"));
 const target=$("#page-content");if(!target)return;target.innerHTML='<div class="crm-module-loading">Building your CRM dashboard…</div>';
 try{
  const [leads,contacts,accounts,deals,tasks,tickets,campaigns]=await Promise.all(["leads","contacts","accounts","deals","tasks","tickets","campaigns"].map(k=>listCrmRecords(k)));
  const openDeals=deals.filter(d=>!["Closed Won","Closed Lost"].includes(d.stage));
  const wonDeals=deals.filter(d=>d.stage==="Closed Won");
  const pipeline=openDeals.reduce((a,d)=>a+Number(d.amount||0),0),won=wonDeals.reduce((a,d)=>a+Number(d.amount||0),0);
  const overdue=tasks.filter(t=>t.due_at&&new Date(t.due_at)<new Date()&&t.status!=="Completed");
  const today=new Date().toISOString().slice(0,10);
  const dueToday=tasks.filter(t=>t.due_at&&String(t.due_at).slice(0,10)===today&&t.status!=="Completed");
  const leadCounts=["New","Contacted","Qualified","Unqualified"].map(status=>({status,count:leads.filter(x=>(x.status||"New")===status).length}));
  const max=Math.max(1,...leadCounts.map(x=>x.count));
  target.innerHTML='<div class="page-head"><div><span class="eyebrow">VISTAAR CRM / WORKSPACE</span><h1>Overview</h1><p>Your sales, customer and service activity in one workspace.</p></div><div class="head-actions"><button class="btn btn-secondary" data-crm-dashboard="refresh">↻ Refresh</button><button class="btn btn-primary" data-crm-dashboard="lead">＋ Add lead</button></div></div><div class="crm-dashboard-grid"><div class="crm-dashboard-card"><small>Total leads</small><strong>'+leads.length+'</strong><span>Prospects in your workspace</span></div><div class="crm-dashboard-card"><small>Contacts</small><strong>'+contacts.length+'</strong><span>People you are managing</span></div><div class="crm-dashboard-card"><small>Accounts</small><strong>'+accounts.length+'</strong><span>Companies and organizations</span></div><div class="crm-dashboard-card"><small>Open pipeline</small><strong>'+esc(money(pipeline))+'</strong><span>'+openDeals.length+' open deal(s)</span></div><div class="crm-dashboard-card"><small>Closed won</small><strong>'+esc(money(won))+'</strong><span>'+wonDeals.length+' won deal(s)</span></div><div class="crm-dashboard-card"><small>Overdue tasks</small><strong>'+overdue.length+'</strong><span>'+dueToday.length+' due today</span></div></div><div class="crm-dashboard-panels"><section class="panel crm-dashboard-panel"><div class="crm-dashboard-title"><h3>Lead pipeline</h3><button data-crm-dashboard="open-leads">View leads →</button></div>'+leadCounts.map(x=>'<div class="crm-bar-row"><span>'+esc(x.status)+'</span><div><i style="width:'+Math.round(x.count/max*100)+'%"></i></div><b>'+x.count+'</b></div>').join("")+'</section><section class="panel crm-dashboard-panel"><div class="crm-dashboard-title"><h3>Work to follow up</h3><button data-crm-dashboard="open-tasks">View tasks →</button></div><div class="crm-dashboard-task"><b>'+overdue.length+'</b><span>Overdue tasks</span></div><div class="crm-dashboard-task"><b>'+dueToday.length+'</b><span>Due today</span></div><div class="crm-dashboard-task"><b>'+tickets.filter(t=>!["Resolved","Closed"].includes(t.status)).length+'</b><span>Open support tickets</span></div><div class="crm-dashboard-task"><b>'+campaigns.filter(c=>c.status==="Active").length+'</b><span>Active campaigns</span></div></section></div>';
 }catch(e){target.innerHTML='<div class="notice">Dashboard could not load: '+esc(e.message||e)+'</div>';}
}
function render(){
 const def=CRM_MODULES[active];if(!def)return;const target=$("#page-content");if(!target)return;
 const filtered=rows.filter(r=>!search||Object.values(r).some(v=>String(v??"").toLowerCase().includes(search.toLowerCase())));
 const columns=def.columns;const visible=filtered.slice(0,250);
 target.innerHTML='<div class="page-head"><div><span class="eyebrow">VISTAAR CRM / '+esc(def.title.toUpperCase())+'</span><h1>'+esc(def.title)+'</h1><p>Manage, search, update and track every '+esc(def.title.toLowerCase().replace(/s$/,""))+' in your workspace.</p></div><div class="head-actions"><button class="btn btn-secondary" data-crm-action="refresh">↻ Refresh</button><button class="btn btn-secondary" data-crm-action="export">⇩ Export</button><button class="btn btn-secondary" data-crm-action="import">⇧ Import</button><button class="btn btn-primary" data-crm-action="new">＋ New '+esc(def.title.replace(/s$/,""))+'</button></div></div><div class="crm-module-stats"><div class="crm-module-stat"><small>Total records</small><strong>'+rows.length+'</strong></div><div class="crm-module-stat"><small>Showing</small><strong>'+visible.length+'</strong></div><div class="crm-module-stat"><small>Workspace</small><strong>Private</strong></div></div><div class="panel crm-module-panel"><div class="crm-module-toolbar"><input id="crm-module-search" type="search" placeholder="Search '+esc(def.title.toLowerCase())+'…" value="'+esc(search)+'"><span>'+filtered.length+' record(s)</span></div><div class="table-wrap"><table class="crm-module-table"><thead><tr>'+columns.map(c=>'<th>'+esc(def.fields.find(f=>f[0]===c)?.[1]||c.replace(/_/g," "))+'</th>').join("")+'<th>Created</th><th></th></tr></thead><tbody>'+visible.map(r=>'<tr>'+columns.map(c=>'<td>'+cell(c,r[c])+'</td>').join("")+'<td>'+date(r.created_at)+'</td><td class="crm-module-actions"><button data-crm-action="edit" data-id="'+esc(r.id)+'">Edit</button>'+(active==="leads"&&!r.converted_at?'<button data-crm-action="convert" data-id="'+esc(r.id)+'">Convert</button>':"")+'<button class="danger" data-crm-action="delete" data-id="'+esc(r.id)+'">Delete</button></td></tr>').join("")+'</tbody></table></div>'+(visible.length? "":'<div class="crm-module-empty"><strong>No records found</strong><p>Create your first '+esc(def.title.toLowerCase().replace(/s$/,""))+' or change your search.</p></div>')+(filtered.length>250?'<div class="crm-module-foot">Showing first 250 results. Narrow your search to find specific records.</div>':"")+'</div>';
}
function cell(k,v){if(v===null||v===undefined||v==="")return '<span class="muted">—</span>';if(k==="amount"||k==="total"||k==="budget"||k==="actual_cost"||k==="expected_revenue"||k==="unit_price"||k==="annual_revenue")return esc(money(v));if(k.includes("date")||k.endsWith("_at"))return esc(date(v));if(k==="status"||k==="stage"||k==="priority"||k==="outcome")return '<span class="crm-pill">'+esc(v)+'</span>';return esc(v);}
function formHtml(record){
 const def=CRM_MODULES[active];return '<div class="crm-dialog-backdrop" id="crm-dialog"><form class="crm-dialog" id="crm-record-form"><div class="crm-dialog-head"><div><span class="eyebrow">'+(record?"EDIT":"NEW")+' RECORD</span><h2>'+(record?"Edit ":"Create ")+esc(def.title.replace(/s$/,""))+'</h2></div><button type="button" data-crm-action="close" class="icon-btn">×</button></div><div class="crm-dialog-fields">'+def.fields.map(([key,label,type,opts])=>'<label>'+esc(label)+(type==="select"?'<select name="'+key+'">'+opts.map(o=>'<option value="'+esc(o)+'" '+(String(record?.[key]??"")===o?"selected":"")+'>'+esc(o==="true"?"Yes":o==="false"?"No":o)+'</option></select>':type==="textarea"?'<textarea name="'+key+'" rows="3">'+esc(inputValue(type,record?.[key]))+'</textarea>':'<input name="'+key+'" type="'+type+'" value="'+esc(record?.[key]??"")+'" '+(key===def.primary?"required":"")+' step="'+(type==="number"?"any":"")+'">')+'</label>').join("")+'</div><div class="crm-dialog-foot"><span class="crm-form-error" id="crm-form-error"></span><button type="button" class="btn btn-secondary" data-crm-action="close">Cancel</button><button type="submit" class="btn btn-primary">'+(record?"Save changes":"Create record")+'</button></div></form></div>';
}
function openForm(record){editing=record||null;const wrap=document.createElement("div");wrap.innerHTML=formHtml(record);document.body.append(wrap.firstElementChild);}
function closeForm(){$("#crm-dialog")?.remove();editing=null;}
function csvEscape(v){const x=String(v??"");return /[",\\n]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x;}
function exportModule(){
 const def=CRM_MODULES[active],keys=def.fields.map(f=>f[0]),header=keys.join(",");
 const lines=rows.map(r=>keys.map(k=>csvEscape(r[k])).join(","));
 const blob=new Blob(["\\ufeff"+[header,...lines].join("\\r\\n")],{type:"text/csv;charset=utf-8"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="vistaar-"+active+"-"+new Date().toISOString().slice(0,10)+".csv";a.click();URL.revokeObjectURL(url);
}
function normalizeHeader(v){return String(v||"").toLowerCase().replace(/[^a-z0-9]/g,"");}
function mapImportRow(row){
 const def=CRM_MODULES[active],lookup=new Map();
 def.fields.forEach(([key,label])=>{lookup.set(normalizeHeader(key),key);lookup.set(normalizeHeader(label),key);});
 const aliases={firstname:"first_name",lastname:"last_name",companyname:"company",business:"businessName",businessname:"businessName",contactname:"contactPerson",contactperson:"contactPerson",mobile:"phone",mobilenumber:"phone",phonenumber:"phone",emailaddress:"email",leadstatus:"status",leadsource:"source",dealvalue:"amount",expectedrevenue:"expected_revenue",duedate:"due_at",taskname:"subject",accountname:"name",productname:"name"};
 const out={};for(const [header,value] of Object.entries(row)){const normalized=normalizeHeader(header),key=lookup.get(normalized)||aliases[normalized];if(key&&value!==""&&value!==null&&value!==undefined)out[key]=value;}
 for(const f of def.fields){if(f[2]==="number"&&out[f[0]]!==undefined)out[f[0]]=Number(String(out[f[0]]).replace(/[,₹ ]/g,""))||0;}
 return out;
}
function importKey(r){
 for(const k of ["email","phone","sku","quote_number","ticket_number"]){if(r[k])return k+":"+String(r[k]).replace(/[^a-z0-9]/gi,"").toLowerCase();}
 if(active==="accounts"&&r.name)return "name:"+String(r.name).trim().toLowerCase();
 if(active==="products"&&r.name)return "name:"+String(r.name).trim().toLowerCase();
 return "";
}
async function chooseImport(){
 const input=document.createElement("input");input.type="file";input.accept=".csv,.xlsx,.xls";input.onchange=async()=>{
  const file=input.files?.[0];if(!file)return;
  try{
   let raw=[];
   if(window.XLSX){const workbook=XLSX.read(await file.arrayBuffer(),{type:"array"});raw=XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]],{defval:""});}
   else if(file.name.toLowerCase().endsWith(".csv")){const text=await file.text();const lines=text.split(/\\r?\\n/).filter(Boolean);const parseLine=line=>{const a=[];let v="",q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'&&line[i+1]==='"'){v+='"';i++;}else if(c==='"')q=!q;else if(c===","&&!q){a.push(v);v="";}else v+=c;}a.push(v);return a;};const h=parseLine(lines.shift()||"");raw=lines.map(line=>Object.fromEntries(parseLine(line).map((v,i)=>[h[i]||("Column "+i),v])));}
   else throw new Error("Excel reader is unavailable. Upload a CSV file.");
   const mapped=raw.map(mapImportRow).filter(r=>Object.values(r).some(v=>String(v??"").trim()));
   const seen=new Set();let duplicates=0;const fresh=[];
   mapped.forEach(r=>{const k=importKey(r);if((k&&seen.has(k))||(k&&rows.some(old=>importKey(old)===k))){duplicates++;return;}if(k)seen.add(k);fresh.push(r);});
   importPreview={fresh,duplicates,total:mapped.length};showImportPreview();
  }catch(err){alert("Import could not be read: "+(err.message||err));}
 };input.click();
}
function showImportPreview(){
 const p=importPreview;if(!p)return;const def=CRM_MODULES[active],sample=p.fresh.slice(0,5),keys=def.columns;
 const wrap=document.createElement("div");wrap.className="crm-dialog-backdrop";wrap.id="crm-import-dialog";
 wrap.innerHTML='<section class="crm-dialog"><div class="crm-dialog-head"><div><span class="eyebrow">DATA IMPORT</span><h2>Import '+esc(def.title)+'</h2></div><button class="icon-btn" data-crm-action="import-close">×</button></div><p class="crm-import-summary">Detected <b>'+p.total+'</b> row(s). <b>'+p.fresh.length+'</b> ready to import; <b>'+p.duplicates+'</b> duplicate(s) will be skipped.</p><div class="table-wrap"><table class="crm-module-table"><thead><tr>'+keys.map(k=>'<th>'+esc(def.fields.find(f=>f[0]===k)?.[1]||k)+'</th>').join("")+'</tr></thead><tbody>'+sample.map(r=>'<tr>'+keys.map(k=>'<td>'+esc(r[k]??"—")+'</td>').join("")+'</tr>').join("")+'</tbody></table></div><p class="crm-import-foot">Columns are matched automatically using field names and common header labels. Only fields recognized for this module will be imported.</p><div class="crm-dialog-foot"><span class="crm-form-error" id="crm-import-error"></span><button class="btn btn-secondary" data-crm-action="import-close">Cancel</button><button class="btn btn-primary" data-crm-action="import-confirm" '+(!p.fresh.length?"disabled":"")+'>Import '+p.fresh.length+' record(s)</button></div></section>';
 document.body.append(wrap);
}
async function confirmImport(button){
 if(!importPreview)return;const batch=importPreview.fresh,duplicateCount=importPreview.duplicates;button.disabled=true;button.textContent="Importing…";let saved=0,failed=0;
 for(let i=0;i<batch.length;i++){try{await createCrmRecord(active,batch[i]);saved++;}catch(e){failed++;}}
 $("#crm-import-error").textContent=saved+" imported · "+failed+" failed";
 if(saved){await load(active);$("#crm-import-dialog")?.remove();importPreview=null;alert("Import finished: "+saved+" imported, "+failed+" failed. "+duplicateCount+" duplicates skipped.");}
 else{button.disabled=false;button.textContent="Retry import";alert("No records were imported. Check required fields and workspace permissions.");}
}

async function load(key){active=key;search="";document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.crmModule===key));loading=true;$("#page-content").innerHTML='<div class="crm-module-loading">Loading '+esc(CRM_MODULES[key].title)+'…</div>';try{rows=await listCrmRecords(key);render()}catch(e){$("#page-content").innerHTML='<div class="notice">Could not load '+esc(CRM_MODULES[key].title)+': '+esc(e.message||e)+'</div>';}finally{loading=false;}}
document.addEventListener("click",async e=>{
 const standardNav=e.target.closest(".nav-item[data-view]");if(standardNav){active=null;if(standardNav.dataset.view==="overview")loadDashboard();return;}
 const nav=e.target.closest("[data-crm-module]");if(nav){e.preventDefault();load(nav.dataset.crmModule);return;}
 const dash=e.target.closest("[data-crm-dashboard]");if(dash){const a=dash.dataset.crmDashboard;if(a==="refresh")loadDashboard();if(a==="lead"){active="leads";load("leads").then(()=>openForm(null));}if(a==="open-leads")load("leads");if(a==="open-tasks")load("tasks");return;}
 const b=e.target.closest("[data-crm-action]");if(!b)return;const action=b.dataset.crmAction;
 if(action==="close"){closeForm();return;}if(action==="new"){openForm(null);return;}
 if(action==="refresh"){load(active);return;}
 if(action==="import"){chooseImport();return;}
 if(action==="export"){exportModule();return;}
 if(action==="import-close"){$("#crm-import-dialog")?.remove();importPreview=null;return;}
 if(action==="import-confirm"){confirmImport(b);return;}
 if(action==="edit"){const r=rows.find(x=>x.id===b.dataset.id);if(r)openForm(r);return;}
 if(action==="convert"){const r=rows.find(x=>x.id===b.dataset.id);if(!r)return;const makeDeal=confirm("Create a Deal during conversion as well?");let amount=0;if(makeDeal){const value=prompt("Enter expected deal amount in INR (optional):","0");if(value===null)return;amount=Number(value)||0;}b.disabled=true;try{await convertCrmLead(r.id,makeDeal,amount);await load("leads");}catch(err){alert(err.message||"Lead conversion failed.");b.disabled=false;}return;}
 if(action==="delete"){const r=rows.find(x=>x.id===b.dataset.id);if(!r||!confirm("Delete this record? This cannot be undone."))return;b.disabled=true;try{await deleteCrmRecord(active,r.id);rows=rows.filter(x=>x.id!==r.id);render()}catch(err){alert(err.message||"Delete failed");b.disabled=false}return;}
});
document.addEventListener("input",e=>{if(e.target.id==="crm-module-search"){search=e.target.value;const pos=e.target.selectionStart;render();const input=$("#crm-module-search");input?.focus();try{input?.setSelectionRange(pos,pos)}catch(_){}}});
document.addEventListener("submit",async e=>{
 if(e.target.id!=="crm-record-form")return;e.preventDefault();const form=e.target,button=form.querySelector('button[type="submit"]'),data=Object.fromEntries(new FormData(form).entries());for(const [k,v] of Object.entries(data)){const f=CRM_MODULES[active].fields.find(x=>x[0]===k);if(f?.[2]==="number")data[k]=v===""?null:Number(v);if(f?.[2]==="select"&&k==="is_active")data[k]=v;}
 button.disabled=true;button.textContent="Saving…";$("#crm-form-error").textContent="";
 try{const saved=editing?await updateCrmRecord(active,editing.id,data):await createCrmRecord(active,data);if(editing)rows=rows.map(x=>x.id===saved.id?saved:x);else rows.unshift(saved);closeForm();render();}
 catch(err){$("#crm-form-error").textContent=err.message||"Could not save record.";button.disabled=false;button.textContent=editing?"Save changes":"Create record";}
});
document.addEventListener("DOMContentLoaded",installNav);installNav();

const initialMember=getMemberState();
if(initialMember.loggedIn&&initialMember.member?.workspaceId)loadDashboard();
else subscribeMember(next=>{if(next.loggedIn&&next.member?.workspaceId&&dashboardWorkspace!==next.member.workspaceId&&!active)loadDashboard();});
