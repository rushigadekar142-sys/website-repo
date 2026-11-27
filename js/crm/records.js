import { supabase } from "/js/supabase/client.js";
import { getMemberState } from "/js/wix/member-store.js";

export const CRM_MODULES = {
  leads:{title:"Leads",table:"crm_leads",primary:"company",fields:[
    ["first_name","First name","text"],["last_name","Last name","text"],["company","Company","text"],["title","Job title","text"],["email","Email","email"],["phone","Phone","tel"],["source","Lead source","select",["Website","Referral","Social","Phone","Advertisement","Other"]],["status","Status","select",["New","Contacted","Qualified","Unqualified"]],["industry","Industry","text"],["city","City","text"],["state","State","text"],["description","Description","textarea"]
  ],columns:["company","first_name","email","phone","source","status"]},
  contacts:{title:"Contacts",table:"contacts",primary:"contactPerson",fields:[
    ["businessName","Business / company","text"],["contactPerson","Contact person","text"],["phone","Phone","tel"],["email","Email","email"],["status","Status","select",["New","Interested","Not Interested","Not Picked","Wrong Number","Customer"]],["source","Source","text"],["city","City","text"],["notes","Notes","textarea"]
  ],columns:["businessName","contactPerson","phone","email","status","city"]},
  accounts:{title:"Accounts",table:"crm_accounts",primary:"name",fields:[
    ["name","Account name","text"],["account_type","Type","select",["Customer","Prospect","Partner","Reseller","Vendor","Other"]],["industry","Industry","text"],["website","Website","url"],["phone","Phone","tel"],["email","Email","email"],["annual_revenue","Annual revenue (₹)","number"],["employee_count","Employees","number"]
  ],columns:["name","account_type","industry","phone","website"]},
  deals:{title:"Deals",table:"crm_deals",primary:"name",fields:[
    ["name","Deal name","text"],["stage","Stage","select",["Qualification","Needs Analysis","Proposal","Negotiation","Closed Won","Closed Lost"]],["amount","Amount (₹)","number"],["probability","Probability (%)","number"],["expected_close_date","Expected close date","date"],["lead_source","Lead source","text"],["type","Deal type","select",["New Business","Existing Business"]],["lost_reason","Lost reason","text"]
  ],columns:["name","stage","amount","probability","expected_close_date"]},
  tasks:{title:"Tasks",table:"crm_tasks",primary:"subject",fields:[
    ["subject","Task subject","text"],["status","Status","select",["Not Started","In Progress","Completed","Deferred","Waiting"]],["priority","Priority","select",["Low","Normal","High","Urgent"]],["due_at","Due date","datetime-local"],["description","Description","textarea"],["related_type","Related record type","select",["Lead","Contact","Account","Deal","Ticket","Other"]]
  ],columns:["subject","status","priority","due_at","related_type"]},
  events:{title:"Meetings & Events",table:"crm_events",primary:"title",fields:[
    ["title","Event title","text"],["starts_at","Start date & time","datetime-local"],["ends_at","End date & time","datetime-local"],["location","Location","text"],["description","Description","textarea"],["related_type","Related record type","select",["Lead","Contact","Account","Deal","Other"]]
  ],columns:["title","starts_at","ends_at","location"]},
  calls:{title:"Calls",table:"crm_calls",primary:"subject",fields:[
    ["subject","Call subject","text"],["call_type","Call type","select",["Outbound","Inbound"]],["outcome","Call outcome","select",["Connected","No Answer","Busy","Wrong Number","Call Back","Interested","Not Interested"]],["started_at","Call date & time","datetime-local"],["duration_seconds","Duration (seconds)","number"],["phone","Phone","tel"],["notes","Call notes","textarea"]
  ],columns:["subject","call_type","outcome","started_at","phone"]},
  notes:{title:"Notes",table:"crm_notes",primary:"title",fields:[
    ["title","Note title","text"],["body","Note","textarea"],["related_type","Related record type","select",["Lead","Contact","Account","Deal","Other"]],["related_id","Related record ID","text"]
  ],columns:["title","related_type","related_id","created_at"]},
  products:{title:"Products",table:"crm_products",primary:"name",fields:[
    ["name","Product name","text"],["sku","SKU","text"],["description","Description","textarea"],["unit","Unit","text"],["unit_price","Selling price (₹)","number"],["cost_price","Cost price (₹)","number"],["tax_rate","Tax rate (%)","number"],["is_active","Active","select",["true","false"]]
  ],columns:["name","sku","unit_price","tax_rate","is_active"]},
  quotes:{title:"Quotes",table:"crm_quotes",primary:"subject",fields:[
    ["subject","Quote subject","text"],["quote_number","Quote number","text"],["status","Status","select",["Draft","Sent","Accepted","Rejected","Expired"]],["issue_date","Issue date","date"],["expiry_date","Expiry date","date"],["subtotal","Subtotal (₹)","number"],["discount","Discount (₹)","number"],["tax_total","Tax total (₹)","number"],["total","Total (₹)","number"],["currency","Currency","text"],["terms","Terms & conditions","textarea"]
  ],columns:["quote_number","subject","status","issue_date","total"]},
  tickets:{title:"Support Tickets",table:"crm_tickets",primary:"subject",fields:[
    ["subject","Ticket subject","text"],["status","Status","select",["Open","In Progress","On Hold","Resolved","Closed"]],["priority","Priority","select",["Low","Normal","High","Urgent"]],["channel","Channel","select",["Email","Phone","Website","Social","Other"]],["ticket_number","Ticket number","text"],["due_at","Due date","datetime-local"],["description","Description","textarea"]
  ],columns:["ticket_number","subject","status","priority","channel","created_at"]},
  campaigns:{title:"Campaigns",table:"crm_campaigns",primary:"name",fields:[
    ["name","Campaign name","text"],["type","Campaign type","select",["Email","Social","Webinar","Event","Ads","Referral","Other"]],["status","Status","select",["Draft","Planned","Active","Completed","Cancelled"]],["start_date","Start date","date"],["end_date","End date","date"],["budget","Budget (₹)","number"],["actual_cost","Actual cost (₹)","number"],["expected_revenue","Expected revenue (₹)","number"],["description","Description","textarea"]
  ],columns:["name","type","status","start_date","budget","expected_revenue"]}
};

const REQUIRED = {leads:"company",contacts:"contactPerson",accounts:"name",deals:"name",tasks:"subject",events:"title",calls:"subject",notes:"title",products:"name",quotes:"subject",tickets:"subject",campaigns:"name",emailTemplates:"name",workflows:"name",customFields:"label",tags:"name",webforms:"name",forecasts:"period_start",territories:"name",approvals:"record_id"};
const clean = (v) => JSON.parse(JSON.stringify(v,(_k,x)=>x instanceof Date?x.toISOString():x));
function currentWorkspace(){const m=getMemberState().member;if(!m?.workspaceId||!m?.id)throw new Error("Your workspace session is not ready. Sign in again.");return m;}
function typedColumns(key,p){
 const common={};
 if(key==="leads")Object.assign(common,{company:p.company||"",first_name:p.first_name||null,last_name:p.last_name||null,email:p.email||null,phone:p.phone||null,source:p.source||null,status:p.status||"New",assigned_to:p.assigned_to||null});
 if(key==="contacts")Object.assign(common,{project_id:p.projectId||null,phone_normalized:String(p.phone||"").replace(/[^0-9]/g,"")||null,email_normalized:String(p.email||"").trim().toLowerCase()||null,assigned_to:p.assigned_to||null});
 if(key==="accounts")Object.assign(common,{name:p.name,account_type:p.account_type||null,industry:p.industry||null,website:p.website||null,phone:p.phone||null,email:p.email||null,annual_revenue:p.annual_revenue||null,employee_count:p.employee_count||null,assigned_to:p.assigned_to||null});
 if(key==="deals")Object.assign(common,{name:p.name,stage:p.stage||"Qualification",amount:Number(p.amount||0),probability:Number(p.probability||0),expected_close_date:p.expected_close_date||null,lead_source:p.lead_source||null,type:p.type||null,lost_reason:p.lost_reason||null,assigned_to:p.assigned_to||null});
 if(key==="tasks")Object.assign(common,{subject:p.subject,status:p.status||"Not Started",priority:p.priority||"Normal",due_at:p.due_at||null,assigned_to:p.assigned_to||null});
 if(key==="events")Object.assign(common,{title:p.title,starts_at:p.starts_at||new Date().toISOString(),ends_at:p.ends_at||null,location:p.location||null,assigned_to:p.assigned_to||null});
 if(key==="calls")Object.assign(common,{subject:p.subject,call_type:p.call_type||"Outbound",outcome:p.outcome||null,started_at:p.started_at||new Date().toISOString(),duration_seconds:Number(p.duration_seconds||0),phone:p.phone||null,notes:p.notes||null,assigned_to:p.assigned_to||null});
 if(key==="notes")Object.assign(common,{title:p.title,body:p.body||""});
 if(key==="products")Object.assign(common,{name:p.name,sku:p.sku||null,unit_price:Number(p.unit_price||0),cost_price:p.cost_price===""?null:Number(p.cost_price||0),tax_rate:Number(p.tax_rate||0),is_active:p.is_active!=="false"});
 if(key==="quotes")Object.assign(common,{subject:p.subject,quote_number:p.quote_number||null,status:p.status||"Draft",issue_date:p.issue_date||new Date().toISOString().slice(0,10),expiry_date:p.expiry_date||null,subtotal:Number(p.subtotal||0),discount:Number(p.discount||0),tax_total:Number(p.tax_total||0),total:Number(p.total||0),currency:p.currency||"INR",terms:p.terms||null});
 if(key==="tickets")Object.assign(common,{subject:p.subject,ticket_number:p.ticket_number||null,status:p.status||"Open",priority:p.priority||"Normal",channel:p.channel||null,due_at:p.due_at||null,description:p.description||null,assigned_to:p.assigned_to||null});
 if(key==="campaigns")Object.assign(common,{name:p.name,type:p.type||null,status:p.status||"Draft",start_date:p.start_date||null,end_date:p.end_date||null,budget:Number(p.budget||0),actual_cost:Number(p.actual_cost||0),expected_revenue:Number(p.expected_revenue||0),description:p.description||null});
 if(key==="emailTemplates")Object.assign(common,{name:p.name,subject:p.subject,category:p.category||null,body_html:p.body_html||"",body_text:p.body_text||"",is_active:p.is_active!=="false"});
 if(key==="workflows")Object.assign(common,{name:p.name,module:p.module||"leads",trigger_type:p.trigger_type||"manual",description:p.description||null,is_active:false,trigger_config:{},conditions:[],actions:[]});
 if(key==="customFields")Object.assign(common,{module:p.module||"leads",field_key:p.field_key,label:p.label,field_type:p.field_type||"text",is_required:p.is_required==="true",is_active:p.is_active!=="false"});
 if(key==="tags")Object.assign(common,{name:p.name,color:p.color||"#64748b"});
 if(key==="webforms")Object.assign(common,{name:p.name,module:p.module||"leads",success_message:p.success_message||null,is_active:false,fields:[]});
 if(key==="forecasts")Object.assign(common,{period_start:p.period_start,period_end:p.period_end,target_amount:Number(p.target_amount||0),pipeline_amount:Number(p.pipeline_amount||0),committed_amount:Number(p.committed_amount||0),closed_amount:Number(p.closed_amount||0),notes:p.notes||null});
 if(key==="territories")Object.assign(common,{name:p.name,description:p.description||null,rules:{}});
 if(key==="approvals")Object.assign(common,{module:p.module||"deals",record_id:p.record_id,status:p.status||"Pending",reason:p.reason||null,decision_note:p.decision_note||null,approver_id:null,decided_at:null});
 return common;
}
function fromRow(key,row){return {...(row.data||{}),...row,id:row.id,_createdDate:row.created_at,_updatedDate:row.updated_at||row.created_at};}
export async function listCrmRecords(key,{limit=500}={}){
 const def=CRM_MODULES[key];if(!def)throw new Error("Unknown CRM module.");
 const m=currentWorkspace();
 const {data,error}=await supabase.from(def.table).select("*").eq("workspace_id",m.workspaceId).order("created_at",{ascending:false}).limit(limit);
 if(error)throw error;return (data||[]).map(r=>fromRow(key,r));
}
export async function createCrmRecord(key,values){
 const def=CRM_MODULES[key],m=currentWorkspace();if(!def)throw new Error("Unknown CRM module.");
 const payload=clean(values||{});const required=REQUIRED[key];if(required&&!String(payload[required]||"").trim())throw new Error(def.fields.find(f=>f[0]===required)?.[1]+" is required.");
 const row={workspace_id:m.workspaceId,created_by:m.id,data:payload,...typedColumns(key,payload)};
 const {data,error}=await supabase.from(def.table).insert(row).select("*").single();if(error)throw error;return fromRow(key,data);
}
export async function updateCrmRecord(key,id,values){
 const def=CRM_MODULES[key],m=currentWorkspace();if(!def)throw new Error("Unknown CRM module.");
 const {data:old,error:readError}=await supabase.from(def.table).select("*").eq("id",id).eq("workspace_id",m.workspaceId).single();if(readError)throw readError;
 const payload={...(old.data||{}),...clean(values||{})};const required=REQUIRED[key];if(required&&!String(payload[required]||"").trim())throw new Error("Required field is missing.");
 const patch={data:payload,updated_at:new Date().toISOString(),...typedColumns(key,payload)};
 const {data,error}=await supabase.from(def.table).update(patch).eq("id",id).eq("workspace_id",m.workspaceId).select("*").single();if(error)throw error;return fromRow(key,data);
}
export async function deleteCrmRecord(key,id){
 const def=CRM_MODULES[key],m=currentWorkspace();if(!def)throw new Error("Unknown CRM module.");
 const {error}=await supabase.from(def.table).delete().eq("id",id).eq("workspace_id",m.workspaceId);if(error)throw error;return true;
}
