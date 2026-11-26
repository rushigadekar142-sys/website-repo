const ORIGINS=new Set(["https://ekdant-leaddesk.vercel.app","https://headless-gwjjtomxzpx-rushigadekar142-140f.wix-site-host.com"]);
const H={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const WRITE=new Set(["owner","admin","manager"]);
const id=()=>crypto.randomUUID();
const out=(d,s=200,h={})=>new Response(JSON.stringify(d),{status:s,headers:{...H,...h}});
async function who(req,env){
 const token=req.headers.get("Authorization")?.replace(/^Bearer\s+/i,"").trim();
 if(!token||token.length>8192)return null;
 const r=await fetch("https://www.wixapis.com/members/v1/members/my",{headers:{Authorization:token,Accept:"application/json"}});
 if(!r.ok)return null;
 const m=(await r.json()).member;
 if(!m?.id)return null;
 const row=await env.DB.prepare("SELECT wm.id AS mid,wm.workspace_id,wm.role,wm.status,wm.display_name,w.name AS workspace_name,w.slug AS workspace_slug FROM workspace_members wm JOIN workspaces w ON w.id=wm.workspace_id WHERE wm.wix_member_id=? AND wm.status='active' LIMIT 1").bind(m.id).first();
 if(row)return {m,...row};
 const email=String(m.loginEmail||"").trim().toLowerCase();
 if(email){
  const invite=await env.DB.prepare("SELECT id,workspace_id,role FROM workspace_invites WHERE email=? COLLATE NOCASE AND status='pending' LIMIT 1").bind(email).first();
  if(invite){
   const mid=crypto.randomUUID();
   await env.DB.prepare("INSERT OR IGNORE INTO workspace_members(id,workspace_id,wix_member_id,email,display_name,role,status) VALUES(?,?,?,?,?,?,?)").bind(mid,invite.workspace_id,m.id,email,m.profile?.nickname||"",invite.role,"active").run();
   await env.DB.prepare("UPDATE workspace_invites SET status='accepted' WHERE id=? AND status='pending'").bind(invite.id).run();
   const created=await env.DB.prepare("SELECT wm.id AS mid,wm.workspace_id,wm.role,wm.status,wm.display_name,w.name AS workspace_name,w.slug AS workspace_slug FROM workspace_members wm JOIN workspaces w ON w.id=wm.workspace_id WHERE wm.wix_member_id=? AND wm.status='active' LIMIT 1").bind(m.id).first();
   if(created)return {m,...created};
  }
 }
 return {m,denied:true};
}
async function log(env,u,action,type,eid,meta={}){await env.DB.prepare("INSERT INTO audit_logs(id,workspace_id,actor_member_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,?,?,?)").bind(id(),u.workspace_id,u.mid,action,type,eid||null,JSON.stringify(meta)).run()}
export default {async fetch(req,env){
 const url=new URL(req.url),origin=req.headers.get("Origin")||"",cors={"Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"null","Access-Control-Allow-Methods":"GET,POST,PATCH,OPTIONS","Access-Control-Allow-Headers":"Authorization,Content-Type","Access-Control-Max-Age":"86400","Vary":"Origin"};
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(url.pathname==="/health"&&req.method==="GET"){try{const x=await env.DB.prepare("SELECT 1 AS ok").first();return out({ok:x?.ok===1,service:"ekdant-leaddesk-api",database:"connected"},200,cors)}catch{return out({ok:false,database:"unavailable"},503,cors)}}
 if(!url.pathname.startsWith("/api/"))return out({error:"Not found"},404,cors);
 if(!ORIGINS.has(origin))return out({error:"Origin not allowed"},403,cors);
 try{
 const u=await who(req,env);if(!u)return out({error:"Valid Wix member login required"},401,cors);if(u.denied)return out({error:"Wix member is not provisioned in this workspace"},403,cors);
 const p=url.pathname.split("/").filter(Boolean),res=p[1],rid=p[2],limit=Math.min(200,Math.max(1,+url.searchParams.get("limit")||50)),offset=Math.max(0,+url.searchParams.get("offset")||0),write=WRITE.has(u.role);
 if(res==="me"&&req.method==="GET")return out({member:{id:u.m.id,email:u.m.loginEmail,name:u.display_name||u.m.profile?.nickname||"",role:u.role},workspace:{id:u.workspace_id,name:u.workspace_name,slug:u.workspace_slug}},200,cors);
 if(res==="projects"&&req.method==="GET"){const r=await env.DB.prepare("SELECT id,name,description,owner_member_id,created_at,updated_at FROM projects WHERE workspace_id=? ORDER BY name").bind(u.workspace_id).all();return out({items:r.results||[]},200,cors)}
 if(res==="contacts"&&req.method==="GET"){
 const q=(url.searchParams.get("q")||"").trim().slice(0,100),status=url.searchParams.get("status"),project=url.searchParams.get("project_id"),w=["workspace_id=?"],b=[u.workspace_id];
 if(q){w.push("(business_name LIKE ? OR contact_person LIKE ? OR phone LIKE ? OR email LIKE ?)");b.push(...Array(4).fill("%"+q+"%"))}
 if(status){w.push("status=?");b.push(status)}if(project){w.push("project_id=?");b.push(project)}
 const sql="SELECT id,project_id,lead_id,business_name,contact_person,phone,whatsapp,email,company,city,area,address,source,campaign,category,industry,website,status,priority,assigned_to,follow_up_at,deal_value,do_not_contact,created_at,updated_at FROM contacts WHERE "+w.join(" AND ")+" ORDER BY updated_at DESC LIMIT ? OFFSET ?";
 const [r,c]=await Promise.all([env.DB.prepare(sql).bind(...b,limit,offset).all(),env.DB.prepare("SELECT COUNT(*) total FROM contacts WHERE "+w.join(" AND ")).bind(...b).first()]);return out({items:r.results||[],total:c?.total||0,limit,offset},200,cors)}
 if(res==="contacts"&&req.method==="POST"){if(!write)return out({error:"Insufficient role"},403,cors);const b=await req.json(),pr=await env.DB.prepare("SELECT id FROM projects WHERE id=? AND workspace_id=?").bind(String(b.project_id||""),u.workspace_id).first();if(!pr)return out({error:"Valid project_id required"},400,cors);
 const fields=["business_name","contact_person","phone","phone_normalized","whatsapp","email","company","city","area","address","source","campaign","category","industry","website","status","priority","assigned_to","follow_up_at"],vals=fields.map(k=>b[k]==null?null:String(b[k]).slice(0,2000)),cid=id(),sql="INSERT INTO contacts(id,workspace_id,project_id,"+fields.join(",")+",deal_value,data_json) VALUES("+Array(3+fields.length+2).fill("?").join(",")+")";
 await env.DB.prepare(sql).bind(cid,u.workspace_id,pr.id,...vals,Math.max(0,Number(b.deal_value||0)),"{}").run();await log(env,u,"create","contact",cid);return out({id:cid,created:true},201,cors)}
 if(res==="contacts"&&rid&&req.method==="PATCH"){if(!write)return out({error:"Insufficient role"},403,cors);const b=await req.json(),allowed=["business_name","contact_person","phone","phone_normalized","whatsapp","email","company","city","area","address","source","campaign","category","industry","website","status","priority","assigned_to","follow_up_at","deal_value","do_not_contact"],keys=Object.keys(b).filter(k=>allowed.includes(k));if(!keys.length)return out({error:"No editable fields"},400,cors);const vals=keys.map(k=>k==="deal_value"?Math.max(0,Number(b[k]||0)):k==="do_not_contact"?(b[k]?1:0):b[k]==null?null:String(b[k]).slice(0,2000)),r=await env.DB.prepare("UPDATE contacts SET "+keys.map(k=>k+"=?").join(",")+",updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND workspace_id=?").bind(...vals,rid,u.workspace_id).run();if(!r.meta?.changes)return out({error:"Contact not found"},404,cors);await log(env,u,"update","contact",rid,{fields:keys});return out({updated:true},200,cors)}
 if(res==="tasks"&&req.method==="GET"){const r=await env.DB.prepare("SELECT id,project_id,contact_id,title,description,assigned_to,due_at,status,priority,created_at,updated_at FROM tasks WHERE workspace_id=? ORDER BY due_at LIMIT ? OFFSET ?").bind(u.workspace_id,limit,offset).all();return out({items:r.results||[]},200,cors)}
 if(res==="tasks"&&req.method==="POST"){if(!write)return out({error:"Insufficient role"},403,cors);const b=await req.json(),tid=id();if(b.project_id){const p=await env.DB.prepare("SELECT id FROM projects WHERE id=? AND workspace_id=?").bind(b.project_id,u.workspace_id).first();if(!p)return out({error:"Invalid project"},400,cors)}await env.DB.prepare("INSERT INTO tasks(id,workspace_id,project_id,contact_id,title,description,assigned_to,due_at,priority,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(tid,u.workspace_id,b.project_id||null,b.contact_id||null,String(b.title||"").slice(0,200),String(b.description||"").slice(0,2000),b.assigned_to||null,b.due_at||null,String(b.priority||"normal"),u.mid).run();await log(env,u,"create","task",tid);return out({id:tid,created:true},201,cors)}
 if(res==="tasks"&&rid&&req.method==="PATCH"){if(!write)return out({error:"Insufficient role"},403,cors);const b=await req.json(),keys=Object.keys(b).filter(k=>["title","description","assigned_to","due_at","status","priority"].includes(k));if(!keys.length)return out({error:"No editable fields"},400,cors);if(b.status&&!["open","in_progress","done","cancelled"].includes(b.status))return out({error:"Invalid task status"},400,cors);const r=await env.DB.prepare("UPDATE tasks SET "+keys.map(k=>k+"=?").join(",")+",updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND workspace_id=?").bind(...keys.map(k=>b[k]),rid,u.workspace_id).run();if(!r.meta?.changes)return out({error:"Task not found"},404,cors);await log(env,u,"update","task",rid,{fields:keys});return out({updated:true},200,cors)}
 if(res==="activities"&&req.method==="GET"){const r=await env.DB.prepare("SELECT id,project_id,contact_id,activity_type,call_outcome,old_status,new_status,actor_email,actor_name,happened_at,duration_seconds,remark,created_at FROM activities WHERE workspace_id=? ORDER BY happened_at DESC LIMIT ? OFFSET ?").bind(u.workspace_id,limit,offset).all();return out({items:r.results||[]},200,cors)}
 return out({error:"Route not found"},404,cors);
 }catch(e){return out({error:"Request failed safely",detail:String(e?.message||"Internal error").slice(0,160)},500,cors)}
}};