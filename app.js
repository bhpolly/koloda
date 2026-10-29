"use strict";
/* ============ utils ============ */
const $ = (s, el=document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const DAY = 86400000;
const INTERVALS = [0, 1, 2, 4, 8, 16, 35, 90]; // дни для уровней 1..7 (чаще, чем раньше: по образцу Anki)
const shuffle = a => { a = a.slice(); for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
const startOfDay = (t=Date.now()) => { const d=new Date(t); d.setHours(0,0,0,0); return d.getTime(); };
const dayKey = (t=Date.now()) => { const d=new Date(t); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const isCyr = s => /[а-яё]/i.test(s);
const uid = () => "c-" + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const gid = () => "g-" + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const SPK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>';
function plural(n, one, few, many){ const m10=n%10, m100=n%100; if(m10===1&&m100!==11) return one; if(m10>=2&&m10<=4&&(m100<12||m100>14)) return few; return many; }
function toast(msg, act){
  const t=$("#toast"); t.textContent=msg;
  if(act){ const b=document.createElement("button"); b.type="button"; b.className="toast-act"; b.textContent=act.label; b.onclick=()=>{ t.hidden=true; clearTimeout(toast._t); act.fn(); }; t.append(" ", b); }
  t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true, act?9000:2600);
}
function lev(a,b){ const m=a.length,n=b.length; if(Math.abs(m-n)>2) return 9; const d=Array.from({length:m+1},(_,i)=>[i]); for(let j=1;j<=n;j++) d[0][j]=j; for(let i=1;i<=m;i++) for(let j=1;j<=n;j++) d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1)); return d[m][n]; }
const norm = s => String(s||"").toLowerCase().replace(/[’‘`´]/g,"'").replace(/ё/g,"е").replace(/[.!?,;:]+$/,"").replace(/\s+/g," ").trim();
function lsGet(k, d){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch{ return d; } }
let storageBad=false;
function lsSet(k, v){
  try{ localStorage.setItem(k, JSON.stringify(v)); if(storageBad){ storageBad=false; showStoreWarn(); } return true; }
  catch{ if(!storageBad){ storageBad=true; showStoreWarn(); } return false; }
}
/* предупреждение: браузер не даёт сохранить данные (память заполнена, приватный режим, запрет сайту) */
function showStoreWarn(){
  let el=$("#storeWarn");
  if(!storageBad){ el?.remove(); return; }
  if(!el){ el=document.createElement("div"); el.id="storeWarn"; el.className="storewarn"; el.setAttribute("role","alert"); const m=document.querySelector("main"); m.parentNode.insertBefore(el,m); }
  const cloud = typeof Store!=="undefined" && Store.mode!=="local";
  el.innerHTML=`<div><b>Браузер не даёт сохранить данные.</b> ${cloud?"Слова сохраняются в облаке, но быстрый доступ без сети может не работать.":"Слова пропадут, когда вы закроете вкладку. Возможно, память браузера заполнена, включён приватный режим или сайту запрещено хранить данные."}</div><div class="row"><button class="btn" type="button" id="swBackup">${cloud?"Понятно":"Скопировать копию колоды"}</button></div>`;
  $("#swBackup").onclick=()=>{ if(cloud){ el.remove(); return; } const json=JSON.stringify({cards:allCards(), notes:allNotes(), stats:Store.stats}); try{ navigator.clipboard.writeText(json).then(()=>toast("Колода скопирована: вставьте её в заметки")); }catch{ go("prefs"); toast("Откройте «Резервная копия» в настройках"); } };
}
try{ localStorage.setItem("koloda_probe","1"); localStorage.removeItem("koloda_probe"); }catch{ storageBad=true; }

/* ============ store ============ */
const DEFAULTS = { batch:10, first:"en", audio:"en", rate:0.9, voice:"", native:true, mmEmail:"", tourDone:false, planSeen:0, sched:0, nick:"", deck:"", goal:10, revCap:40, level:"B1", modes:{choice:true, match:true, letters:true, typing:true, cloze:true} };
const GUEST = "koloda.";
const str = (v, max=500) => typeof v==="string" ? v.slice(0,max) : "";
const numv = v => Number.isFinite(+v) ? +v : 0;
/* Любые данные извне (сервер, импорт) приводим к ожидаемой форме: только строки и числа нужной длины */
const normTag = s => String(s??"").trim().replace(/^#+/,"").replace(/\s+/g," ").toLowerCase().slice(0,30);
function cleanTags(a){ const out=[]; if(Array.isArray(a)) for(const x of a){ const t=normTag(x); if(t && !out.includes(t)) out.push(t); } return out.slice(0,10); }
function parseTags(v){ return cleanTags(String(v||"").split(/[,;\n]/)); }
function sanitizeCard(c){
  if(!c || typeof c!=="object" || !str(c.en) || (!str(c.ru) && !str(c.def))) return null;   // нужен перевод или английское определение
  const id = /^[\w-]{1,64}$/.test(c.id) ? c.id : uid();
  return { id, en:str(c.en,200), ru:str(c.ru,300), def:str(c.def,300), ipa:str(c.ipa,100), pos:str(c.pos,40), note:str(c.note,200), audio:str(c.audio,300), tags:cleanTags(c.tags),
    examples:(Array.isArray(c.examples)?c.examples:[]).slice(0,5).map(x=>{ const o={en:str(x?.en,300), ru:str(x?.ru,300)}; if(x?.src) o.src=str(x.src,8); if(x?.mt) o.mt=true; if(x?.pin) o.pin=true; return o; }).filter(x=>x.en),
    created:numv(c.created)||Date.now(), box:Math.max(0,Math.min(7,Math.round(numv(c.box)))), due:numv(c.due), reps:numv(c.reps), lapses:numv(c.lapses), fails:Math.max(0,Math.min(99,Math.round(numv(c.fails)))), errs:Math.max(0,Math.min(999,Math.round(numv(c.errs)))), last:numv(c.last), updated:numv(c.updated), demo:!!c.demo };
}
/* Заметка по грамматике: название, теги, правило, примеры, ошибки (❌→✅) и своя заметка */
function sanitizeNote(n){
  if(!n || typeof n!=="object" || !str(n.title,120).trim()) return null;
  const id = /^g-[\w-]{1,62}$/.test(n.id) ? n.id : gid();
  const list=(a,max)=>Array.isArray(a)?a.slice(0,max):[];
  return { id, title:str(n.title,120).trim(), tags:cleanTags(n.tags), rule:str(n.rule,3000),
    examples:list(n.examples,25).map(x=>({en:str(x?.en,200).trim(), ru:str(x?.ru,200).trim()})).filter(x=>x.en),
    mistakes:list(n.mistakes,15).map(x=>({bad:str(x?.bad,200).trim(), good:str(x?.good,200).trim(), why:str(x?.why,200).trim()})).filter(x=>x.bad||x.good),
    mine:str(n.mine,1500), created:numv(n.created)||Date.now(), updated:numv(n.updated) };
}
function sanitizeSettings(s){
  const o=structuredClone(DEFAULTS); if(!s||typeof s!=="object") return o;
  if([5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25].includes(+s.batch)) o.batch=+s.batch;
  if(["en","ru"].includes(s.first)) o.first=s.first;
  if(["off","en","both"].includes(s.audio)) o.audio=s.audio;
  if(+s.rate>=0.5 && +s.rate<=1.5) o.rate=+s.rate;
  if([3,5,10,15,20,30,50].includes(+s.goal)) o.goal=+s.goal;
  if([15,25,40,60,100].includes(+s.revCap)) o.revCap=+s.revCap;
  if(["A2","B1","B2","C1"].includes(s.level)) o.level=s.level;
  o.voice=str(s.voice,200); o.native=s.native!==false; o.mmEmail=str(s.mmEmail,120); o.tourDone=!!s.tourDone; o.planSeen=Math.max(0,Math.min(9,+s.planSeen||0)); o.sched=Math.max(0,Math.min(9,+s.sched||0)); o.nick=str(s.nick,30).trim(); o.deck=str(s.deck,30);
  if(s.modes&&typeof s.modes==="object") for(const k of Object.keys(o.modes)) if(k in s.modes) o.modes[k]=!!s.modes[k];
  return o;
}
function sanitizeStats(s){
  const days={}; const d=s?.days; if(d&&typeof d==="object") for(const [k,v] of Object.entries(d)) if(/^\d{4}-\d{2}-\d{2}$/.test(k)&&v&&typeof v==="object") { days[k]={n:numv(v.n),learned:numv(v.learned),reviewed:numv(v.reviewed),rf:numv(v.rf),right:numv(v.right),total:numv(v.total)}; if(v.closed!==undefined) days[k].closed=!!v.closed; }
  return {days};
}
/* таблицы заметок может ещё не быть в базе (схему обновляют вручную): тогда заметки живут только на этом устройстве */
const noteTableMissing = e => /^(PGRST205|42P01)$/.test(e?.code||"") || /schema cache|does not exist|could not find the table/i.test(e?.message||"");
const Store = {
  mode:"local",            // local — гость, данные в браузере; claude — внутри Claude; supa — аккаунт
  prefix:GUEST, cards:new Map(), notes:new Map(), settings:structuredClone(DEFAULTS), stats:{days:{}},
  // ---- кэш в браузере
  loadLocal(prefix=this.prefix){
    this.prefix=prefix;
    this.cards = new Map(lsGet(prefix+"cards", []).map(sanitizeCard).filter(Boolean).map(c=>[c.id,c]));
    this.notes = new Map(lsGet(prefix+"notes", []).map(sanitizeNote).filter(Boolean).map(n=>[n.id,n]));
    this.settings = sanitizeSettings(lsGet(prefix+"settings", {}));
    this.stats = sanitizeStats(lsGet(prefix+"stats", {days:{}}));
  },
  saveLocal(){ lsSet(this.prefix+"cards",[...this.cards.values()]); lsSet(this.prefix+"notes",[...this.notes.values()]); lsSet(this.prefix+"settings",this.settings); lsSet(this.prefix+"stats",this.stats); },
  clearLocal(prefix){ try{ for(const k of Object.keys(localStorage)) if(k.startsWith(prefix) && (prefix!==GUEST || !k.startsWith("koloda.u."))) localStorage.removeItem(k); }catch{} },

  // ---- Claude (версия-артефакт)
  col:null,
  async connectClaude(){
    if(!window.claude?.use) return;
    try{
      const [db, user] = await Promise.all([claude.use("db"), claude.use("user")]);
      if(!db || !user) return;
      const canWrite = await user.can("data.write").catch(()=>null);
      if(canWrite===false) return;
      const id = await user.id(); if(!id) return;
      const col = db.collection("data/users/" + id);
      const snap = await col.limit(1000).get();
      const remote = new Map(), remoteNotes = new Map(); let settings=null, stats=null;
      snap.docs.forEach(d=>{ const v=d.data(); if(!v) return; if(d.id==="settings") settings=v; else if(d.id==="stats") stats=v; else if(d.id.startsWith("c-")){ const c=sanitizeCard(v); if(c) remote.set(d.id, c); } else if(d.id.startsWith("g-")){ const n=sanitizeNote({...v, id:d.id}); if(n) remoteNotes.set(d.id, n); } });
      this.col = col; this.mode = "claude";
      if(remote.size===0 && this.cards.size>0){
        for(const c of this.cards.values()) await this.col.doc(c.id).set(c).catch(()=>{});
        await this.col.doc("settings").set(this.settings).catch(()=>{});
        await this.col.doc("stats").set(this.stats).catch(()=>{});
        for(const n of this.notes.values()) await this.col.doc(n.id).set(n).catch(()=>{});
      } else {
        this.cards = remote;
        if(remoteNotes.size) this.notes = remoteNotes;
        else for(const n of this.notes.values()) this.col.doc(n.id).set(n).catch(()=>{});
        if(settings) this.settings = sanitizeSettings(settings);
        if(stats) this.stats = sanitizeStats(stats);
        this.saveLocal();
      }
    }catch(e){ this.mode="local"; this.col=null; }
  },

  // ---- Supabase (аккаунт)
  sb:null, user:null, pending:new Set(), pendingDel:new Set(), pendingN:new Set(), pendingDelN:new Set(), notesRemote:undefined, statePending:false, flushing:false, flushTimer:null, syncError:null, lastPull:0,
  savePending(){ lsSet(this.prefix+"pending",{c:[...this.pending], d:[...this.pendingDel], n:[...this.pendingN], nd:[...this.pendingDelN], s:this.statePending}); },
  loadPending(){ const p=lsGet(this.prefix+"pending",{}); this.pending=new Set(p.c||[]); this.pendingDel=new Set(p.d||[]); this.pendingN=new Set(p.n||[]); this.pendingDelN=new Set(p.nd||[]); this.statePending=!!p.s; },
  /* есть ли что отправить на сервер (заметки не считаем, пока в базе нет их таблицы) */
  pendingAny(){ return !!(this.pending.size||this.pendingDel.size||this.statePending||(this.notesRemote!==false && (this.pendingN.size||this.pendingDelN.size))); },
  scheduleFlush(ms=700){ clearTimeout(this.flushTimer); this.flushTimer=setTimeout(()=>this.flush(), ms); },
  async flush(){
    if(this.mode!=="supa" || this.flushing) return;
    if(!this.pendingAny()) return;
    if(navigator.onLine===false){ setSync(); return; }
    this.flushing=true; setSync();
    const sb=this.sb, uidv=this.user.id;
    try{
      if(this.pendingDel.size){
        const ids=[...this.pendingDel];
        for(let i=0;i<ids.length;i+=100){ const part=ids.slice(i,i+100); const {error}=await sb.from("cards").delete().in("id",part); if(error) throw error; part.forEach(x=>this.pendingDel.delete(x)); }
      }
      if(this.pending.size){
        const ids=[...this.pending];
        for(let i=0;i<ids.length;i+=200){
          const part=ids.slice(i,i+200).filter(id=>this.cards.has(id));
          const sent=part.map(id=>[id,this.cards.get(id).updated]);
          if(part.length){ const {error}=await sb.from("cards").upsert(part.map(id=>({user_id:uidv, id, data:this.cards.get(id)}))); if(error) throw error; }
          sent.forEach(([id,u])=>{ if(this.cards.get(id)?.updated===u) this.pending.delete(id); });
          ids.slice(i,i+200).forEach(id=>{ if(!this.cards.has(id)) this.pending.delete(id); });
        }
      }
      if(this.notesRemote!==false && (this.pendingN.size || this.pendingDelN.size)){
        try{
          if(this.pendingDelN.size){
            const ids=[...this.pendingDelN];
            for(let i=0;i<ids.length;i+=100){ const part=ids.slice(i,i+100); const {error}=await sb.from("grammar_notes").delete().in("id",part); if(error) throw error; part.forEach(x=>this.pendingDelN.delete(x)); }
          }
          if(this.pendingN.size){
            const ids=[...this.pendingN];
            for(let i=0;i<ids.length;i+=100){
              const chunk=ids.slice(i,i+100), part=chunk.filter(id=>this.notes.has(id));
              const sent=part.map(id=>[id,this.notes.get(id).updated]);
              if(part.length){ const {error}=await sb.from("grammar_notes").upsert(part.map(id=>({user_id:uidv, id, data:this.notes.get(id)}))); if(error) throw error; }
              sent.forEach(([id,u])=>{ if(this.notes.get(id)?.updated===u) this.pendingN.delete(id); });
              chunk.forEach(id=>{ if(!this.notes.has(id)) this.pendingN.delete(id); });
            }
          }
        }catch(e){ if(noteTableMissing(e)) this.notesRemote=false; else { if(/note limit/i.test(e?.message||"")) toast("Достигнут лимит в 2 000 заметок"); throw e; } }
      }
      if(this.statePending){
        this.statePending=false;
        const {error}=await sb.from("user_state").upsert({user_id:uidv, settings:this.settings, stats:this.stats});
        if(error){ this.statePending=true; throw error; }
      }
      this.syncError=null;
    }catch(e){
      this.syncError=e;
      if(/card limit/i.test(e?.message||"")) toast("Достигнут лимит в 10 000 карточек");
    }finally{
      this.flushing=false; this.savePending(); setSync();
      if(this.pendingAny() && !this.syncError) this.scheduleFlush(200);
    }
  },
  async pull(){
    const sb=this.sb, rows=[];
    for(let from=0;;from+=1000){
      const {data,error}=await sb.from("cards").select("id,data").range(from,from+999);
      if(error) throw error;
      rows.push(...data); if(data.length<1000) break;
    }
    const {data:st,error:e2}=await sb.from("user_state").select("settings,stats").maybeSingle();
    if(e2) throw e2;
    if(this.notesRemote!==false){
      try{
        const nrows=[];
        for(let from=0;;from+=1000){
          const {data,error}=await sb.from("grammar_notes").select("id,data").range(from,from+999);
          if(error) throw error;
          nrows.push(...data); if(data.length<1000) break;
        }
        const rem=new Map(); nrows.forEach(r=>{ const n=sanitizeNote({...r.data, id:r.id}); if(n) rem.set(n.id,n); });
        for(const [id,rn] of rem){
          if(this.pendingDelN.has(id)) continue;
          const ln=this.notes.get(id);
          if(!ln || (!this.pendingN.has(id) && (rn.updated||0)>=(ln.updated||0))) this.notes.set(id,rn);
        }
        for(const id of [...this.notes.keys()]) if(!rem.has(id) && !this.pendingN.has(id)) this.notes.delete(id);
      }catch(e){ if(noteTableMissing(e)) this.notesRemote=false; else throw e; }
    }
    const remote=new Map(); rows.forEach(r=>{ const c=sanitizeCard({...r.data, id:r.id}); if(c) remote.set(c.id,c); });
    for(const [id,rc] of remote){
      if(this.pendingDel.has(id)) continue;
      const lc=this.cards.get(id);
      if(!lc || (!this.pending.has(id) && (rc.updated||0)>=(lc.updated||0))) this.cards.set(id,rc);
    }
    for(const id of [...this.cards.keys()]) if(!remote.has(id) && !this.pending.has(id)) this.cards.delete(id); // удалено на другом устройстве
    if(st){
      if(!this.statePending) this.settings=sanitizeSettings(st.settings);
      const rs=sanitizeStats(st.stats);
      for(const [k,v] of Object.entries(rs.days)) if(!this.stats.days[k] || v.n>this.stats.days[k].n) this.stats.days[k]=v;
    }
    this.saveLocal(); this.lastPull=Date.now(); this.syncError=null;
  },
  async useUser(user){
    if(this.user?.id===user.id) return;
    this.user=user; this.mode="supa";
    const guestCards=lsGet(GUEST+"cards",[]).map(sanitizeCard).filter(Boolean);
    const guestStats=sanitizeStats(lsGet(GUEST+"stats",{}));
    const guestNotes=lsGet(GUEST+"notes",[]).map(sanitizeNote).filter(Boolean);
    this.loadLocal("koloda.u."+user.id+"."); this.loadPending();
    renderAll();
    try{ await this.pull(); }catch(e){ this.syncError=e; }
    if(guestNotes.length){ // перенос заметок, написанных до входа
      const haveT=new Set([...this.notes.values()].map(n=>norm(n.title)));
      let m=0;
      for(const n of guestNotes){ if(haveT.has(norm(n.title))) continue; n.id=gid(); n.updated=Date.now(); this.notes.set(n.id,n); this.pendingN.add(n.id); m++; }
      if(m){ this.saveLocal(); this.savePending(); if(!guestCards.length){ this.clearLocal(GUEST); toast(`${m} ${plural(m,"заметка перенесена","заметки перенесены","заметок перенесено")} в аккаунт`); } }
    }
    if(guestCards.length){ // перенос слов, добавленных до входа
      const have=new Set([...this.cards.values()].map(c=>norm(c.en)));
      let n=0;
      for(const c of guestCards){ if(have.has(norm(c.en))) continue; c.id=uid(); c.updated=Date.now(); this.cards.set(c.id,c); this.pending.add(c.id); n++; }
      for(const [k,v] of Object.entries(guestStats.days)) if(!this.stats.days[k]) this.stats.days[k]=v;
      this.statePending=true; this.saveLocal(); this.savePending(); this.clearLocal(GUEST);
      if(n) toast(`${n} ${plural(n,"слово перенесено","слова перенесены","слов перенесено")} в аккаунт`);
    }
    renderAll(); this.flush();
  },
  useGuest(){
    this.user=null; this.mode="local"; this.pending=new Set(); this.pendingDel=new Set(); this.pendingN=new Set(); this.pendingDelN=new Set(); this.statePending=false; this.syncError=null;
    this.loadLocal(GUEST); renderAll();
  },
  hasUnsynced(){ return this.mode==="supa" && this.pendingAny(); },

  // ---- общий интерфейс
  write(kind, id){
    this.saveLocal();
    if(this.mode==="claude"){
      const data = kind==="settings"?this.settings : kind==="stats"?this.stats : this.cards.get(id);
      this.col.doc(kind==="card"?id:kind).set(data).catch(e=>{
        if(["invalid_argument","revoked","not_granted"].includes(e?.code)){ this.mode="local"; setSync(); }
        else if(e?.code==="quota_exceeded") toast("Хранилище заполнено: удалите часть карточек");
      });
    } else if(this.mode==="supa"){
      if(kind==="card") this.pending.add(id); else this.statePending=true;
      this.savePending(); this.scheduleFlush();
    }
  },
  saveCard(c){ c.updated=Date.now(); this.cards.set(c.id,c); this.write("card",c.id); },
  /* пакетное сохранение: одна запись в браузер вместо сотни */
  saveMany(list){
    const now=Date.now(); list.forEach(c=>{ c.updated=now; this.cards.set(c.id,c); });
    this.saveLocal();
    if(this.mode==="claude") list.forEach(c=>this.col.doc(c.id).set(c).catch(()=>{}));
    else if(this.mode==="supa"){ list.forEach(c=>this.pending.add(c.id)); this.savePending(); this.scheduleFlush(); }
  },
  deleteMany(ids){
    ids.forEach(id=>this.cards.delete(id)); this.saveLocal();
    if(this.mode==="claude") ids.forEach(id=>this.col.doc(id).delete().catch(()=>{}));
    else if(this.mode==="supa"){ ids.forEach(id=>{ this.pending.delete(id); this.pendingDel.add(id); }); this.savePending(); this.scheduleFlush(); }
  },
  deleteCard(id){
    this.cards.delete(id); this.saveLocal();
    if(this.mode==="claude") this.col.doc(id).delete().catch(()=>{});
    else if(this.mode==="supa"){ this.pending.delete(id); this.pendingDel.add(id); this.savePending(); this.scheduleFlush(); }
  },
  /* вернуть удалённые карточки (кнопка «Отменить») */
  restoreMany(list){
    list.forEach(c=>{ this.cards.set(c.id,c); }); this.saveLocal();
    if(this.mode==="claude") list.forEach(c=>this.col.doc(c.id).set(c).catch(()=>{}));
    else if(this.mode==="supa"){ list.forEach(c=>{ this.pendingDel.delete(c.id); this.pending.add(c.id); }); this.savePending(); this.scheduleFlush(); }
  },
  /* отложенное пакетное сохранение: при подборе данных для сотен слов не пишем всю колоду на каждую карточку */
  lazy:new Set(), lazyT:null,
  saveLazy(c){ c.updated=Date.now(); this.cards.set(c.id,c); this.lazy.add(c.id); clearTimeout(this.lazyT); this.lazyT=setTimeout(()=>this.flushLazy(),1000); },
  flushLazy(){ clearTimeout(this.lazyT); const list=[...this.lazy].map(id=>this.cards.get(id)).filter(Boolean); this.lazy.clear(); if(list.length) this.saveMany(list); },
  /* ---- заметки по грамматике ---- */
  syncNote(id){
    if(this.mode==="claude") this.col.doc(id).set(this.notes.get(id)).catch(()=>{});
    else if(this.mode==="supa"){ this.pendingN.add(id); this.pendingDelN.delete(id); this.savePending(); this.scheduleFlush(); }
  },
  saveNote(n){ n.updated=Date.now(); this.notes.set(n.id,n); this.saveLocal(); this.syncNote(n.id); },
  deleteNote(id){
    this.notes.delete(id); this.saveLocal();
    if(this.mode==="claude") this.col.doc(id).delete().catch(()=>{});
    else if(this.mode==="supa"){ this.pendingN.delete(id); this.pendingDelN.add(id); this.savePending(); this.scheduleFlush(); }
  },
  saveSettings(){ this.write("settings"); },
  saveStats(){ this.write("stats"); },
};
const S = () => Store.settings;
window.addEventListener("pagehide",()=>Store.flushLazy());
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="hidden") Store.flushLazy(); });
function setSync(){
  const el=$("#sync"); if(!el) return;
  let text="этот браузер", cls="", title="Колода хранится только в этом браузере";
  if(Store.mode==="claude"){ text="синхронизировано"; cls="cloud"; title="Колода хранится в вашем аккаунте Claude"; }
  if(Store.mode==="supa"){
    if(Store.syncError || navigator.onLine===false){ text="нет связи — сохраню позже"; cls="warn"; title="Изменения сохранены на устройстве и отправятся, когда появится связь"; }
    else if(Store.flushing || Store.hasUnsynced()){ text="сохраняю…"; cls="cloud"; }
    else { text="сохранено в аккаунте"; cls="cloud"; title="Колода хранится в вашем аккаунте и доступна на любом устройстве после входа"; }
  }
  el.textContent=text; el.className="sync "+cls; el.title=title;
  renderAcct();
}
/* ============ cards ============ */
/* «Подпись» слова для упражнений: русский перевод, а если его нет, то английское определение */
const glossOf = c => c.ru || c.def || "";
const glossLang = c => c.ru ? "ru" : "en";
function newCard(f){ return { id:uid(), en:f.en.trim(), ru:(f.ru||"").trim(), def:(f.def||"").trim(), ipa:f.ipa||"", pos:f.pos||"", note:f.note||"", audio:f.audio||"", examples:f.examples||[], tags:cleanTags(f.tags), created:Date.now(), box:0, due:0, reps:0, lapses:0, fails:0, errs:0, last:0, demo:!!f.demo }; }
const status = c => !c.box ? "new" : (c.box>=4 ? "known" : "learning");
const isDue = c => c.box>0 && c.due <= Date.now();
const allCards = () => [...Store.cards.values()];
function dueLabel(c){
  if(!c.box) return "новое";
  if(isDue(c)) return "сегодня";
  const d = Math.round((startOfDay(c.due)-startOfDay())/DAY);
  return d===1 ? "завтра" : "через " + d + " " + plural(d,"день","дня","дней");
}
function boxesHtml(c){ const k=status(c)==="known"; let h=`<span class="boxes${k?" known":""}" title="Уровень ${c.box} из 7">`; for(let i=1;i<=7;i++) h+=`<i class="${i<=c.box?"on":""}"></i>`; return h+"</span>"; }

/* ============ speech ============ */
let voices=[];
function loadVoices(){ try{ voices = speechSynthesis.getVoices(); }catch{} }
if("speechSynthesis" in window){ loadVoices(); try{ speechSynthesis.addEventListener("voiceschanged", ()=>{ loadVoices(); if(view==="prefs") renderPrefs(); }); }catch{} }
function pickVoice(lang){
  if(lang==="en") return voices.find(v=>v.voiceURI===S().voice) || voices.find(v=>/en[-_]GB/i.test(v.lang)) || voices.find(v=>/^en/i.test(v.lang));
  return voices.find(v=>/^ru/i.test(v.lang));
}
let warnedNoSpeech=false, audioEl=null;
function stopSpeech(){ try{ speechSynthesis?.cancel(); }catch{} try{ audioEl?.pause(); }catch{} }
function speak(text, lang="en"){
  stopSpeech();
  if(lang==="en" && S().native!==false){
    const url=audioFor(text);
    if(url && /^https:\/\/api\.dictionaryapi\.dev\//.test(url)){ try{ speechSynthesis?.cancel(); }catch{} try{ audioEl?.pause(); audioEl=new Audio(url); audioEl.playbackRate=S().rate; audioEl.play().catch(()=>tts(text,lang)); return; }catch{} }
  }
  tts(text,lang);
}
function tts(text, lang){
  if(!("speechSynthesis" in window)){ if(!warnedNoSpeech){ toast("Этот браузер не умеет озвучивать текст"); warnedNoSpeech=true; } return; }
  try{
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(lang); if(v) u.voice=v;
    u.lang = v?.lang || (lang==="en"?"en-GB":"ru-RU"); u.rate = S().rate;
    speechSynthesis.speak(u);
  }catch{}
}
function autoSpeak(text, lang){ const a=S().audio; if(a==="off") return; if(lang==="ru" && a!=="both") return; speak(text, lang); }
document.addEventListener("click", e=>{ const b=e.target.closest("[data-say]"); if(b){ e.stopPropagation(); speak(b.dataset.say, b.dataset.lang||"en"); } }, true);
const sayBtn = (text, lang="en", sm=true) => `<button type="button" class="icon-btn${sm?" sm":""}" data-say="${esc(text)}" data-lang="${lang}" aria-label="Произнести">${SPK}</button>`;

/* ============ lookup sources ============ */
let samplePromise=null;
const getSample = () => (samplePromise ||= (window.claude?.use ? claude.use("sample") : Promise.resolve(null)));
let SOURCE = window.claude?.use ? "claude" : "free"; // уточняется после getSample()
getSample().then(s=>{ SOURCE = s ? "claude" : "free"; renderSourceNote(); if(view==="prefs") renderPrefs(); });
function renderSourceNote(){
  const el=$("#srcNote"); if(!el) return;
  el.innerHTML = SOURCE==="claude"
    ? "Переводы и примеры подбирает Claude."
    : 'Переводы: <a href="https://en.wiktionary.org" target="_blank" rel="noopener">Викисловарь</a>, машинные: <a href="https://mymemory.translated.net" target="_blank" rel="noopener">MyMemory</a> · словарь, транскрипция и аудио: <a href="https://dictionaryapi.dev" target="_blank" rel="noopener">Free Dictionary API</a> · примеры: <a href="https://tatoeba.org" target="_blank" rel="noopener">Tatoeba</a>';
}

/* Free Dictionary API + MyMemory */
let FETCH_MS = 8000;
async function fetchT(url, ms=FETCH_MS, chars=0){
  const ac=new AbortController(); const t=setTimeout(()=>ac.abort(), ms);
  bumpUsage(url, chars);
  try{ return await fetch(url,{signal:ac.signal}); } finally{ clearTimeout(t); }
}
/* ---- счётчик обращений к бесплатным сервисам (оценка по этому браузеру; реальный лимит считается по IP) ---- */
const USAGE_KEY="koloda_usage";
const SVC_HOST={"api.mymemory.translated.net":"mm","api.dictionaryapi.dev":"dict","en.wiktionary.org":"wik","tatoeba.org":"tat"};
const freshUsage=()=>({d:dayKey(), mm:{r:0,c:0}, dict:{r:0}, wik:{r:0}, tat:{r:0}, warned:0});
let usage=(()=>{ try{ const u=JSON.parse(localStorage.getItem(USAGE_KEY)); if(u&&u.d===dayKey()&&u.mm&&u.dict&&u.wik&&u.tat) return u; }catch{} return freshUsage(); })();
const mmLimit=()=> (S().mmEmail||"").trim() ? 50000 : 5000;
const mmLeft=()=> Math.max(0, mmLimit()-usage.mm.c);
function bumpUsage(url, chars=0){
  let s; try{ s=SVC_HOST[new URL(url).hostname]; }catch{} if(!s) return;
  if(usage.d!==dayKey()) usage=freshUsage();
  usage[s].r++; if(s==="mm") usage.mm.c+=chars;
  try{ localStorage.setItem(USAGE_KEY,JSON.stringify(usage)); }catch{}
  if(s==="mm"){
    const p=usage.mm.c/mmLimit();
    if(p>=1 && usage.warned<2){ usage.warned=2; toast("Дневной лимит переводчика исчерпан. Укажите email в настройках или продолжите завтра."); }
    else if(p>=.8 && usage.warned<1){ usage.warned=1; toast("Использовано больше 80% дневного лимита переводчика."); }
  }
}
const FREE = {
  limited:0,
  async translate(q, from, to){
    const em=(S().mmEmail||"").trim();
    const u="https://api.mymemory.translated.net/get?q="+encodeURIComponent(q)+"&langpair="+from+"|"+to+(em?"&de="+encodeURIComponent(em):"");
    let r; try{ r=await fetchT(u, FETCH_MS, q.length); }catch{ throw {code:"net"}; }
    if(!r.ok) throw {code: r.status===429?"quota":"net"};
    const j=await r.json();
    if(j.responseStatus && +j.responseStatus!==200) throw {code:/quota|limit|429/i.test(String(j.responseDetails)+j.responseStatus)?"quota":"net"};
    if(/MYMEMORY WARNING/i.test(j.responseData?.translatedText||"")) throw {code:"quota"};
    return j;
  },
  variants(j, src){
    const out=[]; const lower = src===src.toLowerCase();
    const add=t=>{ t=String(t||"").replace(/\s+/g," ").trim().replace(/[.!]+$/,""); if(!t||norm(t)===norm(src)||t.length>80) return; if(lower && t!==t.toUpperCase()) t=t.charAt(0).toLowerCase()+t.slice(1); if(!out.some(x=>norm(x)===norm(t))) out.push(t); };
    add(j.responseData?.translatedText);
    (j.matches||[]).filter(m=>+m.match>=0.7 && norm(m.segment)===norm(src)).sort((a,b)=>(+b.quality||0)-(+a.quality||0)).forEach(m=>add(m.translation));
    return out.slice(0,6);
  },
  async dict(word){
    const w=String(word).trim().replace(/^to\s+/i,"");
    if(!w) return {state:"notfound"};
    let r, j; try{ r=await fetchT("https://api.dictionaryapi.dev/api/v2/entries/en/"+encodeURIComponent(w)); }catch{ return {state:"net"}; }
    if(r.status===429){ this.limited=Date.now(); return {state:"limit"}; }
    if(r.status===404) return {state:"notfound"};
    if(!r.ok) return {state:"net"};
    try{ j=await r.json(); }catch{ return {state:"net"}; }
    if(!Array.isArray(j) || !j.length) return {state:"notfound"};
    const phon=j.flatMap(e=>e.phonetics||[]);
    let ipa=j.find(e=>e.phonetic)?.phonetic || phon.find(p=>p.text)?.text || "";
    if(ipa && !ipa.startsWith("/")) ipa="/"+ipa.replace(/^\[|\]$/g,"")+"/";
    const auds=phon.map(p=>p.audio).filter(Boolean);
    const audio=auds.find(a=>/-uk\.mp3/.test(a)) || auds.find(a=>/-us\.mp3/.test(a)) || auds[0] || "";
    const meanings=j.flatMap(e=>e.meanings||[]).map(m=>({pos:m.partOfSpeech, defs:(m.definitions||[]).slice(0,3).map(d=>({def:d.definition, ex:d.example||""}))}));
    const examples=meanings.flatMap(m=>m.defs.filter(d=>d.ex).map(d=>d.ex)).slice(0,2).map(e=>({en:e, ru:""}));
    return {state:"ok", ipa, audio, meanings, examples, pos: meanings.length===1 ? meanings[0].pos : (meanings[0]?.pos||"")};
  },
  async translateExamples(exs){
    for(const x of exs){ if(x.ru) continue; try{ x.ru = (await this.translate(x.en,"en","ru")).responseData?.translatedText || ""; if(x.ru) x.mt=true; }catch(e){ if(e.code==="quota") break; } }
    return exs;
  },
};
const draftAudio=new Map();
function audioFor(text){ const n=norm(text); return draftAudio.get(n) || allCards().find(c=>c.audio && norm(c.en)===n)?.audio || ""; }

/* ===== общий подбор транскрипции, звука и примеров: один и тот же для одиночного добавления и импорта ===== */
const infoCache=new Map();
const escRx = s => s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
/* --- разбор слова/фразы: «to cope with sth» -> «cope with», формы глагола для поиска примеров --- */
const PLACEHOLDER=/^(sb|sth|smb|smth|someone|something|somebody|one's|oneself|your|somewhere)$/i;
function coreOf(en){
  let s=String(en||"").replace(/\([^)]*\)/g," ").replace(/[«»"“”]/g,"").trim().replace(/^to\s+/i,"");
  const w=s.split(/\s+/).filter(Boolean); while(w.length>1 && PLACEHOLDER.test(w[w.length-1])) w.pop();
  return w.join(" ").replace(/[.!?]+$/,"");
}
const IRREG={be:["is","are","was","were","been","being"],set:["sets","setting"],run:["runs","ran","running"],take:["takes","took","taken","taking"],get:["gets","got","gotten","getting"],give:["gives","gave","given","giving"],make:["makes","made","making"],go:["goes","went","gone","going"],come:["comes","came","coming"],put:["puts","putting"],break:["breaks","broke","broken","breaking"],bring:["brings","brought","bringing"],keep:["keeps","kept","keeping"],see:["sees","saw","seen","seeing"],look:["looks","looked","looking"],turn:["turns","turned","turning"],pick:["picks","picked","picking"],hold:["holds","held","holding"],cut:["cuts","cutting"],let:["lets","letting"],lose:["loses","lost","losing"],find:["finds","found","finding"],think:["thinks","thought","thinking"],tell:["tells","told","telling"],leave:["leaves","left","leaving"],do:["does","did","done","doing"],have:["has","had","having"],say:["says","said","saying"],stand:["stands","stood","standing"],fall:["falls","fell","fallen","falling"],grow:["grows","grew","grown","growing"],show:["shows","showed","shown","showing"],write:["writes","wrote","written","writing"],buy:["buys","bought","buying"],pay:["pays","paid","paying"],sell:["sells","sold","selling"],send:["sends","sent","sending"],spend:["spends","spent","spending"],begin:["begins","began","begun","beginning"],drive:["drives","drove","driven","driving"],eat:["eats","ate","eaten","eating"],speak:["speaks","spoke","spoken","speaking"],catch:["catches","caught","catching"],teach:["teaches","taught","teaching"],wake:["wakes","woke","woken","waking"],meet:["meets","met","meeting"],sit:["sits","sat","sitting"],lie:["lies","lay","lain","lying"],sleep:["sleeps","slept","sleeping"],feel:["feels","felt","feeling"],hear:["hears","heard","hearing"],mean:["means","meant","meaning"],win:["wins","won","winning"],throw:["throws","threw","thrown","throwing"],wear:["wears","wore","worn","wearing"],draw:["draws","drew","drawn","drawing"],cope:["copes","coped","coping"]};
function verbForms(v){
  v=v.toLowerCase(); if(IRREG[v]) return IRREG[v];
  const f=[];
  if(/[^aeiou]y$/.test(v)){ f.push(v.slice(0,-1)+"ies", v.slice(0,-1)+"ied", v+"ing"); }
  else if(/e$/.test(v)){ f.push(v+"s", v+"d", v.slice(0,-1)+"ing"); }
  else if(/(s|x|z|ch|sh)$/.test(v)){ f.push(v+"es", v+"ed", v+"ing"); }
  else if(/^[^aeiou]*[aeiou][^aeiouwxy]$/.test(v) && v.length<=4){ f.push(v+"s", v+v.slice(-1)+"ed", v+v.slice(-1)+"ing"); }
  else f.push(v+"s", v+"ed", v+"ing");
  return f;
}
/* варианты записи для поиска: сама фраза, формы глагола, формы существительного */
function phraseVariants(en){
  const core=coreOf(en); if(!core) return [];
  const w=core.split(/\s+/), out=[core];
  if(/^to\s/i.test(String(en).trim())) verbForms(w[0]).forEach(f=>out.push([f,...w.slice(1)].join(" ")));
  return [...new Set(out.map(x=>x.toLowerCase()))];
}
const phraseHit=(sentence, vars)=>{ const s=" "+sentence.toLowerCase().replace(/[’‘`´]/g,"'").replace(/[^a-z' ]+/g," ").replace(/\s+/g," ")+" "; return vars.some(v=>s.includes(" "+v+" ")); };
const stripHtml=s=>String(s||"").replace(/<[^>]*>/g,"").replace(/&nbsp;/g," ").replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").replace(/\s+/g," ").trim();
const goodSentence=en=>en.length>=12 && en.length<=120 && /[a-z]/i.test(en) && !/[<>{}\[\]|]/.test(en);

/* ===== уровень примеров: частотный список (3000 самых частых слов, wordfreq, CC BY-SA) + слова из колоды ===== */
const FREQ_WORDS = "the to and of a in i is for that you it on with this was be as are have at he not by but from my or we an your all so his they me if one can will just like about up out what has when more do no were who had their there her which time get been would she new people how some also them now other its our than good only after first him into know see two make over think any then could back these us want because go well said way most much very where even should may here need really did right work year years being day too going before off why made still take got many never those life say world down great through last while best such love man home long look something use same used both every am come part state three around between always better find help high little old since another does own things under during game thing give house place school again next each mr without against end found must show big feel sure team ever family keep might please put money free second someone away left number city days lot name night play until company doing few let real called different having set thought done however getting god government group looking public top women business care start system times week already anything case nothing person today change enough everything full live making point read told yet bad four hard mean once support tell including music power seen states stop water based believe call head men national small took white came far job side though try went yes actually american later less line order party run says service country open season shit thank children everyone general trying united using area black following law makes together war whole car face five kind maybe per president story working course games health hope important least means news within able book early friends information local oh post thanks video young ago others social talk court fact given guys half hand level mind often single become body coming control death food guy hours office pay problem south true almost fuck history known large lost research room several started taking university win wrong along anyone else girl john matter pretty remember air bit friend hit needs nice playing probably saying understand yeah york class close comes idea international looks past possible wanted cause due happy human members months move question series wait woman ask community data late leave north saw special watch either fucking future light low million morning police short stay taken age buy deal rather reason red report soon third turn whether among check development form further heart minutes myself services yourself act although asked child fire fun living major media phone players art behind building easy gonna market near non plan political quite six talking west works according available education final former front kids list ready sometimes son street bring college current example experience heard london meet program type baby chance father march process song study word across action clear gave gets himself month outside self students words board cost cut dr field held instead main moment mother road seems thinking town wants de department energy fight fine force hear issue played points price re rest results running shows space summer term wife america beautiful date goes killed land miss project sex shot site strong account co especially eyes include june parents period position record similar total above club common died film happened knew lead likely military perfect personal security share st tv won april center county couple dead english happen hold industry inside issues online player private problems return rights sense star test view weeks break british companies event higher hour member middle needed present result sorry takes training wish answer boy design finally girls gold gone guess interest july king learn policy society added al alone average bank brought certain church east hands hot longer medical movie original park performance press received role sent themselves tried worked worth areas became bill books cool director exactly giving ground meeting provide questions relationship september sound source usually value evidence follow lives official ok production rate reading round save stand stuff tax whatever amount blue countries david drive eat fall fast federal feeling felt green league management match model picture size step trust central changes england forward groups hey key mom page paid range review science trade uk upon various attention brother cannot character chief cup football hate james led looked lower natural october property quality send style vote amazing august blood china complete dog economic hell involved itself language lord november oil related serious stage terms title add article attack born damn decided decision enjoy entire french january kill met perhaps poor release situation technology turned website written choice code considered continue council cover currently door election european events financial foreign hair increase legal lose michael pick race seem seven sign simple simply staff super union walk washington bed began built career changed crazy daily daughter december die difficult figure hospital knows loss modern ones paper parts popular published safe starting systems version voice whose writing army australia earth forget goal huge internet listen okay practice rules sea sir success towards waiting ways access base below created deep followed la lol mark missing offer pass professional released risk schools sleep table ten truth ball box build card cases dark district europe george india mine minister note percent piece products recent seeing straight visit wall wanna wrote allowed boys culture etc fans february gives growth included married officer pain paul places respect response river rock shall speak specific standard tonight write album century charge cold create effect eight except eye funny ii limited moving network peace provided recently required sales spent store student tomorrow track via watching weight addition ahead allow anti association beat brown capital chinese committee conference difference double expect gas island moved normal plans population potential pressure radio russian station text treatment western ass beginning california campaign certainly completely content credit cross described despite female focus hi husband ice individual interesting join kept leading loved message miles nearly particular previous quickly region reported section sort speed travel consider contact drop fair feet jesus kid link positive sale throughout tour welcome absolutely additional beyond conditions earlier extra forces immediately jobs leaving minute nature numbers quick sell significant studies unless winning agree canada clean computer construction episode favorite income justice levels manager movement photo posted safety san scene sold sounds spend statement sun teams ability announced asking calling coach collection continued costs definitely designed expected friday gun happens heavy includes knowledge particularly search subject train wide wow author centre claim dad developed fear fit generally german global goals gotta hotel interested judge lady leader letter lines material named nobody opportunity plus pre product regular secretary sister stories unit workers annual anymore bar battle brain contract degree families features finished floor france growing hurt image insurance majority meant opening opinion physical pro reach rule seriously sports stupid successful active administration approach australian biggest cancer civil dance defense direction independent master none reasons russia ship stock trump weekend wonder worst africa awesome band beach cash clearly commercial compared effort ended fan fighting imagine impact lack latest learning multiple older operation organization passed pictures protect secret senior spring sunday telling wear activities address analysis anyway bought calls choose christmas color commission competition details direct dream easily finish grand increased indian literally luck marriage names necessary patients resources rich skin speaking supposed sweet thus touch yesterday caught closed congress damage directly disease doctor doubt drink driving established facebook feels fish gay germany glad greater grow largest machine notice overall planning professor programs records reports shown sit trip associated basic captain carry cars crime effective effects explain fully highly holding japan laws male mrs parties plant reality smith spot texas winter worse advice agreement award block broken caused challenge characters christian comment equipment eventually helped holy killing lived lots nation otherwise peter prices primary purpose rates responsible shop showing sick teacher theory uses william agency avoid camera catch cell coast comments drug economy environment executive foot hall mass meaning mission nine officers operations politics pop produced ran saturday status therefore trial truly weather activity app application claims coffee complex condition division evening flight freedom google heat highest interview library located location murder obama offered putting queen seconds showed sitting standing stars walking accept actual appear attempt broke channel distance eating exchange fat fell finding glass learned losing mobile northern opened placed powerful prior protection reached receive religious ride robert royal screen serve signed slow species speech traffic tree types vs wearing whom wonderful agreed airport animals appears begin benefits bottom cities demand engine everybody famous ideas investment keeping lie notes partner plays raised runs sad solution songs sources southern square stopped structure thomas traditional twice wind worry americans appeared becomes brand bus cent chicago count covered critical digital forced fourth fresh lake mental mentioned missed mostly mouth owner photos previously realize remain scale score separate smart starts surface throw tom totally twitter views wedding acting actions african arms benefit budget click estate failed faith fashion feature fund generation hearing hill jack larger louis metal mid paris profile pull push returned rose seat seemed sexual target understanding village agent animal apply authority basis becoming chris draw dude employees enter ex follows foundation gain http individuals japanese leaders memory prime projects ring rise selling served silver soul spread supply waste weird adult apparently artist chairman edition engineering grade happening healthy institute method mike monday nations obviously option prison provides remains senate smaller somebody stone strength users wild window winner arrived bag bet camp cast christ continues correct dangerous ed extremely firm greatest handle improve indeed leaves movies negative prevent removed richard spirit television till trouble usa videos advantage apart aware cat customers decide dinner dollars eastern fifth function gift helping herself impossible influence items joe los marketing mary materials nor produce progress proud require shooting shut standards tells thinks van wood background birth bridge carried charles classes completed concept copy dear dogs drugs efforts garden host housing inc israel journal labor leadership length lucky neither onto patient possibly prove rare setting skills software thousands tough units ad alive apple balance birthday bitch boss cards changing connection dress easier fellow florida horse knowing liked magic managed map net owned request stick turns vehicle volume wake aid beauty believed billion busy buying cells concerned conversation corner criminal cultural develop driver ends existing farm file fix fly frank guide images investigation mexico operating paying presented raise responsibility roll slightly suggest surprise technical thoughts treat unique variety violence weapons yours youth appreciate bigger breaking discovered dont dry edge evil excited forever funds helps henry injury iron lovely mad magazine martin models offers ordered parliament prepared reference religion sites somewhere stated strategy teachers web wine accounts angeles arm audience bay blog closer core democratic description dropped excellent exist figures forms guard honest issued joined jones lee lies likes medicine mention mountain nuclear orders port presence reaction reduce shoot sides solid spanish sport steps stress taste tea victory afternoon assistant britain citizens classic clothes decisions electric emergency entered entirely facts failure festival flat fuel harry hello houses ill initial introduced johnson kick links mail massive matters pair picked pieces plane plenty prince proper providing quarter regional scott session shape sky teaching toward transfer upper useful valley watched willing windows zone accident advanced alternative anywhere articles awards bear boat bringing capacity cheap climate communities discussion drinking duty fantastic feelings flying governor hundred industrial joint mix museum options path plants policies promise proposed purchase rain remove signs spending steel steve supporting terrible tired treated turning vice warm afraid arts beer border canadian command crew crowd dating dick elements enemy ensure environmental filled fixed forest intelligence intended labour limit moon ocean powers profit proof republican soldiers suit wins appearance asian attorney banks behavior ben bodies brothers buildings chair creating debt domestic expensive grew historical homes honestly honor im jump launch listed minimum native noted originally planned pm ray sets suddenly supreme survey tech trees update user writer yellow younger ancient attacks charges combined communication connected contains download email ending exercise express flow formed girlfriend hero illegal increasing joke loan methods officials performed planet relationships restaurant scotland selected shared shopping soft stuck sugar suggested supported surprised taught transport accepted adding affairs allows appeal applied appropriate artists boston ca confirmed device drama entry era factor feed golden grant grown heads hoping keeps lawyer legs lying measures mistake ms muslim organizations platform pool pulled regarding relations requires route saved schedule scientific shoes smoke squad teach testing tests values walked williams ya abuse angry businesses candidate comfortable concern developing discuss elections emotional et everywhere facilities falling fox guns hole holiday interests internal ireland italian italy jersey laugh leg letters liberal listening ll loves lunch max milk pack payment perform recorded relatively sector sharing snow storm streets strike studio sub weak youtube actor advance apartment asia chain chapter committed confidence cook cute equal fake finance focused hits identity journey kitchen korea leads maintain measure mm numerous owners posts properties quiet revealed specifically split task taxes taylor twenty urban acts affected aircraft applications approved approximately argument arrested claimed conflict considering corporate debate determined distribution documents escape extended factors faster fault fill films flowers friendly ladies lay lights millions mixed phase properly pure reduced requirements residents revenue sam sat secure smile strange talent temperature thousand tony troops truck votes ah authorities basically besides bird blame bob bowl causes chicken collected context coverage determine display dying elected examples experienced falls false fired forgot funding identified iii incredible inspired launched ma meat ministry mode neck noticed novel obvious passing positions remaining scored shirt shots slowly stadium stores surgery trading tuesday vision whenever worried zero alex allowing begins champion charged cream crisis daniel delivered editor estimated eu giant iran jail jim kingdom literature mayor minor moments opposite orange ourselves pages remained selection serving signal stream struggle suicide talked theme thursday tiny typically un unfortunately usual vehicles virginia voted voting walls wave alcohol assembly breakfast bright brings capable carrying chosen combination conservative customer cutting desire destroyed draft drunk essential fail familiar finds granted guilty humans hundreds id improved jewish largely laughing markets medium ohio opportunities papers perfectly recommend referred relevant seek sending solo spoke stands talks ticket unable upset wing answers birds bomb creative cycle dealing directed don educational entertainment extreme facility fields goods hang holds info mainly maximum newspaper offering painting republic reserve returns row salt scared scottish shares statistics switch territory threat tickets wales adults affect appointed armed aside assistance bell blow bond boyfriend careful circumstances communications concerns controlled corporation cry danger deals delivery deserve devices dollar dreams empty enjoyed explained faces folks fucked gender instance kim kinda matches mile motion moves nick pacific prize realized reasonable receiving register resolution rural ryan saving sees singing spain tools typical universe warning wars wednesday admit attitude branch brazil conducted decades dedicated definition drawing favor flag frame guest ha heaven independence institutions jackson kiss load plot possibility random recovery rent replace represent reviews scenes seeking senator sentence teeth tips trained understood academic academy accurate achieve adam afford andrew assume bbc bottle bunch category chat cheese chemical clinton competitive detail diet em favourite fruit harder index item lane mess navy normally occurred opposition parent permanent personally pleasure prefer programme representative scheme shift stood storage tank tend tight transportation ultimately unlike weekly yard anybody assets basketball button candidates combat constitution consumer counter creation crown crying dc defined depending depression describe drivers el employment exclusive excuse expert frequently golf grace hopefully identify importance kevin laid latter manufacturing mining object partners pattern performing personnel perspective pregnant premier promote revolution rooms severe sleeping suppose tool tournament turkey ve victim victims agents amazon arrest attend ban brilliant carbon catholic chose circle concert crash declared deliver depth deputy dirty doctors earned electronic error existence experiences expression factory headed interior joy jr legislation maintenance manner mate matt nearby noise origin pakistan panel personality plate practices prepare relief replaced resistance retail rice roads roof shame ships somewhat staying stronger surely tip updated writers absolute advertising agencies baseball bathroom bible cable calm championship checked client constant da dates degrees democrats doors driven dumb empire exciting expansion heavily hide incident irish linked manage messages michigan multi nfl politicians print quit refused reporting sight significantly sing soviet weapon wet widely worldwide ages anniversary attractive bike broad burn cake causing closely constantly contest deaths depends drawn fees francisco haha hardly hat height hidden hong invited letting loud manchester marine motor officially pc peak portion pounds princess protein puts raw reform regions represented respond retirement sample seats secondary solar somehow stayed suffering sydney tries ultimate unknown wilson wondering attached attacked automatically balls battery bills blind breath brief carolina chest conduct debut decade destroy differences edward engaged experts expressed external fantasy ft grab hollywood immediate introduction joseph license paint pilot pink presidential principal recognize recognized registered regularly representatives rising seasons shipping singer smoking steam suffered survive tall thats theatre therapy witness adopted aim campus cap chances childhood clinical clubs comedy commander comparison covers dan defeat defence democracy detailed entitled exact exposed fed fee injured jan jordan kinds lets loans lock musical nose objects opposed organized plastic protected purposes quote recording semi statements suspect swear techniques tie tim trend valuable wealth wise yards aged approval aspects attempts bread burning champions contain convention dancing document eggs employee en engineer equivalent facing fairly fingers ford founded functions gang graduate greek hanging inner islands le lift marked memories miller monthly mountains neighborhood operate outstanding permission porn racing recommended regulations reply republicans rid roman scientists shoulder shower solutions sons stations stephen tower tradition visited visual wheel zealand achieved admitted appointment authors barely bc bush cabinet celebrate challenges chocolate coal colour contemporary criticism davis dna effectively eric extensive faced filed formation fought gained gallery highway historic hunt improvement inch initially junior jury kong korean marks monster obtained olympic philosophy pride promised repeat returning riding rough santa settlement smell".split(" ");
const FREQ_RANK = new Map(FREQ_WORDS.map((w,i)=>[w,i]));
const LEVELS = {A2:{k:900,len:9}, B1:{k:1800,len:12}, B2:{k:3000,len:16}, C1:{k:3000,len:22}};
const lemmaTry = w => [w, w.replace(/s$/,""), w.replace(/es$/,""), w.replace(/ies$/,"y"), w.replace(/ed$/,""), w.replace(/ed$/,"e"), w.replace(/d$/,""), w.replace(/ing$/,""), w.replace(/ing$/,"e"), w.replace(/ly$/,""), w.replace(/er$/,""), w.replace(/est$/,"")];
let knownCache=null;
function deckKnown(){
  if(knownCache) return knownCache;
  const k=new Set();
  for(const c of Store.cards.values()) if(c.box>=2) for(const w of coreOf(c.en).toLowerCase().split(/\s+/)) if(w) k.add(w);
  return knownCache=k;
}
function isKnownWord(w){
  const lv=LEVELS[S().level]||LEVELS.B1, ks=deckKnown();
  for(const f of lemmaTry(w)){ if(!f) continue; if(ks.has(f)) return true; const r=FREQ_RANK.get(f); if(r!==undefined && r<lv.k) return true; }
  return false;
}
const tokensOf = t => String(t).match(/[A-Za-z]+(?:'[a-z]+)?/g) || [];
/* чем меньше балл, тем пример понятнее: мало незнакомых слов и не слишком длинный */
function exScore(x, c){
  const lv=LEVELS[S().level]||LEVELS.B1, toks=tokensOf(x.en);
  const tgt=new Set(phraseVariants(c.en).flatMap(v=>v.split(/\s+/)));
  let unk=0;
  toks.forEach((t,i)=>{ const w=t.toLowerCase().replace(/'.*$/,""); if(tgt.has(w)||w.length<=2) return; if(i>0 && /^[A-Z]/.test(t)) return; if(!isKnownWord(w)) unk++; });
  return unk*4 + Math.max(0,toks.length-lv.len)*1.5 + toks.length*0.05 + (x.ru?0:0.5) + (x.mt?0.3:0);
}
function rankedExamples(c){
  const ex=c.examples||[]; if(ex.length<2) return ex;
  const pinned=ex.filter(x=>x.pin), rest=ex.filter(x=>!x.pin);
  return [...pinned, ...rest.map(x=>({x,s:exScore(x,c)})).sort((a,b)=>a.s-b.s).map(o=>o.x)];
}
/* где в предложении стоит слово или фраза (в любой форме): нужно для задания с пропуском */
function findInSentence(sentence, c){
  const base=phraseVariants(c.en); if(!base.length) return null;
  const isVerb=/^to\s/i.test(String(c.en).trim());
  const vars=[...base]; if(!isVerb) base.forEach(v=>vars.push(v+"s", v+"es"));
  const sn=String(sentence).replace(/[’‘`´]/g,"'");
  for(const v of vars.sort((a,b)=>b.length-a.length)){
    const rx=new RegExp("(^|[^A-Za-z'])("+v.split(/\s+/).map(escRx).join("\\s+")+")(?![A-Za-z'])","i");
    const m=rx.exec(sn); if(m) return {text:sentence.substr(m.index+m[1].length, m[2].length), index:m.index+m[1].length};
  }
  return null;
}
function clozeFor(c){
  for(const x of rankedExamples(c)){ if(!x.en || x.en.length>140) continue; const m=findInSentence(x.en,c); if(m && m.text.length>=2) return {x,m}; }
  return null;
}

/* --- Tatoeba: примеры с переводом на русский --- */
async function tatoebaSearch(q, withRu){
  const base="https://tatoeba.org/en/api_v0/search?from=eng&sort=relevance&query="+encodeURIComponent(q);
  let r, j;
  try{ r=await fetchT(base+(withRu?"&to=rus&trans_filter=limit":"")); }catch{ return {items:[], state:"net"}; }
  if(!r.ok) return {items:[], state:"net"};
  try{ j=await r.json(); }catch{ return {items:[], state:"net"}; }
  const items=[];
  for(const x of (Array.isArray(j?.results)?j.results:[])){
    const en=str(x?.text,300).trim();
    const tr=(Array.isArray(x?.translations)?x.translations.flat(2):[]).find(t=>t&&t.lang==="rus"&&str(t.text));
    items.push({en, ru:tr?str(tr.text,300).trim():"", src:"tat"});
  }
  return {items, state:"ok"};
}
async function tatoebaExamples(phrase, want=2){
  const vars=phraseVariants(phrase); if(!vars.length) return {items:[], state:"ok"};
  const seen=new Set(), withRu=[], noRu=[]; let state="ok", asked=0;
  const take=(list)=>{ for(const x of list){ if(!x.en||!goodSentence(x.en)||x.ru.length>160||seen.has(norm(x.en))||!phraseHit(x.en,vars)) continue; seen.add(norm(x.en)); (x.ru?withRu:noRu).push(x); } };
  for(const q of [vars[0], ...vars.slice(1,3)]){
    if(withRu.length>=want) break;
    const t=await tatoebaSearch(q,true); asked++; if(t.state==="net") state="net"; else state="ok"; take(t.items);
  }
  if(withRu.length<want && state!=="net"){ const t=await tatoebaSearch(vars[0],false); if(t.state==="net") state="net"; take(t.items); }
  const score=x=>Math.abs(x.en.length-55);
  withRu.sort((a,b)=>score(a)-score(b)); noRu.sort((a,b)=>score(a)-score(b));
  return {items:[...withRu,...noRu].slice(0,want), state};
}

/* --- Викисловарь: примеры и транскрипция, в том числе для фраз и фразовых глаголов --- */
async function wiktDefs(term){
  let r, j; try{ r=await fetchT("https://en.wiktionary.org/api/rest_v1/page/definition/"+encodeURIComponent(term)); }catch{ return {state:"net", examples:[], pos:""}; }
  if(r.status===404) return {state:"notfound", examples:[], pos:""};
  if(!r.ok) return {state:"net", examples:[], pos:""};
  try{ j=await r.json(); }catch{ return {state:"net", examples:[], pos:""}; }
  const secs=Array.isArray(j?.en)?j.en:[]; const ex=[];
  for(const sec of secs) for(const d of (sec.definitions||[])){
    for(const e of (d.examples||[])) ex.push(stripHtml(e));
    for(const p of (d.parsedExamples||[])) ex.push(stripHtml(p?.example));
  }
  const pos=str(secs[0]?.partOfSpeech,40).toLowerCase();
  return {state: secs.length?"ok":"notfound", examples:[...new Set(ex.filter(Boolean))], pos};
}
/* текст страницы Викисловаря берём один раз на слово: из него достаём и транскрипцию, и переводы, и определения */
const wiktCache=new Map();
function wiktPage(term){
  const key=norm(term);
  if(!wiktCache.has(key)){
    const p=(async()=>{
      let r, j; try{ r=await fetchT("https://en.wiktionary.org/w/api.php?action=parse&prop=wikitext&format=json&formatversion=2&redirects=1&origin=*&page="+encodeURIComponent(term)); }catch{ return {state:"net", text:""}; }
      if(!r.ok) return {state:"net", text:""};
      try{ j=await r.json(); }catch{ return {state:"net", text:""}; }
      const wt=j?.parse?.wikitext; if(typeof wt!=="string") return {state:"notfound", text:""};
      return {state:"ok", text:wt};
    })();
    wiktCache.set(key,p); p.then(v=>{ if(v.state==="net") wiktCache.delete(key); });
  }
  return wiktCache.get(key);
}
async function wiktIpa(term){
  const pg=await wiktPage(term); if(pg.state!=="ok") return {state:pg.state, ipa:""};
  const en=wikEnglish(pg.text, true);
  const m=/\{\{IPA\|en\|([^}]*)\}\}/.exec(en); if(!m) return {state:"notfound", ipa:""};
  const p=m[1].split("|").map(x=>x.trim()).find(x=>/^[\/\[].+[\/\]]$/.test(x));
  if(!p) return {state:"notfound", ipa:""};
  return {state:"ok", ipa:"/"+p.slice(1,-1)+"/"};
}
/* английский раздел страницы; whole=true: если раздела нет, берём всю страницу (для транскрипции) */
function wikEnglish(wt, whole=false){
  const a=wt.indexOf("==English==");
  if(a<0) return whole ? wt : "";
  let en=wt.slice(a+11); const b=en.search(/\n==[^=]/); if(b>=0) en=en.slice(0,b);
  return en;
}
/* вики-разметка -> обычный текст: шаблоны {{lb|en|…}}, ссылки [[a|b]], курсив */
function cleanWiki(t){
  let s=String(t||"");
  for(let i=0;i<6 && s.includes("{{");i++){
    s=s.replace(/\{\{([^{}]*)\}\}/g,(_,inner)=>{
      const p=inner.split("|").map(x=>x.trim()), name=p[0].toLowerCase();
      if(["lb","lbl","label","context","cx"].includes(name)){ const labs=p.slice(2).filter(x=>x && !x.includes("=") && !/^(_|and|or|,|;|nocat)$/i.test(x)); return labs.length?"("+labs.join(", ")+")":""; }
      if(["q","qual","qualifier","i","qf"].includes(name)){ const q=p.slice(1).filter(x=>x&&!x.includes("=")); return q.length?"("+q.join(", ")+")":""; }
      if(["l","m","link","mention","ll","l-self","m-self","m-lite","l-lite"].includes(name)) return p[3] && !p[3].includes("=") ? p[3] : (p[2]||"");
      if(["w","pedlink","wikipedia"].includes(name)) return p[2]||p[1]||"";
      if(["gloss","gl"].includes(name)) return p[1]?"("+p[1]+")":"";
      if(["non-gloss definition","n-g","ngd","non-gloss"].includes(name)) return p[1]||"";
      return "";
    });
  }
  return s.replace(/\[\[(?:Category|File|Image):[^\]]*\]\]/gi,"").replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g,"$1")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g,"").replace(/<[^>]*>/g,"").replace(/'{2,}/g,"").replace(/&nbsp;/g," ")
    .replace(/\(\s*\)/g,"").replace(/\s+/g," ").trim();
}
/* русские переводы из блока Translations: группы по смыслу ({{trans-top|значение}}) */
function wikTranslations(en){
  const groups=[];
  const blocks=en.match(/={3,5}\s*Translations\s*={3,5}[\s\S]*?(?=\n={2,5}[^=]|$)/g)||[];
  for(const blk of blocks){
    let gloss="";
    for(const raw of blk.split("\n")){
      const line=raw.trim();
      const tt=/^\{\{trans-top\|(.*?)\}\}$/i.exec(line);
      if(tt){ gloss=cleanWiki(tt[1].split("|")[0]); continue; }
      if(/^\{\{trans-top\}\}/i.test(line)){ gloss=""; continue; }
      const ru=/^\*+\s*Russian\s*:\s*(.*)$/i.exec(line); if(!ru) continue;
      const terms=[];
      for(const m of ru[1].matchAll(/\{\{(?:t\+?|t-simple|tt\+?|t-check|t\+check)\|ru\|([^|}]+)/g)){
        const t=cleanWiki(m[1]).replace(/\u0301/g,""); if(t && !t.includes("=") && isCyr(t) && t.length<=60 && !terms.some(x=>norm(x)===norm(t))) terms.push(t);
      }
      if(terms.length){
        const g=groups.find(x=>x.gloss===gloss);
        if(g) terms.forEach(t=>{ if(!g.terms.some(x=>norm(x)===norm(t))) g.terms.push(t); }); else groups.push({gloss, terms});
      }
    }
  }
  return groups;
}
const WIK_POS=/^={3,5}\s*(Noun|Proper noun|Verb|Adjective|Adverb|Preposition|Conjunction|Pronoun|Interjection|Determiner|Particle|Phrase|Idiom|Proverb|Prepositional phrase|Numeral|Contraction|Article|Postposition|Phrasal verb)\s*={3,5}$/i;
/* определения на английском по частям речи */
function wikDefinitions(en){
  const defs=[]; let pos="";
  for(const raw of en.split("\n")){
    const line=raw.trim(); const h=WIK_POS.exec(line);
    if(h){ pos=h[1].toLowerCase(); continue; }
    if(/^={2,5}[^=]/.test(line)){ pos=""; continue; }
    if(pos && /^#(?![:*#])\s/.test(line)){
      let d=cleanWiki(line.slice(1)); const lab=/^(\([^)]*\)\s*)+/.exec(d); if(lab) d=d.slice(lab[0].length).trim();
      d=d.replace(/[:;,\s]+$/,"");
      if(d.length>=4 && /[a-z]/i.test(d) && !/^(alternative|plural|simple past|past participle|present participle|third-person|obsolete form|misspelling|eye dialect)\b/i.test(d)) defs.push({pos, def:d.slice(0,220), label:lab?lab[0].trim():""});
    }
  }
  return defs;
}
/* переводы и определения слова или фразы из Викисловаря */
async function wiktLearn(term){
  const pg=await wiktPage(term); if(pg.state!=="ok") return {state:pg.state, groups:[], defs:[]};
  const en=wikEnglish(pg.text);
  if(!en) return {state:"notfound", groups:[], defs:[]};
  return {state:"ok", groups:wikTranslations(en), defs:wikDefinitions(en)};
}
const meaningsFromDefs = defs => { const m=new Map(); defs.forEach(d=>{ (m.get(d.pos)||m.set(d.pos,[]).get(d.pos)).push({def:d.def, ex:""}); }); return [...m].map(([pos,ds])=>({pos, defs:ds.slice(0,3)})); };

/* --- Офлайн-словарь произношений (CMU, американский вариант): складываем транскрипцию фразы по словам --- */
let cmuPromise=null;
function loadCmu(){
  return cmuPromise ||= (async()=>{
    try{
      if(typeof DecompressionStream==="undefined") return null;
      const r=await fetch("vendor/ipa-us.json.gz"); if(!r.ok||!r.body) return null;
      const txt=await new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).text();
      return JSON.parse(txt);
    }catch{ return null; }
  })();
}
const FUNC_WORDS=new Set("a an the to of with for in on at by from and or but as is are be am was were you your i my me it its he she we they that this if so do does up out off".split(" "));
async function cmuIpa(core){
  const d=await loadCmu(); if(!d) return "";
  const words=String(core).toLowerCase().replace(/[’‘`´]/g,"'").split(/[\s-]+/).map(w=>w.replace(/^[^a-z']+|[^a-z']+$/g,"")).filter(Boolean);
  if(!words.length||words.length>6) return "";
  const parts=[];
  for(const w of words){
    let p=d[w]; if(!p && w.endsWith("'s")) p=d[w.slice(0,-2)]; if(!p) return "";
    if(words.length>1 && FUNC_WORDS.has(w)) p=p.replace(/[ˈˌ]/g,"");
    parts.push(p);
  }
  return "/"+parts.join(" ")+"/";
}

async function enrichInfo(en){
  const key=norm(en);
  if(infoCache.has(key)) return infoCache.get(key);
  const p=(async()=>{
    const out={ipa:"", pos:"", audio:"", examples:[], meanings:null, dict:"skip", tat:"ok", wik:"skip", src:{}};
    const core=coreOf(en), words=core.split(/\s+/).filter(Boolean), vars=phraseVariants(en);
    if(!core) return out;
    // всё независимое запрашиваем одновременно: время подбора = самый медленный сервис, а не сумма
    const [d, wd, wi, t, wl] = await Promise.all([
      words.length<=2 ? FREE.dict(core) : Promise.resolve({state:"skip"}),
      wiktDefs(core), wiktIpa(core), tatoebaExamples(en,6), wiktLearn(core).catch(()=>({groups:[], defs:[]}))
    ]);
    out.dict=d.state;
    if(d.state==="ok"){ out.ipa=d.ipa; out.pos=d.pos; out.audio=d.audio; out.meanings=d.meanings; if(d.ipa) out.src.ipa="словарь"; }
    out.wik = wd.state==="net"||wi.state==="net" ? "net" : wd.state;
    if(!out.ipa && wi.ipa){ out.ipa=wi.ipa; out.src.ipa="Викисловарь"; }
    if(!out.pos && wd.pos) out.pos=wd.pos;
    if(!out.meanings?.length && wl.defs?.length){ out.meanings=meaningsFromDefs(wl.defs); if(!out.pos) out.pos=wl.defs[0].pos; }
    if(!out.ipa){ const c=await cmuIpa(core); if(c){ out.ipa=c; out.src.ipa="офлайн-словарь"; } }
    // собираем кандидатов из всех источников и оставляем самые понятные для выбранного уровня
    out.tat=t.state; const cand=t.items.slice();
    const add=(list, hitOnly, src)=>{ for(const e of list){ const x=typeof e==="string"?e:e.en; if(!goodSentence(x)||(hitOnly&&!phraseHit(x,vars))||cand.some(y=>norm(y.en)===norm(x))) continue; cand.push({en:x, ru:"", src}); } };
    add(wd.examples, true, "wik");
    if(cand.length<2) add(wd.examples, false, "wik");
    if(cand.length<2 && d.state==="ok") add(d.examples, false, "dict");
    const pseudo={en};
    out.examples = cand.map(x=>({x, s:exScore(x,pseudo)})).sort((a,b)=>a.s-b.s).map(o=>o.x).slice(0,5);
    out.src.ex = out.examples.length ? [...new Set(out.examples.map(x=>SRC_NAME[x.src]).filter(Boolean))].join(", ") : "";
    return out;
  })();
  infoCache.set(key,p);
  const res=await p;
  if(res.dict==="net"||res.dict==="limit"||res.tat==="net"||res.wik==="net") infoCache.delete(key); // сбой сети не запоминаем, чтобы можно было повторить
  if(res.audio) draftAudio.set(key,res.audio);
  return res;
}
function applyInfo(c, info){
  if(!c.ipa && info.ipa) c.ipa=info.ipa;
  if(!c.pos && info.pos) c.pos=info.pos;
  if(!c.audio && info.audio) c.audio=info.audio;
  if(!c.examples?.length && info.examples.length) c.examples=info.examples.map(x=>({...x}));
  return c;
}
function infoHint(info){
  if(!info) return "";
  const p=[], down=[info.dict==="net"||info.dict==="limit"&&"словарь", info.wik==="net"&&"Викисловарь", info.tat==="net"&&"сервис примеров"].filter(Boolean);
  if(!info.ipa) p.push("Транскрипцию подобрать не удалось.");
  if(!info.examples.length) p.push("Примеры не нашлись.");
  if(down.length && p.length) p.push("Не ответили: "+down.join(", ")+". Попробуйте позже.");
  return p.join(" ");
}

/* ---- проверка источников и использование ---- */
function usageHtml(){
  const m=usage.mm, lim=mmLimit(), pct=Math.min(100,Math.round(m.c/lim*100));
  return `<div class="usage"><div class="ubar${pct>=100?" full":pct>=80?" warn":""}" role="img" aria-label="Переводчик: использовано ${pct}%"><i style="width:${pct}%"></i></div>
  <div class="muted">Переводчик: ${m.c} из ${lim} символов (${m.r} ${plural(m.r,"запрос","запроса","запросов")}) · словарь: ${usage.dict.r} · Викисловарь: ${usage.wik.r} · примеры: ${usage.tat.r}. Счётчик обнуляется каждый день.</div></div>`;
}
async function runDiag(){
  const out=$("#diagOut"), btn=$("#diagBtn"); btn.disabled=true; out.innerHTML=usageHtml()+`<div class="muted" style="margin-top:6px">Проверяю…</div>`;
  const rows=[]; const add=(ok,name,msg)=>rows.push(`<li class="${ok?"ok":"no"}"><b>${ok?"✓":"✕"} ${name}</b> <span class="muted">${esc(msg)}</span></li>`);
  await Promise.all([
    (async()=>{ try{ const j=await FREE.translate("hello","en","ru"); add(true,"Переводчик","отвечает: hello → "+(j.responseData?.translatedText||"?")); }catch(e){ add(false,"Переводчик", e.code==="quota"?"дневной лимит исчерпан":"не отвечает"); } })(),
    (async()=>{ const d=await FREE.dict("hello"); add(d.state==="ok","Словарь", d.state==="ok"?"отвечает, транскрипция "+(d.ipa||"не указана"):({net:"не отвечает",limit:"слишком много запросов",notfound:"слово не найдено"})[d.state]); })(),
    (async()=>{ const [a,b]=await Promise.all([wiktDefs("cope with"), wiktIpa("cope with")]); add(a.state==="ok"||b.state==="ok","Викисловарь", a.state==="net"&&b.state==="net"?"не отвечает":`примеров: ${a.examples.length}, транскрипция: ${b.ipa||"нет"}`); })(),
    (async()=>{ const t=await tatoebaSearch("cope with",true); add(t.state==="ok","Примеры с переводом", t.state==="ok"?`найдено предложений: ${t.items.length}`:"не отвечает"); })(),
    (async()=>{ const d=await loadCmu(); add(!!d,"Офлайн-транскрипции", d?`${Object.keys(d).length} слов, например receipt ${d.receipt}`:"файл не загрузился (старый браузер или нет сети)"); })(),
  ]);
  out.innerHTML=usageHtml()+`<ul class="diag">${rows.join("")}</ul>`; btn.disabled=false;
}
async function askJSON(prompt, tier="default"){
  const sample = await getSample();
  if(!sample) throw {code:"none"};
  return sample.json(prompt, {modelTier:tier});
}
function lookupPrompt(text, lang){
  return `You are a bilingual English–Russian learner's dictionary in the style of the Cambridge English–Russian Dictionary.
Entry (${lang==="ru"?"Russian":"English"}): "${text}"

Reply with ONLY a JSON object of this shape:
{"senses":[{"en":"English word or phrase","ru":"русский перевод","ipa":"/British IPA of the English/","pos":"noun|verb|phrasal verb|adjective|adverb|phrase|idiom|...","meaning":"короткое пояснение значения по-русски, до 8 слов","level":"A1|A2|B1|B2|C1|C2","examples":[{"en":"natural example sentence","ru":"перевод примера"},{"en":"...","ru":"..."}]}]}

Rules:
- 2 to 6 senses, most common first; each sense is a genuinely different meaning or a different English equivalent, not a synonym list.
- ${lang==="ru" ? 'Each "ru" stays close to the entry; "en" is the English equivalent for that meaning.' : 'Each "en" is the entry itself (keep "to" for verbs if the entry has it, or the exact phrasal form); "ru" is the translation for that meaning, up to 3 comma-separated variants.'}
- Exactly 2 examples per sense: everyday British English, under 14 words, each containing the English word or phrase (inflected forms allowed), with natural Russian translations.
- If the entry is misspelt, use the most likely intended word.`;
}
function examplesPrompt(pairs){
  return `You are an English–Russian learner's dictionary. For each numbered pair, give the British IPA transcription of the English and 2 natural everyday British English example sentences (under 14 words, containing the English word or phrase in the meaning of the given Russian translation) with Russian translations.

Pairs:
${pairs.map((p,i)=>`${i}. ${p.en} — ${p.ru}`).join("\n")}

Reply with ONLY a JSON array: [{"i":0,"ipa":"/.../","pos":"noun|verb|...","examples":[{"en":"...","ru":"..."},{"en":"...","ru":"..."}]}]`;
}
function lookupErrorText(e){
  if(e?.code==="quota") return "Дневной лимит бесплатного переводчика исчерпан. Укажите email в настройках, и лимит вырастет в 10 раз, или введите перевод вручную.";
  if(e?.code==="net") return "Нет связи со словарём. Проверьте интернет или введите перевод вручную.";
  if(e?.code==="none") return "Автоподбор сейчас недоступен. Введите перевод вручную ниже.";
  if(e?.code==="not_granted") return "Без разрешения на запросы к Claude подбор недоступен. Введите перевод вручную.";
  if(e?.code==="rate_limited") return "Слишком много запросов подряд. Подождите минуту или введите перевод вручную.";
  return "Не получилось подобрать перевод. Попробуйте ещё раз или введите вручную.";
}

/* ============ add flow ============ */
let addState = null;
const addInput = $("#addInput");
addInput.addEventListener("input", ()=>{
  const v=addInput.value.trim(), b=$("#langBadge");
  b.hidden=!v; b.textContent = isCyr(v) ? "RU → EN" : "EN → RU";
});
$("#addForm").addEventListener("submit", e=>{ e.preventDefault(); lookup(); });
$("#addRu").addEventListener("input",()=>{ $("#addBtn").disabled=!$("#addRu").value.trim(); });
$("#addRu").addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); if($("#addRu").value.trim()) addManual(); } });
$("#addBtn").addEventListener("click",()=>addManual());
/* слово с переводом, введённым вручную: добавляем сразу, транскрипцию и примеры подтягиваем в фоне */
async function addManual(){
  const w=addInput.value.trim(), tr=$("#addRu").value.trim();
  if(!w){ addInput.focus(); return; }
  const lang=isCyr(w)?"ru":"en";
  if(lang==="ru" && isCyr(tr)){ toast("Для русского слова впишите английский перевод"); $("#addRu").focus(); return; }
  addState={ text:w, lang, senses:[], sel:-1, picks:[], manual:tr, loading:false, error:null };
  const en = lang==="ru" ? tr : w;   // для английского слова поле принимает русский перевод или определение по-английски
  await saveDraft();
  $("#addRu").value=""; $("#addBtn").disabled=true;
  const c=allCards().find(x=>dupKey(x.en)===dupKey(en));
  if(c && (!c.ipa || !c.examples.length) && !(await getSample())){
    enrichInfo(c.en).then(async info=>{ applyInfo(c,info); if(c.examples.some(x=>!x.ru)){ try{ await FREE.translateExamples(c.examples); }catch{} } Store.saveCard(c); if(view==="words") renderList(); }).catch(()=>{});
  }
}

/* Lite: варианты перевода из открытых источников. Сначала переводы из Викисловаря (их написали люди), потом машинный перевод MyMemory
   с пометкой. Если перевода нет совсем, предлагаем английские определения: карточку можно сохранить и с ними. */
async function liteSenses(text){
  const core=coreOf(text)||text, out=[], seen=new Set();
  const base=()=>({en:text, ipa:"", pos:"", audio:"", examples:[], free:true, enriched:true});
  const [mm, wk] = await Promise.all([
    FREE.translate(text,"en","ru").then(v=>({v}), e=>({e})),
    wiktLearn(core).catch(()=>({state:"net", groups:[], defs:[]}))
  ]);
  for(const g of wk.groups){
    const terms=g.terms.filter(t=>!seen.has(norm(t))).slice(0,3); if(!terms.length) continue;
    terms.forEach(t=>seen.add(norm(t)));
    out.push({...base(), ru:terms.join(", "), def:g.gloss, src:"wik"});
  }
  let mmErr=mm.e||null;
  const addMt=j=>FREE.variants(j, text).forEach(v=>{ if(!seen.has(norm(v)) && out.length<8){ seen.add(norm(v)); out.push({...base(), ru:v, mt:true, src:"mm"}); } });
  if(mm.v) addMt(mm.v);
  // глагол без «to»: «end up» MyMemory часто переводит буквально, с «to» обычно точнее
  if(!mmErr && wk.defs.some(d=>/verb/.test(d.pos)) && !/^to\s/i.test(text.trim())){
    try{ addMt(await FREE.translate("to "+core,"en","ru")); }catch(e){ mmErr=mmErr||e; }
  }
  if(!out.length && wk.defs.length){
    wk.defs.slice(0,3).forEach(d=>out.push({...base(), ru:"", def:d.def, pos:d.pos, src:"def"}));
  }
  if(!out.length && mmErr) throw mmErr;
  return out;
}
async function lookup(){
  const text = addInput.value.trim(); if(!text) { addInput.focus(); return; }
  const lang = isCyr(text) ? "ru" : "en";
  const dup = allCards().find(c => norm(lang==="ru"?c.ru:c.en)===norm(text));
  addState = { text, lang, senses:null, sel:-1, picks:[], loading:true, error:null, dup };
  renderAdd();
  try{
    let senses;
    if(await getSample()){
      const r = await askJSON(lookupPrompt(text, lang));
      senses = (r?.senses||[]).filter(s=>s && s.en && s.ru).slice(0,6).map(s=>({...s, examples:(s.examples||[]).filter(x=>x&&x.en).slice(0,3)}));
    } else if(lang==="en"){
      // варианты перевода показываем сразу, как только ответил переводчик; транскрипция и примеры подтянутся следом
      const infoP = enrichInfo(text);
      senses = await liteSenses(text);
      const st0=addState;
      infoP.then(info=>{
        if(addState!==st0) return;
        st0.info=info; st0.meanings=info.meanings; st0.infoLoading=false;
        st0.senses?.forEach(sn=>{ sn.ipa=info.ipa; sn.pos=info.pos; sn.audio=info.audio; sn.examples=info.examples.map(x=>({...x})); });
        refreshDraft();
      }).catch(()=>{ if(addState===st0){ st0.infoLoading=false; refreshDraft(); } });
      addState.infoLoading=true;
    } else {
      const tr = await FREE.translate(text,"ru","en");
      senses = FREE.variants(tr, text).map(v=>({en:v, ru:text, examples:[], free:true, enriched:false}));
    }
    if(addState?.text!==text) return;
    if(fromExample && norm(fromExample.w)===norm(text)){
      const cx={en:fromExample.sentence, ru:"", src:"ctx"};
      senses.forEach(sn=>{ sn.examples=[cx, ...(sn.examples||[]).filter(e=>norm(e.en)!==norm(cx.en))].slice(0,3); });
    }
    fromExample=null;
    addState.senses = senses; addState.loading=false;
    if(!senses.length) addState.error = "Надёжного перевода не нашлось. Проверьте написание или впишите свой перевод (или определение по-английски) в поле выше.";
  }catch(e){
    fromExample=null;
    if(addState?.text!==text) return;
    addState.loading=false; addState.error = lookupErrorText(e);
  }
  renderAdd();
}
function renderAdd(){
  const el = $("#addResult"); const st = addState;
  if(!st){ el.innerHTML=""; return; }
  let h = "";
  if(st.dup) h += `<div class="feedback no small">Такая карточка уже есть: <b>${esc(st.dup.en)} — ${esc(glossOf(st.dup))}</b></div>`;
  if(st.loading) h += `<div class="label">Ищу значения…</div><div class="senses"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>`;
  if(st.error) h += `<div class="feedback no small">${esc(st.error)}</div>`;
  if(st.senses?.length){
    h += `<div class="label">${st.lang==="ru"?"Выберите подходящий перевод":"Выберите один или несколько переводов"}</div><div class="senses">`;
    st.senses.forEach((s,i)=>{
      const main = st.lang==="ru" ? s.en : (s.ru || s.def);
      const srcChip = s.src==="wik" ? `<span class="chip" ${tipAttr("Перевод из Викисловаря: его написали люди.")}>Викисловарь</span>` : s.mt ? `<span class="chip warn" ${tipAttr("Машинный перевод: он может быть неточным. Проверьте, прежде чем сохранять.")}>машинный</span>` : s.src==="def" ? `<span class="chip" ${tipAttr("Перевода не нашлось, но карточку можно сохранить с английским определением.")}>только определение</span>` : s.src==="ai" ? `<span class="chip" ${tipAttr("Подобрано вашей нейросетью.")}>ИИ</span>` : "";
      const sub = s.meaning || (s.ru && s.def ? s.def : "");
      h += `<button type="button" class="sense" data-sense="${i}" aria-pressed="${(st.picks||[]).includes(i)}">
        <span class="t">${esc(main)} ${s.pos?`<span class="chip">${esc(s.pos)}</span>`:""} ${s.level?`<span class="chip">${esc(s.level)}</span>`:""} ${srcChip}</span>
        ${sub?`<span class="small muted">${esc(sub)}</span>`:""}
        ${s.examples?.[0] && !s.free?`<span class="ex">${esc(s.examples[0].en)}</span>`:""}
      </button>`;
    });
    h += `</div>`;
    if(st.meanings?.length){
      h += `<details class="imp"><summary class="small">Значения в английском словаре</summary><ul class="ex-list small" style="margin-top:8px">${st.meanings.slice(0,4).map(m=>m.defs.slice(0,2).map(d=>`<li><span class="chip">${esc(m.pos)}</span><div>${esc(d.def)}${d.ex?`<div class="ru"><i>${esc(d.ex)}</i></div>`:""}<button type="button" class="btn ghost" data-pickdef="${esc(d.def)}" aria-pressed="${st.defPick===d.def}" style="min-height:28px;padding:2px 8px">${st.defPick===d.def?"Определение выбрано":"Взять как определение"}</button></div></li>`).join("")).join("")}</ul></details>`;
    }
  }
  const c = currentDraft();
  const sameEn = c ? findDupEn(c.en) : null;
  if(c){
    const newRu = sameEn ? newRuFor(sameEn, c) : [];
    if(sameEn) h += `<div class="feedback no small">Слово «${esc(sameEn.en)}» уже есть в колоде (${esc(glossOf(sameEn))}). ${newRu.length?`Новая карточка не создастся: к существующей добавится перевод «${esc(newRu.join(", "))}» и теги, а прогресс сохранится.`:"Такой перевод уже есть. К существующей карточке добавятся только теги, а прогресс сохранится."}</div>`;
    h += `<div class="preview stack" style="gap:10px">
      <div class="row" style="justify-content:space-between;gap:8px"><div><div style="font-size:20px;font-weight:700">${esc(c.en)}</div>
      <div class="row" style="gap:8px">${c.ipa?`<span class="ipa">${esc(c.ipa)}</span>`:""}<span class="muted">${esc(glossOf(c))}</span></div>${c.def&&c.ru?`<div class="small muted">${esc(c.def)}</div>`:""}</div>${sayBtn(c.en,"en",false)}</div>
      ${c.examples.length?`<ul class="ex-list">${c.examples.map(x=>`<li>${sayBtn(x.en)}<div><div class="en">${esc(x.en)}</div><div class="ru">${esc(x.ru||"")}</div></div></li>`).join("")}</ul>`
        : `<div class="row small muted">Примеров пока нет. <button type="button" class="btn ghost" id="fetchEx" style="min-height:32px;padding:4px 8px">Подобрать примеры</button></div>`}
      ${st.infoLoading ? `<div class="small muted">Подбираю транскрипцию и примеры…</div>` : (!c.ipa || !c.examples.length) && st.info ? `<div class="small muted">${esc(infoHint(st.info))}</div>` : ""}
      <button type="button" class="btn primary wide" id="saveCard">${sameEn?(newRu.length?"Добавить перевод к существующей":"Добавить теги к существующей"):"Сохранить карточку"}</button>
    </div>`;
  }
  el.innerHTML = h;
  el.querySelectorAll("[data-sense]").forEach(b=>b.onclick=async ()=>{
    const i=+b.dataset.sense; st.manual=""; st.manualEx=null; const v=st.senses[i];
    if(st.lang==="ru") st.picks=[i];                      // русское слово: один английский вариант
    else st.picks = st.picks.includes(i) ? st.picks.filter(x=>x!==i) : [...st.picks, i];   // английское: можно несколько переводов
    st.sel = st.picks[0] ?? -1;
    if(st.picks.includes(i) && v.free && !v.enriched){ // RU→EN: подтягиваем транскрипцию, аудио и примеры для выбранного английского слова
      v.enriched=true; renderAdd();
      const info=await enrichInfo(v.en);
      v.ipa=info.ipa; v.pos=info.pos; v.audio=info.audio; v.examples=info.examples.map(x=>({...x})); st.info=info; st.meanings=info.meanings;
    }
    renderAdd(); if(st.picks.includes(i)) autoSpeak(v.en,"en");
  });
  el.querySelectorAll("[data-pickdef]").forEach(b=>b.onclick=()=>{ st.defPick = st.defPick===b.dataset.pickdef ? "" : b.dataset.pickdef; renderAdd(); });
  const fe=$("#fetchEx"); if(fe) fe.onclick=fetchManualExamples;
  const sv=$("#saveCard"); if(sv) sv.onclick=saveDraft;
}
let draftTimer=null;
function refreshDraft(){ clearTimeout(draftTimer); draftTimer=setTimeout(()=>{ const f=document.activeElement?.id; const pos=$("#manualTr")?.selectionStart; renderAdd(); if(f==="manualTr"){ const m=$("#manualTr"); m.focus(); try{ m.setSelectionRange(pos,pos); }catch{} } }, 250); }
const ruVariants = t => String(t||"").split(/[,;]/).map(x=>x.trim()).filter(Boolean);
function joinRu(list){ const out=[]; list.forEach(t=>ruVariants(t).forEach(v=>{ if(!out.some(x=>norm(x)===norm(v))) out.push(v); })); return out.join(", ").slice(0,300); }
const newRuFor = (card, d) => ruVariants(d.ru).filter(v=>!ruVariants(card.ru).some(x=>norm(x)===norm(v)));
function currentDraft(){
  const st=addState; if(!st) return null;
  if(st.manual?.trim()){
    const m = st.manual.trim(), defOnly = st.lang==="en" && !isCyr(m);
    const en = st.lang==="ru" ? m : st.text, ru = defOnly ? "" : (st.lang==="ru" ? st.text : m);
    return { en, ru, def: defOnly ? m : (st.defPick||""), ipa:st.manualEx?.ipa||"", pos:st.manualEx?.pos||"", audio:st.manualEx?.audio||"", examples:st.manualEx?.examples||[] };
  }
  const ps=(st.picks||[]).map(i=>st.senses?.[i]).filter(Boolean);
  if(ps.length){
    const s=ps[0];
    let ru = st.lang==="ru" ? st.text : joinRu(ps.map(x=>x.ru));
    const exs=[]; ps.forEach(x=>(x.examples||[]).forEach(e=>{ if(exs.length<3 && !exs.some(y=>norm(y.en)===norm(e.en))) exs.push(e); }));
    return { en: s.en, ru, def: st.defPick || s.def || "", ipa:s.ipa||"", pos:s.pos||"", note:s.meaning||"", audio:s.audio||"", examples:exs };
  }
  return null;
}
async function fetchManualExamples(){
  const c=currentDraft(); if(!c) return;
  const b=$("#fetchEx"); b.disabled=true; b.textContent="Подбираю…";
  try{
    if(await getSample()){ const r=await askJSON(examplesPrompt([c]),"quick"); const x=Array.isArray(r)?r[0]:null; addState.manualEx = {ipa:x?.ipa||"", pos:x?.pos||"", examples:(x?.examples||[]).filter(e=>e?.en).slice(0,3)}; }
    else {
      const info=await enrichInfo(c.en);
      addState.info=info;
      if(!info.examples.length) toast(infoHint(info)||"Примеры не нашлись, их можно вписать в карточке вручную");
      addState.manualEx = {ipa:info.ipa, pos:info.pos, audio:info.audio, examples:info.examples.map(x=>({...x}))};
    }
  }
  catch(e){ toast(lookupErrorText(e)); }
  renderAdd();
}
async function saveDraft(){
  const d=currentDraft(); if(!d) return;
  if(d.examples.some(x=>!x.ru) && !(await getSample())){
    const b=$("#saveCard"); if(b){ b.disabled=true; b.textContent="Перевожу примеры…"; }
    d.examples = await FREE.translateExamples(d.examples.map(x=>({...x})));
  }
  const tags=parseTags($("#addTags").value);
  const same=findDupEn(d.en);
  if(same){
    const before=same.tags.length, add=newRuFor(same,d); let changed=false;
    same.tags=cleanTags([...same.tags,...tags]); if(same.tags.length!==before) changed=true;
    if(add.length){ const nr=joinRu([same.ru,...add]); if(nr!==same.ru){ same.ru=nr; changed=true; } }
    if(!same.def&&d.def){ same.def=d.def; changed=true; }
    if(!same.ipa&&d.ipa){ same.ipa=d.ipa; changed=true; } if(!same.pos&&d.pos){ same.pos=d.pos; changed=true; } if(!same.audio&&d.audio){ same.audio=d.audio; changed=true; }
    for(const e of d.examples){ if(same.examples.length<5 && e.en && !same.examples.some(y=>norm(y.en)===norm(e.en))){ same.examples.push({...e}); changed=true; } }
    if(changed) Store.saveCard(same);
    addState=null; addInput.value=""; $("#langBadge").hidden=true; renderAdd(); renderList();
    toast(add.length ? "К карточке «"+same.en+"» добавлен перевод" : changed ? "Слово уже было в колоде: добавили теги" : "Это слово уже есть в колоде"); addInput.focus(); return;
  }
  const c=newCard({...d, tags}); Store.saveCard(c);
  addState=null; addInput.value=""; $("#langBadge").hidden=true; renderAdd(); renderList();
  const waiting=allCards().filter(x=>!x.box).length;
  toast(`«${c.en}» добавлено. Новых слов ждёт обучения: ${waiting}`, {label:"Учить сейчас", fn:()=>{ go("learn"); startLearn(); }}); addInput.focus();
}

/* bulk import */
const SEP_RE = /\s+[—–−-]\s+|\s*[—–−=→:;\t]\s*/;
function parseImport(text, dry=false){
  const items=[], skipped=[], seen=new Set();
  const haveEn=new Set(allCards().map(c=>dupKey(c.en))), haveRu=new Set(allCards().map(c=>norm(c.ru)));
  const tags=parseTags($("#addTags").value), byEn=new Map(allCards().map(c=>[dupKey(c.en),c]));
  for(const raw of String(text).split(/\r?\n/)){
    const line=raw.replace(/^\s*(?:[-–—•*·]|\d+[.)])\s+/,"").trim(); if(!line) continue;
    let a=line, b="";
    const m=SEP_RE.exec(line);
    if(m){ a=line.slice(0,m.index).trim(); b=line.slice(m.index+m[0].length).trim(); }
    else if(/[a-z]/i.test(line) && /[а-яё]/i.test(line)){ // «cat кошка» или «cat-кошка»: делим там, где меняется алфавит
      const first=line.match(/[a-zа-яё]/i)[0];
      const i=line.search(isCyr(first)?/[a-z]/i:/[а-яё]/i);
      a=line.slice(0,i).replace(/[\s\-–—:=]+$/,"").trim(); b=line.slice(i).trim();
    }
    if(!a){ skipped.push([line,"нет слова"]); continue; }
    let en="", ru="", def="", need=null;
    if(b){
      if(isCyr(a)===isCyr(b)){
        if(!isCyr(a) && b.split(/\s+/).length>=2){ en=a; def=b; }   // «слово — определение по-английски»
        else { skipped.push([line,"не понял, где слово и где перевод"]); continue; }
      } else { if(isCyr(a)) [a,b]=[b,a]; en=a; ru=b; }
    } else if(isCyr(a)){ ru=a; need="en"; }
    else { en=a; need="ru"; }
    en=en.slice(0,200); ru=ru.slice(0,300); def=def.slice(0,300);
    const key = en ? "e:"+dupKey(en) : "r:"+norm(ru);
    if(seen.has(key) || (en ? haveEn.has(dupKey(en)) : haveRu.has(norm(ru)))){
      const ex = en ? byEn.get(dupKey(en)) : allCards().find(c=>norm(c.ru)===norm(ru));
      if(!dry && ex && tags.length && !seen.has(key)){ const n0=ex.tags.length; ex.tags=cleanTags([...ex.tags,...tags]); if(ex.tags.length!==n0) Store.saveCard(ex); skipped.push([line,"уже есть, тег добавлен"]); seen.add(key); continue; }
      skipped.push([line,"уже есть"]); continue; }
    seen.add(key); items.push({en, ru, def, need});
  }
  return {items, skipped};
}
async function pool(list, n, fn, stop){
  let i=0;
  await Promise.all(Array.from({length:Math.min(n,list.length)}, async()=>{ while(i<list.length && !stop()){ const it=list[i++]; try{ await fn(it); }catch{} } }));
}
let impBusy=false, impStop=false;
$("#impText").addEventListener("input", impEstimate); $("#impEx").addEventListener("change", impEstimate);
$("#impBtn").onclick = async ()=>{
  if(impBusy){ impStop=true; $("#impBtn").textContent="Останавливаю…"; return; }
  const {items, skipped}=parseImport($("#impText").value);
  const res=$("#impResult"), btn=$("#impBtn");
  if(!items.length){
    res.innerHTML = `<div class="feedback no small">${skipped.length?"Все строки пропущены (см. ниже).":"Список пуст."}${reportSkipped(skipped)}</div>`; return;
  }
  if(items.length>500){ res.innerHTML=`<div class="feedback no small">За один раз не больше 500 слов. Сейчас в списке ${items.length}.</div>`; return; }
  impBusy=true; impStop=false; res.innerHTML="";
  const sample=await getSample();
  const failed=[];
  try{
    // 1. слова без перевода: подбираем перевод
    const todo=items.filter(x=>x.need);
    if(todo.length){
      let done=0; btn.textContent=`Перевожу 0/${todo.length}…`;
      if(sample){
        for(let i=0;i<todo.length;i+=25){
          const chunk=todo.slice(i,i+25);
          try{
            const r=await askJSON(`Translate each numbered item: English to Russian, Russian to English. Reply with ONLY a JSON array of strings in the same order, giving the single most common translation (keep "to" for English verbs).\n\n${chunk.map((x,k)=>`${k}. ${x.need==="ru"?x.en:x.ru}`).join("\n")}`,"quick");
            chunk.forEach((x,k)=>{ const t=String(r?.[k]||"").trim(); if(t){ if(x.need==="ru") x.ru=t.slice(0,300); else x.en=t.slice(0,200); } });
          }catch{}
        }
      } else {
        await pool(todo, 2, async x=>{
          const j=await FREE.translate(x.need==="ru"?x.en:x.ru, x.need==="ru"?"en":"ru", x.need==="ru"?"ru":"en");
          const t=FREE.variants(j, x.need==="ru"?x.en:x.ru)[0];
          if(t){ if(x.need==="ru") x.ru=t; else x.en=t; }
          btn.textContent=`Перевожу ${++done}/${todo.length}…`;
        }, ()=>false);
      }
    }
    const ready=[];
    const takenEn=new Set(allCards().map(c=>dupKey(c.en))), impTags0=parseTags($("#addTags").value);
    items.forEach(x=>{
      if(!(x.en && (x.ru||x.def))){ failed.push([x.en||x.ru,"не удалось подобрать перевод"]); return; }
      const k=dupKey(x.en);
      if(takenEn.has(k)){ const ex=findDupEn(x.en); if(ex && impTags0.length){ const n0=ex.tags.length; ex.tags=cleanTags([...ex.tags,...impTags0]); if(ex.tags.length!==n0) Store.saveCard(ex); failed.push([x.en,"уже есть, тег добавлен"]); } else failed.push([x.en,"уже есть"]); return; }
      takenEn.add(k); ready.push(x);
    });
    // 2. сразу сохраняем карточки, чтобы ничего не потерялось
    const impTags=parseTags($("#addTags").value), made=ready.map(x=>newCard({en:x.en, ru:x.ru, def:x.def, tags:impTags}));
    Store.saveMany(made);
    renderList();
    // 3. дополняем транскрипцией, звуком и примерами тем же способом, что и при одиночном добавлении
    lastImport={ids:made.map(c=>c.id), skipped:[...skipped,...failed]};
    let stopped=false;
    if($("#impEx").checked && made.length){ await enrichCards(made, sample, btn); stopped=impStop; }
    // 4. отчёт
    const allSkipped=lastImport.skipped;
    const keep=allSkipped.filter(([,why])=>!/^уже есть/.test(why)).map(([l])=>l);
    $("#impText").value=keep.join("\n");
    renderImportReport(made.length, stopped);
    toast(`Добавлено ${made.length} ${plural(made.length,"слово","слова","слов")}`);
  } finally {
    impBusy=false; impStop=false; btn.disabled=false; btn.textContent="Импортировать"; renderList();
  }
};
let lastImport={ids:[],skipped:[]};
async function enrichCards(cards, sample, btn){
  let n=0; const total=cards.length, gain={ipa:0, ex:0, audio:0};
  const setBtn=()=>{ btn.textContent=`Остановить · ${Math.min(n,total)}/${total}`; }; setBtn();
  const snap=c=>({i:!!c.ipa, e:c.examples?.length>0, a:!!c.audio});
  const tally=(c,b)=>{ if(!b.i&&c.ipa) gain.ipa++; if(!b.e&&c.examples?.length) gain.ex++; if(!b.a&&c.audio) gain.audio++; };
  if(sample){
    for(let i=0;i<cards.length && !impStop;i+=25){
      const chunk=cards.slice(i,i+25), before=chunk.map(snap);
      try{
        const r=await askJSON(examplesPrompt(chunk),"quick");
        (Array.isArray(r)?r:[]).forEach(x=>{ const c=chunk[x?.i]; if(!c) return; c.ipa=str(x.ipa,100); c.pos=str(x.pos,40); c.examples=(Array.isArray(x.examples)?x.examples:[]).filter(e=>e?.en).slice(0,3).map(e=>({en:str(e.en,300),ru:str(e.ru,300)})); Store.saveLazy(c); });
      }catch{}
      chunk.forEach((c,k)=>tally(c,before[k]));
      n+=chunk.length; setBtn();
    }
  } else {
    await pool(cards, 3, async c=>{
      const b=snap(c);
      const info=await enrichInfo(c.en);
      applyInfo(c, info);
      if(c.examples.some(x=>!x.ru)) await FREE.translateExamples(c.examples);
      Store.saveLazy(c); tally(c,b); n++; setBtn();
    }, ()=>impStop);
  }
  Store.flushLazy();
  return gain;
}
function renderImportReport(addedNow, stopped, retry=false, gain=null){
  const cs=lastImport.ids.map(id=>Store.cards.get(id)).filter(Boolean), N=cs.length;
  const ipa=cs.filter(c=>c.ipa).length, ex=cs.filter(c=>c.examples?.length).length, au=cs.filter(c=>c.audio).length;
  let msg, cls;
  if(retry){
    const g=gain||{ipa:0,ex:0};
    const found=g.ipa+g.ex>0;
    msg=found ? `Нашлось: транскрипций ${g.ipa}, примеров ${g.ex}.` : "На этот раз ничего нового не нашлось.";
    msg+=` Теперь транскрипция есть у ${ipa} из ${N}, примеры у ${ex} из ${N}.`;
    if(stopped) msg+=" Подбор остановлен.";
    cls=found?"ok":"neutral";
  } else {
    msg=`Добавлено ${addedNow} ${plural(addedNow,"слово","слова","слов")}.`;
    if($("#impEx").checked && N){ msg+=` Транскрипция: ${ipa} из ${N}, примеры: ${ex} из ${N}, запись произношения: ${au} из ${N}. Остальные слова озвучит голос браузера.`; if(stopped) msg+=" Подбор остановлен."; }
    cls=addedNow?"ok":"no";
  }
  const missing=cs.filter(c=>!c.ipa || !c.examples?.length).length;
  $("#impResult").innerHTML=`<div class="feedback ${cls} small result"><button class="x" type="button" id="impClose" aria-label="Закрыть">×</button>${esc(msg)}${missing && N?`<div class="row" style="margin-top:8px"><button class="btn" id="impRetry" type="button" data-tip="Повторит поиск только для слов без транскрипции или примеров. Уже найденное и ваши правки не изменятся.">Найти недостающее (${missing})</button></div><div class="muted" style="margin-top:6px">Для ${missing} ${plural(missing,"слова","слов","слов")} не нашлись транскрипция или примеры, например, когда такого слова нет в словарях или сервис не ответил. Кнопка попробует найти их ещё раз.</div>`:""}${reportSkipped(lastImport.skipped)}</div>`;
  const rb=$("#impRetry"); if(rb) rb.onclick=retryImport;
  if(!retry && addedNow){ const row=document.createElement("div"); row.className="row"; row.style.marginTop="8px"; row.innerHTML=`<button class="btn primary" id="impLearn" type="button">Учить сейчас</button>`; $("#impResult .result").append(row); $("#impLearn").onclick=()=>{ go("learn"); startLearn(); }; }
  $("#impClose").onclick=()=>{ $("#impResult").innerHTML=""; };
}
async function retryImport(){
  if(impBusy) return;
  const cs=lastImport.ids.map(id=>Store.cards.get(id)).filter(c=>c && (!c.ipa || !c.examples?.length));
  if(!cs.length) return;
  impBusy=true; impStop=false; const btn=$("#impBtn"); btn.textContent="Остановить";
  let gain=null;
  try{ gain=await enrichCards(cs, await getSample(), btn); }
  finally{ const st=impStop; impBusy=false; impStop=false; btn.textContent="Импортировать"; renderList(); renderImportReport(0, st, true, gain); }
}
function reportSkipped(sk){
  if(!sk.length) return "";
  return `<details style="margin-top:8px" open><summary class="small" style="cursor:pointer;font-weight:700">Пропущено: ${sk.length}</summary><ul style="margin:6px 0 0;padding-left:18px">${sk.map(([l,why])=>`<li>${esc(l)} <span class="muted">— ${esc(why)}</span></li>`).join("")}</ul></details>`;
}


/* ---- дополнить данные у всей колоды ---- */
let fillRes=null, fillBusy=false;
const needsWork = c => !glossOf(c) || !c.ipa || c.examples.length<MIN_EX || (mmLeft()>0 && c.examples.some(x=>!x.ru));
function renderFillBox(){ const el=$("#fillBox"); if(el) el.innerHTML=""; }
async function fillDeck(src){
  if(impBusy||fillBusy) return;
  const list=(src||allCards()).filter(needsWork); if(!list.length){ toast("У выбранных слов уже есть всё, что можно найти"); return; }
  fillBusy=true; impBusy=true; impStop=false; fillRes=null;
  const btn={textContent:""}; toast(`Ищу недостающее у ${list.length} ${plural(list.length,"слова","слов","слов")}…`);
  const before=usage.mm.c;
  let gain={ipa:0,ex:0};
  try{ gain=await enrichCards(list, await getSample(), btn); }
  finally{
    const st=impStop; fillBusy=false; impBusy=false; impStop=false;
    const left=allCards().filter(c=>!glossOf(c)||!c.ipa||c.examples.length<MIN_EX).length, noTr=allCards().filter(c=>c.examples.some(x=>!x.ru)).length;
    const found=gain.ipa+gain.ex>0;
    let msg=found?`Нашлось: транскрипций ${gain.ipa}, примеров ${gain.ex}.`:"На этот раз ничего нового не нашлось.";
    if(st) msg+=" Подбор остановлен.";
    if(left) msg+=` Не хватает перевода, транскрипции или трёх примеров у ${left}: возможно, этих слов нет в открытых словарях.`;
    if(noTr && mmLeft()<=0) msg+=` Дневной лимит переводчика исчерпан: у ${noTr} ${plural(noTr,"слова","слов","слов")} примеры пока без перевода, их можно добрать завтра.`;
    fillRes=null; toast(msg);
    renderList(); renderLearn();
  }
}
/* оценка расхода лимита перед импортом */
function impEstimate(){
  const el=$("#impEst"); if(!el) return;
  const t=$("#impText").value.trim(); if(!t){ el.textContent=""; return; }
  const {items}=parseImport(t,true); if(!items.length){ el.textContent=""; return; }
  const need=items.filter(x=>x.need).reduce((s,x)=>s+(x.en||x.ru).length+1,0);
  const exChars=$("#impEx").checked && SOURCE==="free" ? items.length*70 : 0;
  const est=need+exChars, left=mmLeft();
  el.className="small "+(est>left?"warnline":"muted");
  el.textContent=`Слов к добавлению: ${items.length}. Примерный расход лимита переводчика: ${est} символов, доступно сегодня около ${left}.`+(est>left?" Лимита может не хватить: часть переводов примеров подберётся позже кнопкой «Найти недостающее».":"");
}
/* ============ words list ============ */
let filter="all";
$("#filters").onclick = e=>{ const b=e.target.closest("button"); if(!b) return; filter=b.dataset.f; $("#filters").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed", x===b)); renderList(); };
$("#search").oninput = renderList;
let tagFilter="", sortMode="new", shown=50, selMode=false;
const selected=new Set(), PAGE=50;
const tipAttr = t => `data-tip="${esc(t)}"`;
const CHEV='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
const openEx=new Set();
const SORTS={
  new:["Сначала новые",(a,b)=>b.created-a.created],
  old:["Сначала старые",(a,b)=>a.created-b.created],
  az:["По алфавиту (английский)",(a,b)=>a.en.localeCompare(b.en,"en",{sensitivity:"base"})],
  level:["По уровню: от низкого",(a,b)=>a.box-b.box||b.created-a.created],
  due:["По сроку повтора",(a,b)=>(a.box?a.due:Infinity)-(b.box?b.due:Infinity)||a.box-b.box]
};
$("#sortSel").innerHTML=Object.entries(SORTS).map(([k,v])=>`<option value="${k}">${v[0]}</option>`).join("");
$("#sortSel").onchange=e=>{ sortMode=e.target.value; shown=PAGE; renderList(); };
$("#filters").onclick = e=>{ const b=e.target.closest("button"); if(!b) return; filter=b.dataset.f; shown=PAGE; $("#filters").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed", x===b)); renderList(); };
$("#search").oninput = ()=>{ shown=PAGE; renderList(); };

/* поле тегов с подсказками из уже существующих */
function syncTagBox(box){
  if(!box) return; const inp=box.querySelector("input"), cur=parseTags(inp.value), wrap=box.querySelector(".tagchips");
  const all=tagCounts().map(([t])=>t).slice(0,16);
  wrap.innerHTML=all.map(t=>`<button type="button" class="tagchip${cur.includes(t)?" on":""}" data-addtag="${esc(t)}" aria-pressed="${cur.includes(t)}">${esc(t)}</button>`).join("");
}
document.addEventListener("click",e=>{ const b=e.target.closest("[data-addtag]"); if(!b) return; const box=b.closest(".tagbox"), inp=box.querySelector("input"), t=b.dataset.addtag; let cur=parseTags(inp.value); cur=cur.includes(t)?cur.filter(x=>x!==t):[...cur,t]; inp.value=cur.join(", "); syncTagBox(box); });
document.addEventListener("input",e=>{ if(e.target.closest?.(".tagbox")) syncTagBox(e.target.closest(".tagbox")); });
function tagCounts(){ const m=new Map(); allCards().forEach(c=>(c.tags||[]).forEach(t=>m.set(t,(m.get(t)||0)+1))); return [...m].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])); }

function filteredCards(){
  const q=norm($("#search").value);
  let list=allCards();
  if(tagFilter) list=list.filter(c=>c.tags.includes(tagFilter));
  if(filter==="due") list=list.filter(isDue);
  else if(filter==="studied") list=list.filter(c=>c.box>0);
  else if(filter==="tomorrow"){ const t0=startOfDay()+DAY; list=list.filter(c=>c.box>0&&c.due>=t0&&c.due<t0+DAY); }
  else if(filter==="incomplete") list=list.filter(c=>quality(c).length>0);
  else if(filter!=="all") list=list.filter(c=>status(c)===filter);
  if(q) list=list.filter(c=>norm(c.en).includes(q)||norm(c.ru).includes(q)||norm(c.def||"").includes(q)||c.tags.some(t=>t.includes(q)));
  return list.sort(SORTS[sortMode][1]);
}
const FILTER_EMPTY={
  incomplete:"Все карточки заполнены полностью. Отличная колода!",
  due:"Сейчас нет слов, которые ждут повторения. Загляните позже или потренируйтесь вне графика.",
  hard:"Сложных слов пока нет. Так держать!",
  new:"Новых слов нет: все слова уже прошли обучение.",
  studied:"Пока нет изученных слов. Начните обучение на вкладке «Учить».",
  known:"Пока нет изученных слов. Слово становится изученным, когда доходит до 4-го уровня.",
  learning:"Слов «в процессе» нет: либо всё ещё новое, либо уже изучено.",
  tomorrow:"На завтра повторений не запланировано."
};
function resetFilters(){ filter="all"; tagFilter=""; $("#search").value=""; shown=PAGE; $("#filters").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed", x.dataset.f==="all")); renderList(); }
function emptyListHtml(){
  const q=$("#search").value.trim();
  let msg, btns=`<button class="btn" type="button" data-reset>Сбросить фильтры</button>`;
  if(q) msg=`По запросу «${esc(q)}» ничего не нашлось.${tagFilter||filter!=="all"?" Возможно, мешает выбранный фильтр.":""}`;
  else if(tagFilter && filter!=="all") msg=`В подборке «${esc(tagFilter)}» нет слов с таким статусом.`;
  else if(tagFilter) msg=`С тегом «${esc(tagFilter)}» пока нет слов.`;
  else { msg=FILTER_EMPTY[filter]||"Ничего не найдено."; if(filter==="studied"||filter==="due") btns+=`<button class="btn primary" type="button" data-go="learn">К обучению</button>`; }
  return `<div class="panel empty stack" style="align-items:center;text-align:center;gap:12px"><div class="muted">${msg}</div><div class="row" style="justify-content:center">${btns}</div></div>`;
}

function renderList(){
  renderFillBox();
  syncTagBox($("#addTagBox"));
  const tags=tagCounts(); if(tagFilter && !tags.some(([t])=>t===tagFilter)) tagFilter="";
  const tf=$("#tagFilters");
  tf.hidden=!tags.length;
  tf.innerHTML=tags.length?`<span class="label">Теги<button class="tip" type="button" aria-label="Пояснение" data-tip="Нажмите на тег, чтобы увидеть только слова из этой подборки. Нажмите ещё раз, чтобы снять фильтр. Учить подборку можно кнопкой ниже или на вкладке «Учить».">?</button></span>`+tags.map(([t,n])=>`<button type="button" class="tagchip${t===tagFilter?" on":""}" data-tagf="${esc(t)}" aria-pressed="${t===tagFilter}" ${tipAttr(t===tagFilter?"Снять фильтр по тегу":"Показать только слова с тегом «"+t+"»")}>${esc(t)} <small>${n}</small></button>`).join(""):"";
  tf.querySelectorAll("[data-tagf]").forEach(b=>b.onclick=()=>{ tagFilter = tagFilter===b.dataset.tagf ? "" : b.dataset.tagf; shown=PAGE; renderList(); });
  $("#sortSel").value=sortMode;
  const el=$("#wlist");
  if(!Store.cards.size){ el.innerHTML=`<div class="panel empty stack" style="align-items:center;text-align:center;gap:12px"><div class="muted">Колода пуста. Добавьте первое слово выше, или загрузите готовый список.</div><div class="row" style="justify-content:center"><button class="btn primary" type="button" id="emptyAdd">Добавить слово</button></div></div>`; $("#emptyAdd").onclick=()=>$("#addInput").focus(); renderSelBar(); return; }
  const list=filteredCards();
  if(!list.length){ el.innerHTML=emptyListHtml(); el.querySelector("[data-reset]")?.addEventListener("click",resetFilters); bindGo(el); renderSelBar(); return; }
  const studyBar = tagFilter ? `<button class="btn" type="button" id="studyTag" ${tipAttr("Перейти на вкладку «Учить» с выбранной подборкой: будут учиться и повторяться только слова с этим тегом")}>Учить подборку «${esc(tagFilter)}»</button>` : "";
  const page=list.slice(0,shown), rest=list.length-page.length;
  el.innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:6px"><span class="small muted">${list.length===Store.cards.size?`${list.length} ${plural(list.length,"карточка","карточки","карточек")}`:`${list.length} из ${Store.cards.size}`}</span>${studyBar}</div><div class="wlist${selMode?" selmode":""}">` + page.map(c=>{
    const has=c.examples.length, open=has && openEx.has(c.id), sel=selected.has(c.id);
    return `<div class="witem">
    <div class="wrow${sel?" selected":""}" role="${selMode?"checkbox":"button"}" ${selMode?`aria-checked="${sel}"`:""} tabindex="0" data-edit="${c.id}">
      ${selMode?`<span class="chk" aria-hidden="true"></span>`:""}${sayBtn(c.en)}
      <div class="w"><b>${esc(c.en)}${c.demo?' <span class="chip">демо</span>':""}</b><span>${esc(glossOf(c))}</span>${c.ru&&c.def?`<span class="small muted">${esc(c.def)}</span>`:""}${c.tags.length?`<div class="wtags">${c.tags.map(t=>`<button type="button" class="tagchip sm" data-tagf2="${esc(t)}" ${tipAttr("Показать только слова с тегом «"+t+"»")}>${esc(t)}</button>`).join("")}</div>`:""}</div>
      <span class="exslot">${has?`<button type="button" class="exbtn${open?" open":""}" data-ex="${c.id}" aria-expanded="${open}" aria-label="Примеры использования" ${tipAttr(open?"Скрыть примеры":"Показать примеры использования ("+has+")")}>${CHEV}</button>`:""}</span>
      <span class="nextdue${isDue(c)?" due":""}">${dueLabel(c)}</span>
      ${boxesHtml(c)}
    </div>
    ${open?`<ul class="ex-list wex">${rankedExamples(c).map(x=>`<li>${sayBtn(x.en)}<div><div class="en">${wordsHtml(x.en,true)}</div><div class="ru">${esc(x.ru||"")}</div>${srcTag(x)}</div></li>`).join("")}</ul><div class="small muted xwhint">Нажмите на незнакомое слово в примере, чтобы добавить его в колоду.</div>`:""}
    </div>`; }).join("") + `</div>` + (rest>0?`<div class="row" style="justify-content:center;margin-top:12px"><button class="btn" type="button" id="moreBtn">Показать ещё ${Math.min(PAGE,rest)} <span class="muted">(осталось ${rest})</span></button></div>`:"");
  el.querySelectorAll("[data-edit]").forEach(r=>{
    const act=ev=>{ if(ev.target.closest("button:not(.chk)")) return; if(selMode){ const id=r.dataset.edit; selected.has(id)?selected.delete(id):selected.add(id); r.classList.toggle("selected",selected.has(id)); r.setAttribute("aria-checked",selected.has(id)); renderSelBar(); } else openEdit(r.dataset.edit); };
    r.onclick=act; r.onkeydown=e=>{ if((e.key==="Enter"||e.key===" ") && e.target===r){ e.preventDefault(); act(e); } };
  });
  bindXw(el);
  el.querySelectorAll("[data-ex]").forEach(b=>b.onclick=ev=>{ ev.stopPropagation(); const id=b.dataset.ex; openEx.has(id)?openEx.delete(id):openEx.add(id); hideTip(); const y=scrollY; renderList(); scrollTo(0,y); });
  el.querySelectorAll("[data-tagf2]").forEach(b=>b.onclick=ev=>{ ev.stopPropagation(); hideTip(); tagFilter=b.dataset.tagf2; shown=PAGE; renderList(); });
  $("#moreBtn")?.addEventListener("click",()=>{ shown+=PAGE; const y=scrollY; renderList(); scrollTo(0,y); });
  const sb=$("#studyTag"); if(sb) sb.onclick=()=>{ S().deck=tagFilter; Store.saveSettings(); go("learn"); };
  renderSelBar();
}

/* ---- выбор нескольких слов ---- */
const wMenu=$("#wMenu"), wMenuBtn=$("#wMenuBtn");
function closeWMenu(){ wMenu.hidden=true; wMenuBtn.setAttribute("aria-expanded","false"); }
function openWMenu(){
  const n=visSel().length, all=filteredCards().length, dupN=n?`среди выбранных (${n})`:"во всей колоде";
  const it=(k,l,d="",dis=false)=>`<button type="button" role="menuitem" data-wm="${k}" ${dis?"disabled":""}><b>${l}</b>${d?`<small>${d}</small>`:""}</button>`;
  wMenu.innerHTML=`<div class="wm-h">Выбор слов</div>
    ${it("sel",selMode?"Закончить выбор":"Выбрать слова","отметьте нужные слова в списке")}
    ${it("all",`Выбрать все (${all})`,"все слова по текущему фильтру и поиску",!all)}
    ${selMode&&n?it("none","Снять выбор",`выбрано: ${n}`):""}
    <div class="wm-h">${n?`С выбранными (${n})`:"Со словами"}</div>
    ${it("tag","Добавить тег","",!n)}${it("untag","Убрать тег","",!n)}
    ${it("fill","Найти недостающие данные","транскрипция, примеры, их перевод",!n)}
    ${it("dup","Найти дубли",dupN)}
    ${it("del","Удалить","",!n)}
    <div class="wm-h">Теги</div>${it("tags","Управление тегами","переименовать, объединить, удалить")}`;
  wMenu.hidden=false; wMenuBtn.setAttribute("aria-expanded","true");
  const r=wMenuBtn.getBoundingClientRect(); if(r.top>180 || r.bottom>innerHeight-420) window.scrollBy({top:r.top-110,behavior:"smooth"});
}
wMenuBtn.onclick=e=>{ e.stopPropagation(); hideTip(); wMenu.hidden ? openWMenu() : closeWMenu(); };
document.addEventListener("click",e=>{ if(!wMenu.hidden && !e.target.closest("#wMenu")) closeWMenu(); });
document.addEventListener("keydown",e=>{ if(e.key==="Escape" && !wMenu.hidden){ closeWMenu(); wMenuBtn.focus(); } });
wMenu.onclick=e=>{
  const b=e.target.closest("[data-wm]"); if(!b||b.disabled) return; const k=b.dataset.wm; closeWMenu();
  if(k==="sel"){ selMode=!selMode; if(!selMode) selected.clear(); renderList(); }
  else if(k==="all"){ selMode=true; filteredCards().forEach(c=>selected.add(c.id)); renderList(); }
  else if(k==="none"){ selected.clear(); renderList(); }
  else if(k==="tag") bulkAddTag();
  else if(k==="untag") bulkRemoveTag();
  else if(k==="fill") fillDeck(selCards());
  else if(k==="dup") openDupScanner(visSel().length?visSel():null);
  else if(k==="del") bulkDelete();
  else if(k==="tags") openTagManager();
};
function renderSelBar(){
  const bar=$("#selBar"); if(!bar) return;
  if(!selMode){ bar.hidden=true; bar.innerHTML=""; return; }
  const n=visSel().length, hid=selected.size-n, all=filteredCards().length;
  bar.hidden=false;
  bar.innerHTML=`<span class="selcount"><b>${n}</b> ${n?"выбрано · действия в меню ⋮":"— отметьте слова"}${hid?` <span class="muted small">(ещё ${hid} скрыто фильтром)</span>`:""}</span>
    <button class="btn" type="button" data-sb="all" ${tipAttr("Выбрать все слова, подходящие под текущий фильтр и поиск")}>Все (${all})</button>
    <button class="btn" type="button" data-sb="none" ${n?"":"disabled"}>Снять</button>
    <button class="btn" type="button" data-sb="done">Готово</button>`;
  bar.querySelectorAll("[data-sb]").forEach(b=>b.onclick=()=>{
    hideTip(); const k=b.dataset.sb;
    if(k==="all"){ filteredCards().forEach(c=>selected.add(c.id)); renderList(); }
    else if(k==="none"){ selected.clear(); renderList(); }
    else if(k==="done"){ selMode=false; selected.clear(); renderList(); }
  });
}
/* действия применяются только к выбранным словам, которые сейчас видны (фильтр или поиск не должны менять скрытые) */
const visSel=()=>{ const v=new Set(filteredCards().map(c=>c.id)); return [...selected].filter(id=>v.has(id)); };
const selCards=()=>visSel().map(id=>Store.cards.get(id)).filter(Boolean);
function bulkAddTag(){
  const n=visSel().length;
  openModal(`<h2 style="font-size:18px">Добавить тег: ${n} ${plural(n,"слово","слова","слов")}</h2>
    <div class="tagbox"><label class="f">Теги через запятую<input class="input" id="b-tags" autocomplete="off" placeholder="например: работа" maxlength="200"></label><div class="tagchips"></div></div>
    <div class="row" style="justify-content:flex-end"><button class="btn" id="b-cancel" type="button">Отмена</button><button class="btn primary" id="b-ok" type="button">Добавить</button></div>`);
  syncTagBox($("#modalBody .tagbox")); $("#b-tags").focus();
  $("#b-cancel").onclick=closeModal;
  const go_=()=>{ const t=parseTags($("#b-tags").value); if(!t.length){ toast("Введите хотя бы один тег"); return; }
    const list=selCards(); list.forEach(c=>{ c.tags=cleanTags([...c.tags,...t]); }); Store.saveMany(list);
    closeModal(); renderList(); toast(`Тег добавлен: ${list.length} ${plural(list.length,"слово","слова","слов")}`); };
  $("#b-ok").onclick=go_; $("#b-tags").onkeydown=e=>{ if(e.key==="Enter"){ e.preventDefault(); go_(); } };
}
function bulkRemoveTag(){
  const cnt=new Map(); selCards().forEach(c=>c.tags.forEach(t=>cnt.set(t,(cnt.get(t)||0)+1)));
  if(!cnt.size){ toast("У выбранных слов нет тегов"); return; }
  openModal(`<h2 style="font-size:18px">Убрать тег у выбранных слов</h2><p class="small muted" style="margin:0">Отметьте теги, которые нужно убрать. Сами слова останутся.</p>
    <div class="tagchips" id="b-rm">${[...cnt].map(([t,n])=>`<button type="button" class="tagchip" data-rmtag="${esc(t)}" aria-pressed="false">${esc(t)} <small>${n}</small></button>`).join("")}</div>
    <div class="row" style="justify-content:flex-end"><button class="btn" id="b-cancel" type="button">Отмена</button><button class="btn primary" id="b-ok" type="button">Убрать</button></div>`);
  $("#modalBody").querySelectorAll("[data-rmtag]").forEach(b=>b.onclick=()=>{ const on=b.getAttribute("aria-pressed")!=="true"; b.setAttribute("aria-pressed",on); b.classList.toggle("on",on); });
  $("#b-cancel").onclick=closeModal;
  $("#b-ok").onclick=()=>{ const rm=[...$("#modalBody").querySelectorAll('[data-rmtag][aria-pressed="true"]')].map(b=>b.dataset.rmtag); if(!rm.length){ toast("Отметьте хотя бы один тег"); return; }
    const list=selCards().filter(c=>c.tags.some(t=>rm.includes(t))); list.forEach(c=>{ c.tags=c.tags.filter(t=>!rm.includes(t)); }); Store.saveMany(list);
    closeModal(); renderList(); toast(`Тег убран у ${list.length} ${plural(list.length,"слова","слов","слов")}`); };
}
function bulkDelete(){
  const n=visSel().length;
  openModal(`<h2 style="font-size:18px">Удалить ${n} ${plural(n,"слово","слова","слов")}?</h2><p class="small muted" style="margin:0">Слова и их прогресс будут удалены. Сразу после удаления можно нажать «Отменить».</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" id="b-cancel" type="button">Нет</button><button class="btn primary" id="b-ok" type="button" style="background:var(--bad);border-color:var(--bad)">Удалить</button></div>`);
  $("#b-cancel").onclick=closeModal;
  $("#b-ok").onclick=()=>{ const ids=visSel(), snap=ids.map(id=>structuredClone(Store.cards.get(id))).filter(Boolean); Store.deleteMany(ids); ids.forEach(id=>{ openEx.delete(id); selected.delete(id); }); closeModal(); renderAll(); toast(`Удалено: ${ids.length}`, {label:"Отменить", fn:()=>{ Store.restoreMany(snap); renderAll(); toast(`Возвращено: ${snap.length}`); }}); };
}

/* ---- управление тегами ---- */
function openTagManager(){
  const tags=tagCounts();
  openModal(`<div class="row" style="justify-content:space-between"><h2 style="font-size:18px">Теги</h2><button class="btn" id="tm-close" type="button">Готово</button></div>
    ${tags.length?`<p class="small muted" style="margin:0">Переименуйте тег: он изменится у всех слов. Если новое имя уже есть, теги объединятся. Удаление тега не удаляет слова.</p>
    <div class="stack" style="gap:8px">${tags.map(([t,n])=>`<div class="tmrow" data-tag="${esc(t)}"><input class="input" value="${esc(t)}" maxlength="30" aria-label="Название тега"><span class="muted small">${n} ${plural(n,"слово","слова","слов")}</span><button class="btn" type="button" data-tm="rn" ${tipAttr("Сохранить новое название тега")}>Переименовать</button><button class="btn" type="button" data-tm="show" ${tipAttr("Показать слова с этим тегом")}>Слова</button><button class="btn danger" type="button" data-tm="del" ${tipAttr("Убрать тег у всех слов")}>Удалить</button></div>`).join("")}</div>`
    :`<div class="panel empty muted" style="text-align:center">Тегов пока нет. Добавьте тег при создании слова, в карточке слова или выбрав несколько слов кнопкой «Выбрать».</div>`}`);
  $("#tm-close").onclick=()=>{ closeModal(); renderAll(); };
  $("#modalBody").querySelectorAll(".tmrow").forEach(row=>{
    const old=row.dataset.tag, inp=row.querySelector("input");
    row.querySelector('[data-tm="rn"]').onclick=()=>{
      const nw=normTag(inp.value); if(!nw){ toast("Название тега не может быть пустым"); return; } if(nw===old){ toast("Название не изменилось"); return; }
      const merged=tags.some(([t])=>t===nw), list=allCards().filter(c=>c.tags.includes(old));
      list.forEach(c=>{ c.tags=cleanTags(c.tags.map(t=>t===old?nw:t)); }); Store.saveMany(list);
      if(tagFilter===old) tagFilter=nw; if(S().deck===old){ S().deck=nw; Store.saveSettings(); }
      toast(merged?`Теги объединены: «${nw}»`:`Тег переименован: «${nw}»`); openTagManager();
    };
    row.querySelector('[data-tm="show"]').onclick=()=>{ tagFilter=old; filter="all"; shown=PAGE; $("#filters").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed", x.dataset.f==="all")); closeModal(); renderList(); };
    row.querySelector('[data-tm="del"]').onclick=()=>{
      const n=allCards().filter(c=>c.tags.includes(old)).length;
      row.innerHTML=`<span class="small" style="flex:1">Убрать тег «${esc(old)}» у ${n} ${plural(n,"слова","слов","слов")}? Сами слова останутся.</span><button class="btn" type="button" data-tm="no">Нет</button><button class="btn primary" type="button" data-tm="yes" style="background:var(--bad);border-color:var(--bad)">Убрать</button>`;
      row.querySelector('[data-tm="no"]').onclick=openTagManager;
      row.querySelector('[data-tm="yes"]').onclick=()=>{ const list=allCards().filter(c=>c.tags.includes(old)); list.forEach(c=>{ c.tags=c.tags.filter(t=>t!==old); }); Store.saveMany(list); if(tagFilter===old) tagFilter=""; if(S().deck===old){ S().deck=""; Store.saveSettings(); } toast("Тег удалён"); openTagManager(); };
    };
  });
}

/* ---- дубли: одно английское слово = одна карточка ---- */
function dupKey(en){
  return norm(en).replace(/\([^)]*\)/g," ").replace(/^(to|a|an|the)\s+/,"").replace(/[^a-z0-9'\s]/g,"").replace(/\s+/g," ").trim();
}
const findDupEn = en => { const k=dupKey(en); return k ? allCards().find(c=>dupKey(c.en)===k) : null; };
const dupIgnore=new Set();
function bestOf(group){ return [...group].sort((a,b)=>b.box-a.box||b.reps-a.reps||b.examples.length-a.examples.length||(b.ipa?1:0)-(a.ipa?1:0)||a.created-b.created)[0]; }
function dupGroups(scope){
  const m=new Map(); (scope||allCards()).forEach(c=>{ const k=dupKey(c.en); if(!k) return; (m.get(k)||m.set(k,[]).get(k)).push(c); });
  return [...m].filter(([k,g])=>g.length>1 && !dupIgnore.has(k)).sort((a,b)=>b[1].length-a[1].length||a[0].localeCompare(b[0]));
}
function mergeInto(keep, others){
  for(const o of others){
    keep.tags=cleanTags([...keep.tags,...o.tags]);
    if(!keep.ipa&&o.ipa) keep.ipa=o.ipa; if(!keep.pos&&o.pos) keep.pos=o.pos; if(!keep.audio&&o.audio) keep.audio=o.audio;
    if(!keep.examples.length&&o.examples.length) keep.examples=o.examples.map(x=>({...x}));
    if(o.ru && !keep.ru) keep.ru=o.ru;
    else if(o.ru && norm(keep.ru).indexOf(norm(o.ru))<0 && (keep.ru+", "+o.ru).length<=300) keep.ru=keep.ru+", "+o.ru;
    if(!keep.def&&o.def) keep.def=o.def;
    if(o.box>keep.box){ keep.box=o.box; keep.due=o.due; keep.fails=o.fails; keep.last=Math.max(keep.last,o.last); }
    keep.reps+=o.reps; keep.lapses+=o.lapses; keep.created=Math.min(keep.created,o.created);
  }
  return keep;
}
let dupScope=null;
function openDupScanner(scopeIds){
  if(scopeIds!==undefined) dupScope=scopeIds;
  const groups=dupGroups(dupScope?dupScope.map(id=>Store.cards.get(id)).filter(Boolean):null);
  const body=groups.length ? `<p class="small muted" style="margin:0">Одинаковое английское слово или фраза (без учёта регистра, «to», артиклей и скобок). Выберите карточку, которую оставить: теги, транскрипция, примеры и лучший прогресс перенесутся в неё.</p>
    <div class="row" style="justify-content:space-between"><span class="small">Групп: ${groups.length}</span><button class="btn primary" type="button" id="dupAll" ${tipAttr("Объединить все группы: останется карточка с лучшим прогрессом")}>Объединить все</button></div>
    <div class="stack" style="gap:12px;max-height:50vh;overflow:auto">${groups.map(([k,g],gi)=>{ const keep=bestOf(g); return `<div class="dupgrp" data-k="${esc(k)}"><div class="label">${esc(k)}</div>${g.map(c=>`<label class="duprow"><input type="radio" name="dg${gi}" value="${c.id}" ${c===keep?"checked":""}><span><b>${esc(c.en)}</b> — ${esc(glossOf(c))}<br><span class="muted small">уровень ${c.box}/7 · примеров: ${c.examples.length}${c.tags.length?" · "+c.tags.map(esc).join(", "):""}</span></span></label>`).join("")}<div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-dg="skip">Не объединять</button><button class="btn primary" type="button" data-dg="merge">Объединить</button></div></div>`; }).join("")}</div>`
    : `<div class="panel empty muted" style="text-align:center">Дублей не нашлось: у каждого английского слова одна карточка.</div>`;
  openModal(`<div class="row" style="justify-content:space-between"><h2 style="font-size:18px">Дубли</h2><button class="btn" id="dup-close" type="button">Готово</button></div>${body}`);
  $("#dup-close").onclick=()=>{ dupScope=null; closeModal(); renderAll(); };
  let snaps=[];
  const undoMerge=n=>toast(`Объединено: удалено дублей ${n}`, {label:"Отменить", fn:()=>{ Store.restoreMany(snaps); renderAll(); toast("Объединение отменено"); }});
  const doMerge=(k,keepId)=>{ const g=(dupScope?dupScope.map(id=>Store.cards.get(id)).filter(Boolean):allCards()).filter(c=>dupKey(c.en)===k); const keep=g.find(c=>c.id===keepId)||bestOf(g); const others=g.filter(c=>c!==keep); snaps.push(...g.map(c=>structuredClone(c))); mergeInto(keep,others); Store.saveMany([keep]); Store.deleteMany(others.map(c=>c.id)); return others.length; };
  $("#modalBody").querySelectorAll(".dupgrp").forEach(el=>{
    const k=el.dataset.k;
    el.querySelector('[data-dg="merge"]').onclick=()=>{ const id=el.querySelector("input:checked")?.value; snaps=[]; const n=doMerge(k,id); openDupScanner(); undoMerge(n); };
    el.querySelector('[data-dg="skip"]').onclick=()=>{ dupIgnore.add(k); openDupScanner(); };
  });
  $("#dupAll")?.addEventListener("click",()=>{ let n=0; snaps=[]; groups.forEach(([k])=>{ n+=doMerge(k); }); openDupScanner(); undoMerge(n); });
}


/* edit modal */
/* ---- кнопка «Назад» (телефон, браузер): закрывает окно или спрашивает про выход из тренировки, а не уводит со страницы ---- */
let modalLock=false;
const Nav={ silent:0, modal:false, sess:false,
  push(){ try{ history.pushState({koloda:1},"",location.href); return true; }catch{ return false; } },
  pop(){ this.silent++; try{ history.back(); }catch{ this.silent--; } }
};
window.addEventListener("popstate",()=>{
  if(Nav.silent>0){ Nav.silent--; return; }
  if(Nav.modal && !$("#modal").hidden){ if(modalLock){ Nav.push(); return; } Nav.modal=false; $("#modal").hidden=true; return; }
  if(Nav.sess && sess){
    Nav.sess=false;
    if(sess.finished){ closeSess(); return; }
    if(Nav.push()) Nav.sess=true;
    if($("#qc")) $("#qc").remove(); else askClose();
  }
});
function openModal(html){ $("#modalBody").innerHTML=html; $("#modal").hidden=false; if(!Nav.modal && Nav.push()) Nav.modal=true; }
function closeModal(){ modalLock=false; $("#modal").hidden=true; if(Nav.modal){ Nav.modal=false; Nav.pop(); } }
$("#modal").addEventListener("click", e=>{ if(e.target.id==="modal" && !modalLock) closeModal(); });
function openEdit(id){
  const c=Store.cards.get(id); if(!c) return;
  openModal(`<div class="row" style="justify-content:space-between"><h2 style="font-size:18px">Карточка</h2>${boxesHtml(c)}</div>
    <label class="f">English<input class="input" id="e-en" value="${esc(c.en)}"></label>
    <label class="f">Русский<input class="input" id="e-ru" value="${esc(c.ru)}"></label>
    <label class="f"><span>Определение по-английски<button class="tip" type="button" aria-label="Пояснение" data-tip="Необязательно, если есть русский перевод. Если перевода нет, определение показывается вместо него.">?</button></span><input class="input" id="e-def" value="${esc(c.def||"")}" maxlength="300" placeholder="например: to finally be in a particular place or situation"></label>
    <label class="f">Транскрипция<input class="input" id="e-ipa" value="${esc(c.ipa)}"></label>
    <label class="f">Примеры: по одному в строке, «English | перевод». Первая строка — главный пример, он показывается первым<textarea class="input" id="e-ex">${esc(c.examples.map(x=>x.en+(x.ru?" | "+x.ru:"")).join("\n"))}</textarea></label>
    <div class="tagbox" id="e-tagbox"><label class="f"><span>Теги<button class="tip" type="button" aria-label="Пояснение" data-tip="Через запятую. По тегу слова можно фильтровать в списке и учить отдельной подборкой.">?</button></span><input class="input" id="e-tags" autocomplete="off" value="${esc((c.tags||[]).join(", "))}" placeholder="например: работа, поездка" maxlength="200"></label><div class="tagchips"></div></div>
    ${SOURCE==="free"?`<div class="row"><button class="btn" id="e-fetch" type="button">Подтянуть из словаря</button><span class="small muted" id="e-fetchMsg"></span></div>`:""}
    <div class="small muted">Следующее повторение: ${dueLabel(c)} · повторений: ${c.reps}</div>
    <div class="row">${c.box>0?`<button class="btn" id="e-prac" type="button" data-tip="Пройти упражнения по этому слову прямо сейчас. Уровень и срок повтора не изменятся.">Потренировать сейчас</button>`:""}${c.box<7?`<button class="btn" id="e-master" type="button" data-tip="Поставит прогресс слова на 100%: следующий повтор через 90 дней. Сбросить прогресс можно в любой момент.">Отметить выученным</button>`:`<span class="chip">Прогресс 100%</span>`}</div>
    <div class="row" id="e-actions" style="justify-content:space-between">
      <div class="row"><button class="btn danger" id="e-del">Удалить</button><button class="btn ghost" id="e-reset">Сбросить прогресс</button></div>
      <div class="row"><button class="btn" id="e-cancel">Отмена</button><button class="btn primary" id="e-save">Сохранить</button></div>
    </div>`);
  $("#e-cancel").onclick=closeModal; syncTagBox($("#e-tagbox"));
  let pendAudio="", pendPos=""; const pendEx=[]; const exInit=$("#e-ex").value;
  if($("#e-fetch")) $("#e-fetch").onclick=async ()=>{
    const b=$("#e-fetch"), msg=$("#e-fetchMsg"); b.disabled=true; msg.textContent="Ищу…";
    const info=await enrichInfo($("#e-en").value.trim()||c.en);
    if(!$("#e-ipa").value.trim() && info.ipa) $("#e-ipa").value=info.ipa;
    if(!$("#e-ex").value.trim() && info.examples.length){
      const exs=info.examples.map(x=>({...x})); if(exs.some(x=>!x.ru)) await FREE.translateExamples(exs); pendEx.push(...exs);
      $("#e-ex").value=exs.map(x=>x.en+(x.ru?" | "+x.ru:"")).join("\n");
    }
    pendAudio=info.audio; pendPos=info.pos;
    const got=[info.ipa&&"транскрипция", info.examples.length&&"примеры", info.audio&&"запись произношения"].filter(Boolean);
    msg.textContent = got.length ? "Нашлось: "+got.join(", ")+". Нажмите «Сохранить»." : (infoHint(info)||"Ничего не нашлось.");
    b.disabled=false;
  };
  $("#e-save").onclick=()=>{
    const newRu=$("#e-ru").value.trim(), newDef=$("#e-def").value.trim();
    if(!newRu && !newDef){ toast("Впишите перевод или определение"); return; }
    const newEn=$("#e-en").value.trim()||c.en;
    if(norm(newEn)!==norm(c.en)){ c.audio=""; }   // запись произношения относилась к прежнему слову
    if(pendAudio && !c.audio) c.audio=pendAudio; if(pendPos && !c.pos) c.pos=pendPos;
    c.en=newEn; c.ru=newRu; c.def=newDef; c.ipa=$("#e-ipa").value.trim(); c.tags=parseTags($("#e-tags").value);
    const old=new Map([...pendEx, ...c.examples].map(x=>[norm(x.en),x]));
    const firstOld=norm(exInit.split("\n")[0]?.split("|")[0]||"");
    c.examples=$("#e-ex").value.split("\n").map(l=>l.trim()).filter(Boolean).map(l=>{ const [en,ru]=l.split("|").map(s=>s.trim()); const o=old.get(norm(en)), r={en, ru:ru||""}; if(o){ if(o.src) r.src=o.src; if(o.mt && norm(o.ru)===norm(ru||"")) r.mt=true; if(o.pin) r.pin=true; } return r; });
    if(c.examples.length && norm(c.examples[0].en)!==firstOld){ c.examples.forEach(x=>delete x.pin); c.examples[0].pin=true; }
    Store.saveCard(c); closeModal(); renderAll(); toast("Сохранено");
  };
  if($("#e-master")) $("#e-master").onclick=()=>{ masterCard(c); closeModal(); renderAll(); toast("Слово выучено: прогресс 100%"); };
  if($("#e-prac")) $("#e-prac").onclick=()=>{ closeModal(); runSeen=new Set(); buildSession("practice",[c]); };
  $("#e-reset").onclick=()=>{ const snap=structuredClone(c); c.box=0; c.due=0; c.reps=0; c.fails=0; Store.saveCard(c); closeModal(); renderAll(); toast("Прогресс слова сброшен", {label:"Отменить", fn:()=>{ Store.saveCard(snap); renderAll(); toast("Прогресс возвращён"); }}); };
  $("#e-del").onclick=()=>{
    $("#e-actions").innerHTML=`<span class="small">Удалить «${esc(c.en)}» насовсем?</span><div class="row"><button class="btn" id="e-no">Нет</button><button class="btn primary" id="e-yes" style="background:var(--bad);border-color:var(--bad)">Удалить</button></div>`;
    $("#e-no").onclick=()=>openEdit(id);
    $("#e-yes").onclick=()=>{ const snap=structuredClone(c); Store.deleteCard(id); closeModal(); renderAll(); toast("Удалено", {label:"Отменить", fn:()=>{ Store.restoreMany([snap]); renderAll(); toast("Слово возвращено"); }}); };
  };
}

/* ============ learn home ============ */
const DEMO = [
  {en:"to set off", ru:"отправиться в путь, выехать", ipa:"/set ˈɒf/", pos:"phrasal verb", examples:[{en:"We set off early to avoid the traffic.",ru:"Мы выехали рано, чтобы не попасть в пробки."},{en:"What time are you setting off tomorrow?",ru:"Во сколько вы завтра выезжаете?"}]},
  {en:"acquaintance", ru:"знакомый, знакомая", ipa:"/əˈkweɪntəns/", pos:"noun", examples:[{en:"She's not a close friend, just an acquaintance.",ru:"Она не близкая подруга, просто знакомая."},{en:"I bumped into an old acquaintance at the station.",ru:"Я столкнулась со старым знакомым на вокзале."}]},
  {en:"to cope with", ru:"справляться с", ipa:"/kəʊp wɪð/", pos:"verb", examples:[{en:"How do you cope with stress at work?",ru:"Как ты справляешься со стрессом на работе?"},{en:"She coped with the move really well.",ru:"Она очень хорошо справилась с переездом."}]},
  {en:"receipt", ru:"чек, квитанция", ipa:"/rɪˈsiːt/", pos:"noun", examples:[{en:"Keep the receipt in case you want to return it.",ru:"Сохраните чек на случай, если захотите вернуть."},{en:"Could I have a receipt, please?",ru:"Можно чек, пожалуйста?"}]},
  {en:"to fit", ru:"подходить по размеру", ipa:"/fɪt/", pos:"verb", examples:[{en:"These jeans don't fit me any more.",ru:"Эти джинсы мне больше не подходят по размеру."},{en:"Does the jacket fit?",ru:"Куртка подошла по размеру?"}]},
  {en:"jealous", ru:"ревнивый, завистливый", ipa:"/ˈdʒeləs/", pos:"adjective", examples:[{en:"He gets jealous when she talks to other men.",ru:"Он ревнует, когда она говорит с другими мужчинами."},{en:"I'm so jealous of your holiday!",ru:"Я так завидую твоему отпуску!"}]},
  {en:"to run late", ru:"опаздывать", ipa:"/rʌn ˈleɪt/", pos:"phrase", examples:[{en:"Sorry, I'm running late. Start without me.",ru:"Извини, я опаздываю. Начинайте без меня."},{en:"The train is running ten minutes late.",ru:"Поезд опаздывает на десять минут."}]},
  {en:"it's not rocket science", ru:"это не бином Ньютона, это несложно", ipa:"/ɪts nɒt ˈrɒkɪt ˌsaɪəns/", pos:"idiom", examples:[{en:"Come on, cooking pasta isn't rocket science.",ru:"Да ладно, сварить пасту — не бином Ньютона."},{en:"Setting up the app is not rocket science.",ru:"Настроить приложение несложно."}]},
];
/* ===== цель дня: новые слова + повторения (не больше лимита). Закрытый день продлевает серию ===== */
const goalOf=()=>S().goal||10, capOf=()=>S().revCap||40;
const emptyDay=()=>({n:0,learned:0,reviewed:0,rf:0,right:0,total:0,closed:false});
function goalState(){
  const dc=deckCards(), d=Store.stats.days?.[dayKey()]||emptyDay();
  const fresh=dc.filter(c=>!c.box).length, due=dc.filter(isDue).length;
  const newTarget=Math.min(goalOf(), (d.learned||0)+fresh);
  const revTarget=Math.min(capOf(), (d.reviewed||0)+due);      // повторений сегодня = пришедшие на повтор + уже пройденные
  const tried=(d.reviewed||0)+(d.rf||0);                          // пройденные и не выученные тоже считаются попыткой
  return {d, fresh, due, newTarget, revTarget, tried, newDone:Math.min(d.learned||0,newTarget), revDone:Math.min(tried,revTarget), closed:(d.learned||0)>=newTarget && tried>=revTarget};
}
const dayClosed = d => !!d && (d.closed===true || (d.closed===undefined && d.n>0));   // старые записи без цели считаем закрытыми
function streakInfo(){
  const days=Store.stats.days||{}, now=Date.now(), ok=t=>dayClosed(days[dayKey(t)]);
  let n=0, lastGap=-99;
  for(let i=ok(now)?0:1; i<4000; i++){
    const t=now-i*DAY;
    if(ok(t)){ n++; continue; }
    if(i-lastGap>=7 && ok(now-(i+1)*DAY)){ lastGap=i; continue; }   // один пропуск в неделю не рвёт серию
    break;
  }
  const last7=[]; for(let i=6;i>=0;i--){ const t=now-i*DAY; last7.push(ok(t)?1:(days[dayKey(t)]?.n>0?2:0)); }
  return {n,last7};
}
/* порядок повторений: сначала самые просроченные и слабые */
const reviewScore = c => (startOfDay()-startOfDay(c.due))/DAY / Math.max(1,INTERVALS[c.box]||1) + (c.fails||0)*0.5;
const reviewOrder = (a,b) => reviewScore(b)-reviewScore(a) || a.box-b.box;
/* разгрузка: следующий срок выбираем в пределах ±10% интервала в самый свободный день */
function dueLoad(){ const m=new Map(); for(const c of Store.cards.values()) if(c.box>0 && c.due>Date.now()){ const t=startOfDay(c.due); m.set(t,(m.get(t)||0)+1); } return m; }
function schedDue(box, load){
  const base=INTERVALS[box], w=base>=7?Math.floor(base*0.1):0, t0=startOfDay();
  let best=t0+base*DAY, bl=load.get(best)||0, bo=0;
  for(let o=-w;o<=w;o++){ const t=t0+Math.max(1,base+o)*DAY, l=load.get(t)||0; if(l<bl || (l===bl && Math.abs(o)<bo)){ best=t; bl=l; bo=Math.abs(o); } }
  load.set(best,(load.get(best)||0)+1);
  return best;
}
/* план «Учить»: сначала повторения (до лимита), потом новые (до цели); когда цель выполнена, можно учить сверх */
/* демо-слова не участвуют в обучении, как только в колоде появились настоящие */
const skipDemo = c => c.demo && allCards().some(x=>!x.demo);
function learnPlan(excludeSeen){
  const base=deckCards().filter(c=>!(excludeSeen&&runSeen.has(c.id)) && !closedLevel(c) && !skipDemo(c));
  const revs=base.filter(c=>c.box>0).sort(reviewOrder), news=base.filter(c=>!c.box).sort((a,b)=>((a.fails||0)>0)-((b.fails||0)>0)||a.created-b.created);
  const g=goalState(), revLeft=Math.max(0,g.revTarget-g.tried), newLeft=Math.max(0,g.newTarget-(g.d.learned||0));
  const mix=(rv,nw)=>{ const out=[]; let i=0,j=0; while(i<rv.length||j<nw.length){ if(j<nw.length && (i>=rv.length || (j+0.5)/nw.length <= (i+0.5)/rv.length)) out.push(nw[j++]); else out.push(rv[i++]); } return out; };   // новые слова равномерно между повторениями
  const planned=mix(revs.slice(0,revLeft), news.slice(0,newLeft));
  const extra=!planned.length && (revs.length>0||news.length>0);
  return {list: extra?mix(revs,news):planned, extra, revs:Math.min(revs.length,revLeft), news:Math.min(news.length,newLeft), g};
}
/* накопилось слишком много повторений: переносим лишние на ближайшие дни, не больше лимита в день */
function spreadBacklog(){
  const cap=capOf(), due=allCards().filter(isDue).sort(reviewOrder), rest=due.slice(cap);
  if(!rest.length) return 0;
  const load=dueLoad(), t0=startOfDay(); let day=1;
  for(const c of rest){ while((load.get(t0+day*DAY)||0)>=cap) day++; c.due=t0+day*DAY; load.set(c.due,(load.get(c.due)||0)+1); }
  Store.saveMany(rest);
  return rest.length;
}
function renderLearn(){
  const el=$("#v-learn"), cs=allCards();
  const tagsAll=tagCounts(); if(S().deck && !tagsAll.some(([t])=>t===S().deck)){ S().deck=""; Store.saveSettings(); }
  const dc=deckCards(), closed=dc.filter(closedLevel).length, nP=Math.min(S().batch, closed);
  const plan=learnPlan(false), gs=plan.g, todo=plan.list.length, n=Math.min(S().batch, todo);
  if(cs.length && gs.newTarget===0 && gs.revTarget===0 && !gs.d.closed){ const d=Store.stats.days[dayKey()] ||= emptyDay(); d.closed=true; Store.saveStats(); }   // задач на сегодня нет: день закрыт сам
  const st=streakInfo();
  const studied=cs.filter(c=>c.box>0).length, longterm=cs.filter(c=>c.box>=4).length, dueAll=cs.filter(isDue).length;
  const notStarted=cs.filter(c=>!c.box).length;
  const deckName=S().deck?`«${esc(S().deck)}»`:"все слова";
  const msg = gs.closed ? "День закрыт. Так держать!" : st.n ? "Закройте цель дня, чтобы серия не прервалась." : "Закройте цель дня и запустите свою серию.";
  const pct=(a,b)=>b?Math.round(a/b*100):100, tomorrow=cs.filter(c=>c.box>0 && c.due>=startOfDay()+DAY && c.due<startOfDay()+2*DAY).length;
  const leech=cs.filter(c=>c.fails>=3).length, backlog=dueAll>capOf()*2;
  const goalBox=`<section class="panel goal${gs.closed?" done":""}" aria-label="Цель на сегодня">
    <div class="goal-h"><b>Цель на сегодня</b><button class="tip" type="button" aria-label="Пояснение" data-tip="Чтобы закрыть день, выучите заданное число новых слов и пройдите повторения, которые пришли на сегодня (но не больше лимита). Учить можно и больше. Закрытый день продлевает серию. Цель и лимит меняются в настройках.">?</button><span class="chip${gs.closed?" ok":""}">${gs.closed?"день закрыт ✓":"в процессе"}</span></div>
    <div class="goal-row"><span>Новые слова</span><div class="gbar" role="img" aria-label="Новые слова ${gs.newDone} из ${gs.newTarget}"><i style="width:${pct(gs.newDone,gs.newTarget)}%"></i></div><b>${gs.newDone}/${gs.newTarget}</b></div>
    <div class="goal-row"><span>Повторения</span><div class="gbar" role="img" aria-label="Повторения ${gs.revDone} из ${gs.revTarget}"><i style="width:${pct(gs.revDone,gs.revTarget)}%"></i></div><b>${gs.revDone}/${gs.revTarget}</b></div>
    <div class="small muted">Цель: ${goalOf()} новых, лимит повторений: ${capOf()}. <button class="pill-link" type="button" data-go="prefs">Изменить</button></div>
  </section>`;
  const notes = (backlog?`<div class="resume" id="blBox"><div><b>Накопилось повторений: ${dueAll}</b><div class="small muted">Каждый день показываем самые важные, не больше ${capOf()}. Остальные можно разложить на ближайшие дни: уровни не изменятся.</div></div><div class="row"><button class="btn primary" type="button" data-spread ${tipAttr("Перенесёт лишние повторения на ближайшие дни, чтобы в каждом было не больше лимита. Прогресс слов не меняется.")}>Разложить</button></div></div>`:"")
    + (leech?`<div class="resume" id="lcBox"><div><b>Проблемные слова: ${leech}</b><div class="small muted">Слова, в которых вы ошиблись три раза и больше. Откройте карточку и поправьте перевод или пример: так они запомнятся легче.</div></div><div class="row"><button class="btn" type="button" data-gof="hard">Показать</button></div></div>`:"");
  const deckBar = `<div class="sec-head"><h2>Подборки по тегам</h2></div>` + (tagsAll.length ? `<div class="deckbar"><span class="label">Учить<button class="tip" type="button" aria-label="Пояснение" data-tip="Выберите тег, и «Учить» и «Тренировка» возьмут только слова с ним. Подборку можно сменить в любой момент. Прогресс у слова один на все подборки: выученное слово вернётся на повторение только в свой срок, даже если оно есть в другой подборке.">?</button></span><div class="filters" id="deckChips"><button type="button" data-deck="" aria-pressed="${!S().deck}" ${tipAttr("Учить все слова колоды")}>Все слова · ${cs.length}</button>${tagsAll.map(([t,k])=>`<button type="button" data-deck="${esc(t)}" aria-pressed="${S().deck===t}" ${tipAttr("Учить и повторять только слова с тегом «"+t+"»")}>${esc(t)} · ${k}</button>`).join("")}</div></div>`
    : `<div class="panel small muted" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:space-between">Добавьте слову тег, например «работа», и его можно будет учить отдельной подборкой.<button class="pill-link" data-go="words">К словам</button></div>`);
  const ss=savedSess(), ssLeft=ss?ss.rounds.reduce((n,r)=>n+(r.queue?.length||0),0):0;
  const resumeBox = ss ? `<div class="resume"><div><b>Незавершённая тренировка</b><div class="small muted">${ss.kind==="practice"?"Тренировка":"Обучение"} · осталось шагов: ${ssLeft}</div></div><div class="row"><button class="btn primary" type="button" data-resume ${tipAttr("Продолжить с того места, где остановились")}>Продолжить</button><button class="btn" type="button" data-discard ${tipAttr("Удалить сохранённую тренировку. Прогресс слов не изменится.")}>Сбросить</button></div></div>` : "";
  el.innerHTML = resumeBox + `
  <section class="prog" aria-label="Ваш прогресс">
    <div class="prog-streak">
      <span class="hero-kicker">Серия${`<button class="tip tip-light" type="button" aria-label="Пояснение" data-tip="Сколько дней подряд вы закрывали цель дня. Один пропуск в неделю серию не прерывает. Полоски: последние 7 дней, справа сегодня. Тёмная — день закрыт, полупрозрачная — занимались, но цель не закрыли.">?</button>`}</span>
      <div class="prog-num"><b>${st.n}</b><span>${plural(st.n,"день","дня","дней")} подряд</span></div>
      <div class="streak" aria-label="Активность за 7 дней">${st.last7.map(v=>`<span class="${v===1?"on":v===2?"half":""}"></span>`).join("")}</div>
      <p>${msg}</p>
    </div>
    <div class="prog-stats">
      <button class="pstat lime" type="button" data-gof="known" ${tipAttr("Слова, которые вы уже хорошо запомнили: они дошли до 4-го уровня и теперь возвращаются раз в 8 дней и реже. «В работе» — слова, которые вы уже начали учить, но они ещё не дошли до этого уровня. Нажмите, чтобы открыть список.")}><b>${longterm}</b><span>завершено</span><small>из ${cs.length} · в работе ${studied-longterm}</small></button>
      <button class="pstat pink" type="button" data-gof="due" ${tipAttr("Слова, у которых пришёл срок повтора. Нажмите, чтобы открыть их список.")}><b>${dueAll}</b><span>на повторение</span></button>
    </div>
  </section>

  ${goalBox}
  ${notes}
  <div class="sec-head"><h2>Что делаем сегодня</h2><span class="chip">подборка: ${deckName}</span></div>
  <div class="grid3 acts">
    <div class="ftile lime compact hero-cta">
      <div class="label">Учить<button class="tip" type="button" aria-label="Пояснение" data-tip="Сначала повторения (самые важные, не больше лимита), потом новые слова до цели дня. Без ошибок уровень растёт (новое слово сразу получает 2-й уровень), с одной ошибкой остаётся прежним, с двумя и больше снижается на 1.">?</button></div>
      <div class="bignum">${todo}</div>
      <p>${!cs.length?"Добавьте слова, и здесь появится план на сегодня":!todo?"Всё изучено на текущих уровнях":plan.extra?"Цель дня выполнена. Можно учить ещё":`На сегодня: ${plan.news} ${plural(plan.news,"новое","новых","новых")} · ${plan.revs} на повторении`}</p>
      ${notStarted>plan.news?`<p class="small" style="margin-top:-4px;opacity:.75">Ещё не начато: ${notStarted}. Остальные подключатся в следующие дни: по ${goalOf()} новых в день.</p>`:""}
      <button class="btn primary" data-start="learn" ${todo?"":"disabled"} ${tipAttr("Сначала повторения (самые важные, не больше лимита), потом новые слова до цели дня. Без ошибок уровень растёт (новое слово сразу получает 2-й уровень), с одной ошибкой остаётся прежним, с двумя и больше снижается на 1.")}>${todo?`${plan.extra?"Учить ещё":"Учить"} ${n} ${plural(n,"слово","слова","слов")}`:"Нечего учить"}</button>
      <span class="deco ring"></span>
    </div>
    <div class="ftile compact">
      <div class="label">Тренировка<button class="tip" type="button" aria-label="Пояснение" data-tip="Слова, у которых текущий уровень уже закрыт и срок повтора не пришёл. Тренироваться можно сколько угодно: уровень слов не меняется.">?</button></div>
      <div class="bignum">${closed}</div>
      <p>${closed?"слов можно потренировать для себя":"пока нет слов с закрытым уровнем"}</p>
      <button class="btn ${closed?"pink":""}" data-start="practice" ${closed?"":"disabled"} ${tipAttr("Слова, у которых текущий уровень уже закрыт и срок повтора не пришёл. Тренироваться можно сколько угодно: уровень слов не меняется.")}>${closed?`Тренировать ${nP}`:"Тренировать"}</button>
      <span class="deco stackc"><i></i><i></i><i></i></span>
    </div>
    <button class="ftile compact addtile" type="button" data-go="words" ${tipAttr("Перейти к добавлению слов: по одному или списком")}>
      <div class="label">Новые слова</div>
      <div class="plus" aria-hidden="true">+</div>
      <p>Добавить слово или целый список. Перевод, примеры и звук подберутся сами.</p>
      <span class="btn">Добавить слова</span>
    </button>
  </div>
  ${deckBar}
  ${AUTH.enabled && Store.mode==="local" ? `<div class="ftile nudge"><div><h3>Сохраните слова в аккаунте</h3><p>Сейчас колода живёт только в этом браузере. С аккаунтом слова не потеряются и будут на любом устройстве.</p></div><div class="row"><button class="btn primary" data-auth="signup">Регистрация</button><button class="btn" data-auth="signin">Вход</button></div></div>` : ""}
  <div class="sec-head"><h2>Все слова</h2>${cs.length?`<button class="pill-link" data-go="words">Открыть список · ${cs.length}</button>`:""}</div>
  <div class="grid2">
    ${!cs.length?`<div class="panel stack" style="grid-column:1/-1"><div><b>Пока в колоде нет слов</b><div class="small muted">Добавьте своё слово или список, либо загрузите 8 готовых слов, чтобы посмотреть, как всё работает.</div></div><div class="row"><button class="btn primary" type="button" data-go="words">Добавить слово</button><button class="btn" type="button" id="demoBtn">8 слов для пробы</button></div></div>`:""}
    ${[...cs].sort((a,b)=>b.created-a.created).slice(0,4).map(c=>`<div class="wordtile">${sayBtn(c.en,"en",false)}<div class="w"><b>${esc(c.en)}</b><span>${esc(glossOf(c))}${c.ipa?` · <span class="ipa" style="display:inline">${esc(c.ipa)}</span>`:""}</span></div>${boxesHtml(c)}</div>`).join("")}
  </div>
`;
  el.querySelectorAll("[data-start]").forEach(b=>b.onclick=()=> b.dataset.start==="learn" ? startLearn() : startPractice());
  el.querySelector("[data-resume]")?.addEventListener("click",()=>{ hideTip(); resumeSess(); });
  el.querySelector("[data-discard]")?.addEventListener("click",()=>{ hideTip(); clearSavedSess(); renderLearn(); toast("Сохранённая тренировка удалена"); });
  el.querySelectorAll("[data-deck]").forEach(b=>b.onclick=()=>{ hideTip(); S().deck=b.dataset.deck; Store.saveSettings(); renderLearn(); });
  el.querySelectorAll("[data-gof]").forEach(b=>b.onclick=()=>{ hideTip(); filter=b.dataset.gof; tagFilter=""; $("#filters").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed", x.dataset.f===filter)); go("words"); });
  el.querySelectorAll("[data-auth]").forEach(b=>b.onclick=()=>openAuth(b.dataset.auth));
  el.querySelector("[data-spread]")?.addEventListener("click",()=>{
    hideTip(); const k=Math.max(0,dueAll-capOf());
    $("#blBox").innerHTML=`<div><b>Перенести ${k} ${plural(k,"повторение","повторения","повторений")} на ближайшие дни?</b><div class="small muted">Не больше ${capOf()} в день. Уровни слов не изменятся.</div></div><div class="row"><button class="btn" type="button" id="blNo">Отмена</button><button class="btn primary" type="button" id="blYes">Перенести</button></div>`;
    $("#blNo").onclick=renderLearn; $("#blYes").onclick=()=>{ const m=spreadBacklog(); renderAll(); toast(`Перенесено повторений: ${m}`); };
  });
  $("#demoBtn")?.addEventListener("click",()=>{ DEMO.forEach((d,i)=>{ const c=newCard({...d, demo:true}); c.created+=i; Store.saveCard(c); }); renderAll(); toast("Добавлено 8 карточек"); });
  bindGo(el);
}
function bindGo(el){ el.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>{ go(b.dataset.go); if(b.dataset.go==="words") setTimeout(()=>addInput.focus(),50); }); }

/* ============ session engine ============ */
const FILLER = [["house","дом"],["window","окно"],["to borrow","одалживать"],["weather","погода"],["cheap","дешёвый"],["to arrive","прибывать"],["neighbour","сосед"],["to forget","забывать"],["kitchen","кухня"],["busy","занятой"],["to explain","объяснять"],["journey","поездка"]].map(([en,ru])=>({en,ru}));
let sess=null;
function modesOn(){ const m=S().modes; return m; }
function deckCards(){ const t=S().deck; return t ? allCards().filter(c=>c.tags.includes(t)) : allCards(); }
/* подборки: слова текущего run (цепочка «Изучать далее») повторно не предлагаем */
let runSeen=new Set();
const closedLevel = c => c.box>0 && !isDue(c);          // уровень закрыт: срок повтора ещё не пришёл
function pickPool(kind){
  const base=deckCards().filter(c=>!runSeen.has(c.id)&&!skipDemo(c));  // 1) тег (если выбран)  2) критерий уровня
  if(kind==="practice") return base.filter(closedLevel).sort((a,b)=>(a.last||0)-(b.last||0));
  return learnPlan(true).list;
}
function startRun(kind, fresh=true){
  if(fresh) runSeen=new Set();
  const list=pickPool(kind).slice(0,S().batch);
  if(list.length) buildSession(kind, list);
}
const startLearn=(fresh=true)=>startRun("learn",fresh);
const startPractice=(fresh=true)=>startRun("practice",fresh);
/* доли заданий зависят от уровня слова: на низких больше узнавания, на высоких больше вспоминания; все форматы встречаются на всех уровнях */
const TASK_W={ low:{cf:26,ma:22,cr:20,cl:8,le:16,ty:8}, mid:{cf:6,ma:10,cr:16,cl:22,le:22,ty:24}, high:{cf:2,ma:4,cr:6,cl:30,le:16,ty:42} };
const TASK_MUST={ low:["le","ty"], mid:["ty"], high:["ty","cl"] };
const TASK_N={ low:5, mid:4, high:3 };
const bandOf=c=>c.box<=2?"low":c.box<=4?"mid":"high";
function taskOn(t,c){ const m=modesOn(); if(t==="cf"||t==="cr") return !!m.choice; if(t==="ma") return !!m.match; if(t==="le") return !!m.letters; if(t==="ty") return !!m.typing; if(t==="cl") return m.cloze!==false && !!clozeFor(c); return false; }
function assignTasks(c, noMatch=false){
  const b=bandOf(c), on=Object.keys(TASK_W[b]).filter(t=>taskOn(t,c) && !(noMatch&&t==="ma"));
  if(!on.length) return ["cf"];
  const chosen=TASK_MUST[b].filter(t=>on.includes(t));
  let pool=on.filter(t=>!chosen.includes(t));
  while(chosen.length<Math.min(TASK_N[b],on.length) && pool.length){
    const tot=pool.reduce((x,t)=>x+TASK_W[b][t],0); let r=Math.random()*tot, pick=pool[pool.length-1];
    for(const t of pool){ r-=TASK_W[b][t]; if(r<=0){ pick=t; break; } }
    chosen.push(pick); pool=pool.filter(t=>t!==pick);
  }
  return chosen;
}
const roundKey = r => r.type==="choice" ? (r.dir==="rev"?"cr":"cf") : ({match:"ma",cloze:"cl",letters:"le",typing:"ty"})[r.type];
/* раунды одной «части»: знакомство только для новых слов, дальше все форматы. Новые слова идут порциями по 4–6 (знакомство → сразу проверка),
   а не пачкой из 10–25 карточек подряд: память держится лучше, когда за показом сразу идёт вспоминание */
function waveRounds(list, w){
  const bk={cf:[],ma:[],cr:[],cl:[],le:[],ty:[]};
  list.forEach(c=>assignTasks(c).forEach(t=>bk[t].push(c.id)));
  if(bk.ma.length===1){ const id=bk.ma.pop(); const alt=["cr","cf","ty"].find(t=>!bk[t].includes(id) && (t==="ty"||modesOn().choice)); if(alt) bk[alt].push(id); }
  const rounds=[{type:"intro", queue:list.filter(c=>!c.box).map(c=>c.id)}];
  rounds.push({type:"choice", dir:"fwd", queue:shuffle(bk.cf)});
  { const sh=shuffle(bk.ma), ch=[]; for(let i=0;i<sh.length;i+=5) ch.push(sh.slice(i,i+5)); if(ch.length>1 && ch[ch.length-1].length<2){ ch[ch.length-2].push(...ch.pop()); } rounds.push({type:"match", queue:ch}); }
  rounds.push({type:"choice", dir:"rev", queue:shuffle(bk.cr)});
  rounds.push({type:"cloze", queue:shuffle(bk.cl)});
  rounds.push({type:"letters", queue:shuffle(bk.le)});
  rounds.push({type:"typing", queue:shuffle(bk.ty)});
  rounds.forEach(r=>r.w=w);
  return rounds;
}
function splitWaves(list){
  const n=list.length, k=n<=7?1:Math.ceil(n/6), out=[]; let i=0;
  for(let j=0;j<k;j++){ const size=Math.ceil((n-i)/(k-j)); out.push(list.slice(i,i+size)); i+=size; }
  return out;
}
const wavesCount = () => 1+Math.max(0,...sess.rounds.map(r=>r.w||0));
function buildSession(kind, list){
  knownCache=null;
  const ids=list.map(c=>c.id); ids.forEach(i=>runSeen.add(i));
  const rounds=splitWaves(list).flatMap((g,w)=>waveRounds(g,w));
  sess={kind, ids, rounds, r:0, done:0, mistakes:Object.fromEntries(ids.map(i=>[i,0])), skipped:new Set(), answers:0, right:0, busy:false};
  sess.total = rounds.reduce((n,r)=>n+r.queue.length,0);
  $("#sess").hidden=false; document.body.style.overflow="hidden"; if(!Nav.sess && Nav.push()) Nav.sess=true;
  if((S().planSeen||0)<2){ S().planSeen=(S().planSeen||0)+1; Store.saveSettings(); showPlan(list); } else next();
}
/* первые занятия: короткий план перед стартом, чтобы было понятно, что будет и сколько это займёт */
function showPlan(list){
  updateBar(); $("#sessMore").hidden=true; sess.cur=null;
  const nNew=list.filter(c=>!c.box).length, nRev=list.length-nNew, k=wavesCount(), mins=Math.max(1,Math.round(sess.total*8/60));
  const bits=[nNew?`${nNew} ${plural(nNew,"новое слово","новых слова","новых слов")}`:"", nRev?`${nRev} на повторении`:""].filter(Boolean).join(" и ");
  const kinds=[nNew?["Знакомство","смотрите слово, перевод и примеры"]:null, ["Выбор перевода","узнаёте слово среди вариантов"], ["Пары","соединяете слово и перевод"], ["Предложения и буквы","вставляете слово, собираете из букв"], ["Ввод","пишете слово сами"]].filter(Boolean);
  body().innerHTML=`<div class="flash plan" style="text-align:left;align-items:stretch;gap:10px">
    <div class="label" style="text-align:center">План занятия</div>
    <div style="text-align:center"><div class="bignum" style="font-size:44px">${list.length}</div><div class="muted">${bits} · примерно ${mins} ${plural(mins,"минута","минуты","минут")}</div></div>
    <ol class="plan-list">${kinds.map(([t,d])=>`<li><b>${t}</b><span class="muted small">${d}</span></li>`).join("")}</ol>
    <p class="small muted" style="margin:0">${k>1?"Слова идут небольшими порциями: после знакомства сразу проверка, так запоминается лучше. ":""}Ошибиться не страшно: слово вернётся в конце, и это часть обучения. Выйти можно в любой момент, пройденные слова сохранятся.</p></div>
  <div class="sess-foot"><button class="btn primary" id="planGo" type="button">Поехали</button></div>`;
  $("#planGo").onclick=()=>next(); $("#planGo").focus();
}

/* ---- сохранение тренировки: можно закрыть вкладку и продолжить ---- */
const sessKey=()=>Store.prefix+"sess";
function saveSess(){
  if(!sess || sess.finished) return;
  try{ localStorage.setItem(sessKey(), JSON.stringify({v:1,t:Date.now(),kind:sess.kind,ids:sess.ids,rounds:sess.rounds,r:sess.r,done:sess.done,mistakes:sess.mistakes,skipped:[...sess.skipped],answers:sess.answers,right:sess.right})); }catch{}
}
function clearSavedSess(){ try{ localStorage.removeItem(sessKey()); }catch{} }
function savedSess(){
  try{
    const s=JSON.parse(localStorage.getItem(sessKey()));
    if(!s || s.v!==1 || !Array.isArray(s.ids) || !Array.isArray(s.rounds) || Date.now()-s.t>3*86400000) return null;
    if(!s.ids.some(id=>Store.cards.has(id))) return null;
    return s;
  }catch{ return null; }
}
function resumeSess(){
  const s=savedSess(); if(!s) return;
  const alive=new Set(s.ids.filter(id=>Store.cards.has(id)));
  const rounds=s.rounds.filter(r=>r&&["intro","choice","match","cloze","letters","typing"].includes(r.type)&&Array.isArray(r.queue)).map(r=>({type:r.type, dir:r.dir, w:+r.w||0, queue: r.type==="match" ? r.queue.map(g=>(Array.isArray(g)?g:[]).filter(x=>alive.has(x))).filter(g=>g.length>=2) : r.queue.filter(x=>typeof x==="string"&&alive.has(x))}));
  sess={kind:s.kind, ids:[...alive], rounds, r:Math.min(+s.r||0, rounds.length), done:+s.done||0, mistakes:Object.fromEntries([...alive].map(id=>[id,+s.mistakes?.[id]||0])), skipped:new Set((s.skipped||[]).filter(id=>alive.has(id))), answers:+s.answers||0, right:+s.right||0, busy:false};
  sess.total=sess.done+rounds.reduce((n,r)=>n+r.queue.length,0);
  alive.forEach(id=>runSeen.add(id));
  $("#sess").hidden=false; document.body.style.overflow="hidden"; if(!Nav.sess && Nav.push()) Nav.sess=true;
  next();
}
function cardOf(id){ return Store.cards.get(id); }
function front(c){ return S().first==="en" ? {t:c.en, l:"en"} : {t:glossOf(c), l:glossLang(c)}; }
function back(c){ return S().first==="en" ? {t:glossOf(c), l:glossLang(c)} : {t:c.en, l:"en"}; }
const shownText = (c, x) => x.t===c.en ? x.t : maskDef(c, x.t);
/* определение без русского перевода: слово в нём закрываем, иначе ответ виден сразу */
function maskDef(c, t=glossOf(c)){
  if(c.ru) return t;
  const core=coreOf(c.en).trim(); if(!core) return t;
  const forms=core.split(/\s+/).filter(w=>w.length>2).map(w=>w.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"));
  if(!forms.length) return t;
  const stems=forms.map(w=>w.length>4?w.slice(0,-1):w);
  return String(t).replace(new RegExp("\\b(?:"+stems.join("|")+")[a-z]*","gi"),"…");
}
function updateBar(){ const p=sess.total?Math.round(sess.done/sess.total*100):0; sess.maxP=Math.max(sess.maxP||0,p); $("#pbar").style.width=sess.maxP+"%";}
function next(){
  updateBar();
  while(sess.r<sess.rounds.length && !sess.rounds[sess.r].queue.length) sess.r++;
  if(sess.r>=sess.rounds.length) return finish();
  const round=sess.rounds[sess.r];
  stopSpeech(); sess.busy=false; saveSess();
  sess.cur = typeof round.queue[0]==="string" ? round.queue[0] : null;   // в «парах» карточка не одна
  closeSessMenu(); $("#sessMore").hidden = !sess.cur;
  ({intro:stepIntro, choice:stepChoice, match:stepMatch, cloze:stepCloze, letters:stepLetters, typing:stepTyping})[round.type](round, round.queue[0]);
}
/* отложенное действие: срабатывает, только если тренировка и раунд не изменились */
function later(fn, ms){ const tok=sess, r=tok&&tok.r, q=tok&&tok.rounds[tok.r]?.queue.length; setTimeout(()=>{ if(sess===tok && tok && !tok.finished && tok.r===r && tok.rounds[tok.r]?.queue.length===q) fn(); }, ms); }
/* пауза после верного ответа: даём дослушать слово, но не дольше 2,5 с */
const speakPause = text => S().audio==="off" ? 600 : Math.max(750, Math.min(2500, String(text).length*70));
function done(ok, id, requeue=true){
  const round=sess.rounds[sess.r]; round.queue.shift(); sess.done++;
  if(id!==undefined){ sess.answers++; if(ok) sess.right++; else { sess.mistakes[id]++; if(requeue){ round.queue.push(id); sess.total++; } } }
  next();
}
const MODE = {intro:"Знакомство", choice:"Выберите перевод", match:"Соедините пары", cloze:"Вставьте пропущенное", letters:"Соберите слово из букв", typing:"Напишите по-английски"};
function head(type, extra=""){ return `<div class="mode-tag"><span class="label">${MODE[type]}</span>${extra}</div>`; }
const SRC_NAME={tat:"Tatoeba", wik:"Викисловарь", dict:"словарь", ctx:"из вашего примера"};
const SRC_TIP={tat:"Предложение из Tatoeba: его написали и проверили люди.", wik:"Пример из Викисловаря.", dict:"Пример из словаря.", ctx:"Предложение из примера, на который вы нажали."};
function srcTag(x, onlyWarn=false){
  const t=[]; if(!onlyWarn && SRC_NAME[x.src]) t.push(SRC_NAME[x.src]);
  if(x.mt) t.push("машинный перевод"); else if(!x.ru) t.push("без перевода");
  if(!t.length) return "";
  const warn=x.mt||!x.ru;
  return `<span class="exsrc${warn?" warn":""}" ${tipAttr(warn?"Русский перевод сделал автоматический переводчик (или его нет), он может быть неточным. Проверьте и поправьте в карточке.":(SRC_TIP[x.src]||""))}>${t.join(" · ")}</span>`;
}
function wordsHtml(t, click){
  if(!click) return esc(t);
  const own=new Set(); for(const c of Store.cards.values()) for(const w of coreOf(c.en).toLowerCase().split(/\s+/)) own.add(w);
  return String(t).split(/([A-Za-z]+(?:'[a-z]+)?)/).map((p,i)=>{
    if(i%2===0) return esc(p);
    const w=p.toLowerCase().replace(/'.*$/,""); if(w.length<2) return esc(p);
    return `<button type="button" class="${own.has(w)?"xw own":isKnownWord(w)?"xw":"xw new"}" data-xw="${esc(w)}">${esc(p)}</button>`;
  }).join("");
}
function exHtml(c, n=2, o={}){ const l=rankedExamples(c).slice(0,n); return l.length ? `<ul class="ex-list">${l.map(x=>`<li>${sayBtn(x.en)}<div><div class="en">${wordsHtml(x.en,o.click)}</div><div class="ru">${esc(x.ru||"")}</div>${srcTag(x,!o.tags)}</div></li>`).join("")}</ul>` : ""; }
/* слово из примера -> в колоду: открываем «Слова» и сразу ищем перевод, предложение уходит первым примером */
let fromExample=null;
function addFromExample(w, sentence){
  const have=findDupEn(w); if(have){ toast(`«${have.en}» уже в колоде`); return; }
  fromExample={w, sentence:String(sentence).trim().slice(0,300)};
  go("words"); addInput.value=w; addInput.dispatchEvent(new Event("input")); scrollTo(0,0); lookup();
}
function bindXw(el){ el.querySelectorAll("[data-xw]").forEach(b=>b.onclick=ev=>{ ev.stopPropagation(); hideTip(); addFromExample(b.dataset.xw, b.closest(".en").textContent); }); }
const MIN_EX = 3;   // цель: у каждого слова перевод (или определение) и минимум три примера
function quality(c){
  const m=[]; if(!glossOf(c)) m.push("перевод"); if(!c.ipa) m.push("транскрипция");
  if(!c.examples.length) m.push("примеры");
  else { if(c.examples.length<MIN_EX) m.push("примеров меньше "+MIN_EX); if(c.examples.some(x=>!x.ru)) m.push("перевод примеров"); else if(c.examples.every(x=>x.mt)) m.push("проверка перевода примеров"); }
  return m;
}
const body = () => $("#sessBody");

function stepIntro(round, id){
  const c=cardOf(id), f=front(c), b=back(c);
  body().innerHTML = head("intro", `<span class="chip">${round.queue.length>1?"ещё "+(round.queue.length-1):"последняя"}</span>`) + `
  <div class="flash">
    ${c.pos?`<span class="chip">${esc(c.pos)}</span>`:""}
    <div class="row" style="justify-content:center;flex-wrap:nowrap"><div class="word">${esc(f.t)}</div>${sayBtn(f.t,f.l,false)}</div>
    ${c.ipa && f.l==="en"?`<div class="ipa">${esc(c.ipa)}</div>`:""}
    <hr>
    <div class="row" style="justify-content:center;flex-wrap:nowrap"><div class="trans">${esc(b.t)}</div>${sayBtn(b.t,b.l)}</div>
    ${c.ipa && b.l==="en"?`<div class="ipa">${esc(c.ipa)}</div>`:""}
    ${exHtml(c,3)}
  </div>
  <div class="sess-foot"><button class="btn" id="iKnow">Уже знаю</button><button class="btn primary" id="iNext">Дальше <kbd style="opacity:.6;font-size:11px">Enter</kbd></button></div>
  <div class="small muted" style="text-align:center">«Уже знаю» отправит слово сразу на 4-й уровень: следующий повтор через 8 дней.</div>`;
  autoSpeak(f.t, f.l);
  $("#iNext").onclick=()=>done(true);
  $("#iKnow").onclick=()=>{
    sess.skipped.add(id);
    for(const r of sess.rounds){ if(r.type==="intro") continue; if(r.type==="match"){ r.queue=r.queue.map(g=>g.filter(x=>x!==id)).filter(g=>g.length>=2); } else r.queue=r.queue.filter(x=>x!==id); }
    // на место слова, которое пользователь уже знает, берём следующее из подборки
    const rep=pickPool(sess.kind).find(x=>!sess.ids.includes(x.id)), curW=round.w||0;
    if(rep){
      runSeen.add(rep.id); sess.ids.push(rep.id); sess.mistakes[rep.id]=0;
      const tasks=assignTasks(rep,true);
      for(const r of sess.rounds){
        if((r.w||0)!==curW) continue;      // замена садится в ту же часть, где пользователь сейчас
        if(r.type==="intro"){ if(!rep.box) r.queue.push(rep.id); }
        else if(r.type!=="match" && tasks.includes(roundKey(r))) r.queue.splice(Math.floor(Math.random()*(r.queue.length+1)),0,rep.id);
      }
    }
    sess.total = sess.done + sess.rounds.reduce((s,r)=>s+r.queue.length,0);
    done(true);
  };
  $("#iNext").focus();
}
/* неверные варианты похожи на ответ по форме (часть речи, «to», длина, число слов), поэтому угадать по виду нельзя;
   слова с тем же русским переводом (to hire / to rent) в варианты не берём: ответ был бы неоднозначным */
function distractors(c, key, n=3){
  const get = x => key==="en" ? x.en : glossOf(x);   // key: "en" (слово) или "g" (перевод/определение)
  const base=String(get(c)), isTo=/^to\s/i.test(base), len=base.length, wc=base.split(/\s+/).length, mine=ruVariants(c.ru).map(norm);
  const clash=x=>ruVariants(x.ru).some(v=>mine.includes(norm(v)));
  const score=x=>{
    const v=String(get(x)); let sc=Math.abs(v.length-len)/Math.max(len,6)*2 + Math.abs(v.split(/\s+/).length-wc)*0.7;
    if(key==="en"){ if(/^to\s/i.test(v)!==isTo) sc+=3; if(x.pos && c.pos && x.pos!==c.pos) sc+=1; }
    if(sess.ids.includes(x.id)) sc-=0.8;
    return sc+Math.random()*1.2;
  };
  const pool=allCards().filter(x=>x.id!==c.id && get(x) && (key==="en" || glossLang(x)===glossLang(c)) && norm(get(x))!==norm(base) && !clash(x)).map(x=>[score(x),x]).sort((a,b)=>a[0]-b[0]).map(p=>p[1]);
  const out=[]; const seen=new Set([norm(base)]);
  for(const x of [...pool, ...(key==="en"||glossLang(c)==="ru" ? shuffle(FILLER) : [])]){ const v=key==="en"?x.en:glossOf(x); if(!seen.has(norm(v))){ seen.add(norm(v)); out.push(v); } if(out.length>=n) break; }
  return out;
}
function stepChoice(round, id){
  const c=cardOf(id);
  let ask = round.dir==="fwd" ? front(c) : back(c);
  let ans = round.dir==="fwd" ? back(c) : front(c);
  if(!c.ru && ans.t!==c.en) [ask, ans] = [ans, ask];   // у карточки только определение: всегда угадываем слово по определению
  const key = ans.t===c.en ? "en" : "g";
  const askT = ask.t===c.en ? ask.t : maskDef(c, ask.t);
  const opts = shuffle([ans.t, ...distractors(c, key)]);
  body().innerHTML = head("choice") + `
  <div class="flash"><div class="row" style="justify-content:center;flex-wrap:nowrap"><div class="word">${esc(askT)}</div>${ask.t===c.en||c.ru?sayBtn(ask.t,ask.l,false):""}</div>${c.ipa&&ask.t===c.en?`<div class="ipa">${esc(c.ipa)}</div>`:""}</div>
  <div class="opts">${opts.map((o,i)=>`<button class="opt" data-o="${i}"><kbd>${i+1}</kbd><span>${esc(o)}</span></button>`).join("")}</div>
  <div class="row" style="justify-content:center"><button type="button" class="btn ghost" id="idk">Не помню</button></div>
  <div id="fb"></div>`;
  if(ask.t===c.en) autoSpeak(ask.t,"en");
  const wrongShown=()=>{
    $("#idk").disabled=true;
    $("#fb").innerHTML=`<div class="feedback no">Правильно: <b>${esc(ans.t)}</b>. Слово вернётся в конце раунда.</div><div class="sess-foot"><button class="btn primary" id="go">Дальше</button></div>`;
    speak(c.en,"en"); $("#go").onclick=()=>done(false,id); $("#go").focus();
  };
  $("#idk").onclick=()=>{
    if(sess.busy) return; sess.busy=true;
    body().querySelectorAll("[data-o]").forEach(x=>{ x.disabled=true; if(opts[+x.dataset.o]===ans.t) x.classList.add("right"); });
    wrongShown();
  };
  body().querySelectorAll("[data-o]").forEach(b=>b.onclick=()=>{
    if(sess.busy) return; sess.busy=true;
    const pick=opts[+b.dataset.o], ok = pick===ans.t;
    body().querySelectorAll("[data-o]").forEach(x=>{ x.disabled=true; if(opts[+x.dataset.o]===ans.t) x.classList.add("right"); });
    if(ok){ if(ans.l==="en") autoSpeak(ans.t,"en"); later(()=>done(true,id), ans.l==="en"?speakPause(ans.t):750); }
    else { b.classList.add("wrong"); wrongShown(); }
  });
}
function stepMatch(round, group){
  const cs=group.map(cardOf).filter(Boolean);
  const left=shuffle(cs), right=shuffle(cs);
  let sel=null, left_n=cs.length; const err=new Set();
  body().innerHTML = head("match", `<span class="chip">${cs.length} ${plural(cs.length,"пара","пары","пар")}</span>`) + `
  <div class="match"><div class="col">${left.map(c=>`<button class="mitem" data-l="${c.id}">${esc(shownText(c,front(c)))}</button>`).join("")}</div>
  <div class="col">${right.map(c=>`<button class="mitem" data-r="${c.id}">${esc(shownText(c,back(c)))}</button>`).join("")}</div></div>`;
  const B=body();
  B.querySelectorAll("[data-l]").forEach(b=>b.onclick=()=>{ B.querySelectorAll("[data-l]").forEach(x=>x.classList.remove("sel")); sel=b.dataset.l; b.classList.add("sel"); const c=cardOf(sel); if(front(c).l==="en") autoSpeak(c.en,"en"); });
  B.querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>{
    if(!sel){ b.classList.add("err"); setTimeout(()=>b.classList.remove("err"),350); return; }
    const L=B.querySelector(`[data-l="${sel}"]`);
    if(b.dataset.r===sel){
      L.classList.add("done"); b.classList.add("done"); L.classList.remove("sel");
      sess.answers++; if(!err.has(sel)) sess.right++;
      sel=null; left_n--;
      if(!left_n) later(()=>{ const r=sess.rounds[sess.r]; r.queue.shift(); sess.done++; next(); }, 350);
    } else {
      if(!err.has(sel)){ err.add(sel); sess.mistakes[sel]++; }
      [L,b].forEach(x=>{ x.classList.add("err"); setTimeout(()=>x.classList.remove("err"),400); });
    }
  });
}
function contextHtml(c){
  const x=rankedExamples(c).find(e=>e.ru); if(!x) return "";
  return `<div class="context">${esc(x.ru)}</div>`;
}
function stepLetters(round, id){
  const c=cardOf(id), target=c.en;
  const chars=[...target];
  const isL = ch => /[\p{L}\p{N}]/u.test(ch);
  const letterIdx = chars.map((ch,i)=>isL(ch)?i:-1).filter(i=>i>=0);
  if(letterIdx.length>26){ // слишком длинно для плиток — переводим в ввод
    return stepTyping(round,id);
  }
  let tiles = shuffle(letterIdx.map((i,k)=>({k, ch:chars[i].toLowerCase()})));
  let pos=0, errors=0, wrongInRow=0;
  body().innerHTML = head("letters") + `
  <div class="flash"><div class="row" style="justify-content:center;flex-wrap:nowrap"><div class="trans" style="font-size:24px;font-weight:600">${esc(maskDef(c))}</div>${c.ru?sayBtn(c.ru,"ru"):""}</div>${contextHtml(c)}</div>
  <div class="slots" id="slots" style="--n:${Math.max(6,...target.split(/\s+/).map(w=>[...w].length))}">${(()=>{ let o="", cur=""; const flush=()=>{ if(cur){ o+=`<span class="swd">${cur}</span>`; cur=""; } }; chars.forEach((ch,i)=>{ if(ch===" "){ flush(); o+=`<span class="slot gap"></span>`; } else cur+= isL(ch) ? `<span class="slot" data-s="${i}"></span>` : `<span class="slot fixed">${esc(ch)}</span>`; }); flush(); return o; })()}</div>
  <div class="tiles" id="tiles"></div><div id="fb"></div>`;
  const renderTiles=()=>{ $("#tiles").innerHTML = tiles.map(t=>`<button class="tile" data-k="${t.k}">${esc(t.ch)}</button>`).join(""); $("#tiles").querySelectorAll("[data-k]").forEach(b=>b.onclick=()=>press(b)); };
  const press = b => {
    if(pos>=letterIdx.length) return;
    const t=tiles.find(x=>String(x.k)===b.dataset.k), need=chars[letterIdx[pos]].toLowerCase();
    if(t.ch===need){
      const slot=$(`[data-s="${letterIdx[pos]}"]`); slot.textContent=chars[letterIdx[pos]]; slot.classList.add("fill");
      tiles=tiles.filter(x=>x!==t); pos++; wrongInRow=0; renderTiles();
      if(pos>=letterIdx.length){ autoSpeak(target,"en"); const ok=errors<2;
        if(ok) later(()=>done(errors===0,id,false), speakPause(target));
        else { $("#fb").innerHTML=`<div class="feedback no">Собрано с ошибками (${errors}). Слово вернётся в конце раунда.</div><div class="sess-foot"><button class="btn primary" id="go">Дальше</button></div>`; $("#go").onclick=()=>done(false,id); $("#go").focus(); }
      }
    } else {
      errors++; wrongInRow++; b.classList.add("err"); setTimeout(()=>b.classList.remove("err"),350);
      if(wrongInRow>=2){ const h=[...$("#tiles").children].find(x=>tiles.find(t=>String(t.k)===x.dataset.k)?.ch===need); h?.classList.add("hint"); }
    }
  };
  renderTiles();
  sess.keyHandler = e=>{ if(e.key.length!==1) return; const k=e.key.toLowerCase(); const btn=[...$("#tiles").children].find(x=>x.textContent===k && tiles.find(t=>String(t.k)===x.dataset.k)?.ch===chars[letterIdx[pos]]?.toLowerCase()) || [...$("#tiles").children].find(x=>x.textContent===k); if(btn){ e.preventDefault(); press(btn); } };
}
function stepCloze(round, id){
  const c=cardOf(id), cz=clozeFor(c);
  if(!cz) return stepTyping(round,id);
  const {x,m}=cz, sen=x.en, before=sen.slice(0,m.index), after=sen.slice(m.index+m.text.length), target=m.text;
  let hinted=false;
  body().innerHTML = head("cloze") + `
  <div class="flash"><div class="cloze-s" id="cz">${esc(before)}<span class="blank" style="min-width:${Math.min(16,Math.max(4,target.length))}ch"></span>${esc(after)}</div>${x.ru?`<div class="context">${esc(x.ru)}</div>`:""}<div class="row" style="justify-content:center;flex-wrap:nowrap"><div class="trans" style="font-size:18px;font-weight:600">${esc(maskDef(c))}</div>${c.ru?sayBtn(c.ru,"ru"):""}</div></div>
  <form id="tf" class="stack" style="gap:10px"><input class="input type-in" id="ti" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="впишите слово" aria-label="Пропущенное слово">
  <button class="btn primary wide" type="submit" id="check">Проверить</button><div class="row hintrow"><button type="button" class="btn ghost" id="hint">Подсказка</button><button type="button" class="btn ghost" id="dunno">Не помню</button></div></form>
  <div id="fb"></div>`;
  const ti=$("#ti"); ti.focus();
  const fillIn=ok=>{ $("#cz").innerHTML=`${esc(before)}<span class="blank fill ${ok?"right":"wrong"}">${esc(target)}</span>${esc(after)}`; };
  const accept=v=>{ const a=norm(v), t=norm(target); if(a===t) return "exact"; if(t.length>=5 && lev(a,t)<=1) return "typo"; return null; };
  const finishWrong=shown=>{
    ti.disabled=true; ti.classList.add("wrong"); $("#check").disabled=true; $("#hint").disabled=true; $("#dunno").disabled=true; fillIn(false);
    $("#fb").innerHTML=`<div class="feedback no">${shown?"":"Не совсем. "}Нужно: <b>${esc(target)}</b>${norm(target)!==norm(c.en)?` <span class="muted">(слово из карточки: ${esc(c.en)})</span>`:""}</div><div class="sess-foot"><button class="btn primary" id="go">Дальше</button></div>`;
    autoSpeak(sen,"en"); $("#go").onclick=()=>done(false,id); $("#go").focus();
  };
  $("#tf").onsubmit=e=>{
    e.preventDefault(); if(sess.busy) return;
    const v=ti.value; if(!v.trim()) return;
    const r=accept(v);
    if(r){ sess.busy=true; ti.classList.add("right"); ti.disabled=true; fillIn(true); autoSpeak(sen,"en");
      if(r==="typo"){ $("#fb").innerHTML=`<div class="feedback ok">Засчитано, но с опечаткой: <b>${esc(target)}</b></div><div class="sess-foot"><button class="btn primary" id="go">Дальше</button></div>`; $("#go").onclick=()=>done(!hinted,id,false); $("#go").focus(); }
      else later(()=>done(!hinted,id,false), speakPause(sen));
    } else { sess.busy=true; finishWrong(false); }
  };
  $("#hint").onclick=()=>{
    hinted=true; const cur=ti.value; let i=0;
    while(i<cur.length && i<target.length && cur[i].toLowerCase()===target[i].toLowerCase()) i++;
    ti.value=target.slice(0,i+1); ti.focus();
    if(i+1>=target.length){ sess.busy=true; finishWrong(true); }
  };
  $("#dunno").onclick=()=>{ sess.busy=true; finishWrong(true); };
}
/* сравнение ответа с карточкой: без «to», без sb/sth и скобок («flat (BrE)»), сокращения равны полным формам (it\'s = it is) */
const expandC = s => s.replace(/\bwon't\b/g,"will not").replace(/\bcan't\b/g,"can not").replace(/\bcannot\b/g,"can not").replace(/n't\b/g," not").replace(/'m\b/g," am").replace(/'re\b/g," are").replace(/'ve\b/g," have").replace(/'ll\b/g," will").replace(/'d\b/g," would").replace(/\b(it|that|what|he|she|there|here|who|where)'s\b/g,"$1 is").replace(/\blet's\b/g,"let us");
function answerMatch(v, target){
  const forms=new Set(), t=norm(target), core=norm(coreOf(target));
  [t, t.replace(/^to /,""), core, core.replace(/^to /,"")].forEach(f=>{ if(f){ forms.add(f); forms.add(expandC(f)); } });
  const a=norm(v), a2=a.replace(/^to /,""), aE=expandC(a), a2E=expandC(a2);
  if([a,a2,aE,a2E].some(x=>forms.has(x))) return "exact";
  let d=9; for(const f of forms) if(f.length>=5) d=Math.min(d, lev(a,f), lev(a2,f), lev(aE,f), lev(a2E,f));
  return d<=1 ? "typo" : null;
}
function stepTyping(round, id){
  const c=cardOf(id), target=c.en;
  let hinted=false;
  body().innerHTML = head("typing") + `
  <div class="flash"><div class="row" style="justify-content:center;flex-wrap:nowrap"><div class="trans" style="font-size:24px;font-weight:600">${esc(maskDef(c))}</div>${c.ru?sayBtn(c.ru,"ru"):""}</div>${contextHtml(c)}</div>
  <form id="tf" class="stack" style="gap:10px"><input class="input type-in" id="ti" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="по-английски" aria-label="Ответ по-английски">
  <button class="btn primary wide" type="submit" id="check">Проверить</button><div class="row hintrow"><button type="button" class="btn ghost" id="hint">Подсказка</button><button type="button" class="btn ghost" id="dunno">Не помню</button></div></form>
  <div id="fb"></div>`;
  const ti=$("#ti"); ti.focus();
  const accept = v => answerMatch(v, target);
  const finishWrong = (shown)=>{
    ti.disabled=true; ti.classList.add("wrong"); $("#check").disabled=true; $("#hint").disabled=true; $("#dunno").disabled=true;
    $("#fb").innerHTML=`<div class="feedback no">${shown?"":"Не совсем. "}Правильно: <b>${esc(target)}</b> ${c.ipa?`<span class="ipa">${esc(c.ipa)}</span>`:""}</div><div class="sess-foot"><button class="btn primary" id="go">Дальше</button></div>`;
    autoSpeak(target,"en"); $("#go").onclick=()=>done(false,id); $("#go").focus();
  };
  $("#tf").onsubmit = e=>{
    e.preventDefault(); if(sess.busy) return;
    const v=ti.value; if(!v.trim()) return;
    const r=accept(v);
    if(r){ sess.busy=true; ti.classList.add("right"); ti.disabled=true; autoSpeak(target,"en");
      if(r==="typo"){ $("#fb").innerHTML=`<div class="feedback ok">Засчитано, но с опечаткой: <b>${esc(target)}</b></div><div class="sess-foot"><button class="btn primary" id="go">Дальше</button></div>`; $("#go").onclick=()=>done(!hinted,id,false); $("#go").focus(); }
      else later(()=>done(!hinted,id,false), speakPause(target));
    } else { sess.busy=true; finishWrong(false); }
  };
  $("#hint").onclick=()=>{
    hinted=true; const cur=ti.value; let i=0; const t=target;
    while(i<cur.length && i<t.length && cur[i].toLowerCase()===t[i].toLowerCase()) i++;
    ti.value=t.slice(0,i+1); ti.focus();
    if(i+1>=t.length){ sess.busy=true; finishWrong(true); }
  };
  $("#dunno").onclick=()=>{ sess.busy=true; finishWrong(true); };
}
document.addEventListener("keydown", e=>{
  if($("#sess").hidden) return;
  if(e.target.closest?.("#sessMenu")) return;
  if($("#qc")){ if(e.key==="Escape") $("#qc").remove(); return; }
  if(e.key==="Escape"){ askClose(); return; }
  const round=sess?.rounds[sess.r]; if(!round) return;
  if(round.type==="letters" && sess.keyHandler && !e.ctrlKey && !e.metaKey){ sess.keyHandler(e); return; }
  if(round.type==="choice" && /^[1-4]$/.test(e.key)){ $(`[data-o="${+e.key-1}"]`)?.click(); }
  if(e.key==="Enter" && !["INPUT","BUTTON","TEXTAREA","SELECT"].includes(document.activeElement?.tagName)){ const g=$("#go")||$("#iNext"); if(g){ e.preventDefault(); g.click(); } }
});

/* меню «⋯»: добавить тег текущему слову, не затрагивая тренировку */
function closeSessMenu(){ const m=$("#sessMenu"); if(m) m.hidden=true; }
$("#sessMore").onclick=e=>{
  e.stopPropagation();
  const m=$("#sessMenu"); if(!m.hidden){ m.hidden=true; return; }
  const c=sess&&sess.cur&&cardOf(sess.cur); if(!c) return;
  m.innerHTML=`<b>Теги слова «${esc(c.en)}»</b>
    <label class="f"><input class="input" id="sm-tags" autocomplete="off" value="${esc(c.tags.join(", "))}" placeholder="например: работа, поездка" maxlength="200" aria-label="Теги"></label>
    <div class="tagchips"></div>
    <div class="small muted">Слово останется в текущей подборке, его прогресс не изменится.</div>
    <div class="row" style="justify-content:flex-end"><button class="btn" id="sm-cancel" type="button">Отмена</button><button class="btn primary" id="sm-save" type="button">Сохранить</button></div>`;
  m.hidden=false; syncTagBox(m); hideTip();
  $("#sm-cancel").onclick=closeSessMenu;
  $("#sm-save").onclick=()=>{ c.tags=parseTags($("#sm-tags").value); Store.saveCard(c); closeSessMenu(); toast("Теги сохранены"); };
  $("#sm-tags").onkeydown=ev=>{ ev.stopPropagation(); if(ev.key==="Enter"){ ev.preventDefault(); $("#sm-save").click(); } if(ev.key==="Escape"){ closeSessMenu(); } };
  $("#sm-tags").focus();
};
document.addEventListener("click",e=>{ const m=$("#sessMenu"); if(m && !m.hidden && !e.target.closest("#sessMenu,#sessMore")) m.hidden=true; });
/* слова, у которых не осталось ни одного задания: их можно засчитать при досрочном выходе */
function doneIdsNow(){
  const rem=new Set(); for(const r of sess.rounds) for(const q of r.queue){ if(Array.isArray(q)) q.forEach(x=>rem.add(x)); else rem.add(q); }
  return {done:sess.ids.filter(id=>!rem.has(id) && Store.cards.has(id)), rem};
}
function earlyFinish(){
  const {done,rem}=doneIdsNow(); if(!done.length){ closeSess(); return; }
  $("#qc")?.remove();
  [...rem].forEach(id=>runSeen.delete(id));       // недопройденные слова не пропадают из подборки
  sess.ids=done; sess.rounds.forEach(r=>{ r.queue=[]; });
  next();                                          // очереди пусты: откроется итог и засчитаются пройденные слова
}
function askClose(){
  if(!sess || sess.finished){ closeSess(); return; }
  if($("#qc")) return; // окно подтверждения уже открыто: второе не создаём
  const nd=doneIdsNow().done.length, practice=sess.kind==="practice";
  const w=document.createElement("div"); w.id="qc"; w.className="qc-wrap"; w.setAttribute("role","dialog"); w.setAttribute("aria-modal","true");
  w.innerHTML=`<div class="qc-box"><b style="font-size:18px">Выйти из тренировки?</b><span class="muted small">Прогресс слов засчитывается, когда слово пройдено до конца. Незаконченную тренировку можно продолжить на вкладке «Учить»: она хранится 3 дня и только на этом устройстве.${nd&&!practice?` Полностью пройдено слов: ${nd}, их можно засчитать сейчас.`:""}</span><div class="row"><button class="btn" id="qn" type="button">Остаться</button>${nd&&!practice?`<button class="btn" id="qe" type="button">Засчитать ${nd} и выйти</button>`:""}<button class="btn primary" id="qy" type="button">Выйти</button></div></div>`;
  $("#sess").appendChild(w);
  $("#qn").onclick=()=>w.remove(); $("#qy").onclick=closeSess; if($("#qe")) $("#qe").onclick=earlyFinish;
  w.addEventListener("click",e=>{ if(e.target===w) w.remove(); });
  $("#qn").focus();
}
$("#sessClose").onclick=askClose;
function closeSess(){ try{ speechSynthesis.cancel(); }catch{} $("#qc")?.remove(); $("#sess").hidden=true; document.body.style.overflow=""; sess=null; if(Nav.sess){ Nav.sess=false; Nav.pop(); } renderAll(); }

function finish(){
  sess.finished=true; updateBar(); $("#sessMore").hidden=true; closeSessMenu(); clearSavedSess();
  const now=Date.now(), rows=[], practice=sess.kind==="practice", kind=sess.kind;
  let learnedN=0, reviewedN=0, rfN=0; const load=dueLoad(), changed=[];
  for(const id of sess.ids){
    const c=cardOf(id); if(!c) continue;
    const m=sess.mistakes[id], skip=sess.skipped.has(id), wasNew=!c.box;
    if(!skip && m>=1){ c.errs=(c.errs||0)+1; changed.push(c); }   // ошибка = слово хоть раз ответили неверно в этой подборке (не больше одной за подборку)
    if(practice){ rows.push({c,m,skip,ok:!m,note:""}); continue; }   // тренировка: прогресс не трогаем
    let ok=false, note="";
    if(skip || m===0){
      c.box = skip ? (wasNew?4:Math.min(7,c.box+1)) : (wasNew?2:Math.min(7,c.box+1));
      c.fails=0; c.due=schedDue(c.box,load); c.reps++; ok=true;
      wasNew?learnedN++:reviewedN++;
    } else if(m===1){
      // одна ошибка за тренировку: считаем промахом. Новое слово получает 1-й уровень, у повторяемого уровень сохраняется
      if(wasNew) c.box=1;
      c.due=schedDue(c.box,load); c.reps++; ok=true; note=wasNew?"одна ошибка: повторим скорее":"одна ошибка: уровень не снижен";
      wasNew?learnedN++:reviewedN++;
    } else {
      // неудача = две и больше ошибок за тренировку: слово не освоено, считается один раз
      if(c.box>1){ c.box--; c.lapses++; note=`уровень снижен до ${c.box}`; }
      else note="не изучено, слово останется в подборке";
      c.fails=Math.min(99,c.fails+1);
      if(!wasNew) c.due=Math.min(c.due, now);   // забытое слово возвращается в тот же день, как в Anki
      if(!wasNew) rfN++;
      if(c.fails>=3) note+=(note?"; ":"")+"проблемное слово: поправьте карточку";
    }
    c.last=now; if(!changed.includes(c)) changed.push(c);
    rows.push({c,m,skip,ok,note});
  }
  if(changed.length) Store.saveMany(changed);
  const k=dayKey(); const d=Store.stats.days[k] ||= emptyDay();
  d.n+=rows.length; d.learned+=learnedN; d.reviewed+=reviewedN; d.rf=(d.rf||0)+rfN; d.right+=sess.right; d.total+=sess.answers;
  const wasClosed=!!d.closed; if(!practice && goalState().closed) d.closed=true; else if(d.closed===undefined) d.closed=false;
  const justClosed=!wasClosed && !!d.closed;
  Store.saveStats();
  const gs=goalState();
  const acc = sess.answers ? Math.round(sess.right/sess.answers*100) : 100;
  const clean=rows.filter(r=>!r.m).length, okN=rows.filter(r=>r.ok).length;
  const more=pickPool(kind).length;
  const title = practice?"Тренировка завершена":"Обучение завершено";
  const sub = practice ? "Прогресс слов не изменился: они вернутся на повторение в свой срок." : `Изучено на текущем уровне: ${okN} из ${rows.length}`;
  body().innerHTML = `<div class="flash" style="gap:6px"><div class="label">${title}</div>
    <div class="bignum" style="font-size:52px">${acc}%</div><div class="muted">точность · ${rows.length} ${plural(rows.length,"слово","слова","слов")}</div><div class="small muted">${sub}</div>${practice?"":`<div class="small" style="margin-top:6px"><b>Цель дня:</b> новые ${gs.newDone}/${gs.newTarget} · повторения ${gs.revDone}/${gs.revTarget}${justClosed?` · <b>день закрыт!</b> Серия: ${streakInfo().n} ${plural(streakInfo().n,"день","дня","дней")}`:gs.closed?" · день закрыт":""}</div>`}</div>
    ${(()=>{ if(practice) return ""; const t0=startOfDay()+DAY, all=allCards().filter(c=>c.box>0), tom=all.filter(c=>c.due>=t0 && c.due<t0+DAY).length, three=all.filter(c=>c.due>=t0 && c.due<t0+3*DAY).length; return `<div class="small muted" style="text-align:center">Что дальше: ${tom?`завтра вернётся ${tom} ${plural(tom,"слово","слова","слов")}`:"завтра повторений нет"}${three>tom?`, а в ближайшие три дня всего ${three}`:""}. Приходите, когда придёт срок: так слова запоминаются надолго.</div>`; })()}
    <div class="sum-list">${rows.map(r=>`<div class="sum-row"><b>${esc(r.c.en)}</b><span class="${r.ok?"ok":"no"}">${r.skip?"уже знаю":r.m?`ошибок: ${r.m}`:"без ошибок"} · ${practice?dueLabel(r.c):r.ok?dueLabel(r.c)+(r.note?" · "+r.note:""):r.note}</span></div>`).join("")}</div>
    <div class="sess-foot">${practice&&clean?`<button class="btn" id="master" data-tip="Поставит словам без ошибок из этой тренировки прогресс 100%: они уйдут на очень долгий повтор (через 90 дней).">Считать выученными (${clean})</button>`:""}${more?`<button class="btn primary" id="more">${practice?"Тренировать далее":"Изучать далее"}</button>`:""}<button class="btn" id="fin">Закончить</button></div>`;
  $("#fin").onclick=closeSess;
  if($("#master")) $("#master").onclick=()=>{ rows.filter(r=>!r.m).forEach(r=>masterCard(r.c)); toast("Слова отмечены выученными"); $("#master").remove(); };
  if($("#more")) $("#more").onclick=()=>{ sess=null; startRun(kind,false); };
}
/* вручную сделать слово выученным: прогресс 100% */
function masterCard(c){ const now=Date.now(); c.box=7; c.fails=0; c.due=startOfDay(now)+INTERVALS[7]*DAY; c.reps++; c.last=now; Store.saveCard(c); }

/* ============ progress ============ */
function renderStats(){
  const el=$("#v-stats"), cs=allCards();
  setTimeout(()=>bindGo(el));
  const cnt={new:0,learning:0,known:0}; cs.forEach(c=>cnt[status(c)]++);
  const days=Store.stats.days||{}; let right=0,total=0; Object.values(days).forEach(d=>{right+=d.right||0; total+=d.total||0;});
  const st=streakInfo(), wd=["вс","пн","вт","ср","чт","пт","сб"];
  const wk=[]; for(let i=6;i>=0;i--){ const t=Date.now()-i*DAY; wk.push({t, n:days[dayKey(t)]?.learned||0}); }
  const wmax=Math.max(1,...wk.map(a=>a.n)), wsum=wk.reduce((s,a)=>s+a.n,0);
  const top=cs.filter(c=>c.errs>0).sort((a,b)=>b.errs-a.errs||b.last-a.last).slice(0,10);
  const TIPS={
    known:"Слова, которые вы хорошо запомнили: с 4-го уровня, следующий повтор не раньше чем через 8 дней. В списке слов они стоят в фильтре «Изучено».",
    work:"Слова, которые вы уже начали учить, но они ещё не дошли до 4-го уровня.",
    acc:"Точность — доля правильных ответов во всех упражнениях за всё время: выбор перевода, пары, сборка из букв и ввод. Правильным считается ответ с первой попытки и без подсказки. Знакомство с карточкой не учитывается.",
    week:"Сколько новых слов вы брали в работу в каждый из последних 7 дней: слово засчитывается, когда вы прошли его в обучении.",
    top:"Ошибка — это когда слово хотя бы раз ответили неверно за одну подборку. За одну подборку слову засчитывается не больше одной ошибки."
  };
  const tip=t=>`<button class="tip" type="button" aria-label="Пояснение" data-tip="${esc(t)}">?</button>`;
  el.innerHTML=`
  <div class="sec-head" style="margin-top:4px"><h2>Ваш прогресс</h2><button class="pill-link" data-go="learn">Учить</button></div>
  <div class="kpis">
    <div class="kpi"><b>${cs.length}</b><span>всего карточек</span></div>
    <div class="kpi"><b>${cnt.learning}</b><span>в работе${tip(TIPS.work)}</span><small>из ${cs.length}</small></div>
    <div class="kpi"><b>${cnt.known}</b><span>завершены${tip(TIPS.known)}</span><small>с 4-го уровня</small></div>
    <div class="kpi"><b>${total?Math.round(right/total*100)+"%":"—"}</b><span>точность ответов${tip(TIPS.acc)}</span><small>${total?`верных ${right} из ${total}`:"пока нет ответов"}</small></div>
  </div>
  <div class="panel">
    <div class="row" style="justify-content:space-between"><div class="label">Слов взято в работу за 7 дней${tip(TIPS.week)}</div><span class="small muted">всего: ${wsum} · серия: ${st.n} ${plural(st.n,"день","дня","дней")}</span></div>
    <div class="bars">${wk.map((a,i)=>`<div class="bar"><em>${a.n||""}</em><i class="${i===6?"today":""}" style="height:${a.n/wmax*100}%"></i></div>`).join("")}</div>
    <div class="bar-labels">${wk.map((a,i)=>`<span>${i===6?"сег.":wd[new Date(a.t).getDay()]}</span>`).join("")}</div>
  </div>
  <div class="panel stack" style="gap:8px">
    <div class="label">Топ-10 трудных слов${tip(TIPS.top)}</div>
    ${top.length? top.map((c,i)=>`<div class="row" style="justify-content:space-between"><span><span class="muted">${i+1}.</span> <b>${esc(c.en)}</b> <span class="muted">— ${esc(glossOf(c))}</span></span><span class="chip">${c.errs} ${plural(c.errs,"ошибка","ошибки","ошибок")}</span></div>`).join("") : `<div class="muted small">Пока пусто: сюда попадут слова, в которых вы чаще всего ошибаетесь.</div>`}
  </div>`;
}

/* ============ settings ============ */
/* загрузка резервной копии: карточки с тем же id заменяются, только если в копии прогресс не старее (иначе остаётся более свежая версия в колоде) */
function importBackup(text){
  let d; try{ d=JSON.parse(text); }catch{ toast("Не получилось прочитать JSON — проверьте, что скопирован целиком"); return; }
  const raw=Array.isArray(d)?d:(Array.isArray(d?.cards)?d.cards:null);
  const rawN=Array.isArray(d?.notes)?d.notes:[];
  if(!raw && !rawN.length){ toast("В файле нет карточек колоды"); return; }
  const list=[]; let kept=0;
  (raw||[]).slice(0,10000).forEach(r=>{ const c=sanitizeCard(r); if(!c) return; const ex=Store.cards.get(c.id); if(ex && (ex.updated||0)>(c.updated||0) && (ex.reps||0)>=(c.reps||0)){ kept++; return; } list.push(c); });
  if(list.length) Store.saveMany(list);
  let notesIn=0;
  rawN.slice(0,2000).forEach(r=>{ const n=sanitizeNote(r); if(!n) return; const ex=Store.notes.get(n.id); if(ex && (ex.updated||0)>=(n.updated||0)) return; Store.notes.set(n.id,n); Store.saveLocal(); Store.syncNote(n.id); notesIn++; });
  const ds=sanitizeStats(d?.stats); if(Object.keys(ds.days).length){ Store.stats.days={...ds.days, ...Store.stats.days}; Store.saveStats(); }
  const n=list.length; renderAll();
  toast(`Загружено ${n} ${plural(n,"карточка","карточки","карточек")}`+(notesIn?` и ${notesIn} ${plural(notesIn,"заметка","заметки","заметок")}`:"")+(kept?`, ${kept} уже свежее в колоде — не тронуты`:""));
}
function renderPrefs(){
  const s=S(), el=$("#v-prefs");
  const en=voices.filter(v=>/^en/i.test(v.lang)), hasRu=voices.some(v=>/^ru/i.test(v.lang));
  const seg=(key,opts)=>`<div class="seg" data-seg="${key}">${opts.map(([v,l])=>`<button type="button" data-v="${v}" aria-pressed="${s[key]===v}">${l}</button>`).join("")}</div>`;
  const sw=(k,l,d)=>`<div class="setrow"><div class="lbl"><b>${l}</b><span>${d}</span></div><label class="switch"><input type="checkbox" data-mode="${k}" ${s.modes[k]?"checked":""} aria-label="${l}"><span></span></label></div>`;
  el.innerHTML=`
  <div class="sec-head" style="margin-top:4px"><h2>Настройки</h2></div>
  <div class="panel">
    <div class="label" style="margin-bottom:4px">Профиль</div>
    <div class="setrow" style="flex-wrap:wrap"><div class="lbl"><b>Имя или ник</b><span>показывается на значке в шапке</span></div><input class="input" id="nick" maxlength="30" autocomplete="nickname" placeholder="Как вас зовут?" value="${esc(s.nick||"")}" style="max-width:220px" aria-label="Имя или ник"></div>
  </div>
  <div class="panel" id="learnPanel">
    <div class="label" style="margin-bottom:4px">Обучение</div>
    <div class="setrow"><div class="lbl"><b>Слов за одну тренировку</b><span>от 5 до 25</span></div><div class="range"><input type="range" id="batch" min="5" max="25" value="${s.batch}" aria-label="Слов за тренировку"><output id="batchOut">${s.batch}</output></div></div>
    <div class="setrow"><div class="lbl"><b>Сначала показывать</b><span>язык лицевой стороны карточки</span></div>${seg("first",[["en","English"],["ru","Русский"]])}</div>
  </div>
  <div class="panel">
    <div class="label" style="margin-bottom:4px">Цель дня</div>
    <div class="setrow"><div class="lbl"><b>Новых слов в день<button class="tip" type="button" aria-label="Пояснение" data-tip="Столько новых слов нужно выучить, чтобы день считался закрытым. Можно учить и больше, но этого достаточно для серии.">?</button></b><span>сколько слов вы хотите выучить за день</span></div>${seg("goal",[[3,"3"],[5,"5"],[10,"10"],[15,"15"],[20,"20"],[30,"30"],[50,"50"]])}</div>
    <div class="setrow"><div class="lbl"><b>Лимит повторений в день<button class="tip" type="button" aria-label="Пояснение" data-tip="Сколько повторений нужно пройти за день. Если слов на повторении больше, показываем самые важные, остальные подождут. Так большая колода не превращается в гору долгов.">?</button></b><span>больше не требуется для закрытия дня</span></div>${seg("revCap",[[15,"15"],[25,"25"],[40,"40"],[60,"60"],[100,"100"]])}</div>
    <div class="setrow"><div class="lbl"><b>Уровень английского<button class="tip" type="button" aria-label="Пояснение" data-tip="Влияет на подбор примеров: сначала показываем те, где мало незнакомых слов и нет лишней длины. Слова из вашей колоды с уровнем 2 и выше считаются знакомыми.">?</button></b><span>для подбора понятных примеров</span></div>${seg("level",[["A2","A2"],["B1","B1"],["B2","B2"],["C1","C1"]])}</div>
  </div>
  <div class="panel">
    <div class="label" style="margin-bottom:4px">Форматы упражнений</div>
    ${sw("choice","Выбор перевода","4 варианта, в обе стороны")}
    ${sw("match","Сопоставление пар","до 5 пар на экране")}
    ${sw("letters","Сборка из букв","слово собирается из перемешанных букв")}
    ${sw("cloze","Пропуск в предложении","нужно вписать слово в нужной форме, берётся из примера карточки")}
    ${sw("typing","Ввод с клавиатуры","без подсказки буквами")}
  </div>
  <div class="panel">
    <div class="label" style="margin-bottom:4px">Произношение</div>
    <div class="setrow"><div class="lbl"><b>Озвучивать автоматически</b><span>${hasRu?"":"русский голос в этом браузере не найден"}</span></div>${seg("audio",[["off","Нет"],["en","English"],["both","Оба языка"]])}</div>
    <div class="setrow"><div class="lbl"><b>Записи носителей</b><span>если в словаре есть аудио, играть его вместо синтеза речи</span></div><label class="switch"><input type="checkbox" id="native" ${s.native!==false?"checked":""} aria-label="Записи носителей"><span></span></label></div>
    <div class="setrow"><div class="lbl"><b>Скорость речи</b><span>${s.rate.toFixed(1)}×</span></div><div class="range"><input type="range" id="rate" min="0.6" max="1.2" step="0.1" value="${s.rate}" aria-label="Скорость речи"></div></div>
    <div class="setrow"><div class="lbl"><b>Английский голос</b><span>${en.length?en.length+" доступно":"голоса загружаются или недоступны"}</span></div>
      <div class="row" style="flex-wrap:nowrap"><select class="input" id="voice" style="max-width:190px;min-height:40px">${`<option value="">Автовыбор (британский)</option>`+en.map(v=>`<option value="${esc(v.voiceURI)}" ${v.voiceURI===s.voice?"selected":""}>${esc(v.name)} · ${esc(v.lang)}</option>`).join("")}</select>${sayBtn("Nice to meet you","en",false)}</div></div>
  </div>
  ${accountPanel()}
  <div class="panel">
    <div class="label" style="margin-bottom:4px">Данные</div>
    <div class="setrow"><div class="lbl"><b>Хранение</b><span>${Store.mode==="claude"?"в вашем аккаунте Claude, видно с любого устройства":Store.mode==="supa"?"в вашем аккаунте, видно на любом устройстве после входа":"только в этом браузере — войдите в аккаунт или делайте резервную копию"}</span></div></div>
    <div class="setrow"><div class="lbl"><b>Источник переводов</b><span>${SOURCE==="claude"?"Claude":"Викисловарь + MyMemory + Free Dictionary API + Tatoeba"}</span></div></div>
    ${SOURCE==="free"?`<div class="setrow" style="flex-wrap:wrap"><div class="lbl"><b>Email для MyMemory</b><span>Необязательно. Переводчик MyMemory бесплатно переводит около 5 000 символов в день, это примерно 30–50 новых карточек. Если указать email, лимит вырастет до 50 000. Подтверждать почту не нужно, адрес уходит только в MyMemory и сохраняется в ваших настройках.</span></div><input class="input" id="mmEmail" type="email" autocomplete="email" placeholder="you@example.com" value="${esc(s.mmEmail||"")}" style="max-width:260px"></div>`:""}
    ${SOURCE==="free"?`<div class="setrow" style="flex-wrap:wrap"><div class="lbl"><b>Подбор переводов и примеров<button class="tip" type="button" aria-label="Пояснение" data-tip="Колода берёт данные из бесплатных сервисов, у которых есть дневные лимиты. Здесь видно, сколько обращений вы сделали сегодня (оценка по этому браузеру), и можно проверить, отвечают ли сервисы.">?</button></b><span>обращения сегодня и проверка источников</span></div><button class="btn" id="diagBtn" type="button">Проверить</button><div id="diagOut" class="small" style="flex-basis:100%">${usageHtml()}</div></div>`:""}
    <div class="setrow"><div class="lbl"><b>Резервная копия</b><span>сохраните колоду файлом или скопируйте как текст; при загрузке более свежий прогресс в колоде не перезаписывается</span></div><div class="row"><button class="btn" id="expFile">Скачать файл</button><button class="btn" id="impFile">Из файла</button><button class="btn" id="exp">Копировать</button><button class="btn" id="imp">Вставить</button></div><input type="file" id="impFileIn" accept=".json,application/json,text/plain" hidden></div>
    <div class="setrow"><div class="lbl"><b>Очистить колоду</b><span>удалить все карточки и статистику</span></div><button class="btn danger" id="wipe">Очистить</button></div>
    <div id="dataArea"></div>
  </div>`;
  bindAccountPanel(el);
  $("#nick").onchange=e=>{ s.nick=e.target.value.trim().slice(0,30); Store.saveSettings(); renderAcct(); toast(s.nick?"Имя сохранено":"Имя убрано"); };
  if($("#diagBtn")) $("#diagBtn").onclick=runDiag;
  const save=()=>{ Store.saveSettings(); };
  $("#batch").oninput=e=>{ s.batch=+e.target.value; $("#batchOut").textContent=s.batch; };
  $("#batch").onchange=save;
  $("#rate").onchange=e=>{ s.rate=+e.target.value; save(); renderPrefs(); speak("Nice to meet you","en"); };
  $("#voice").onchange=e=>{ s.voice=e.target.value; save(); tts("Nice to meet you","en"); };
  $("#native").onchange=e=>{ s.native=e.target.checked; save(); };
  if($("#mmEmail")) $("#mmEmail").onchange=e=>{ s.mmEmail=e.target.value.trim(); save(); toast(s.mmEmail?"Email сохранён":"Email убран"); };
  el.querySelectorAll("[data-seg]").forEach(g=>g.onclick=e=>{ const b=e.target.closest("button"); if(!b) return; const v=b.dataset.v; s[g.dataset.seg]=/^\d+$/.test(v)?+v:v; save(); renderPrefs(); });
  el.querySelectorAll("[data-mode]").forEach(i=>i.onchange=()=>{ s.modes[i.dataset.mode]=i.checked; if(!Object.values(s.modes).some(Boolean)){ s.modes.choice=true; toast("Хотя бы один формат нужен — оставлен выбор перевода"); renderPrefs(); } save(); });
  $("#exp").onclick=()=>{
    const json=JSON.stringify({cards:allCards(), notes:allNotes(), stats:Store.stats},null,0);
    const done=()=>toast("Колода скопирована");
    const fallback=()=>{ $("#dataArea").innerHTML=`<textarea class="input" id="expText" readonly>${esc(json)}</textarea><p class="small muted">Выделите текст и скопируйте вручную.</p>`; $("#expText").select(); };
    try{ navigator.clipboard.writeText(json).then(done,fallback); }catch{ fallback(); }
  };
  $("#expFile").onclick=()=>{
    const json=JSON.stringify({v:3, exported:new Date().toISOString(), cards:allCards(), notes:allNotes(), stats:Store.stats});
    try{
      const url=URL.createObjectURL(new Blob([json],{type:"application/json"})), a=document.createElement("a");
      a.href=url; a.download="koloda-"+dayKey()+".json"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),4000); toast("Файл с колодой сохранён");
    }catch{ toast("Не получилось сохранить файл: используйте «Копировать»"); }
  };
  $("#impFile").onclick=()=>$("#impFileIn").click();
  $("#impFileIn").onchange=async e=>{ const f=e.target.files?.[0]; e.target.value=""; if(!f) return; if(f.size>30*1024*1024){ toast("Файл слишком большой"); return; } try{ importBackup(await f.text()); }catch{ toast("Не получилось прочитать файл"); } };
  $("#imp").onclick=()=>{
    $("#dataArea").innerHTML=`<div class="stack" style="gap:8px;margin-top:8px"><textarea class="input" id="impJson" placeholder="Вставьте сюда скопированный JSON"></textarea><button class="btn primary" id="impGo">Добавить в колоду</button></div>`;
    $("#impGo").onclick=()=>importBackup($("#impJson").value);
  };
  $("#wipe").onclick=()=>{
    $("#dataArea").innerHTML=`<div class="feedback no" style="margin-top:8px"><div style="margin-bottom:8px">Удалить ${Store.cards.size} ${plural(Store.cards.size,"карточку","карточки","карточек")} и всю статистику?</div><div class="row"><button class="btn" id="wn">Отмена</button><button class="btn primary" id="wy" style="background:var(--bad);border-color:var(--bad)">Удалить всё</button></div></div>`;
    $("#wn").onclick=()=>$("#dataArea").innerHTML="";
    $("#wy").onclick=()=>{ const snap=allCards().map(c=>structuredClone(c)), oldStats=structuredClone(Store.stats); Store.deleteMany([...Store.cards.keys()]); Store.stats={days:{}}; Store.saveStats(); renderAll(); toast("Колода очищена", {label:"Отменить", fn:()=>{ Store.restoreMany(snap); Store.stats=oldStats; Store.saveStats(); renderAll(); toast("Колода возвращена"); }}); };
  };
}

/* ============ accounts (Supabase) ============ */
const CFG = window.KOLODA_CONFIG || {};
const AUTH = { enabled:false };
const SITE_URL = () => CFG.siteUrl || (location.origin + location.pathname);
const GOOGLE_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h6c-.3 1.4-1 2.5-2.2 3.3v2.8h3.6c2.1-1.9 3.2-4.8 3.2-8.1z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.4-2.7l-3.6-2.8c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2v2.9C3.8 20.5 7.6 23 12 23z"/><path fill="#FBBC05" d="M5.7 14c-.2-.7-.4-1.3-.4-2s.1-1.4.4-2V7.1H2C1.4 8.6 1 10.3 1 12s.4 3.4 1 4.9L5.7 14z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2C17.5 2.1 15 1 12 1 7.6 1 3.8 3.5 2 7.1L5.7 10c.9-2.6 3.4-4.6 6.3-4.6z"/></svg>';
function authErr(e){
  const c=e?.code||"", m=(e?.message||"").toLowerCase();
  if(c==="invalid_credentials"||m.includes("invalid login")) return "Неверный email или пароль.";
  if(c==="user_already_exists"||m.includes("already registered")) return "Этот email уже зарегистрирован. Войдите или восстановите пароль.";
  if(c==="weak_password"||m.includes("password should")) return "Пароль слишком простой: минимум 8 символов, буквы и цифры.";
  if(c==="email_not_confirmed") return "Подтвердите email по ссылке из письма и войдите снова.";
  if(c.startsWith("over_")||m.includes("rate limit")) return "Слишком много попыток. Подождите несколько минут.";
  if(c==="email_address_invalid"||m.includes("invalid email")) return "Проверьте адрес email.";
  if(m.includes("fetch")||m.includes("network")) return "Нет связи с сервером. Проверьте интернет.";
  if(c==="same_password") return "Новый пароль совпадает со старым.";
  if(c==="signup_disabled"||m.includes("signups not allowed")) return "Регистрация на сервере выключена. Владельцу: Supabase → Authentication → Sign In / Providers → включите «Allow new users to sign up».";
  if(c==="email_provider_disabled"||m.includes("email logins are disabled")) return "Вход по email выключен на сервере. Владельцу: Supabase → Authentication → Sign In / Providers → Email → Enable.";
  if(c==="unexpected_failure"||m.includes("sending") && m.includes("email")) return "Сервер не смог отправить письмо подтверждения. Владельцу: Supabase → Authentication → Sign In / Providers → Email → выключите «Confirm email».";
  if(c==="validation_failed"||c==="bad_json") return "Сервер не принял данные. Проверьте email и пароль.";
  if(e?.status===401||e?.status===403||m.includes("invalid api key")||m.includes("apikey")) return "Сервер отклонил ключ доступа. Владельцу: проверьте ключ в config.js.";
  return "Не получилось. Попробуйте ещё раз. (код: "+(c||e?.status||(e?.message||"неизвестно").slice(0,80))+")";
}
async function initAuth(){
  if(Store.mode==="claude") return;
  if(!CFG.supabaseUrl || !CFG.supabaseAnonKey || !window.supabase?.createClient) return;
  try{
    Store.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth:{ flowType:"pkce", persistSession:true, autoRefreshToken:true, detectSessionInUrl:true } });
  }catch{ return; }
  AUTH.enabled=true; renderAcct(); if(view==="learn"||view==="prefs") renderView();
  Store.sb.auth.onAuthStateChange((event, session)=>{
    setTimeout(async ()=>{ // вне колбэка, как советует Supabase
      if(event==="PASSWORD_RECOVERY"){ openNewPassword(true); }
      if(session?.user) await Store.useUser(session.user);
      else if(event==="SIGNED_OUT" || (event==="INITIAL_SESSION" && Store.mode==="supa")) Store.useGuest();
      renderAcct();
    },0);
  });
  window.addEventListener("online", ()=>{ setSync(); Store.flush(); });
  window.addEventListener("offline", setSync);
  document.addEventListener("visibilitychange", ()=>{
    if(document.visibilityState==="visible" && Store.mode==="supa" && !sess && Date.now()-Store.lastPull>60000){
      Store.flush().then(()=>Store.pull()).then(()=>{ if(!sess) renderView(); setSync(); }).catch(()=>{});
    }
  });
  setInterval(()=>{ if(Store.mode==="supa" && Store.hasUnsynced()) Store.flush(); }, 30000);
}
function renderAcct(){
  const el=$("#acct"); if(!el) return;
  const em=(Store.mode==="supa" && Store.user) ? (Store.user.email||"") : "";
  const nick=(S().nick||"").trim(), name=nick||em;
  const ini=name ? esc(name.charAt(0).toUpperCase()) : `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>`;
  const login = AUTH.enabled && !em ? `<button class="pill-link" id="loginBtn">Войти</button>` : "";
  el.innerHTML=`${login}<button class="avatar" id="acctBtn" data-tip="Настройки и профиль" title="${esc(name||"Настройки")}" aria-label="Настройки${name?" ("+esc(name)+")":""}" aria-current="${view==="prefs"?"page":"false"}">${ini}</button>`;
  $("#acctBtn").onclick=()=>go("prefs");
  if($("#loginBtn")) $("#loginBtn").onclick=()=>openAuth("signin");
}
function openAuth(mode="signin", msg=""){
  const up = mode==="signup";
  openModal(`<div class="row" style="justify-content:space-between"><h2 class="mtitle">${up?"Регистрация":"Вход"}</h2><button class="icon-btn sm" id="aClose" aria-label="Закрыть"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <p class="muted small" style="margin:0">Слова сохранятся в аккаунте и будут на любом устройстве. Мы храним только ваш email и карточки.</p>
    <div class="seg" style="align-self:flex-start"><button type="button" data-am="signin" aria-pressed="${!up}">Вход</button><button type="button" data-am="signup" aria-pressed="${up}">Регистрация</button></div>
    ${CFG.google?`<button type="button" class="btn wide gbtn" id="aGoogle">${GOOGLE_SVG}Продолжить с Google</button><div class="or"><span>или по email</span></div>`:""}
    <form id="aForm" class="stack" style="gap:12px" novalidate>
      <label class="f">Email<input class="input" id="aEmail" type="email" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" required maxlength="120"></label>
      <label class="f">Пароль<span class="pw"><input class="input" id="aPass" type="password" autocomplete="${up?"new-password":"current-password"}" required minlength="8" maxlength="72"><button type="button" class="pw-eye" id="aEye" aria-label="Показать пароль">показать</button></span></label>
      ${up?`<span class="small muted">Минимум 8 символов, буквы и цифры.</span>
      <label class="row small" style="gap:10px;flex-wrap:nowrap;align-items:flex-start"><input type="checkbox" id="aAgree" style="margin-top:3px;accent-color:var(--pink-strong)"><span>Я прочитал(а) <a href="#" id="aPriv">политику конфиденциальности</a> и согласен(на) на хранение моего email и карточек.</span></label>`:""}
      <div id="aMsg" role="alert">${msg?`<div class="feedback ok small">${esc(msg)}</div>`:""}</div>
      <button class="btn primary wide" type="submit" id="aSubmit">${up?"Создать аккаунт":"Войти"}</button>
      ${up?"":`<button type="button" class="btn ghost" id="aForgot" style="align-self:center">Забыли пароль?</button>`}
    </form>`);
  $("#aClose").onclick=closeModal;
  $("#modalBody").querySelectorAll("[data-am]").forEach(b=>b.onclick=()=>openAuth(b.dataset.am));
  $("#aEye").onclick=()=>{ const p=$("#aPass"); const show=p.type==="password"; p.type=show?"text":"password"; $("#aEye").textContent=show?"скрыть":"показать"; };
  if($("#aPriv")) $("#aPriv").onclick=e=>{ e.preventDefault(); openPrivacy(()=>openAuth("signup")); };
  if($("#aGoogle")) $("#aGoogle").onclick=async ()=>{
    const {error}=await Store.sb.auth.signInWithOAuth({provider:"google", options:{redirectTo:SITE_URL()}});
    if(error) $("#aMsg").innerHTML=`<div class="feedback no small">${esc(authErr(error))}</div>`;
  };
  const say=(t,ok=false)=>$("#aMsg").innerHTML=`<div class="feedback ${ok?"ok":"no"} small">${esc(t)}</div>`;
  if($("#aForgot")) $("#aForgot").onclick=async ()=>{
    const email=$("#aEmail").value.trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ say("Введите email, и мы пришлём ссылку для нового пароля."); $("#aEmail").focus(); return; }
    const b=$("#aForgot"); b.disabled=true;
    const {error}=await Store.sb.auth.resetPasswordForEmail(email,{redirectTo:SITE_URL()});
    b.disabled=false;
    if(error) say(authErr(error));
    else say("Если такой аккаунт есть, мы отправили письмо со ссылкой. Проверьте почту и папку «Спам». Открывайте ссылку в том же браузере, где запрашивали сброс.", true);
  };
  $("#aForm").onsubmit=async e=>{
    e.preventDefault();
    const email=$("#aEmail").value.trim(), pass=$("#aPass").value;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return say("Проверьте адрес email.");
    if(up){
      if(pass.length<8 || !/[A-Za-zА-Яа-яЁё]/.test(pass) || !/\d/.test(pass)) return say("Пароль: минимум 8 символов, буквы и цифры.");
      if(!$("#aAgree").checked) return say("Нужно согласие с политикой конфиденциальности.");
    } else if(!pass) return say("Введите пароль.");
    const b=$("#aSubmit"); b.disabled=true; b.textContent=up?"Создаю…":"Вхожу…";
    const {data,error} = up
      ? await Store.sb.auth.signUp({email, password:pass, options:{emailRedirectTo:SITE_URL()}})
      : await Store.sb.auth.signInWithPassword({email, password:pass});
    b.disabled=false; b.textContent=up?"Создать аккаунт":"Войти";
    if(error) return say(authErr(error));
    if(up && !data.session) return say("Почти готово: откройте письмо и подтвердите email. Ссылку лучше открыть в том же браузере и на том же устройстве, где вы регистрировались. Если не получилось, просто войдите с этим email и паролем.", true);
    closeModal(); toast(up?"Аккаунт создан — слова сохраняются в облаке":"Вы вошли");
  };
  setTimeout(()=>$("#aEmail")?.focus(),50);
}
function openNewPassword(recovery=false){
  openModal(`<h2 class="mtitle">Новый пароль</h2>
    <form id="npForm" class="stack" style="gap:12px">
      <label class="f">Новый пароль<input class="input" id="np1" type="password" autocomplete="new-password" minlength="8" maxlength="72" required></label>
      <label class="f">Ещё раз<input class="input" id="np2" type="password" autocomplete="new-password" minlength="8" maxlength="72" required></label>
      <div id="npMsg" role="alert"></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="npCancel">${recovery?"Не менять, выйти":"Отмена"}</button><button class="btn primary" type="submit">Сохранить</button></div>
    </form>`);
  modalLock=recovery;
  $("#npCancel").onclick=()=>{ closeModal(); if(recovery) doSignOut(); };
  $("#npForm").onsubmit=async e=>{
    e.preventDefault();
    const a=$("#np1").value, b=$("#np2").value, say=t=>$("#npMsg").innerHTML=`<div class="feedback no small">${esc(t)}</div>`;
    if(a.length<8 || !/[A-Za-zА-Яа-яЁё]/.test(a) || !/\d/.test(a)) return say("Минимум 8 символов, буквы и цифры.");
    if(a!==b) return say("Пароли не совпадают.");
    const {error}=await Store.sb.auth.updateUser({password:a});
    if(error) return say(authErr(error));
    closeModal(); toast("Пароль обновлён");
  };
}
async function signOut(){
  if(Store.hasUnsynced()){
    await Store.flush();
    if(Store.hasUnsynced()){
      const area=$("#acctArea");
      area.innerHTML=`<div class="feedback no small">Часть изменений ещё не отправлена: нет связи. Если выйти сейчас, они потеряются.<div class="row" style="margin-top:8px"><button class="btn" id="soNo">Остаться</button><button class="btn danger" id="soYes">Выйти всё равно</button></div></div>`;
      $("#soNo").onclick=()=>area.innerHTML=""; $("#soYes").onclick=()=>doSignOut();
      return;
    }
  }
  doSignOut();
}
async function doSignOut(){
  const prefix=Store.prefix;
  await Store.sb.auth.signOut({scope:"local"}).catch(()=>{});
  Store.clearLocal(prefix); // на общем компьютере после выхода не остаётся ваших слов
  Store.useGuest(); toast("Вы вышли из аккаунта");
}
function accountPanel(){
  if(!AUTH.enabled) return "";
  if(Store.mode!=="supa") return `<div class="panel stack" style="gap:8px">
      <div class="label">Аккаунт</div>
      <div class="row" style="justify-content:space-between"><span class="muted small" style="max-width:46ch">Вы не вошли. Слова хранятся только в этом браузере и могут пропасть при очистке данных.</span>
      <div class="row"><button class="btn primary" data-auth="signup">Регистрация</button><button class="btn" data-auth="signin">Вход</button></div></div>
      <button class="btn ghost small" data-priv style="align-self:flex-start;padding-left:0">Конфиденциальность и источники</button>
    </div>`;
  return `<div class="panel stack" style="gap:6px">
    <div class="label">Аккаунт</div>
    <div class="setrow"><div class="lbl"><b>${esc(Store.user.email||"")}</b><span>${esc($("#sync")?.textContent||"")}</span></div><button class="btn" id="soBtn">Выйти</button></div>
    <div class="setrow"><div class="lbl"><b>Пароль</b><span>сменить пароль для входа по email</span></div><button class="btn" id="pwBtn">Сменить</button></div>
    <div class="setrow"><div class="lbl"><b>Удалить аккаунт</b><span>навсегда удалить аккаунт и все карточки с сервера</span></div><button class="btn danger" id="delAcc">Удалить</button></div>
    <button class="btn ghost small" data-priv style="align-self:flex-start;padding-left:0">Конфиденциальность и источники</button>
    <div id="acctArea"></div>
  </div>`;
}
function bindAccountPanel(el){
  el.querySelectorAll("[data-auth]").forEach(b=>b.onclick=()=>openAuth(b.dataset.auth));
  el.querySelectorAll("[data-priv]").forEach(b=>b.onclick=()=>openPrivacy());
  if($("#soBtn")) $("#soBtn").onclick=signOut;
  if($("#pwBtn")) $("#pwBtn").onclick=()=>openNewPassword(false);
  if($("#delAcc")) $("#delAcc").onclick=()=>{
    const area=$("#acctArea");
    area.innerHTML=`<div class="feedback no small stack" style="gap:8px"><span>Аккаунт, все ${Store.cards.size} ${plural(Store.cards.size,"карточка","карточки","карточек")} и заметки по грамматике будут удалены с сервера без возможности восстановления. Чтобы подтвердить, напишите <b>УДАЛИТЬ</b>.</span>
      <input class="input" id="delConfirm" autocomplete="off"><div class="row"><button class="btn" id="delNo">Отмена</button><button class="btn danger" id="delYes" disabled>Удалить навсегда</button></div></div>`;
    $("#delConfirm").oninput=e=>$("#delYes").disabled = e.target.value.trim().toUpperCase()!=="УДАЛИТЬ";
    $("#delNo").onclick=()=>area.innerHTML="";
    $("#delYes").onclick=async ()=>{
      $("#delYes").disabled=true;
      const {error}=await Store.sb.rpc("delete_my_account");
      if(error){ area.innerHTML=`<div class="feedback no small">${esc(authErr(error))}</div>`; return; }
      const prefix=Store.prefix;
      await Store.sb.auth.signOut({scope:"local"}).catch(()=>{});
      Store.clearLocal(prefix); Store.useGuest(); toast("Аккаунт и все данные удалены");
    };
  };
}
function openPrivacy(back){
  openModal(`<h2 class="mtitle">Конфиденциальность и источники</h2>
  <div class="privacy">
    <h3>Что хранится</h3>
    <p>Если вы не вошли — ничего не уходит на сервер: карточки, заметки, настройки и статистика лежат только в вашем браузере.</p>
    <p>Если вы вошли — на сервере хранятся ваш email, карточки (слова, переводы, примеры), заметки по грамматике, настройки и статистика занятий. Больше ничего: ни имени, ни телефона, ни истории посещений.</p>
    <h3>Где и как</h3>
    <p>Данные лежат в базе Supabase в Европейском союзе (Франкфурт). Соединение зашифровано (HTTPS), данные на сервере тоже хранятся в зашифрованном виде. Пароль хранится только в виде необратимого хеша — его не видит никто, включая автора сайта.</p>
    <p>Каждая строчка базы привязана к вашему аккаунту, а правила доступа на сервере пропускают к ней только вас. Другие пользователи не могут ни прочитать, ни изменить ваши карточки.</p>
    <p>Автор сайта как владелец проекта технически имеет доступ к панели управления базой. Данные не продаются, не передаются третьим лицам и не используются для рекламы.</p>
    <h3>Внешние сервисы</h3>
    <p>Чтобы подобрать перевод, транскрипцию и примеры, слово, которое вы вводите, отправляется в <a href="https://mymemory.translated.net" target="_blank" rel="noopener noreferrer">MyMemory</a>, <a href="https://dictionaryapi.dev" target="_blank" rel="noopener noreferrer">Free Dictionary API</a> и <a href="https://tatoeba.org" target="_blank" rel="noopener noreferrer">Tatoeba</a>. Эти сервисы видят ваш IP-адрес, как любой сайт, к которому вы обращаетесь. Уходит только само слово или пример, без email и без привязки к аккаунту. Email уходит в MyMemory, только если вы сами укажете его в настройках для увеличения лимита.</p>
    <p>При входе через Google аккаунт Google лишь подтверждает вашу личность; слова в Google не передаются.</p>
    <p>На сайте нет рекламы, счётчиков и сторонней аналитики. Шрифты и библиотеки загружаются с этого же сайта.</p>
    <h3>Источники данных</h3>
    <p>Переводы: <a href="https://mymemory.translated.net" target="_blank" rel="noopener noreferrer">MyMemory</a>. Транскрипция, определения и записи произношения: <a href="https://dictionaryapi.dev" target="_blank" rel="noopener noreferrer">Free Dictionary API</a>. Примеры предложений с переводом: <a href="https://tatoeba.org" target="_blank" rel="noopener noreferrer">Tatoeba</a>, лицензия CC BY 2.0 FR. Дополнительные примеры и транскрипции фраз: <a href="https://en.wiktionary.org" target="_blank" rel="noopener noreferrer">Викисловарь</a>, лицензия CC BY-SA. Офлайн-транскрипции: CMU Pronouncing Dictionary. Аккаунты и база: <a href="https://supabase.com" target="_blank" rel="noopener noreferrer">Supabase</a>.</p>
    <h3>Ваши права</h3>
    <p>Скопировать все свои данные или скачать их файлом: Настройки → Резервная копия. Удалить аккаунт со всеми данными: Настройки → Аккаунт → Удалить — удаление происходит сразу и навсегда.</p>
  </div>
  <div class="row" style="justify-content:flex-end"><button class="btn primary" id="privOk">${back?"Назад":"Понятно"}</button></div>`);
  $("#privOk").onclick=()=> back ? back() : closeModal();
}

/* ============ подсказки «?» ============ */
const tipPop=document.createElement("div"); tipPop.id="tipPop"; tipPop.className="tip-pop"; tipPop.hidden=true; tipPop.setAttribute("role","tooltip"); document.body.appendChild(tipPop);
let tipBtn=null;
function showTip(b){
  tipBtn=b; tipPop.textContent=b.dataset.tip; tipPop.hidden=false;
  const r=b.getBoundingClientRect(), w=Math.min(300, innerWidth-24); tipPop.style.width=w+"px";
  tipPop.style.left=Math.min(Math.max(12, r.left+r.width/2-w/2), innerWidth-w-12)+"px";
  const hg=tipPop.offsetHeight; let top=r.bottom+8; if(top+hg>innerHeight-12) top=Math.max(12, r.top-hg-8);
  tipPop.style.top=top+"px"; b.setAttribute("aria-describedby","tipPop");
}
function hideTip(){ tipPop.hidden=true; tipBtn?.removeAttribute("aria-describedby"); tipBtn=null; }
const TOUCH = !!(window.matchMedia && matchMedia("(hover: none)").matches);   // на тач-экране подсказки только по кнопке «?»
const tipOk = b => !TOUCH || b.classList.contains("tip");
document.addEventListener("mouseover",e=>{ const b=e.target.closest?.("[data-tip]"); if(b && b!==tipBtn && tipOk(b)) showTip(b); });
document.addEventListener("mouseout",e=>{ const b=e.target.closest?.("[data-tip]"); if(b && !e.relatedTarget?.closest?.("[data-tip]")) hideTip(); });
document.addEventListener("focusin",e=>{ const b=e.target.closest?.("[data-tip]"); if(b && tipOk(b)) showTip(b); });
document.addEventListener("focusout",e=>{ if(e.target.closest?.("[data-tip]")) hideTip(); });
document.addEventListener("click",e=>{ const b=e.target.closest?.(".tip"); if(b){ e.preventDefault(); e.stopPropagation(); showTip(b); } else if(!tipPop.hidden) hideTip(); }, true);
window.addEventListener("scroll",hideTip,{passive:true});
document.addEventListener("keydown",e=>{ if(e.key==="Escape" && !tipPop.hidden) hideTip(); });

/* ============ тур для новичков ============ */
const TOUR_KEY="koloda_tour";
const tourDoneHere=()=>{ try{ return !!localStorage.getItem(TOUR_KEY); }catch{ return false; } };
function markTourDone(){ try{ localStorage.setItem(TOUR_KEY,"1"); }catch{} if(!S().tourDone){ S().tourDone=true; Store.saveSettings(); } }
let tour=null;
function tourSteps(){
  const st=[];
  st.push({title:"Добро пожаловать в Колоду", text:"Покажем за минуту, где что находится. Тур можно пропустить, а потом запустить снова кнопкой «?» рядом с логотипом.", welcome:true});
  st.push({view:"learn", target:".top .tabs", title:"Разделы", text:"Учить: тренировки и повторения. Слова: добавление и список. Прогресс: сколько выучено. Настройки открываются по значку профиля справа вверху: озвучка, форматы упражнений и количество слов."});
  if(AUTH.enabled && Store.mode==="local") st.push({view:"learn", target:"#loginBtn", title:"Создайте аккаунт", text:"Так слова сохранятся в облаке и будут на любом устройстве. Можно и позже, пока колода хранится только в этом браузере."});
  st.push({view:"words", target:"#addForm", title:"Добавляйте слова", text:"Введите слово или фразу на английском или русском. Колода предложит варианты перевода, а к выбранному подтянет транскрипцию, произношение и примеры."});
  st.push({view:"words", target:"details.imp summary", title:"Много слов сразу", text:"Вставьте список: «слово — перевод» или просто слова, перевод подберётся сам."});
  st.push({view:"learn", target:"#v-learn .hero-cta .btn.primary", title:"Учите", text:"Когда в колоде есть слова, здесь кнопка «Учить». Слова идут партиями: знакомство, выбор перевода, пары, вставка в предложение, сборка из букв и ввод с клавиатуры."});
  st.push({view:"stats", target:".kpis", title:"Прогресс и повторения", text:"Слова возвращаются на повторение через 1, 2, 4, 8 дней и дальше, пока не запомнятся надолго. Здесь видно, сколько слов выучено и насколько вы точны."});
  st.push({view:"prefs", target:"#learnPanel", title:"Настройки", text:"Сколько слов учить за раз (от 5 до 25), с какого языка показывать карточки, какие упражнения включить и как озвучивать слова."});
  st.push({title:"Всё готово", text:"Добавьте первое слово или загрузите восемь слов для пробы на главной странице.", last:true});
  return st;
}
function maybeStartTour(){
  if(tour || sess || tourDoneHere() || S().tourDone || Store.cards.size>0 || !$("#modal").hidden) return;
  startTour(false);
}
function startTour(force){
  if(tour) return;
  tour={i:0, steps:tourSteps(), el:null};
  const el=document.createElement("div"); el.id="tour"; el.className="tour";
  el.innerHTML=`<div class="tour-block"></div><div class="tour-spot" hidden></div><div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tourT"><button class="tour-x" type="button" aria-label="Пропустить обучение">×</button><div class="tour-dots"></div><h3 id="tourT"></h3><p id="tourP"></p><div class="tour-btns"></div></div>`;
  document.body.appendChild(el); tour.el=el;
  el.querySelector(".tour-x").onclick=()=>endTour();
  window.addEventListener("resize",tourPlace); window.addEventListener("scroll",tourPlace,{passive:true});
  document.addEventListener("keydown",tourKey,true);
  tourShow(0);
}
function tourKey(e){
  if(!tour) return;
  if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); endTour(); }
  else if(e.key==="ArrowRight"){ e.preventDefault(); tourGo(1); }
  else if(e.key==="ArrowLeft"){ e.preventDefault(); tourGo(-1); }
}
function tourGo(d){
  if(!tour) return; let i=tour.i+d;
  if(i<0) return; if(i>=tour.steps.length){ endTour(); return; }
  tourShow(i, d);
}
function tourShow(i, dir=1){
  const t=tour, st=t.steps[i];
  if(st.view && view!==st.view) go(st.view);
  t.i=i;
  let tgt=st.target?document.querySelector(st.target):null;
  if(st.target && (!tgt || !tgt.getClientRects().length)){ // элемента нет на экране: пропускаем шаг
    const j=i+dir; if(j>=0 && j<t.steps.length){ tourShow(j, dir); return; }
  }
  if(tgt) tgt.scrollIntoView({block:"center", inline:"nearest"});
  const el=t.el;
  el.querySelector(".tour-dots").innerHTML=t.steps.map((_,k)=>`<i class="${k<i?"past":k===i?"on":""}"></i>`).join("");
  el.querySelector("#tourT").textContent=st.title; el.querySelector("#tourP").textContent=st.text;
  const btns=el.querySelector(".tour-btns");
  if(st.welcome) btns.innerHTML=`<button class="btn" type="button" id="tSkip">Пропустить</button><button class="btn primary" type="button" id="tNext">Показать</button>`;
  else if(st.last) btns.innerHTML=`<button class="btn" type="button" id="tBack">Назад</button><button class="btn primary" type="button" id="tNext">Добавить слово</button>`;
  else btns.innerHTML=`<button class="btn" type="button" id="tBack">Назад</button><button class="btn primary" type="button" id="tNext">Далее</button>`;
  if($("#tSkip")) $("#tSkip").onclick=()=>endTour();
  if($("#tBack")) $("#tBack").onclick=()=>tourGo(-1);
  $("#tNext").onclick=()=>{ if(st.last){ endTour("words"); } else tourGo(1); };
  tourPlace(); setTimeout(tourPlace,60); $("#tNext").focus({preventScroll:true});
}
function tourPlace(){
  const t=tour; if(!t) return;
  const st=t.steps[t.i], el=t.el, card=el.querySelector(".tour-card"), spot=el.querySelector(".tour-spot"), block=el.querySelector(".tour-block");
  const W=innerWidth, H=innerHeight, cw=Math.min(360,W-24); card.style.width=cw+"px";
  const tgt=st.target?document.querySelector(st.target):null;
  const r=tgt && tgt.getClientRects().length ? tgt.getBoundingClientRect() : null;
  if(!r){ spot.hidden=true; block.classList.add("dim"); card.style.left=(W-cw)/2+"px"; card.style.top=Math.max(12,(H-card.offsetHeight)/2)+"px"; return; }
  block.classList.remove("dim"); const pad=8;
  spot.hidden=false; spot.style.left=(r.left-pad)+"px"; spot.style.top=(r.top-pad)+"px"; spot.style.width=(r.width+pad*2)+"px"; spot.style.height=(r.height+pad*2)+"px";
  const ch=card.offsetHeight; let top=r.bottom+pad+12;
  if(top+ch>H-12) top=r.top-pad-12-ch;
  if(top<12) top=(r.top>H-r.bottom)?12:H-ch-12;
  card.style.left=Math.max(12,Math.min(r.left+r.width/2-cw/2, W-cw-12))+"px"; card.style.top=top+"px";
}
function endTour(next){
  if(!tour) return;
  window.removeEventListener("resize",tourPlace); window.removeEventListener("scroll",tourPlace); document.removeEventListener("keydown",tourKey,true);
  tour.el.remove(); tour=null; markTourDone();
  go(next||"learn");
  if(next==="words") setTimeout(()=>addInput.focus(),50);
}


/* ---- несколько вкладок: подхватываем изменения, сделанные в другой вкладке ---- */
let tabSyncT=null;
window.addEventListener("storage", e=>{
  if(!e.key || Store.mode==="claude" || !e.key.startsWith(Store.prefix)) return;
  const k=e.key.slice(Store.prefix.length); if(!["cards","notes","settings","stats"].includes(k)) return;
  clearTimeout(tabSyncT);
  tabSyncT=setTimeout(()=>{
    Store.cards=new Map(lsGet(Store.prefix+"cards",[]).map(sanitizeCard).filter(Boolean).map(c=>[c.id,c]));
    Store.notes=new Map(lsGet(Store.prefix+"notes",[]).map(sanitizeNote).filter(Boolean).map(n=>[n.id,n]));
    Store.settings=sanitizeSettings(lsGet(Store.prefix+"settings",{}));
    Store.stats=sanitizeStats(lsGet(Store.prefix+"stats",{days:{}}));
    if(sess){ // убираем из идущей тренировки слова, которых больше нет
      const alive=id=>Store.cards.has(id);
      sess.ids=sess.ids.filter(alive);
      for(const r of sess.rounds) r.queue = r.type==="match" ? r.queue.map(g=>g.filter(alive)).filter(g=>g.length>=2) : r.queue.filter(alive);
      sess.total=sess.done+sess.rounds.reduce((n,r)=>n+r.queue.length,0);
      if(!sess.ids.length) closeSess();
      else if(sess.cur && !alive(sess.cur) && !sess.finished){ next(); }
    } else renderAll();
    toast("Данные обновлены из другой вкладки");
  },120);
});

/* ============ grammar notes ============ */
let gMode="list", gId=null, gDraft=null, gTag="", gQuery="", gSort="new";
const NOTE_MAX_EX=25, NOTE_MAX_MIS=15;
const NOTE_DEMO = { title:"Present Perfect vs Past Simple", tags:["времена"],
  rule:"**Past Simple** — действие закончилось в конкретное время в прошлом. Время названо или понятно из контекста: yesterday, in 2020, last week.\n**Present Perfect** (have / has + третья форма глагола) — важен результат или опыт к настоящему моменту. Времени в предложении нет, либо оно ещё не закончилось: ever, never, just, already, yet.\n- Названо конкретное время → Past Simple.\n- Время не важно, важна связь с настоящим → Present Perfect.",
  examples:[{en:"I've been to London twice.",ru:"Я дважды был в Лондоне."},{en:"I was in London in 2020.",ru:"Я был в Лондоне в 2020 году."},{en:"Susan has lost her key.",ru:"Сьюзен потеряла ключ (его до сих пор нет)."},{en:"Susan lost her key yesterday.",ru:"Сьюзен вчера потеряла ключ."}],
  mistakes:[{bad:"I have seen him yesterday.",good:"I saw him yesterday.",why:"Со словом yesterday нужен Past Simple: время названо."}], mine:"" };
/* простое и безопасное форматирование: **жирный**, строки с «- » становятся списком */
function fmtText(t){
  const inline=x=>esc(x).replace(/\*\*(.+?)\*\*/g,"<b>$1</b>");
  let out="", inList=false;
  for(const raw of String(t||"").split("\n")){
    const m=raw.match(/^\s*[-•]\s+(.*)$/);
    if(m){ if(!inList){ out+="<ul>"; inList=true; } out+="<li>"+inline(m[1])+"</li>"; }
    else { if(inList){ out+="</ul>"; inList=false; } if(raw.trim()) out+="<p>"+inline(raw)+"</p>"; }
  }
  return out+(inList?"</ul>":"");
}
const allNotes = () => [...Store.notes.values()];
const noteTagCounts = () => { const m=new Map(); allNotes().forEach(n=>n.tags.forEach(t=>m.set(t,(m.get(t)||0)+1))); return [...m].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])); };
function noteText(n){ return norm([n.title, n.tags.join(" "), n.rule, n.mine, ...n.examples.map(x=>x.en+" "+x.ru), ...n.mistakes.map(x=>x.bad+" "+x.good+" "+x.why)].join(" ")); }
function filteredNotes(){
  const q=norm(gQuery); let l=allNotes();
  if(gTag) l=l.filter(n=>n.tags.includes(gTag));
  if(q) l=l.filter(n=>noteText(n).includes(q));
  return gSort==="az" ? l.sort((a,b)=>a.title.localeCompare(b.title,"en")) : l.sort((a,b)=>(b.updated||b.created)-(a.updated||a.created));
}
function renderGrammar(){
  const el=$("#v-grammar");
  if(gMode==="edit" && $("#gEdit")) return;           // не стираем недописанную заметку при фоновых обновлениях
  if(gMode==="edit" && !gDraft) gMode="list";
  if(gMode==="read" && !Store.notes.has(gId)) gMode="list";
  if(gMode==="read") return renderNoteRead(el);
  if(gMode==="edit") return renderNoteEdit(el);
  renderNoteList(el);
}
function gGo(mode, id=null){ gMode=mode; gId=id; if(mode!=="edit") gDraft=null; renderGrammar(); window.scrollTo(0,0); }
function noteStatusHtml(){
  return Store.mode==="supa" && Store.notesRemote===false
    ? `<div class="feedback no small">Заметки пока хранятся только на этом устройстве: в базе ещё нет таблицы для них. Чтобы они синхронизировались с аккаунтом, нужно один раз обновить схему базы (supabase/schema.sql).</div>` : "";
}
function renderNoteList(el){
  const tags=noteTagCounts(); if(gTag && !tags.some(([t])=>t===gTag)) gTag="";
  const total=Store.notes.size;
  el.innerHTML=`<div class="sec-head" style="margin-top:4px"><h2>Грамматика</h2><button class="pill-link" type="button" id="gNew">Новая заметка</button></div>
  ${noteStatusHtml()}
  ${total?`<div class="row toolbar">
    <input class="input" id="gSearch" placeholder="Поиск по названию, правилу, примеру или тегу" style="flex:1;min-width:180px" aria-label="Поиск по заметкам" value="${esc(gQuery)}">
    <select class="input sel" id="gSortSel" aria-label="Сортировка"><option value="new"${gSort==="new"?" selected":""}>Сначала новые</option><option value="az"${gSort==="az"?" selected":""}>По алфавиту</option></select>
  </div>
  ${tags.length?`<div class="filters tagfilters" id="gTags"><span class="label">Теги</span>${tags.map(([t,n])=>`<button type="button" class="tagchip${t===gTag?" on":""}" data-gtag="${esc(t)}" aria-pressed="${t===gTag}">${esc(t)} <small>${n}</small></button>`).join("")}</div>`:""}`:""}
  <div id="gBody"></div>`;
  $("#gNew").onclick=()=>startNoteEdit(null);
  if(total){
    $("#gSearch").oninput=e=>{ gQuery=e.target.value; fillNoteList(); };
    $("#gSortSel").onchange=e=>{ gSort=e.target.value; fillNoteList(); };
    el.querySelectorAll("[data-gtag]").forEach(b=>b.onclick=()=>{ gTag = gTag===b.dataset.gtag ? "" : b.dataset.gtag; renderNoteList(el); });
  }
  fillNoteList();
}
function fillNoteList(){
  const body=$("#gBody"); if(!body) return;
  if(!Store.notes.size){
    body.innerHTML=`<div class="panel empty stack" style="align-items:center;text-align:center;gap:12px"><div><b>Здесь будет ваш конспект по грамматике</b><div class="small muted" style="margin-top:4px">Записывайте правило своими словами, примеры с переводом и частые ошибки. Одна тема — одна заметка.</div></div><div class="row" style="justify-content:center"><button class="btn primary" type="button" id="gNew2">Написать первую заметку</button><button class="btn" type="button" id="gDemo" ${tipAttr("Добавит готовую заметку, чтобы посмотреть, как всё выглядит. Её можно изменить или удалить.")}>Пример заметки</button></div></div>`;
    $("#gNew2").onclick=()=>startNoteEdit(null);
    $("#gDemo").onclick=()=>{ const n=sanitizeNote({...NOTE_DEMO, id:gid(), created:Date.now()}); Store.saveNote(n); gGo("read", n.id); };
    return;
  }
  const list=filteredNotes();
  if(!list.length){
    const q=gQuery.trim();
    body.innerHTML=`<div class="panel empty stack" style="align-items:center;text-align:center;gap:12px"><div class="muted">${q?`По запросу «${esc(q)}» ничего не нашлось.`:`С тегом «${esc(gTag)}» пока нет заметок.`}${q&&gTag?" Возможно, мешает выбранный тег.":""}</div><button class="btn" type="button" id="gReset">Сбросить поиск и теги</button></div>`;
    $("#gReset").onclick=()=>{ gQuery=""; gTag=""; renderNoteList($("#v-grammar")); };
    return;
  }
  const snip=n=>{ const t=n.rule.replace(/\*\*/g,"").replace(/^\s*[-•]\s+/gm,"").replace(/\s+/g," ").trim(); return t.length>120?t.slice(0,117).trimEnd()+"…":t; };
  body.innerHTML=`<div class="small muted" style="margin-bottom:6px">${list.length===Store.notes.size?`${list.length} ${plural(list.length,"заметка","заметки","заметок")}`:`${list.length} из ${Store.notes.size}`}</div>
  <div class="glist">${list.map(n=>`<button type="button" class="gitem" data-gopen="${n.id}"><span class="gt"><b>${esc(n.title)}</b>${snip(n)?`<span class="gs">${esc(snip(n))}</span>`:""}${n.tags.length?`<span class="wtags">${n.tags.map(t=>`<span class="tagchip sm">${esc(t)}</span>`).join("")}</span>`:""}</span><span class="gm">${n.examples.length?`${n.examples.length} ${plural(n.examples.length,"пример","примера","примеров")}`:""}</span></button>`).join("")}</div>`;
  body.querySelectorAll("[data-gopen]").forEach(b=>b.onclick=()=>gGo("read", b.dataset.gopen));
}
function renderNoteRead(el){
  const n=Store.notes.get(gId);
  el.innerHTML=`<div class="row"><button class="btn ghost" type="button" id="gBack">← Все заметки</button></div>
  <div class="panel stack gread">
    <div class="row" style="justify-content:space-between;align-items:flex-start;flex-wrap:nowrap"><h2 class="gtitle">${esc(n.title)}</h2><button class="btn" type="button" id="gEditBtn">Изменить</button></div>
    ${n.tags.length?`<div class="wtags">${n.tags.map(t=>`<button type="button" class="tagchip sm" data-gtag2="${esc(t)}" ${tipAttr("Показать все заметки с тегом «"+t+"»")}>${esc(t)}</button>`).join("")}</div>`:""}
    ${n.rule.trim()?`<div><div class="label">Правило</div><div class="grule">${fmtText(n.rule)}</div></div>`:""}
    ${n.examples.length?`<div><div class="label">Примеры</div><ul class="ex-list" style="margin-top:8px">${n.examples.map(x=>`<li>${sayBtn(x.en)}<div><div class="en">${esc(x.en)}</div>${x.ru?`<div class="ru">${esc(x.ru)}</div>`:""}</div></li>`).join("")}</ul></div>`:""}
    ${n.mistakes.length?`<div><div class="label">Частые ошибки</div><div class="stack" style="gap:10px;margin-top:8px">${n.mistakes.map(x=>`<div class="gmis">${x.bad?`<div class="gbad"><span aria-hidden="true">❌</span> <s>${esc(x.bad)}</s></div>`:""}${x.good?`<div class="ggood"><span aria-hidden="true">✅</span> ${esc(x.good)}</div>`:""}${x.why?`<div class="small muted">${esc(x.why)}</div>`:""}</div>`).join("")}</div></div>`:""}
    ${n.mine.trim()?`<div><div class="label">Моя заметка</div><div class="grule">${fmtText(n.mine)}</div></div>`:""}
    ${!n.rule.trim()&&!n.examples.length&&!n.mistakes.length&&!n.mine.trim()?`<div class="small muted">Заметка пока пустая. Нажмите «Изменить», чтобы добавить правило и примеры.</div>`:""}
  </div>`;
  $("#gBack").onclick=()=>gGo("list");
  $("#gEditBtn").onclick=()=>startNoteEdit(n.id);
  el.querySelectorAll("[data-gtag2]").forEach(b=>b.onclick=()=>{ hideTip(); gTag=b.dataset.gtag2; gQuery=""; gGo("list"); });
}
function startNoteEdit(id){
  gId=id; gMode="edit";
  gDraft = id ? structuredClone(Store.notes.get(id)) : {title:"",tags:[],rule:"",examples:[{en:"",ru:""}],mistakes:[],mine:""};
  renderGrammar(); window.scrollTo(0,0);
  if(!id) setTimeout(()=>$("#g-title")?.focus(),50);
}
const RM_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const exRow=(x={})=>`<div class="grow g-ex"><div class="gcols"><input class="input" data-k="en" maxlength="200" placeholder="English" autocomplete="off" spellcheck="false" aria-label="Пример на английском" value="${esc(x.en||"")}"><input class="input" data-k="ru" maxlength="200" placeholder="Перевод" autocomplete="off" aria-label="Перевод примера" value="${esc(x.ru||"")}"></div><button type="button" class="icon-btn sm" data-rm aria-label="Убрать пример">${RM_SVG}</button></div>`;
const misRow=(x={})=>`<div class="grow g-mis"><div class="gcols"><input class="input" data-k="bad" maxlength="200" placeholder="❌ Как говорят неправильно" autocomplete="off" spellcheck="false" aria-label="Неправильный вариант" value="${esc(x.bad||"")}"><input class="input" data-k="good" maxlength="200" placeholder="✅ Как правильно" autocomplete="off" spellcheck="false" aria-label="Правильный вариант" value="${esc(x.good||"")}"><input class="input" data-k="why" maxlength="200" placeholder="Почему (необязательно)" autocomplete="off" aria-label="Пояснение" value="${esc(x.why||"")}"></div><button type="button" class="icon-btn sm" data-rm aria-label="Убрать ошибку">${RM_SVG}</button></div>`;
function collectNote(){
  const rows=(sel,keys)=>[...document.querySelectorAll(sel)].map(r=>Object.fromEntries(keys.map(k=>[k,(r.querySelector(`[data-k="${k}"]`)?.value||"").trim()])));
  return { title:$("#g-title").value.trim(), tags:parseTags($("#g-tags").value), rule:$("#g-rule").value.trim(), mine:$("#g-mine").value.trim(),
    examples:rows("#g-exs .g-ex",["en","ru"]).filter(x=>x.en||x.ru), mistakes:rows("#g-mis .g-mis",["bad","good","why"]).filter(x=>x.bad||x.good||x.why) };
}
function syncNoteTags(){
  const cur=parseTags($("#g-tags").value), all=noteTagCounts().map(([t])=>t).slice(0,16);
  $("#g-tagchips").innerHTML=all.map(t=>`<button type="button" class="tagchip${cur.includes(t)?" on":""}" data-addntag="${esc(t)}" aria-pressed="${cur.includes(t)}">${esc(t)}</button>`).join("");
}
function renderNoteEdit(el){
  const d=gDraft, isNew=!gId;
  el.innerHTML=`<div class="row"><button class="btn ghost" type="button" id="gCancelTop">← ${isNew?"Отмена":"К заметке"}</button></div>
  <div class="panel stack" id="gEdit">
    <h2 class="mtitle">${isNew?"Новая заметка":"Изменить заметку"}</h2>
    <label class="f">Название<input class="input" id="g-title" maxlength="120" autocomplete="off" placeholder="например: Present Perfect vs Past Simple" value="${esc(d.title)}"></label>
    <div><label class="f"><span>Теги <span class="muted">(необязательно, через запятую)</span></span><input class="input" id="g-tags" autocomplete="off" maxlength="200" placeholder="например: времена, артикли" value="${esc(d.tags.join(", "))}"></label><div class="tagchips" id="g-tagchips"></div></div>
    <label class="f"><span>Правило <span class="muted">— своими словами. Строка с «- » станет пунктом списка, **так** выделится жирным</span></span><textarea class="input" id="g-rule" rows="6" maxlength="3000" placeholder="Когда используется, как строится, чем отличается от русского">${esc(d.rule)}</textarea></label>
    <div class="stack" style="gap:8px"><div class="label">Примеры</div><div class="stack" style="gap:10px" id="g-exs">${d.examples.map(exRow).join("")}</div><div><button class="btn" type="button" id="g-addex">+ Пример</button></div></div>
    <div class="stack" style="gap:8px"><div class="label">Частые ошибки</div><div class="stack" style="gap:10px" id="g-mis">${d.mistakes.map(misRow).join("")}</div><div><button class="btn" type="button" id="g-addmis">+ Ошибка ❌ → ✅</button></div></div>
    <label class="f">Моя заметка<textarea class="input" id="g-mine" rows="3" maxlength="1500" placeholder="Что у вас путается, как запомнить, на что обратить внимание">${esc(d.mine)}</textarea></label>
    <div class="row" id="gActions" style="justify-content:space-between">
      <div class="row">${isNew?"":`<button class="btn danger" type="button" id="gDel">Удалить</button>`}</div>
      <div class="row"><button class="btn" type="button" id="gCancel">Отмена</button><button class="btn primary" type="button" id="gSave">Сохранить</button></div>
    </div>
  </div>`;
  syncNoteTags();
  const initial=JSON.stringify(collectNote());
  const dirty=()=>JSON.stringify(collectNote())!==initial;
  const leave=()=>{ gDraft=null; gMode=isNew?"list":"read"; renderGrammar(); window.scrollTo(0,0); };
  const tryLeave=()=>{
    if(!dirty()){ leave(); return; }
    $("#gActions").innerHTML=`<span class="small">Выйти без сохранения?</span><div class="row"><button class="btn" type="button" id="gStay">Остаться</button><button class="btn danger" type="button" id="gOut">Выйти</button></div>`;
    $("#gStay").onclick=()=>renderNoteEditActions(isNew, tryLeave, save, del);
    $("#gOut").onclick=leave;
  };
  const save=()=>{
    const c=collectNote();
    if(!c.title){ toast("Дайте заметке название"); $("#g-title").focus(); return; }
    const base=isNew?{id:gid(), created:Date.now()}:Store.notes.get(gId);
    if(!base){ toast("Эта заметка уже удалена"); leave(); return; }
    const n=sanitizeNote({...base, ...c}); if(!n){ toast("Не получилось сохранить заметку"); return; }
    Store.saveNote(n); gDraft=null; toast("Сохранено"); gGo("read", n.id);
  };
  const del=()=>{
    const n=Store.notes.get(gId); if(!n) return;
    $("#gActions").innerHTML=`<span class="small">Удалить «${esc(n.title)}» насовсем?</span><div class="row"><button class="btn" type="button" id="gNo">Нет</button><button class="btn danger" type="button" id="gYes">Удалить</button></div>`;
    $("#gNo").onclick=()=>renderNoteEditActions(isNew, tryLeave, save, del);
    $("#gYes").onclick=()=>{ const snap=structuredClone(n); Store.deleteNote(n.id); gDraft=null; gGo("list"); toast("Заметка удалена", {label:"Отменить", fn:()=>{ Store.saveNote(snap); renderGrammar(); toast("Заметка возвращена"); }}); };
  };
  $("#gCancelTop").onclick=tryLeave; $("#gCancel").onclick=tryLeave; $("#gSave").onclick=save; if($("#gDel")) $("#gDel").onclick=del;
  $("#g-tags").addEventListener("input",syncNoteTags);
  $("#g-addex").onclick=()=>{ if(document.querySelectorAll("#g-exs .g-ex").length>=NOTE_MAX_EX){ toast("Достаточно: не больше "+NOTE_MAX_EX+" примеров в заметке"); return; } $("#g-exs").insertAdjacentHTML("beforeend",exRow()); $("#g-exs .g-ex:last-child input").focus(); };
  $("#g-addmis").onclick=()=>{ if(document.querySelectorAll("#g-mis .g-mis").length>=NOTE_MAX_MIS){ toast("Достаточно: не больше "+NOTE_MAX_MIS+" ошибок в заметке"); return; } $("#g-mis").insertAdjacentHTML("beforeend",misRow()); $("#g-mis .g-mis:last-child input").focus(); };
  $("#gEdit").addEventListener("click",e=>{ const rm=e.target.closest("[data-rm]"); if(rm) rm.closest(".grow").remove(); });
}
function renderNoteEditActions(isNew, tryLeave, save, del){
  $("#gActions").innerHTML=`<div class="row">${isNew?"":`<button class="btn danger" type="button" id="gDel">Удалить</button>`}</div><div class="row"><button class="btn" type="button" id="gCancel">Отмена</button><button class="btn primary" type="button" id="gSave">Сохранить</button></div>`;
  $("#gCancel").onclick=tryLeave; $("#gSave").onclick=save; if($("#gDel")) $("#gDel").onclick=del;
}
document.addEventListener("click",e=>{ const b=e.target.closest("[data-addntag]"); if(!b) return; const inp=$("#g-tags"); if(!inp) return; const t=b.dataset.addntag; let cur=parseTags(inp.value); cur=cur.includes(t)?cur.filter(x=>x!==t):[...cur,t]; inp.value=cur.join(", "); syncNoteTags(); });

/* ============ routing ============ */
let view="learn";
const VIEWS=["learn","words","grammar","stats","prefs"];
function go(v){
  if(!VIEWS.includes(v)) v="learn"; view=v;
  VIEWS.forEach(x=>$("#v-"+x).hidden = x!==v);
  $("#tabs").querySelectorAll("button").forEach(b=>b.setAttribute("aria-current", b.dataset.view===v?"page":"false"));
  $("#acctBtn")?.setAttribute("aria-current", v==="prefs"?"page":"false");
  try{ history.replaceState(null,"","#"+v); }catch{}
  renderView(); window.scrollTo(0,0);
}
function renderView(){ ({learn:renderLearn, words:renderList, grammar:renderGrammar, stats:renderStats, prefs:renderPrefs})[view](); }
/* одноразово: подтягиваем сроки старых слов под новые, более короткие интервалы; слова с ошибками возвращаем в повтор */
function migrateSched(){
  if(S().sched>=3 || !Store.cards.size) return;
  const now=Date.now(), ch=[];
  for(const c of Store.cards.values()){
    if(!c.errs && (c.lapses||c.fails)){ c.errs=(c.lapses||0)+(c.fails||0); if(!ch.includes(c)) ch.push(c); }
    if(!(c.box>0)) continue;
    const lim=startOfDay(c.last||c.created||now)+INTERVALS[c.box]*DAY;
    let due=Math.min(c.due||lim, lim);
    if(c.fails>0 || (c.lapses>0 && c.box<4)) due=Math.min(due, now);
    if(due!==c.due){ c.due=due; if(!ch.includes(c)) ch.push(c); }
  }
  if(ch.length) Store.saveMany(ch);
  S().sched=3; Store.saveSettings();
}
function renderAll(){ knownCache=null; migrateSched(); renderView(); setSync(); }
$("#toLearn").onclick=()=>go("learn");
$("#howLink").onclick=()=>startTour(true);
$("#tabs").onclick=e=>{ const b=e.target.closest("button"); if(b) go(b.dataset.view); };

/* ============ boot ============ */
Store.loadLocal();
go((location.hash||"").slice(1));
setSync(); renderSourceNote();
showStoreWarn();
Store.connectClaude().then(()=>{ if(!sess) renderAll(); else setSync(); initAuth(); setTimeout(maybeStartTour,1300); });
try{ navigator.storage?.persist?.().catch(()=>{}); }catch{}
if("serviceWorker" in navigator && location.protocol==="https:") window.addEventListener("load",()=>{ navigator.serviceWorker.register("sw.js").catch(()=>{}); });   // офлайн-режим
document.addEventListener("click", e=>{ if(e.target.closest("#footPriv")){ e.preventDefault(); openPrivacy(); } });

/* ——— напоминание: добавить сайт на домашний экран (только телефоны) ——— */
(function(){
  const KEY_SNOOZE="koloda_a2hs_snooze", KEY_DONE="koloda_a2hs_done", EVERY=6*3600*1000;
  let deferred=null;
  window.addEventListener("beforeinstallprompt",e=>{ e.preventDefault(); deferred=e; });
  window.addEventListener("appinstalled",()=>{ try{ localStorage.setItem(KEY_DONE,"1"); }catch{} hideA2hs(); });
  const ua=navigator.userAgent||"";
  const isIOS=/iPhone|iPad|iPod/.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
  const isMobile=isIOS||/Android.+Mobile|Mobile.+Android|Android/.test(ua);
  const standalone=()=>window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
  const get=k=>{ try{ return localStorage.getItem(k); }catch{ return null; } };
  const set=(k,v)=>{ try{ localStorage.setItem(k,v); }catch{} };
  function hideA2hs(){ document.getElementById("a2hs")?.remove(); }
  function due(){ if(!isMobile||standalone()||get(KEY_DONE)) return false; const t=+get(KEY_SNOOZE)||0; return Date.now()-t>=EVERY; }
  function show(){
    if(!due()||document.getElementById("a2hs")||sess||tour||!$("#modal").hidden) return;
    const steps = isIOS
      ? 'Нажмите «Поделиться» <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M12 15V3M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg> в Safari, затем «На экран Домой».'
      : "Откройте меню браузера <b>⋮</b> и выберите «Добавить на главный экран».";
    const d=document.createElement("div"); d.id="a2hs"; d.className="a2hs"; d.setAttribute("role","dialog"); d.setAttribute("aria-label","Добавить Колоду на домашний экран");
    d.innerHTML=`<img src="icons/icon-192.png" alt="" width="48" height="48"><div class="a2t"><b>Колода на домашнем экране</b><span>${deferred?"Откроется как приложение, без адресной строки.":steps}</span></div>
      <div class="a2b">${deferred?'<button class="btn primary" type="button" data-a="add">Добавить</button>':'<button class="btn primary" type="button" data-a="done">Готово</button>'}<button class="btn ghost" type="button" data-a="later">Позже</button></div>`;
    d.addEventListener("click",async e=>{ const a=e.target.closest("[data-a]")?.dataset.a; if(!a) return;
      if(a==="add"&&deferred){ try{ deferred.prompt(); const r=await deferred.userChoice; if(r.outcome==="accepted") set(KEY_DONE,"1"); else set(KEY_SNOOZE,String(Date.now())); }catch{} deferred=null; }
      else if(a==="done") set(KEY_DONE,"1"); else set(KEY_SNOOZE,String(Date.now()));
      hideA2hs(); });
    document.body.append(d);
  }
  if(isMobile){ setTimeout(()=>{ show(); setInterval(show,60000); },25000); }
})();
