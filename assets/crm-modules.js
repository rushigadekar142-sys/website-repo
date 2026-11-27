import { CRM_MODULES, listCrmRecords, createCrmRecord, updateCrmRecord, deleteCrmRecord } from "/js/crm/records.js";

const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=v=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(v||0));
const date=v=>{if(!v)return "—";const d=new Date(v);return isNaN(d)?"—":d.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});};
const navGroups=[
 {label:"SALES",items:[["leads","Leads"],["accounts","Accounts"],["deals","Deals"],["contacts","Contacts"]]},
 {label:"ACTIVITY",items:[["tasks","Tasks"],["events","Meetings & Events"],["calls","Calls"],["notes","Notes"]]},
 {label:"INVENTORY & REVENUE",items:[["products","Products"],["quotes","Quotes"]]},
 {label:"CUSTOMER SERVICE",items:[["tickets","Support Tickets"]]},
 {label:"MARKETING",items:[["campaigns","Campaigns"]]}
];
let active=null,rows=[],search="",editing=null,loading=false;
function installNav(){
 const nav=$(".main-nav");if(!nav||nav.dataset.crmInstalled)return;nav.dataset.crmInstalled="1";
 navGroups.forEach(g=>{const label=document.createElement("span");label.className="nav-label";label.textContent=g.label;nav.append(label);
  g.items.forEach(([key,name])=>{const b=document.createElement("button");b.className="nav-item crm-module-nav";b.type="button";b.dataset.crmModule=key;b.innerHTML='<span class="nav-ico">◈</span>'+name;nav.append(b);});});
}
function render(){
 const def=CRM_MODULES[active];if(!def)return;const target=$("#page-content");if(!target)return;
 const filtered=rows.filter(r=>!search||Object.values(r).some(v=>String(v??"").toLowerCase().includes(search.toLowerCase())));
 const columns=def.columns;const visible=filtered.slice(0,250);
 target.innerHTML='<div class="page-head"><div><span class="eyebrow">VISTAAR CRM / '+esc(def.title.toUpperCase())+'</span><h1>'+esc(def.title)+'</h1><p>Manage, search, update and track every '+esc(def.title.toLowerCase().replace(/s$/,""))+' in your workspace.</p></div><div class="head-actions"><button class="btn btn-secondary" data-crm-action="refresh">↻ Refresh</button><button class="btn btn-primary" data-crm-action="new">＋ New '+esc(def.title.replace(/s$/,""))+'</button></div></div><div class="crm-module-stats"><div class="crm-module-stat"><small>Total records</small><strong>'+rows.length+'</strong></div><div class="crm-module-stat"><small>Showing</small><strong>'+visible.length+'</strong></div><div class="crm-module-stat"><small>Workspace</small><strong>Private</strong></div></div><div class="panel crm-module-panel"><div class="crm-module-toolbar"><input id="crm-module-search" type="search" placeholder="Search '+esc(def.title.toLowerCase())+'…" value="'+esc(search)+'"><span>'+filtered.length+' record(s)</span></div><div class="table-wrap"><table class="crm-module-table"><thead><tr>'+columns.map(c=>'<th>'+esc(def.fields.find(f=>f[0]===c)?.[1]||c.replace(/_/g," "))+'</th>').join("")+'<th>Created</th><th></th></tr></thead><tbody>'+visible.map(r=>'<tr>'+columns.map(c=>'<td>'+cell(c,r[c])+'</td>').join("")+'<td>'+date(r.created_at)+'</td><td class="crm-module-actions"><button data-crm-action="edit" data-id="'+esc(r.id)+'">Edit</button><button class="danger" data-crm-action="delete" data-id="'+esc(r.id)+'">Delete</button></td></tr>').join("")+'</tbody></table></div>'+(visible.length? "":'<div class="crm-module-empty"><strong>No records found</strong><p>Create your first '+esc(def.title.toLowerCase().replace(/s$/,""))+' or change your search.</p></div>')+(filtered.length>250?'<div class="crm-module-foot">Showing first 250 results. Narrow your search to find specific records.</div>':"")+'</div>';
}
function cell(k,v){if(v===null||v===undefined||v==="")return '<span class="muted">—</span>';if(k==="amount"||k==="total"||k==="budget"||k==="actual_cost"||k==="expected_revenue"||k==="unit_price"||k==="annual_revenue")return esc(money(v));if(k.includes("date")||k.endsWith("_at"))return esc(date(v));if(k==="status"||k==="stage"||k==="priority"||k==="outcome")return '<span class="crm-pill">'+esc(v)+'</span>';return esc(v);}
function formHtml(record){
 const def=CRM_MODULES[active];return '<div class="crm-dialog-backdrop" id="crm-dialog"><form class="crm-dialog" id="crm-record-form"><div class="crm-dialog-head"><div><span class="eyebrow">'+(record?"EDIT":"NEW")+' RECORD</span><h2>'+(record?"Edit ":"Create ")+esc(def.title.replace(/s$/,""))+'</h2></div><button type="button" data-crm-action="close" class="icon-btn">×</button></div><div class="crm-dialog-fields">'+def.fields.map(([key,label,type,opts])=>'<label>'+esc(label)+(type==="select"?'<select name="'+key+'">'+opts.map(o=>'<option value="'+esc(o)+'" '+(String(record?.[key]??"")===o?"selected":"")+'>'+esc(o==="true"?"Yes":o==="false"?"No":o)+'</option></select>':type==="textarea"?'<textarea name="'+key+'" rows="3">'+esc(record?.[key]??"")+'</textarea>':'<input name="'+key+'" type="'+type+'" value="'+esc(record?.[key]??"")+'" '+(key===def.primary?"required":"")+' step="'+(type==="number"?"any":"")+'">')+'</label>').join("")+'</div><div class="crm-dialog-foot"><span class="crm-form-error" id="crm-form-error"></span><button type="button" class="btn btn-secondary" data-crm-action="close">Cancel</button><button type="submit" class="btn btn-primary">'+(record?"Save changes":"Create record")+'</button></div></form></div>';
}
function openForm(record){editing=record||null;const wrap=document.createElement("div");wrap.innerHTML=formHtml(record);document.body.append(wrap.firstElementChild);}
function closeForm(){$("#crm-dialog")?.remove();editing=null;}
async function load(key){active=key;search="";document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.crmModule===key));loading=true;$("#page-content").innerHTML='<div class="crm-module-loading">Loading '+esc(CRM_MODULES[key].title)+'…</div>';try{rows=await listCrmRecords(key);render()}catch(e){$("#page-content").innerHTML='<div class="notice">Could not load '+esc(CRM_MODULES[key].title)+': '+esc(e.message||e)+'</div>';}finally{loading=false;}}
document.addEventListener("click",async e=>{
 const nav=e.target.closest("[data-crm-module]");if(nav){e.preventDefault();load(nav.dataset.crmModule);return;}
 const b=e.target.closest("[data-crm-action]");if(!b)return;const action=b.dataset.crmAction;
 if(action==="close"){closeForm();return;}if(action==="new"){openForm(null);return;}
 if(action==="refresh"){load(active);return;}
 if(action==="edit"){const r=rows.find(x=>x.id===b.dataset.id);if(r)openForm(r);return;}
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
