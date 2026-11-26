const ORIGINS=new Set([
 "https://ekdant-leaddesk.vercel.app",
 "https://headless-gwjjtomxzpx-rushigadekar142-140f.wix-site-host.com",
 "https://ekdant-leaddesk-recovery.pages.dev"
]);
const H={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const GLOBAL_WRITE=new Set(["owner","admin","manager"]);
const COLLECTIONS={EkdantProjects:"projects",EkdantContacts:"contacts",EkdantActivity:"activities"};
const CONTACT_FIELDS={leadId:"lead_id",businessName:"business_name",contactPerson:"contact_person",phone:"phone",phoneNormalized:"phone_normalized",whatsapp:"whatsapp",email:"email",company:"company",city:"city",area:"area",address:"address",source:"source",campaign:"campaign",category:"category",industry:"industry",website:"website",status:"status",priority:"priority",assignedTo:"assigned_to",followUpAt:"follow_up_at",dealValue:"deal_value",doNotContact:"do_not_contact"};
const ACTIVITY_FIELDS={activityType:"activity_type",callOutcome:"call_outcome",oldStatus:"old_status",newStatus:"new_status",actorEmail:"actor_email",actorName:"actor_name",happenedAt:"happened_at",durationSeconds:"duration_seconds",remark:"remark"};
const id=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const out=(d,s=200,h={})=>new Response(JSON.stringify(d),{status:s,headers:{...H,...h}});
const emailKey=v=>String(v||"").trim().toLowerCase();
function parse(v,fallback){try{return JSON.parse(v)}catch{return fallback}}
function normalize(v){
 if(Array.isArray(v))return v.map(normalize);
 if(v&&typeof v==="object"){
  if(typeof v.$date==="string")return v.$date;
  const o={};for(const [k,x] of Object.entries(v))o[k]=normalize(x);return o;
 }
 return v;
}
function cleanData(v){const d=v&&typeof v==="object"&&!Array.isArray(v)?v:{};const o={};for(const [k,x] of Object.entries(d)){if(k!=="__proto__"&&k!=="constructor"&&k!=="prototype"&&typeof k==="string"&&k.length<100)o[k]=x}return o}
function dataFor(kind,row){
 const d=normalize(parse(row.data_json,{}))||{};
 const base={...d,_id:row.wix_id||row.id,_createdDate:d._createdDate||row.created_at,_updatedDate:d._updatedDate||row.updated_at};
 if(kind==="projects")return {...base,name:row.name||d.name||"",description:row.description??d.description??"",memberEmails:parse(row.member_emails_json,d.memberEmails||[])||[]};
 if(kind==="contacts")return {...base,projectId:row.project_id,businessName:row.business_name??d.businessName??"",contactPerson:row.contact_person??d.contactPerson??"",phone:row.phone??d.phone??"",phoneNormalized:row.phone_normalized??d.phoneNormalized??"",whatsapp:row.whatsapp??d.whatsapp??"",email:row.email??d.email??"",company:row.company??d.company??"",city:row.city??d.city??"",area:row.area??d.area??"",address:row.address??d.address??"",source:row.source??d.source??"",campaign:row.campaign??d.campaign??"",category:row.category??d.category??"",industry:row.industry??d.industry??"",website:row.website??d.website??"",status:row.status??d.status??"New",priority:row.priority??d.priority??"Normal",assignedTo:row.assigned_to??d.assignedTo??"",followUpAt:row.follow_up_at??d.followUpAt??null,dealValue:row.deal_value??d.dealValue??0,doNotContact:!!(row.do_not_contact??d.doNotContact)};
 return {...base,projectId:row.project_id,contactId:row.contact_id||d.contactId||"",activityType:row.activity_type??d.activityType??"",callOutcome:row.call_outcome??d.callOutcome??"",oldStatus:row.old_status??d.oldStatus??"",newStatus:row.new_status??d.newStatus??"",actorEmail:row.actor_email??d.actorEmail??"",actorName:row.actor_name??d.actorName??"",happenedAt:row.happened_at??d.happenedAt??row.created_at, durationSeconds:row.duration_seconds??d.durationSeconds??0,remark:row.remark??d.remark??""};
}
function projectRole(row,u){
 if(!row)return "none";
 if(u.role==="owner"||u.role==="admin")return "owner";
 if(u.role==="manager")return "editor";
 const d=parse(row.data_json,{})||{},email=emailKey(u.m.loginEmail);
 if(row.owner_member_id===u.mid||emailKey(d.createdBy)===email)return "owner";
 const shares=parse(row.member_emails_json,d.memberEmails||[])||[];
 const entry=shares.find(x=>emailKey(String(x).split("::")[0])===email);
 return entry?(String(entry).split("::")[1]||"viewer").toLowerCase():"none";
}
async function projectsFor(env,u){
 const r=await env.DB.prepare("SELECT * FROM projects WHERE workspace_id=? ORDER BY name").bind(u.workspace_id).all();
 return (r.results||[]).map(row=>({row,role:projectRole(row,u)})).filter(x=>x.role!=="none");
}
async function projectFor(env,u,pid){
 return await env.DB.prepare("SELECT * FROM projects WHERE id=? AND workspace_id=?").bind(String(pid||""),u.workspace_id).first();
}
async function canEditProject(env,u,pid){
 const p=await projectFor(env,u,pid);return p&&["owner","editor"].includes(projectRole(p,u))?p:null;
}
async function who(req,env){
 const token=req.headers.get("Authorization")?.replace(/^Bearer\\s+/i,"").trim();
 if(!token||token.length>8192)return null;
 const r=await fetch("https://www.wixapis.com/members/v1/members/my",{headers:{Authorization:token,Accept:"application/json"}});
 if(!r.ok)return null;
 const m=(await r.json()).member;
 if(!m?.id)return null;
 const row=await env.DB.prepare("SELECT wm.id AS mid,wm.workspace_id,wm.role,wm.status,wm.display_name,w.name AS workspace_name,w.slug AS workspace_slug FROM workspace_members wm JOIN workspaces w ON w.id=wm.workspace_id WHERE wm.wix_member_id=? AND wm.status='active' LIMIT 1").bind(m.id).first();
 if(row)return {m,...row};
 const email=emailKey(m.loginEmail);
 if(!email)return {m,denied:true};
 const invite=await env.DB.prepare("SELECT id,workspace_id,role FROM workspace_invites WHERE email=? COLLATE NOCASE AND status='pending' LIMIT 1").bind(email).first();
 if(invite){
  const mid=id();
  await env.DB.prepare("INSERT OR IGNORE INTO workspace_members(id,workspace_id,wix_member_id,email,display_name,role,status) VALUES(?,?,?,?,?,?,?)").bind(mid,invite.workspace_id,m.id,email,m.profile?.nickname||m.profile?.firstName||"",invite.role,"active").run();
  await env.DB.prepare("UPDATE workspace_invites SET status='accepted' WHERE id=? AND status='pending'").bind(invite.id).run();
  const created=await env.DB.prepare("SELECT wm.id AS mid,wm.workspace_id,wm.role,wm.status,wm.display_name,w.name AS workspace_name,w.slug AS workspace_slug FROM workspace_members wm JOIN workspaces w ON w.id=wm.workspace_id WHERE wm.wix_member_id=? AND wm.status='active' LIMIT 1").bind(m.id).first();
  if(created)return {m,...created};
 }
 // A verified Wix member invited to a specific project can be provisioned as a workspace member.
 const workspaces=await env.DB.prepare("SELECT id FROM workspaces").all();
 for(const ws of workspaces.results||[]){
  const rows=await env.DB.prepare("SELECT member_emails_json,data_json FROM projects WHERE workspace_id=?").bind(ws.id).all();
  const invited=(rows.results||[]).some(p=>{
   const shares=parse(p.member_emails_json,parse(p.data_json,{})?.memberEmails||[])||[];
   return shares.some(x=>emailKey(String(x).split("::")[0])===email);
  });
  if(invited){
   await env.DB.prepare("INSERT OR IGNORE INTO workspace_members(id,workspace_id,wix_member_id,email,display_name,role,status) VALUES(?,?,?,?,?,?,?)").bind(id(),ws.id,m.id,email,m.profile?.nickname||m.profile?.firstName||"","member","active").run();
   const created=await env.DB.prepare("SELECT wm.id AS mid,wm.workspace_id,wm.role,wm.status,wm.display_name,w.name AS workspace_name,w.slug AS workspace_slug FROM workspace_members wm JOIN workspaces w ON w.id=wm.workspace_id WHERE wm.wix_member_id=? AND wm.status='active' LIMIT 1").bind(m.id).first();
   if(created)return {m,...created};
  }
 }
 return {m,denied:true};
}
async function log(env,u,action,type,eid,meta={}){
 await env.DB.prepare("INSERT INTO audit_logs(id,workspace_id,actor_member_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,?,?,?)").bind(id(),u.workspace_id,u.mid,action,type,eid||null,JSON.stringify(meta)).run();
}
function mapValues(data,map){
 const cols=[],vals=[];
 for(const [key,col] of Object.entries(map)){
  if(!Object.prototype.hasOwnProperty.call(data,key))continue;
  let v=data[key];
  if(v&&typeof v==="object"&&typeof v.$date==="string")v=v.$date;
  if(v instanceof Date)v=v.toISOString();
  if(col==="deal_value")v=Math.max(0,Number(v||0));
  else if(col==="do_not_contact")v=v?1:0;
  else if(col==="duration_seconds")v=Math.max(0,Math.floor(Number(v||0)));
  else if(v!==null&&typeof v!=="number")v=String(v).slice(0,4000);
  cols.push(col);vals.push(v??null);
 }
 return {cols,vals};
}
async function listCollection(env,u,kind,url){
 const allowed=await projectsFor(env,u),ids=allowed.map(x=>x.row.id);
 const limit=Math.min(200,Math.max(1,Number(url.searchParams.get("limit"))||50));
 const offset=Math.max(0,Number(url.searchParams.get("offset"))||0);
 if(kind==="projects"){
  const all=allowed.map(x=>dataFor("projects",x.row));
  return {items:all.slice(offset,offset+limit),total:all.length,limit,offset,hasNext:offset+limit<all.length};
 }
 if(!ids.length)return {items:[],total:0,limit,offset,hasNext:false};
 const where=["workspace_id=?","project_id IN ("+ids.map(()=>"?").join(",")+")"],params=[u.workspace_id,...ids];
 const project=url.searchParams.get("project_id"),status=url.searchParams.get("status"),q=(url.searchParams.get("q")||"").trim().slice(0,100);
 if(project&&ids.includes(project)){where.push("project_id=?");params.push(project)}
 if(status&&kind==="contacts"){where.push("status=?");params.push(status)}
 if(q&&kind==="contacts"){where.push("(business_name LIKE ? OR contact_person LIKE ? OR phone LIKE ? OR email LIKE ?)");params.push(...Array(4).fill("%"+q+"%"))}
 const table=kind==="contacts"?"contacts":"activities",order=kind==="contacts"?"updated_at DESC":"happened_at DESC";
 const sql="SELECT * FROM "+table+" WHERE "+where.join(" AND ")+" ORDER BY "+order+" LIMIT ? OFFSET ?";
 const [rows,count]=await Promise.all([
  env.DB.prepare(sql).bind(...params,limit,offset).all(),
  env.DB.prepare("SELECT COUNT(*) AS total FROM "+table+" WHERE "+where.join(" AND ")).bind(...params).first()
 ]);
 const total=count?.total||0;
 return {items:(rows.results||[]).map(x=>dataFor(kind,x)),total,limit,offset,hasNext:offset+limit<total};
}
async function createCollection(env,u,kind,body){
 const d=cleanData(body?.data??body),rid=id(),at=now();
 if(kind==="projects"){
  if(!GLOBAL_WRITE.has(u.role))return {error:"Only workspace owners and administrators can create projects",status:403};
  d._id=rid;d.createdBy=emailKey(u.m.loginEmail);d.memberEmails=Array.isArray(d.memberEmails)?d.memberEmails:[];d._createdDate=at;d._updatedDate=at;
  await env.DB.prepare("INSERT INTO projects(id,workspace_id,wix_id,name,description,owner_member_id,member_emails_json,data_json) VALUES(?,?,?,?,?,?,?,?)").bind(rid,u.workspace_id,rid,String(d.name||"Untitled project").slice(0,200),String(d.description||"").slice(0,2000),u.mid,JSON.stringify(d.memberEmails),JSON.stringify(d)).run();
  await log(env,u,"create","project",rid);return {item:dataFor("projects",await env.DB.prepare("SELECT * FROM projects WHERE id=?").bind(rid).first()),created:true};
 }
 const pid=String(d.projectId||d.project_id||"");
 const project=await canEditProject(env,u,pid);
 if(!project)return {error:"Project not found or edit access denied",status:403};
 d._id=rid;d.projectId=pid;d._createdDate=at;d._updatedDate=at;
 if(kind==="contacts"){
  const mapped=mapValues(d,CONTACT_FIELDS),cols=["id","workspace_id","project_id",...mapped.cols,"data_json"],vals=[rid,u.workspace_id,pid,...mapped.vals,JSON.stringify(d)];
  const placeholders=cols.map(()=>"?").join(",");
  await env.DB.prepare("INSERT INTO contacts("+cols.join(",")+") VALUES("+placeholders+")").bind(...vals).run();
  await log(env,u,"create","contact",rid,{project_id:pid});
  return {item:dataFor("contacts",await env.DB.prepare("SELECT * FROM contacts WHERE id=?").bind(rid).first()),created:true};
 }
 if(kind==="activities"){
  const cid=String(d.contactId||"");
  let validContact=null;
  if(cid)validContact=await env.DB.prepare("SELECT id FROM contacts WHERE id=? AND project_id=? AND workspace_id=?").bind(cid,pid,u.workspace_id).first();
  const mapped=mapValues(d,ACTIVITY_FIELDS),cols=["id","workspace_id","project_id","contact_id",...mapped.cols,"data_json"],vals=[rid,u.workspace_id,pid,validContact?cid:null,...mapped.vals,JSON.stringify(d)];
  await env.DB.prepare("INSERT INTO activities("+cols.join(",")+") VALUES("+cols.map(()=>"?").join(",")+")").bind(...vals).run();
  await log(env,u,"create","activity",rid,{project_id:pid});
  return {item:dataFor("activities",await env.DB.prepare("SELECT * FROM activities WHERE id=?").bind(rid).first()),created:true};
 }
 return {error:"Unsupported collection",status:404};
}
async function patchCollection(env,u,kind,rid,body){
 const d=cleanData(body?.data??body),at=now();
 if(kind==="projects"){
  const row=await projectFor(env,u,rid);
  if(!row||projectRole(row,u)!=="owner")return {error:"Project owner access required",status:403};
  const merged={...normalize(parse(row.data_json,{})),...d,_id:row.wix_id||row.id,_updatedDate:at};
  const members=Array.isArray(merged.memberEmails)?merged.memberEmails:[];
  await env.DB.prepare("UPDATE projects SET name=?,description=?,member_emails_json=?,data_json=?,updated_at=? WHERE id=? AND workspace_id=?").bind(String(merged.name||row.name).slice(0,200),String(merged.description||"").slice(0,2000),JSON.stringify(members),JSON.stringify(merged),at,rid,u.workspace_id).run();
  await log(env,u,"update","project",rid,{fields:Object.keys(d)});
  return {item:dataFor("projects",await projectFor(env,u,rid)),updated:true};
 }
 if(kind==="contacts"){
  const row=await env.DB.prepare("SELECT * FROM contacts WHERE id=? AND workspace_id=?").bind(rid,u.workspace_id).first();
  if(!row||!(await canEditProject(env,u,row.project_id)))return {error:"Contact not found or edit access denied",status:403};
  const merged={...normalize(parse(row.data_json,{})),...d,_id:row.wix_id||row.id,_updatedDate:at};
  const mapped=mapValues(d,CONTACT_FIELDS),sets=mapped.cols.map(c=>c+"=?");
  sets.push("data_json=?","updated_at=?");
  await env.DB.prepare("UPDATE contacts SET "+sets.join(",")+" WHERE id=? AND workspace_id=?").bind(...mapped.vals,JSON.stringify(merged),at,rid,u.workspace_id).run();
  await log(env,u,"update","contact",rid,{fields:Object.keys(d)});
  return {item:dataFor("contacts",await env.DB.prepare("SELECT * FROM contacts WHERE id=?").bind(rid).first()),updated:true};
 }
 if(kind==="activities"){
  const row=await env.DB.prepare("SELECT * FROM activities WHERE id=? AND workspace_id=?").bind(rid,u.workspace_id).first();
  if(!row||!(await canEditProject(env,u,row.project_id)))return {error:"Activity not found or edit access denied",status:403};
  const merged={...normalize(parse(row.data_json,{})),...d,_id:row.wix_id||row.id,_updatedDate:at};
  const mapped=mapValues(d,ACTIVITY_FIELDS),sets=mapped.cols.map(c=>c+"=?");sets.push("data_json=?");
  await env.DB.prepare("UPDATE activities SET "+sets.join(",")+" WHERE id=? AND workspace_id=?").bind(...mapped.vals,JSON.stringify(merged),rid,u.workspace_id).run();
  await log(env,u,"update","activity",rid,{fields:Object.keys(d)});
  return {item:dataFor("activities",await env.DB.prepare("SELECT * FROM activities WHERE id=?").bind(rid).first()),updated:true};
 }
 return {error:"Unsupported collection",status:404};
}
export default {async fetch(req,env){
 const url=new URL(req.url),origin=req.headers.get("Origin")||"",allowed=ORIGINS.has(origin);
 const cors={"Access-Control-Allow-Origin":allowed?origin:"null","Access-Control-Allow-Methods":"GET,POST,PATCH,OPTIONS","Access-Control-Allow-Headers":"Authorization,Content-Type","Access-Control-Max-Age":"86400","Vary":"Origin"};
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(url.pathname==="/health"&&req.method==="GET"){try{const x=await env.DB.prepare("SELECT 1 AS ok").first();return out({ok:x?.ok===1,service:"ekdant-leaddesk-api",database:"connected"},200,cors)}catch{return out({ok:false,database:"unavailable"},503,cors)}}
 if(!url.pathname.startsWith("/api/"))return out({error:"Not found"},404,cors);
 if(!allowed)return out({error:"Origin not allowed"},403,cors);
 try{
  const u=await who(req,env);if(!u)return out({error:"Valid Wix member login required"},401,cors);if(u.denied)return out({error:"Wix member is not provisioned in this workspace"},403,cors);
  const p=url.pathname.split("/").filter(Boolean),res=p[1],rid=p[3]||p[2],limit=Math.min(200,Math.max(1,Number(url.searchParams.get("limit"))||50)),offset=Math.max(0,Number(url.searchParams.get("offset"))||0);
  if(res==="me"&&req.method==="GET")return out({member:{id:u.m.id,email:u.m.loginEmail,name:u.display_name||u.m.profile?.nickname||"",role:u.role},workspace:{id:u.workspace_id,name:u.workspace_name,slug:u.workspace_slug}},200,cors);
  if(res==="collections"){
   const collection=decodeURIComponent(p[2]||""),kind=COLLECTIONS[collection];
   if(!kind)return out({error:"Unknown CRM collection"},404,cors);
   if(req.method==="GET")return out(await listCollection(env,u,kind,url),200,cors);
   if(req.method==="POST"){const result=await createCollection(env,u,kind,await req.json());return out(result,result.status||201,cors)}
   if(req.method==="PATCH"&&rid){const result=await patchCollection(env,u,kind,rid,await req.json());return out(result,result.status||200,cors)}
   return out({error:"Method not allowed"},405,cors);
  }
  if(res==="projects"&&req.method==="GET"){const r=await listCollection(env,u,"projects",url);return out({items:r.items,total:r.total},200,cors)}
  if(res==="contacts"&&req.method==="GET"){return out(await listCollection(env,u,"contacts",url),200,cors)}
  if(res==="activities"&&req.method==="GET"){return out(await listCollection(env,u,"activities",url),200,cors)}
  if(res==="tasks"&&req.method==="GET"){
   const access=await projectsFor(env,u),ids=access.map(x=>x.row.id);if(!ids.length)return out({items:[]},200,cors);
   const r=await env.DB.prepare("SELECT id,project_id,contact_id,title,description,assigned_to,due_at,status,priority,created_at,updated_at FROM tasks WHERE workspace_id=? AND project_id IN ("+ids.map(()=>"?").join(",")+") ORDER BY due_at LIMIT ? OFFSET ?").bind(u.workspace_id,...ids,limit,offset).all();
   return out({items:r.results||[]},200,cors);
  }
  if(res==="tasks"&&req.method==="POST"){
   const b=await req.json(),pid=String(b.project_id||"");if(!pid||!(await canEditProject(env,u,pid)))return out({error:"Project edit access required"},403,cors);
   const tid=id();if(b.contact_id){const c=await env.DB.prepare("SELECT id FROM contacts WHERE id=? AND project_id=? AND workspace_id=?").bind(b.contact_id,pid,u.workspace_id).first();if(!c)return out({error:"Invalid contact"},400,cors)}
   await env.DB.prepare("INSERT INTO tasks(id,workspace_id,project_id,contact_id,title,description,assigned_to,due_at,priority,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(tid,u.workspace_id,pid,b.contact_id||null,String(b.title||"").slice(0,200),String(b.description||"").slice(0,2000),b.assigned_to||null,b.due_at||null,String(b.priority||"normal"),u.mid).run();
   await log(env,u,"create","task",tid);return out({id:tid,created:true},201,cors);
  }
  if(res==="tasks"&&rid&&req.method==="PATCH"){
   const row=await env.DB.prepare("SELECT project_id FROM tasks WHERE id=? AND workspace_id=?").bind(rid,u.workspace_id).first();if(!row||!(await canEditProject(env,u,row.project_id)))return out({error:"Task not found or edit access denied"},403,cors);
   const b=await req.json(),keys=Object.keys(b).filter(k=>["title","description","assigned_to","due_at","status","priority"].includes(k));if(!keys.length)return out({error:"No editable fields"},400,cors);
   if(b.status&& !["open","in_progress","done","cancelled"].includes(b.status))return out({error:"Invalid task status"},400,cors);
   await env.DB.prepare("UPDATE tasks SET "+keys.map(k=>k+"=?").join(",")+",updated_at=? WHERE id=? AND workspace_id=?").bind(...keys.map(k=>b[k]),now(),rid,u.workspace_id).run();await log(env,u,"update","task",rid,{fields:keys});return out({updated:true},200,cors);
  }
  return out({error:"Route not found"},404,cors);
 }catch(e){return out({error:"Request failed safely",detail:String(e?.message||"Internal error").slice(0,160)},500,cors)}
}};
