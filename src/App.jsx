import { useState, useEffect, useCallback, useRef } from "react";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged, signOut
} from "firebase/auth";
import {
  doc, setDoc, getDoc, getDocs, addDoc, collection,
  collectionGroup, query, where, orderBy, serverTimestamp,
  deleteDoc, onSnapshot, updateDoc, runTransaction
} from "firebase/firestore";
import { auth, db, toEmail, createAccount } from "./firebase";

// ── UTILS ─────────────────────────────────────────────────────────────────────
const AV_COLORS = ["#1e3a5f","#1a4731","#5c2d0e","#2d3a8c","#4a1a5c","#2d4a6a","#3a1a4a","#1a3a4a"];
const ini  = (n="?") => n.trim().split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
const randC = () => AV_COLORS[Math.floor(Math.random()*AV_COLORS.length)];
const genPw = () => { const c="abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#"; return Array.from({length:12},()=>c[Math.floor(Math.random()*c.length)]).join(""); };
const pwStr = (pw) => { if(!pw)return 0; let s=0; if(pw.length>=6)s++; if(pw.length>=10)s++; if(/[A-Z]|[0-9]/.test(pw))s++; if(/[^a-zA-Z0-9]/.test(pw)||pw.length>=14)s++; return s; };
const fmt$  = (n) => "$"+Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtTs = (ts) => { if(!ts)return"—"; const d=ts?.toDate?ts.toDate():new Date(ts); return d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); };
const fmtTime=(ts)=>{ if(!ts)return"—"; const d=ts?.toDate?ts.toDate():new Date(ts); return d.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",hour12:true}); };
const durStr=(ms)=>{ if(!ms||ms<0)return"—"; const h=Math.floor(ms/3600000); const m=Math.floor((ms%3600000)/60000); return h>0?`${h}h ${m}m`:`${m}m`; };
const STR_LBL = ["","Very weak","Weak","Good","Strong"];
const ROLES   = ["client","manager"];

const INV_STATUS = ["draft","sent","viewed","paid","overdue"];
const INV_COLOR  = { draft:"#718096", sent:"#1e90ff", viewed:"#f59e0b", paid:"#10b981", overdue:"#ef4444" };
const INV_BG     = { draft:"rgba(113,128,150,.18)", sent:"rgba(30,144,255,.18)", viewed:"rgba(245,158,11,.18)", paid:"rgba(16,185,129,.18)", overdue:"rgba(239,68,68,.18)" };

// ── TOASTS ────────────────────────────────────────────────────────────────────
const useToasts = () => {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type="ok") => {
    const id = Date.now();
    setToasts(p=>[...p,{id,msg,type}]);
    setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)), 4500);
  },[]);
  const rm = id => setToasts(p=>p.filter(t=>t.id!==id));
  return { toasts, add, rm };
};
const Toasts = ({toasts,rm}) => (
  <div className="toast-wrap">
    {toasts.map(t=>(
      <div key={t.id} className={`toast ${t.type}`}>
        <span>{t.msg}</span>
        <span className="toast-x" onClick={()=>rm(t.id)}>×</span>
      </div>
    ))}
  </div>
);

// ── ICONS ─────────────────────────────────────────────────────────────────────
const Icon = ({name, size=18}) => {
  const p = {fill:"none",stroke:"currentColor",strokeWidth:"1.8",strokeLinecap:"round",strokeLinejoin:"round"};
  const icons = {
    home:    <><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
    invoice: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
    users:   <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></>,
    clock:   <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    plus:    <><line x1="12" y1="5" x2="12" y2="19" strokeWidth="2"/><line x1="5" y1="12" x2="19" y2="12" strokeWidth="2"/></>,
    bell:    <><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></>,
    chat:    <><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" style={{display:"inline-block",verticalAlign:"middle",flexShrink:0}} {...p}>{icons[name]}</svg>;
};

const Logo = ({small}) => (
  <div style={{display:"flex",alignItems:"center",gap:small?6:8}}>
    <img src="/icon-192.png" alt="MB" style={{width:small?26:32,height:small?26:32,borderRadius:small?6:8}}/>
    <span style={{fontFamily:"'DM Serif Display',serif",fontSize:small?18:20,color:"var(--gold2)"}}>MB Electronics</span>
  </div>
);

// ── FIREBASE HELPERS ──────────────────────────────────────────────────────────
const saveNotif = async (uid, title, body) => {
  if (!uid) return;
  await addDoc(collection(db,"notifications"), { uid, title, body, read:false, createdAt:serverTimestamp() });
};

const getNextInvoiceNumber = async () => {
  const ref = doc(db, "meta", "invoiceCounter");
  let num = 1;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    num = snap.exists() ? (snap.data().current||0)+1 : 1;
    tx.set(ref, { current: num }, { merge: true });
  });
  return `INV-${new Date().getFullYear()}-${String(num).padStart(3,"0")}`;
};

// ── INVOICE DETAIL SHEET ──────────────────────────────────────────────────────
const InvoiceSheet = ({ inv, onClose, isAdmin, toast }) => {
  const [loading, setLoading] = useState(false);
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState([]);
  const [status, setStatus] = useState(inv.status||"draft");
  const commentRef = useRef(null);

  useEffect(()=>{
    const unsub = onSnapshot(
      query(collection(db,"invoices",inv.id,"comments"), orderBy("createdAt","asc")),
      snap => setComments(snap.docs.map(d=>({id:d.id,...d.data()})))
    );
    return ()=>unsub();
  },[inv.id]);

  const changeStatus = async (s) => {
    setLoading(true);
    try {
      await updateDoc(doc(db,"invoices",inv.id), { status:s, updatedAt:serverTimestamp() });
      setStatus(s);
      if (s==="sent" && inv.clientUid) {
        await saveNotif(inv.clientUid, "📄 New Invoice", `Invoice ${inv.invoiceNumber} — ${fmt$(inv.total)} is ready for you.`);
      }
      if (s==="paid") {
        await saveNotif(inv.clientUid||"", "✅ Invoice Paid", `Invoice ${inv.invoiceNumber} has been marked as paid. Thank you!`);
      }
      toast(`Status updated to ${s}`, "ok");
    } catch(e) { toast("Error: "+e.message, "err"); }
    setLoading(false);
  };

  const addComment = async () => {
    const txt = comment.trim();
    if (!txt) return;
    setComment("");
    await addDoc(collection(db,"invoices",inv.id,"comments"), {
      text: txt, createdAt: serverTimestamp(),
      author: isAdmin ? "MB Electronics" : "Client",
      isAdmin,
    });
    if (isAdmin && inv.clientUid) {
      await saveNotif(inv.clientUid, "💬 New comment", `MB Electronics commented on invoice ${inv.invoiceNumber}`);
    }
  };

  const total = inv.total || (inv.services||[]).reduce((s,r)=>s+(parseFloat(r.qty)||0)*(parseFloat(r.price)||0),0);

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="sheet" style={{maxHeight:"92vh",overflowY:"auto",display:"flex",flexDirection:"column",gap:0}}>
        <div className="sheet-handle"/>

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div>
            <div className="sheet-title">{inv.invoiceNumber}</div>
            <div className="sheet-sub">{inv.clientName}</div>
          </div>
          <span style={{background:INV_BG[status],color:INV_COLOR[status],padding:"4px 12px",borderRadius:20,fontSize:12,fontWeight:700,textTransform:"uppercase",flexShrink:0}}>
            {status}
          </span>
        </div>

        {/* Info rows */}
        {[
          ["Date",    inv.date || fmtTs(inv.createdAt)],
          ["Contact", inv.clientContact],
          ["Email",   inv.clientEmail],
          ["Phone",   inv.clientPhone],
          ["Address", inv.clientAddress],
        ].filter(r=>r[1]).map(([k,v])=>(
          <div key={k} className="det-row"><span className="det-k">{k}</span><span className="det-v">{v}</span></div>
        ))}
        <div className="det-row">
          <span className="det-k">Total</span>
          <span className="det-v" style={{fontFamily:"'DM Serif Display',serif",fontSize:22,color:"var(--gold2)"}}>{fmt$(total)}</span>
        </div>

        {/* Services */}
        {(inv.services||[]).length > 0 && (
          <div style={{margin:"14px 0"}}>
            <div style={{fontSize:10,letterSpacing:2,color:"var(--muted)",textTransform:"uppercase",marginBottom:8}}>Services</div>
            {inv.services.map((s,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid var(--rim)"}}>
                <div style={{flex:1,paddingRight:12}}>
                  <div style={{fontSize:13,color:"var(--cream)",fontWeight:500}}>{s.desc}</div>
                  {s.notes&&<div style={{fontSize:11,color:"var(--muted)",marginTop:2,fontStyle:"italic"}}>{s.notes}</div>}
                  <div style={{fontSize:11,color:"var(--muted)",marginTop:1}}>Qty: {s.qty} × {fmt$(s.price)}</div>
                </div>
                <div style={{fontWeight:700,color:"var(--cream)",whiteSpace:"nowrap"}}>{fmt$((parseFloat(s.qty)||0)*(parseFloat(s.price)||0))}</div>
              </div>
            ))}
          </div>
        )}

        {/* Admin actions */}
        {isAdmin && (
          <div style={{display:"flex",gap:8,flexWrap:"wrap",margin:"14px 0"}}>
            {status==="draft"   && <button className="btn btn-gold" style={{flex:1}} disabled={loading} onClick={()=>changeStatus("sent")}>📤 Send to Client</button>}
            {status==="sent"    && <button className="btn btn-ghost" style={{flex:1}} disabled={loading} onClick={()=>changeStatus("viewed")}>👁 Mark Viewed</button>}
            {(status==="sent"||status==="viewed") && <button className="btn btn-gold" style={{flex:1}} disabled={loading} onClick={()=>changeStatus("paid")}>✅ Mark Paid</button>}
            {status!=="paid"&&status!=="overdue" && <button style={{background:"rgba(239,68,68,.15)",border:"1px solid rgba(239,68,68,.4)",borderRadius:8,color:"#ef4444",padding:"8px 12px",fontSize:12,cursor:"pointer"}} disabled={loading} onClick={()=>changeStatus("overdue")}>⚠️ Overdue</button>}
            {status==="overdue" && <button className="btn btn-gold" style={{flex:1}} disabled={loading} onClick={()=>changeStatus("paid")}>✅ Mark Paid</button>}
          </div>
        )}

        {/* Client: confirm received */}
        {!isAdmin && status==="sent" && (
          <button className="btn btn-gold btn-full" style={{marginBottom:12}} onClick={()=>changeStatus("viewed")}>
            ✅ Confirm Received
          </button>
        )}

        {/* Comments */}
        <div style={{marginTop:14}}>
          <div style={{fontSize:10,letterSpacing:2,color:"var(--muted)",textTransform:"uppercase",marginBottom:10}}>Comments</div>
          <div style={{maxHeight:200,overflowY:"auto",marginBottom:10}}>
            {comments.length===0
              ? <div style={{color:"var(--muted)",fontSize:12,padding:"8px 0"}}>No comments yet.</div>
              : comments.map(c=>(
                  <div key={c.id} style={{background:c.isAdmin?"rgba(30,144,255,.08)":"var(--surface)",borderRadius:8,padding:"9px 12px",marginBottom:7,borderLeft:`3px solid ${c.isAdmin?"var(--blue)":"var(--gold)"}`}}>
                    <div style={{fontSize:10,color:"var(--muted)",marginBottom:3}}>{c.author} · {fmtTs(c.createdAt)}</div>
                    <div style={{fontSize:13,color:"var(--cream)"}}>{c.text}</div>
                  </div>
                ))
            }
          </div>
          <div style={{display:"flex",gap:8}}>
            <input
              ref={commentRef}
              style={{flex:1,background:"var(--surface)",border:"1px solid var(--rim)",borderRadius:8,padding:"10px 12px",color:"var(--cream)",fontSize:13,outline:"none"}}
              placeholder="Write a comment..."
              value={comment}
              onChange={e=>setComment(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&addComment()}
            />
            <button className="btn btn-gold btn-sm" onClick={addComment}>Send</button>
          </div>
        </div>

        <button className="btn btn-ghost btn-full" style={{marginTop:16}} onClick={onClose}>Close</button>
      </div>
    </div>
  );
};

// ── ADD CLIENT SHEET ──────────────────────────────────────────────────────────
const AddClientSheet = ({adminUser, onClose, onCreated, toast}) => {
  const [username,setUsername]=useState(""); const [fullName,setFullName]=useState("");
  const [password,setPassword]=useState(""); const [showPw,setShowPw]=useState(false);
  const [role,setRole]=useState("client"); const [errors,setErrors]=useState({});
  const [checking,setChecking]=useState(false); const [uStatus,setUStatus]=useState(null);
  const [loading,setLoading]=useState(false); const [success,setSuccess]=useState(null);
  const [copied,setCopied]=useState("");

  const handleUsername = (val) => {
    const v = val.toLowerCase().replace(/[^a-z0-9_]/g,"");
    setUsername(v); setUStatus(null);
    if(errors.username) setErrors(e=>({...e,username:null}));
    clearTimeout(window._uc);
    if(v.length>=3){
      setChecking(true);
      window._uc=setTimeout(async()=>{
        try{ const s=await getDocs(query(collection(db,"users"),where("username","==",v))); setUStatus(s.empty?"ok":"bad"); }
        catch{ setUStatus("ok"); }
        setChecking(false);
      },600);
    }
  };

  const validate = () => {
    const e={};
    if(!username||username.length<3) e.username="Minimum 3 characters";
    if(uStatus==="bad") e.username="Username already exists";
    if(!fullName.trim()) e.fullName="Name is required";
    if(!password||password.length<6) e.password="Minimum 6 characters";
    setErrors(e); return !Object.keys(e).length;
  };

  const handleSubmit = async () => {
    if(!validate()) return;
    setLoading(true);
    const color = randC();
    let newUid = null;
    try {
      newUid = await createAccount(toEmail(username), password);
      await setDoc(doc(db,"users",newUid), {
        uid:newUid, username, fullName:fullName.trim(),
        email:toEmail(username), role, plan:"Business",
        avatarColor:color, status:"active",
        createdAt:serverTimestamp(), createdBy:adminUser.uid,
        balance:0, totalHoursMs:0,
      });
      setSuccess({username, password, fullName:fullName.trim(), role});
      onCreated();
      toast(`@${username} created ✓`,"ok");
    } catch(e) {
      if(e.code==="auth/email-already-in-use") setErrors(x=>({...x,username:"Username already exists"}));
      else toast("Error: "+e.message,"err");
    }
    setLoading(false);
  };

  const copy = (txt,lbl) => { navigator.clipboard?.writeText(txt).catch(()=>{}); setCopied(lbl); toast(`${lbl} copied ✓`); setTimeout(()=>setCopied(""),2000); };
  const str = pwStr(password);

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="sheet">
        <div className="sheet-handle"/>
        {success ? (
          <>
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{width:52,height:52,borderRadius:"50%",background:"var(--ok-bg)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px",fontSize:24}}>✓</div>
              <div className="sheet-title">Client created!</div>
              <div className="sheet-sub">Share these credentials with {success.fullName}</div>
            </div>
            <div className="creds">
              {[["Username",success.username],["Password",success.password]].map(([k,v])=>(
                <div key={k} className="cred-row">
                  <span className="cred-k">{k}</span>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span className="cred-v">{v}</span>
                    <button className="copy-btn" onClick={()=>copy(v,k)}>{copied===k?"✓":"📋"}</button>
                  </div>
                </div>
              ))}
              <div className="cred-row"><span className="cred-k">Role</span><span className="cred-v" style={{textTransform:"capitalize"}}>{success.role}</span></div>
            </div>
            <button className="btn btn-gold btn-full" style={{marginBottom:10}} onClick={()=>copy(`Username: ${success.username}\nPassword: ${success.password}`,"Credentials")}>Copy all</button>
            <button className="btn btn-ghost btn-full" onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            <div className="sheet-title">New client</div>
            <div className="sheet-sub">Account created in Firebase automatically</div>
            <div className="field">
              <label>Username</label>
              <input value={username} onChange={e=>handleUsername(e.target.value)} placeholder="e.g. client_name" className={errors.username?"err":""} autoCapitalize="none"/>
              {username.length>=3&&(checking?<div className="u-prev chk"><span className="u-dot"/>Checking…</div>:uStatus==="ok"?<div className="u-prev ok"><span className="u-dot"/>@{username} available</div>:uStatus==="bad"?<div className="u-prev bad"><span className="u-dot"/>Already taken</div>:null)}
              {errors.username&&<div className="field-err">{errors.username}</div>}
            </div>
            <div className="field">
              <label>Full name</label>
              <input value={fullName} onChange={e=>{setFullName(e.target.value);if(errors.fullName)setErrors(x=>({...x,fullName:null}));}} placeholder="e.g. Moraima Rivera" className={errors.fullName?"err":""}/>
              {errors.fullName&&<div className="field-err">{errors.fullName}</div>}
            </div>
            <div className="field">
              <label>Password</label>
              <div className="pw-wrap">
                <input type={showPw?"text":"password"} value={password} onChange={e=>{setPassword(e.target.value);if(errors.password)setErrors(x=>({...x,password:null}));}} placeholder="Min 6 characters" className={errors.password?"err":""} autoComplete="new-password"/>
                <button className="pw-eye" onClick={()=>setShowPw(p=>!p)}>{showPw?"🙈":"👁"}</button>
              </div>
              {password&&(<><div className="s-bars">{[1,2,3,4].map(i=><div key={i} className={`s-bar${str>=i?` s${str}`:""}`}/>)}</div><div className="s-lbl">{STR_LBL[str]}</div></>)}
              {errors.password&&<div className="field-err">{errors.password}</div>}
            </div>
            <button className="btn btn-ghost btn-full" style={{marginBottom:14,fontSize:13}} onClick={()=>{setPassword(genPw());setShowPw(true);}}>⚡ Generate secure password</button>
            <div className="field" style={{marginBottom:20}}>
              <label>Role</label>
              <div className="chips">{ROLES.map(r=><button key={r} className={`chip${role===r?" on":""}`} onClick={()=>setRole(r)}>{r.charAt(0).toUpperCase()+r.slice(1)}</button>)}</div>
              <div className="field-hint" style={{marginTop:8}}>{role==="client"?"Standard access: invoices, hours, notifications":"Can view all clients and manage accounts"}</div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-gold" style={{flex:1}} onClick={handleSubmit} disabled={loading||uStatus==="bad"||checking}>
                {loading?<><div className="spinner"/>Creating…</>:"Create client"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ── LOG HOURS SHEET ───────────────────────────────────────────────────────────
const LogHoursSheet = ({adminUser, clients, onClose, toast}) => {
  const [selClient,setSelClient]=useState(""); const [loading,setLoading]=useState(false); const [activeSession,setActiveSession]=useState(null);
  useEffect(()=>{
    if(!selClient) return;
    const unsub=onSnapshot(query(collection(db,"users",selClient,"sessions"),where("status","==","open")),
      snap=>setActiveSession(snap.empty?null:{id:snap.docs[0].id,...snap.docs[0].data()}));
    return()=>unsub();
  },[selClient]);
  const client=clients.find(c=>c.id===selClient);
  const punchIn=async()=>{
    if(!selClient){toast("Select a client","err");return;}
    setLoading(true);
    try{
      const now=new Date();
      await addDoc(collection(db,"users",selClient,"sessions"),{clientUid:selClient,clientName:client.fullName||client.username,adminUid:adminUser.uid,punchIn:serverTimestamp(),punchOut:null,status:"open",durationMs:0,date:now.toLocaleDateString("en-US")});
      await saveNotif(selClient,"Work session started 🟢",`Session started at ${fmtTime(serverTimestamp())}.`);
      toast(`Punched IN for ${client.fullName||client.username} ✓`,"ok");
    }catch(e){toast("Error: "+e.message,"err");}
    setLoading(false);
  };
  const punchOut=async()=>{
    if(!activeSession) return;
    setLoading(true);
    try{
      const now=new Date(); const ms=now-(activeSession.punchIn.toDate());
      await updateDoc(doc(db,"users",selClient,"sessions",activeSession.id),{punchOut:serverTimestamp(),status:"closed",durationMs:ms});
      const snap=await getDoc(doc(db,"users",selClient)); const prev=snap.data().totalHoursMs||0;
      await updateDoc(doc(db,"users",selClient),{totalHoursMs:prev+ms});
      await saveNotif(selClient,"Work session ended 🔴",`Session ended. Duration: ${durStr(ms)}.`);
      toast(`Punched OUT — ${durStr(ms)} for ${client.fullName||client.username} ✓`,"ok");
    }catch(e){toast("Error: "+e.message,"err");}
    setLoading(false);
  };
  return(
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="sheet">
        <div className="sheet-handle"/>
        <div className="sheet-title">Log Hours</div>
        <div className="sheet-sub">Sessions saved per client with notifications</div>
        <div className="field">
          <label>Client</label>
          <select className="client-sel" value={selClient} onChange={e=>setSelClient(e.target.value)}>
            <option value="">— Select client —</option>
            {clients.map(c=><option key={c.id} value={c.id}>{c.fullName||c.username}</option>)}
          </select>
        </div>
        {selClient&&(
          <div style={{textAlign:"center",padding:"16px 0 24px"}}>
            <div className="punch-status">{activeSession?`In session since ${fmtTime(activeSession.punchIn)}`:"Ready to start"}</div>
            <div className="punch-time">{client?.fullName||client?.username}</div>
            <button className={`punch-btn ${activeSession?"out":"in"}${loading?" loading":""}`} onClick={activeSession?punchOut:punchIn} disabled={loading}>
              {loading?<div className="spinner"/>:<><span className="punch-emoji">{activeSession?"🔴":"🟢"}</span><span className="punch-label">{activeSession?"PUNCH OUT":"PUNCH IN"}</span></>}
            </button>
          </div>
        )}
        <button className="btn btn-ghost btn-full" onClick={onClose}>Close</button>
      </div>
    </div>
  );
};

// ── LOGIN ─────────────────────────────────────────────────────────────────────
const Login = ({onLogin}) => {
  const [user,setUser]=useState(""); const [pw,setPw]=useState(""); const [show,setShow]=useState(false); const [load,setLoad]=useState(false); const [err,setErr]=useState("");
  const go = async () => {
    if(!user||!pw){setErr("Fill in all fields");return;}
    setLoad(true); setErr("");
    try{
      const cred=await signInWithEmailAndPassword(auth,toEmail(user),pw);
      const snap=await getDoc(doc(db,"users",cred.user.uid));
      if(!snap.exists()){await signOut(auth);setErr("Account not found.");setLoad(false);return;}
      onLogin(cred.user,snap.data());
    }catch(e){
      setErr(e.code==="auth/invalid-credential"||e.code==="auth/user-not-found"?"Wrong username or password":e.code==="auth/too-many-requests"?"Too many attempts. Try later.":"Error: "+e.message);
      setLoad(false);
    }
  };
  return(
    <div className="login-page"><div className="login-box">
      <div style={{textAlign:"center",marginBottom:16}}><img src="/icon-192.png" alt="MB" style={{width:80,height:80,borderRadius:18}}/></div>
      <div className="login-logo">MB Electronics</div>
      <div className="login-sub">Client Portal</div>
      <div className="card">
        <div className="field"><label>Username</label><input value={user} onChange={e=>setUser(e.target.value.toLowerCase())} placeholder="your username" autoCapitalize="none" autoCorrect="off" onKeyDown={e=>e.key==="Enter"&&go()}/></div>
        <div className="field"><label>Password</label><div className="pw-wrap"><input type={show?"text":"password"} value={pw} onChange={e=>setPw(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&go()}/><button className="pw-eye" onClick={()=>setShow(p=>!p)}>{show?"🙈":"👁"}</button></div></div>
        {err&&<div className="login-err">{err}</div>}
        <button className="btn btn-gold btn-full" style={{padding:"14px"}} onClick={go} disabled={load}>{load?<><div className="spinner"/>Signing in…</>:"Sign In"}</button>
        <p className="login-hint">Admins and clients share the same login — redirected automatically.</p>
      </div>
    </div></div>
  );
};

// ── ADMIN APP ─────────────────────────────────────────────────────────────────
const AdminApp = ({user, userData, onSignOut}) => {
  const {toasts,add:toast,rm} = useToasts();
  const [page,setPage]       = useState("home");
  const [clients,setClients] = useState([]);
  const [loadCl,setLoadCl]   = useState(true);
  const [showAdd,setShowAdd] = useState(false);
  const [showHours,setShowHours] = useState(false);
  const [deleting,setDeleting]   = useState(null);
  const [hoursLog,setHoursLog]   = useState([]);
  const [invoices,setInvoices]   = useState([]);
  const [selInv,setSelInv]       = useState(null);
  const [invFilter,setInvFilter] = useState("all");

  const loadClients = useCallback(async()=>{
    setLoadCl(true);
    try{
      const s=await getDocs(query(collection(db,"users"),where("role","!=","admin")));
      setClients(s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.username||"").localeCompare(b.username||"")));
    }catch(e){toast("Error loading clients","err");}
    setLoadCl(false);
  },[]);

  useEffect(()=>{ loadClients(); },[loadClients]);

  useEffect(()=>{
    const q=query(collectionGroup(db,"sessions"),orderBy("punchIn","desc"));
    return onSnapshot(q, snap=>setHoursLog(snap.docs.map(d=>({id:d.id,...d.data()})).slice(0,40)));
  },[]);

  useEffect(()=>{
    const q=query(collection(db,"invoices"),orderBy("createdAt","desc"));
    return onSnapshot(q, snap=>setInvoices(snap.docs.map(d=>({id:d.id,...d.data()}))));
  },[]);

  const handleDelete = async (c) => {
    if(!window.confirm(`Delete @${c.username}? This cannot be undone.`)) return;
    setDeleting(c.id);
    try{ await deleteDoc(doc(db,"users",c.id)); toast(`@${c.username} deleted`,"ok"); await loadClients(); }
    catch(e){ toast("Error: "+e.message,"err"); }
    setDeleting(null);
  };

  const openSessions  = hoursLog.filter(h=>h.status==="open");
  const pendingAmt    = invoices.filter(i=>["sent","viewed","overdue"].includes(i.status)).reduce((a,i)=>a+(i.total||0),0);
  const paidAmt       = invoices.filter(i=>i.status==="paid").reduce((a,i)=>a+(i.total||0),0);
  const filteredInv   = invoices.filter(i=>invFilter==="all"||i.status===invFilter);

  const PAGES = [{id:"home",label:"Dashboard",icon:"home"},{id:"invoices",label:"Invoices",icon:"invoice"},{id:"hours",label:"Hours",icon:"clock"},{id:"clients",label:"Clients",icon:"users"}];

  const Sidebar = () => (
    <aside className="sidebar">
      <div className="sidebar-logo"><Logo/><div className="tagline" style={{marginTop:4}}>Admin Panel</div></div>
      {PAGES.map(p=><div key={p.id} className={`nav-item${page===p.id?" active":""}`} onClick={()=>setPage(p.id)}><Icon name={p.icon} size={16}/>{p.label}</div>)}
      <div style={{padding:"8px 24px"}}><button className="btn btn-gold btn-full" onClick={()=>setShowAdd(true)}><Icon name="plus" size={14}/>New Client</button></div>
      <div className="sidebar-footer">
        <div className="sidebar-user"><div className="cl-av" style={{background:"linear-gradient(135deg,var(--gold),#8a5c20)"}}>{ini(userData.fullName||userData.username)}</div><div><div className="uname">{userData.fullName||userData.username}</div><div className="urole">Admin</div></div></div>
        <button className="logout-btn" onClick={onSignOut}>Sign Out</button>
      </div>
    </aside>
  );

  const InvRow = ({inv}) => (
    <div className="inv-row" style={{cursor:"pointer"}} onClick={()=>setSelInv(inv)}>
      <div className="inv-icon" style={{background:INV_BG[inv.status||"draft"]}}><span style={{fontSize:18}}>📄</span></div>
      <div className="inv-meta">
        <div className="inv-name">{inv.invoiceNumber} · {inv.clientName}</div>
        <div className="inv-sub">{fmtTs(inv.createdAt)} · {fmt$(inv.total||0)}</div>
      </div>
      <span style={{background:INV_BG[inv.status||"draft"],color:INV_COLOR[inv.status||"draft"],padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,textTransform:"uppercase",flexShrink:0}}>{inv.status||"draft"}</span>
    </div>
  );

  return (
    <div className="app">
      <Sidebar/>
      <div className="main">
        <div className="topbar">
          <Logo small/>
          <div className="topbar-right">
            <button className="btn btn-gold btn-sm" onClick={()=>setShowAdd(true)}><Icon name="plus" size={13}/>Client</button>
            <div className="t-avatar">{ini(userData.fullName||userData.username)}</div>
          </div>
        </div>
        <div className="content">

          {page==="home" && <>
            <div className="page-title">Dashboard</div>
            <div className="page-sub">MB Electronics · Admin</div>
            <div className="qa-grid">
              <button className="qa-btn" onClick={()=>setShowAdd(true)}><span className="qa-icon">➕</span><span className="qa-lbl">New Client</span></button>
              <button className="qa-btn" onClick={()=>setShowHours(true)}><span className="qa-icon">⏱️</span><span className="qa-lbl">Log Hours</span></button>
              <button className="qa-btn" onClick={()=>setPage("clients")}><span className="qa-icon">👥</span><span className="qa-lbl">Clients</span></button>
              <button className="qa-btn" onClick={()=>setPage("invoices")}><span className="qa-icon">📄</span><span className="qa-lbl">Invoices</span></button>
            </div>
            {openSessions.length>0&&<div className="notif-banner warn" style={{cursor:"pointer"}} onClick={()=>setShowHours(true)}><span style={{fontSize:18}}>⏱️</span><div className="notif-body"><strong>{openSessions.length} active session{openSessions.length>1?"s":""}</strong> — {openSessions.map(s=>s.clientName).join(", ")}</div><span className="notif-x">→</span></div>}
            <div className="kpi-grid">
              <div className="kpi-card"><div className="kpi-bar" style={{background:"var(--gold)"}}/><div className="kpi-label">Active Clients</div><div className="kpi-value">{clients.filter(c=>c.status==="active").length}</div><div className="kpi-sub">{clients.length} total</div></div>
              <div className="kpi-card"><div className="kpi-bar" style={{background:"var(--warn)"}}/><div className="kpi-label">Pending</div><div className="kpi-value" style={{fontSize:18}}>{fmt$(pendingAmt)}</div><div className="kpi-sub">{invoices.filter(i=>["sent","viewed","overdue"].includes(i.status)).length} invoices</div></div>
              <div className="kpi-card"><div className="kpi-bar" style={{background:"var(--ok)"}}/><div className="kpi-label">Collected</div><div className="kpi-value" style={{fontSize:18}}>{fmt$(paidAmt)}</div><div className="kpi-sub">{invoices.filter(i=>i.status==="paid").length} paid</div></div>
              <div className="kpi-card"><div className="kpi-bar" style={{background:"var(--blue)"}}/><div className="kpi-label">Hours Logged</div><div className="kpi-value">{durStr(hoursLog.filter(h=>h.durationMs).reduce((a,h)=>a+(h.durationMs||0),0))}</div><div className="kpi-sub">{openSessions.length} live</div></div>
            </div>
            <div className="sec-label">Recent invoices</div>
            <div className="card">{invoices.length===0?<p style={{color:"var(--muted)",textAlign:"center",padding:24,fontSize:13}}>No invoices yet. Create them from the Invoice App.</p>:<div>{invoices.slice(0,5).map(inv=><InvRow key={inv.id} inv={inv}/>)}</div>}</div>
          </>}

          {page==="invoices" && <>
            <div className="page-title">Invoices</div>
            <div className="page-sub">All client invoices</div>
            <div className="kpi-grid" style={{marginBottom:14}}>
              <div className="kpi-card"><div className="kpi-bar" style={{background:"var(--warn)"}}/><div className="kpi-label">Pending</div><div className="kpi-value" style={{fontSize:18}}>{fmt$(pendingAmt)}</div></div>
              <div className="kpi-card"><div className="kpi-bar" style={{background:"var(--ok)"}}/><div className="kpi-label">Collected</div><div className="kpi-value" style={{fontSize:18}}>{fmt$(paidAmt)}</div></div>
            </div>
            <div className="filter-tabs">{["all",...INV_STATUS].map(f=><button key={f} className={`ftab${invFilter===f?" on":""}`} onClick={()=>setInvFilter(f)}>{f.charAt(0).toUpperCase()+f.slice(1)}</button>)}</div>
            <div className="card">{filteredInv.length===0?<p style={{color:"var(--muted)",textAlign:"center",padding:32}}>No invoices found.</p>:<div>{filteredInv.map(inv=><InvRow key={inv.id} inv={inv}/>)}</div>}</div>
          </>}

          {page==="hours" && <>
            <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:4}}>
              <div><div className="page-title">Hours</div><div className="page-sub">All work sessions</div></div>
              <button className="btn btn-gold" style={{marginBottom:20}} onClick={()=>setShowHours(true)}><Icon name="clock" size={14}/>Punch</button>
            </div>
            <div className="card">{hoursLog.length===0?<p style={{color:"var(--muted)",textAlign:"center",padding:32}}>No sessions yet.</p>:<div>{hoursLog.map(h=>(
              <div key={h.id} className="hours-row">
                <div className="hours-dot" style={{background:h.status==="open"?"var(--ok)":"var(--blue)"}}/>
                <div className="hours-body"><div className="hours-name">{h.clientName}</div><div className="hours-sub">{h.date} · In: {fmtTime(h.punchIn)}{h.punchOut?` · Out: ${fmtTime(h.punchOut)}`:""}{h.status==="open"?<span style={{color:"var(--ok)",fontWeight:600,marginLeft:6}}>● LIVE</span>:""}</div></div>
                <div className="hours-dur">{h.durationMs?durStr(h.durationMs):h.status==="open"?"…":"—"}</div>
              </div>
            ))}</div>}</div>
          </>}

          {page==="clients" && <>
            <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:4}}>
              <div><div className="page-title">Clients</div><div className="page-sub">All accounts</div></div>
              <button className="btn btn-gold" style={{marginBottom:20}} onClick={()=>setShowAdd(true)}><Icon name="plus" size={14}/>New</button>
            </div>
            <div className="card" style={{padding:"16px 20px"}}>
              {loadCl?<div style={{textAlign:"center",padding:32}}><div className="spinner" style={{margin:"0 auto"}}/></div>
              :clients.length===0?<p style={{color:"var(--muted)",textAlign:"center",padding:32}}>No clients yet.</p>
              :<table className="cl-table"><thead><tr><th>Client</th><th>Hours</th><th>Role</th><th>Status</th><th></th></tr></thead>
              <tbody>{clients.map(c=>(
                <tr key={c.id}>
                  <td><div className="cl-chip"><div className="cl-av" style={{background:c.avatarColor||"#2d4a6a"}}>{ini(c.fullName||c.username)}</div><div><div style={{fontWeight:500,color:"var(--text)"}}>{c.fullName||c.username}</div><div style={{fontSize:11,color:"var(--muted)"}}>@{c.username}</div></div></div></td>
                  <td><span style={{fontFamily:"'DM Serif Display',serif",fontSize:15,color:"var(--cream)"}}>{c.totalHoursMs?durStr(c.totalHoursMs):"—"}</span></td>
                  <td><span style={{fontSize:12,color:"var(--muted)",textTransform:"capitalize"}}>{c.role}</span></td>
                  <td><span className={`badge ${c.status==="active"?"b-ok":"b-off"}`}>{c.status==="active"?"Active":"Inactive"}</span></td>
                  <td style={{textAlign:"right"}}><button className="btn btn-danger btn-sm" disabled={deleting===c.id} onClick={()=>handleDelete(c)}>{deleting===c.id?<div className="spinner" style={{borderTopColor:"var(--danger)"}}/>:"✕"}</button></td>
                </tr>
              ))}</tbody></table>}
            </div>
          </>}

        </div>
        <nav className="bottom-nav"><div className="bottom-nav-inner">{PAGES.map(p=><button key={p.id} className={`bottom-tab${page===p.id?" active":""}`} onClick={()=>setPage(p.id)}><Icon name={p.icon} size={19}/><span>{p.label}</span></button>)}</div></nav>
      </div>
      {showAdd&&<AddClientSheet adminUser={user} onClose={()=>setShowAdd(false)} onCreated={loadClients} toast={toast}/>}
      {showHours&&<LogHoursSheet adminUser={user} clients={clients} onClose={()=>setShowHours(false)} toast={toast}/>}
      {selInv&&<InvoiceSheet inv={selInv} onClose={()=>setSelInv(null)} isAdmin={true} toast={toast}/>}
      <Toasts toasts={toasts} rm={rm}/>
    </div>
  );
};

// ── CLIENT APP ────────────────────────────────────────────────────────────────
const ClientApp = ({user, userData, onSignOut}) => {
  const {toasts,add:toast,rm} = useToasts();
  const [page,setPage]       = useState("home");
  const [notifs,setNotifs]   = useState([]);
  const [dismissed,setDismissed] = useState(new Set());
  const [myHours,setMyHours] = useState([]);
  const [invoices,setInvoices] = useState([]);
  const [selInv,setSelInv]   = useState(null);
  const [invFilter,setInvFilter] = useState("all");

  useEffect(()=>{ return onSnapshot(query(collection(db,"notifications"),where("uid","==",user.uid),orderBy("createdAt","desc")), snap=>setNotifs(snap.docs.map(d=>({id:d.id,...d.data()})).slice(0,30))); },[user.uid]);
  useEffect(()=>{ return onSnapshot(query(collection(db,"users",user.uid,"sessions"),orderBy("punchIn","desc")), snap=>setMyHours(snap.docs.map(d=>({id:d.id,...d.data()})).slice(0,20))); },[user.uid]);
  useEffect(()=>{
    const q=query(collection(db,"invoices"),where("clientUid","==",user.uid),orderBy("createdAt","desc"));
    return onSnapshot(q, snap=>setInvoices(snap.docs.map(d=>({id:d.id,...d.data()}))));
  },[user.uid]);

  const markRead = async (id) => { setDismissed(p=>new Set([...p,id])); try{ await updateDoc(doc(db,"notifications",id),{read:true}); }catch{} };
  const unreadCount   = notifs.filter(n=>!n.read&&!dismissed.has(n.id)).length;
  const activeSession = myHours.find(h=>h.status==="open");
  const totalHours    = userData.totalHoursMs||myHours.filter(h=>h.durationMs).reduce((a,h)=>a+(h.durationMs||0),0);
  const pendingAmt    = invoices.filter(i=>["sent","viewed","overdue"].includes(i.status)).reduce((a,i)=>a+(i.total||0),0);
  const filteredInv   = invoices.filter(i=>invFilter==="all"||i.status===invFilter);

  const PAGES = [{id:"home",label:"Dashboard",icon:"home"},{id:"invoices",label:"Invoices",icon:"invoice"},{id:"notifs",label:"Alerts",icon:"bell",badge:unreadCount}];

  const InvRow = ({inv}) => (
    <div className="inv-row" style={{cursor:"pointer"}} onClick={()=>setSelInv(inv)}>
      <div className="inv-icon" style={{background:INV_BG[inv.status||"sent"]}}><span style={{fontSize:18}}>📄</span></div>
      <div className="inv-meta">
        <div className="inv-name">{inv.invoiceNumber}</div>
        <div className="inv-sub">{fmtTs(inv.createdAt)} · {fmt$(inv.total||0)}</div>
      </div>
      <span style={{background:INV_BG[inv.status||"sent"],color:INV_COLOR[inv.status||"sent"],padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,textTransform:"uppercase",flexShrink:0}}>{inv.status||"sent"}</span>
    </div>
  );

  const Sidebar = () => (
    <aside className="sidebar">
      <div className="sidebar-logo"><Logo/><div className="tagline" style={{marginTop:4}}>Client Portal</div></div>
      {PAGES.map(p=><div key={p.id} className={`nav-item${page===p.id?" active":""}`} onClick={()=>setPage(p.id)} style={{position:"relative"}}><Icon name={p.icon} size={16}/>{p.label}{p.badge>0&&<span style={{marginLeft:"auto",background:"var(--danger)",color:"white",fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:20}}>{p.badge}</span>}</div>)}
      <div className="sidebar-footer">
        <div className="sidebar-user"><div className="cl-av" style={{background:userData.avatarColor||"#2d4a6a"}}>{ini(userData.fullName||userData.username)}</div><div><div className="uname">{userData.fullName||userData.username}</div><div className="urole">Business</div></div></div>
        <button className="logout-btn" onClick={onSignOut}>Sign Out</button>
      </div>
    </aside>
  );

  return (
    <div className="app">
      <Sidebar/>
      <div className="main">
        <div className="topbar">
          <Logo small/>
          <div className="topbar-right">
            <div style={{position:"relative",cursor:"pointer"}} onClick={()=>setPage("notifs")}>
              <Icon name="bell" size={20}/>
              {unreadCount>0&&<span style={{position:"absolute",top:-4,right:-4,background:"var(--danger)",color:"white",fontSize:9,fontWeight:700,padding:"1px 4px",borderRadius:10,minWidth:16,textAlign:"center"}}>{unreadCount}</span>}
            </div>
            <div className="t-avatar" style={{background:userData.avatarColor||"#2d4a6a"}}>{ini(userData.fullName||userData.username)}</div>
          </div>
        </div>
        <div className="content">

          {page==="home" && <>
            <div className="page-title">Dashboard</div>
            <div className="page-sub">Welcome, {(userData.fullName||userData.username).split(" ")[0]}</div>
            {activeSession&&<div className="notif-banner ok"><span style={{fontSize:18}}>🟢</span><div className="notif-body"><strong>Session in progress</strong> — Started at {fmtTime(activeSession.punchIn)}</div></div>}
            {notifs.filter(n=>!n.read&&!dismissed.has(n.id)).slice(0,2).map(n=>(
              <div key={n.id} className="notif-banner info"><span style={{fontSize:18}}>🔔</span><div className="notif-body"><strong>{n.title}</strong><br/>{n.body}</div><span className="notif-x" onClick={()=>markRead(n.id)}>×</span></div>
            ))}
            <div className="balance-card">
              <div className="balance-label">Available Balance</div>
              <div className="balance-amount">${String((userData.balance||0).toFixed(2)).split(".")[0]}<span className="balance-cents">.{String((userData.balance||0).toFixed(2)).split(".")[1]}</span></div>
              <div className="balance-footer"><span style={{fontSize:12,color:"var(--muted)",display:"flex",alignItems:"center",gap:6}}><span className="pulse"/>Live</span><span className="badge b-gold">Business</span></div>
            </div>
            <div className="kpi-grid">
              <div className="kpi-card"><div className="kpi-bar" style={{background:"var(--warn)"}}/><div className="kpi-label">Pending</div><div className="kpi-value" style={{fontSize:18}}>{fmt$(pendingAmt)}</div><div className="kpi-sub">{invoices.filter(i=>["sent","viewed","overdue"].includes(i.status)).length} invoices</div></div>
              <div className="kpi-card"><div className="kpi-bar" style={{background:"var(--blue)"}}/><div className="kpi-label">Total Hours</div><div className="kpi-value">{totalHours?durStr(totalHours):"—"}</div><div className="kpi-sub">{myHours.length} sessions</div></div>
            </div>
            <div className="sec-label">Recent invoices</div>
            <div className="card">{invoices.length===0?<p style={{color:"var(--muted)",textAlign:"center",padding:24,fontSize:13}}>No invoices yet.</p>:<div>{invoices.slice(0,4).map(inv=><InvRow key={inv.id} inv={inv}/>)}</div>}</div>
          </>}

          {page==="invoices" && <>
            <div className="page-title">My Invoices</div>
            <div className="page-sub">Your billing history</div>
            <div className="kpi-grid" style={{marginBottom:14}}>
              <div className="kpi-card"><div className="kpi-bar" style={{background:"var(--warn)"}}/><div className="kpi-label">Pending</div><div className="kpi-value" style={{fontSize:18}}>{fmt$(pendingAmt)}</div></div>
              <div className="kpi-card"><div className="kpi-bar" style={{background:"var(--ok)"}}/><div className="kpi-label">Paid</div><div className="kpi-value" style={{fontSize:18}}>{fmt$(invoices.filter(i=>i.status==="paid").reduce((a,i)=>a+(i.total||0),0))}</div></div>
            </div>
            <div className="filter-tabs">{["all","sent","viewed","paid","overdue"].map(f=><button key={f} className={`ftab${invFilter===f?" on":""}`} onClick={()=>setInvFilter(f)}>{f.charAt(0).toUpperCase()+f.slice(1)}</button>)}</div>
            <div className="card">{filteredInv.length===0?<p style={{color:"var(--muted)",textAlign:"center",padding:32}}>No invoices found.</p>:<div>{filteredInv.map(inv=><InvRow key={inv.id} inv={inv}/>)}</div>}</div>
          </>}

          {page==="notifs" && <>
            <div className="page-title">Notifications</div>
            <div className="page-sub">{unreadCount} unread</div>
            {notifs.length===0?<div className="card" style={{textAlign:"center",color:"var(--muted)",padding:32}}>No notifications yet</div>
            :<div className="card">{notifs.map(n=>(
              <div key={n.id} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"13px 0",borderBottom:"1px solid var(--rim)"}}>
                <span style={{fontSize:20,flexShrink:0}}>🔔</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:500,color:n.read||dismissed.has(n.id)?"var(--muted)":"var(--cream)"}}>{n.title}</div>
                  <div style={{fontSize:12,color:"var(--muted)",marginTop:3,lineHeight:1.5}}>{n.body}</div>
                  <div style={{fontSize:11,color:"var(--muted)",marginTop:4}}>{fmtTs(n.createdAt)}</div>
                </div>
                {!n.read&&!dismissed.has(n.id)&&<button className="btn btn-ghost btn-sm" onClick={()=>markRead(n.id)}>✓</button>}
              </div>
            ))}</div>}
          </>}

        </div>
        <nav className="bottom-nav"><div className="bottom-nav-inner">{PAGES.map(p=>(
          <button key={p.id} className={`bottom-tab${page===p.id?" active":""}`} onClick={()=>setPage(p.id)} style={{position:"relative"}}>
            <Icon name={p.icon} size={19}/><span>{p.label}</span>
            {p.badge>0&&<span style={{position:"absolute",top:6,right:"calc(50% - 16px)",background:"var(--danger)",color:"white",fontSize:9,fontWeight:700,padding:"1px 4px",borderRadius:10}}>{p.badge}</span>}
          </button>
        ))}</div></nav>
      </div>
      {selInv&&<InvoiceSheet inv={selInv} onClose={()=>setSelInv(null)} isAdmin={false} toast={toast}/>}
      <Toasts toasts={toasts} rm={rm}/>
    </div>
  );
};

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [session,setSession] = useState(null);
  const [loading,setLoading] = useState(true);

  useEffect(()=>{
    return onAuthStateChanged(auth, async user=>{
      if(user){
        try{
          const snap=await getDoc(doc(db,"users",user.uid));
          if(snap.exists()) setSession({user,userData:snap.data()});
          else{ await signOut(auth); setSession(null); }
        }catch{ setSession(null); }
      } else setSession(null);
      setLoading(false);
    });
  },[]);

  const handleSignOut = async () => { await signOut(auth); setSession(null); };
  const handleLogin   = (user,userData) => setSession({user,userData});

  if(loading) return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"var(--bg)"}}><div className="spinner" style={{width:36,height:36,borderWidth:3}}/></div>;
  if(!session) return <Login onLogin={handleLogin}/>;

  const {user,userData} = session;
  return userData.role==="admin"
    ? <AdminApp user={user} userData={userData} onSignOut={handleSignOut}/>
    : <ClientApp user={user} userData={userData} onSignOut={handleSignOut}/>;
}
