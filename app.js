"use strict";
/* ============ utils ============ */
const $ = (s, el=document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const DAY = 86400000;
const INTERVALS = [0, 1, 3, 7, 16, 35, 80, 180]; // дни для коробок 1..7
const shuffle = a => { a = a.slice(); for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
const startOfDay = (t=Date.now()) => { const d=new Date(t); d.setHours(0,0,0,0); return d.getTime(); };
const dayKey = (t=Date.now()) => { const d=new Date(t); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const isCyr = s => /[а-яё]/i.test(s);
const uid = () => "c-" + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const SPK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>';
function plural(n, one, few, many){ const m10=n%10, m100=n%100; if(m10===1&&m100!==11) return one; if(m10>=2&&m10<=4&&(m100<12||m100>14)) return few; return many; }
function toast(msg){ const t=$("#toast"); t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true, 2600); }
function lev(a,b){ const m=a.length,n=b.length; if(Math.abs(m-n)>2) return 9; const d=Array.from({length:m+1},(_,i)=>[i]); for(let j=1;j<=n;j++) d[0][j]=j; for(let i=1;i<=m;i++) for(let j=1;j<=n;j++) d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1)); return d[m][n]; }
const norm = s => String(s||"").toLowerCase().replace(/[’‘`´]/g,"'").replace(/ё/g,"е").replace(/[.!?,;:]+$/,"").replace(/\s+/g," ").trim();
function lsGet(k, d){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch{ return d; } }
function lsSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} }

/* ============ store ============ */
const DEFAULTS = { batch:10, first:"en", audio:"en", rate:0.9, voice:"", native:true, mmEmail:"", modes:{choice:true, match:true, letters:true, typing:true} };
const GUEST = "koloda.";
const str = (v, max=500) => typeof v==="string" ? v.slice(0,max) : "";
const numv = v => Number.isFinite(+v) ? +v : 0;
/* Любые данные извне (сервер, импорт) приводим к ожидаемой форме: только строки и числа нужной длины */
function sanitizeCard(c){
  if(!c || typeof c!=="object" || !str(c.en) || !str(c.ru)) return null;
  const id = /^[\w-]{1,64}$/.test(c.id) ? c.id : uid();
  return { id, en:str(c.en,200), ru:str(c.ru,300), ipa:str(c.ipa,100), pos:str(c.pos,40), note:str(c.note,200), audio:str(c.audio,300),
    examples:(Array.isArray(c.examples)?c.examples:[]).slice(0,5).map(x=>({en:str(x?.en,300), ru:str(x?.ru,300)})).filter(x=>x.en),
    created:numv(c.created)||Date.now(), box:Math.max(0,Math.min(7,Math.round(numv(c.box)))), due:numv(c.due), reps:numv(c.reps), lapses:numv(c.lapses), last:numv(c.last), updated:numv(c.updated), demo:!!c.demo };
}
function sanitizeSettings(s){
  const o=structuredClone(DEFAULTS); if(!s||typeof s!=="object") return o;
  if([5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25].includes(+s.batch)) o.batch=+s.batch;
  if(["en","ru"].includes(s.first)) o.first=s.first;
  if(["off","en","both"].includes(s.audio)) o.audio=s.audio;
  if(+s.rate>=0.5 && +s.rate<=1.5) o.rate=+s.rate;
  o.voice=str(s.voice,200); o.native=s.native!==false; o.mmEmail=str(s.mmEmail,120);
  if(s.modes&&typeof s.modes==="object") for(const k of Object.keys(o.modes)) if(k in s.modes) o.modes[k]=!!s.modes[k];
  return o;
}
function sanitizeStats(s){
  const days={}; const d=s?.days; if(d&&typeof d==="object") for(const [k,v] of Object.entries(d)) if(/^\d{4}-\d{2}-\d{2}$/.test(k)&&v&&typeof v==="object") days[k]={n:numv(v.n),learned:numv(v.learned),reviewed:numv(v.reviewed),right:numv(v.right),total:numv(v.total)};
  return {days};
}
const Store = {
  mode:"local",            // local — гость, данные в браузере; claude — внутри Claude; supa — аккаунт
  prefix:GUEST, cards:new Map(), settings:structuredClone(DEFAULTS), stats:{days:{}},
  // ---- кэш в браузере
  loadLocal(prefix=this.prefix){
    this.prefix=prefix;
    this.cards = new Map(lsGet(prefix+"cards", []).map(sanitizeCard).filter(Boolean).map(c=>[c.id,c]));
    this.settings = sanitizeSettings(lsGet(prefix+"settings", {}));
    this.stats = sanitizeStats(lsGet(prefix+"stats", {days:{}}));
  },
  saveLocal(){ lsSet(this.prefix+"cards",[...this.cards.values()]); lsSet(this.prefix+"settings",this.settings); lsSet(this.prefix+"stats",this.stats); },
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
      const remote = new Map(); let settings=null, stats=null;
      snap.docs.forEach(d=>{ const v=d.data(); if(!v) return; if(d.id==="settings") settings=v; else if(d.id==="stats") stats=v; else if(d.id.startsWith("c-")){ const c=sanitizeCard(v); if(c) remote.set(d.id, c); } });
      this.col = col; this.mode = "claude";
      if(remote.size===0 && this.cards.size>0){
        for(const c of this.cards.values()) await this.col.doc(c.id).set(c).catch(()=>{});
        await this.col.doc("settings").set(this.settings).catch(()=>{});
        await this.col.doc("stats").set(this.stats).catch(()=>{});
      } else {
        this.cards = remote;
        if(settings) this.settings = sanitizeSettings(settings);
        if(stats) this.stats = sanitizeStats(stats);
        this.saveLocal();
      }
    }catch(e){ this.mode="local"; this.col=null; }
  },

  // ---- Supabase (аккаунт)
  sb:null, user:null, pending:new Set(), pendingDel:new Set(), statePending:false, flushing:false, flushTimer:null, syncError:null, lastPull:0,
  savePending(){ lsSet(this.prefix+"pending",{c:[...this.pending], d:[...this.pendingDel], s:this.statePending}); },
  loadPending(){ const p=lsGet(this.prefix+"pending",{}); this.pending=new Set(p.c||[]); this.pendingDel=new Set(p.d||[]); this.statePending=!!p.s; },
  scheduleFlush(ms=700){ clearTimeout(this.flushTimer); this.flushTimer=setTimeout(()=>this.flush(), ms); },
  async flush(){
    if(this.mode!=="supa" || this.flushing) return;
    if(!this.pending.size && !this.pendingDel.size && !this.statePending) return;
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
      if((this.pending.size||this.pendingDel.size||this.statePending) && !this.syncError) this.scheduleFlush(200);
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
    this.loadLocal("koloda.u."+user.id+"."); this.loadPending();
    renderAll();
    try{ await this.pull(); }catch(e){ this.syncError=e; }
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
    this.user=null; this.mode="local"; this.pending=new Set(); this.pendingDel=new Set(); this.statePending=false; this.syncError=null;
    this.loadLocal(GUEST); renderAll();
  },
  hasUnsynced(){ return this.mode==="supa" && (this.pending.size||this.pendingDel.size||this.statePending); },

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
  deleteCard(id){
    this.cards.delete(id); this.saveLocal();
    if(this.mode==="claude") this.col.doc(id).delete().catch(()=>{});
    else if(this.mode==="supa"){ this.pending.delete(id); this.pendingDel.add(id); this.savePending(); this.scheduleFlush(); }
  },
  saveSettings(){ this.write("settings"); },
  saveStats(){ this.write("stats"); },
};
const S = () => Store.settings;
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
function newCard(f){ return { id:uid(), en:f.en.trim(), ru:f.ru.trim(), ipa:f.ipa||"", pos:f.pos||"", note:f.note||"", audio:f.audio||"", examples:f.examples||[], created:Date.now(), box:0, due:0, reps:0, lapses:0, last:0, demo:!!f.demo }; }
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
function speak(text, lang="en"){
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
    : 'Переводы: <a href="https://mymemory.translated.net" target="_blank" rel="noopener">MyMemory</a> · словарь, транскрипция и аудио: <a href="https://dictionaryapi.dev" target="_blank" rel="noopener">Free Dictionary API</a>';
}

/* Free Dictionary API + MyMemory */
let FETCH_MS = 8000;
async function fetchT(url, ms=FETCH_MS){
  const ac=new AbortController(); const t=setTimeout(()=>ac.abort(), ms);
  try{ return await fetch(url,{signal:ac.signal}); } finally{ clearTimeout(t); }
}
const FREE = {
  limited:0,
  async translate(q, from, to){
    const em=(S().mmEmail||"").trim();
    const u="https://api.mymemory.translated.net/get?q="+encodeURIComponent(q)+"&langpair="+from+"|"+to+(em?"&de="+encodeURIComponent(em):"");
    let r; try{ r=await fetchT(u); }catch{ throw {code:"net"}; }
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
    let r, j; try{ r=await fetchT("https://api.dictionaryapi.dev/api/v2/entries/en/"+encodeURIComponent(w)); }catch{ return null; }
    if(r.status===429){ this.limited=Date.now(); return null; }
    if(!r.ok) return null;
    try{ j=await r.json(); }catch{ return null; }
    if(!Array.isArray(j)) return null;
    const phon=j.flatMap(e=>e.phonetics||[]);
    let ipa=j.find(e=>e.phonetic)?.phonetic || phon.find(p=>p.text)?.text || "";
    if(ipa && !ipa.startsWith("/")) ipa="/"+ipa.replace(/^\[|\]$/g,"")+"/";
    const auds=phon.map(p=>p.audio).filter(Boolean);
    const audio=auds.find(a=>/-uk\.mp3/.test(a)) || auds.find(a=>/-us\.mp3/.test(a)) || auds[0] || "";
    const meanings=j.flatMap(e=>e.meanings||[]).map(m=>({pos:m.partOfSpeech, defs:(m.definitions||[]).slice(0,3).map(d=>({def:d.definition, ex:d.example||""}))}));
    const examples=meanings.flatMap(m=>m.defs.filter(d=>d.ex).map(d=>d.ex)).slice(0,2).map(e=>({en:e, ru:""}));
    return {ipa, audio, meanings, examples, pos: meanings.length===1 ? meanings[0].pos : (meanings[0]?.pos||"")};
  },
  async translateExamples(exs){
    for(const x of exs){ if(x.ru) continue; try{ x.ru = (await this.translate(x.en,"en","ru")).responseData?.translatedText || ""; }catch(e){ if(e.code==="quota") break; } }
    return exs;
  },
};
const draftAudio=new Map();
function audioFor(text){ const n=norm(text); return draftAudio.get(n) || allCards().find(c=>c.audio && norm(c.en)===n)?.audio || ""; }
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
  if(e?.code==="quota") return "Дневной лимит переводчика MyMemory исчерпан. Укажите email в настройках (лимит вырастет в 10 раз) или введите перевод вручную.";
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

async function lookup(){
  const text = addInput.value.trim(); if(!text) { addInput.focus(); return; }
  const lang = isCyr(text) ? "ru" : "en";
  const dup = allCards().find(c => norm(lang==="ru"?c.ru:c.en)===norm(text));
  addState = { text, lang, senses:null, sel:-1, loading:true, error:null, dup };
  renderAdd();
  try{
    let senses;
    if(await getSample()){
      const r = await askJSON(lookupPrompt(text, lang));
      senses = (r?.senses||[]).filter(s=>s && s.en && s.ru).slice(0,6).map(s=>({...s, examples:(s.examples||[]).filter(x=>x&&x.en).slice(0,3)}));
    } else if(lang==="en"){
      const [tr, d] = await Promise.all([FREE.translate(text,"en","ru"), FREE.dict(text)]);
      if(d?.audio) draftAudio.set(norm(text), d.audio);
      addState.meanings = d?.meanings || null;
      senses = FREE.variants(tr, text).map(v=>({en:text, ru:v, ipa:d?.ipa||"", pos:d?.pos||"", audio:d?.audio||"", examples:(d?.examples||[]).map(x=>({...x})), free:true, enriched:true}));
    } else {
      const tr = await FREE.translate(text,"ru","en");
      senses = FREE.variants(tr, text).map(v=>({en:v, ru:text, examples:[], free:true, enriched:false}));
    }
    if(addState?.text!==text) return;
    addState.senses = senses; addState.loading=false;
    if(!senses.length) addState.error = "Словарь ничего не нашёл. Проверьте написание или введите перевод вручную.";
  }catch(e){
    if(addState?.text!==text) return;
    addState.loading=false; addState.error = lookupErrorText(e);
  }
  renderAdd();
}
function renderAdd(){
  const el = $("#addResult"); const st = addState;
  if(!st){ el.innerHTML=""; return; }
  let h = "";
  if(st.dup) h += `<div class="feedback no small">Такая карточка уже есть: <b>${esc(st.dup.en)} — ${esc(st.dup.ru)}</b></div>`;
  if(st.loading) h += `<div class="label">Ищу значения…</div><div class="senses"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>`;
  if(st.error) h += `<div class="feedback no small">${esc(st.error)}</div>`;
  if(st.senses?.length){
    h += `<div class="label">Выберите подходящий перевод</div><div class="senses">`;
    st.senses.forEach((s,i)=>{
      const main = st.lang==="ru" ? s.en : s.ru;
      h += `<button type="button" class="sense" data-sense="${i}" aria-pressed="${st.sel===i}">
        <span class="t">${esc(main)} ${s.pos?`<span class="chip">${esc(s.pos)}</span>`:""} ${s.level?`<span class="chip">${esc(s.level)}</span>`:""}</span>
        ${s.meaning?`<span class="small muted">${esc(s.meaning)}</span>`:""}
        ${s.examples?.[0] && !s.free?`<span class="ex">${esc(s.examples[0].en)}</span>`:""}
      </button>`;
    });
    h += `</div>`;
    if(st.meanings?.length){
      h += `<details class="imp"><summary class="small">Значения в английском словаре</summary><ul class="ex-list small" style="margin-top:8px">${st.meanings.slice(0,4).map(m=>m.defs.slice(0,2).map(d=>`<li><span class="chip">${esc(m.pos)}</span><div>${esc(d.def)}${d.ex?`<div class="ru"><i>${esc(d.ex)}</i></div>`:""}</div></li>`).join("")).join("")}</ul></details>`;
    }
  }
  if(!st.loading){
    h += `<div class="stack" style="gap:8px">
      <label class="f">Свой вариант перевода<input class="input" id="manualTr" autocomplete="off" placeholder="${st.lang==="ru"?"English translation":"перевод на русский"}" value="${esc(st.manual||"")}"></label></div>`;
  }
  const c = currentDraft();
  if(c){
    h += `<div class="preview stack" style="gap:10px">
      <div class="row" style="justify-content:space-between;gap:8px"><div><div style="font-size:20px;font-weight:700">${esc(c.en)}</div>
      <div class="row" style="gap:8px">${c.ipa?`<span class="ipa">${esc(c.ipa)}</span>`:""}<span class="muted">${esc(c.ru)}</span></div></div>${sayBtn(c.en,"en",false)}</div>
      ${c.examples.length?`<ul class="ex-list">${c.examples.map(x=>`<li>${sayBtn(x.en)}<div><div class="en">${esc(x.en)}</div><div class="ru">${esc(x.ru||"")}</div></div></li>`).join("")}</ul>`
        : `<div class="row small muted">Примеров пока нет. <button type="button" class="btn ghost" id="fetchEx" style="min-height:32px;padding:4px 8px">Подобрать примеры</button></div>`}
      <button type="button" class="btn primary wide" id="saveCard">Сохранить карточку</button>
    </div>`;
  }
  el.innerHTML = h;
  el.querySelectorAll("[data-sense]").forEach(b=>b.onclick=async ()=>{
    st.sel=+b.dataset.sense; st.manual=""; st.manualEx=null; const v=st.senses[st.sel];
    if(v.free && !v.enriched){ // RU→EN: подтягиваем транскрипцию, аудио и примеры для выбранного английского слова
      v.enriched=true; renderAdd();
      const d=await FREE.dict(v.en);
      if(d){ v.ipa=d.ipa; v.pos=d.pos; v.audio=d.audio; v.examples=d.examples; if(d.audio) draftAudio.set(norm(v.en), d.audio); }
    }
    renderAdd(); autoSpeak(v.en,"en");
  });
  const m=$("#manualTr"); if(m){ m.oninput=()=>{ st.manual=m.value; if(m.value.trim()) { st.sel=-1; } refreshDraft(); }; }
  const fe=$("#fetchEx"); if(fe) fe.onclick=fetchManualExamples;
  const sv=$("#saveCard"); if(sv) sv.onclick=saveDraft;
}
let draftTimer=null;
function refreshDraft(){ clearTimeout(draftTimer); draftTimer=setTimeout(()=>{ const f=document.activeElement?.id; const pos=$("#manualTr")?.selectionStart; renderAdd(); if(f==="manualTr"){ const m=$("#manualTr"); m.focus(); try{ m.setSelectionRange(pos,pos); }catch{} } }, 250); }
function currentDraft(){
  const st=addState; if(!st) return null;
  if(st.manual?.trim()){
    const en = st.lang==="ru" ? st.manual.trim() : st.text, ru = st.lang==="ru" ? st.text : st.manual.trim();
    return { en, ru, ipa:st.manualEx?.ipa||"", pos:st.manualEx?.pos||"", audio:st.manualEx?.audio||"", examples:st.manualEx?.examples||[] };
  }
  if(st.sel>=0 && st.senses?.[st.sel]){
    const s=st.senses[st.sel];
    return { en: s.en, ru: st.lang==="ru" ? st.text : s.ru, ipa:s.ipa||"", pos:s.pos||"", note:s.meaning||"", audio:s.audio||"", examples:s.examples||[] };
  }
  return null;
}
async function fetchManualExamples(){
  const c=currentDraft(); if(!c) return;
  const b=$("#fetchEx"); b.disabled=true; b.textContent="Подбираю…";
  try{
    if(await getSample()){ const r=await askJSON(examplesPrompt([c]),"quick"); const x=Array.isArray(r)?r[0]:null; addState.manualEx = {ipa:x?.ipa||"", pos:x?.pos||"", examples:(x?.examples||[]).filter(e=>e?.en).slice(0,3)}; }
    else {
      const d=await FREE.dict(c.en);
      if(!d || !d.examples.length) toast("В словаре нет примеров для этого слова — их можно вписать в карточке вручную");
      if(d?.audio) draftAudio.set(norm(c.en), d.audio);
      addState.manualEx = {ipa:d?.ipa||"", pos:d?.pos||"", audio:d?.audio||"", examples:d?.examples||[]};
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
  const c=newCard(d); Store.saveCard(c);
  addState=null; addInput.value=""; $("#langBadge").hidden=true; renderAdd(); renderList();
  toast("Карточка «"+c.en+"» добавлена"); addInput.focus();
}

/* bulk import */
const SEP_RE = /\s+[—–−-]\s+|\s*[—–−=→:;\t]\s*/;
function parseImport(text){
  const items=[], skipped=[], seen=new Set();
  const haveEn=new Set(allCards().map(c=>norm(c.en))), haveRu=new Set(allCards().map(c=>norm(c.ru)));
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
    let en="", ru="", need=null;
    if(b){
      if(isCyr(a)===isCyr(b)){ skipped.push([line,"не понял, где слово и где перевод"]); continue; }
      if(isCyr(a)) [a,b]=[b,a];
      en=a; ru=b;
    } else if(isCyr(a)){ ru=a; need="en"; }
    else { en=a; need="ru"; }
    en=en.slice(0,200); ru=ru.slice(0,300);
    const key = en ? "e:"+norm(en) : "r:"+norm(ru);
    if(seen.has(key) || (en ? haveEn.has(norm(en)) : haveRu.has(norm(ru)))){ skipped.push([line,"уже есть"]); continue; }
    seen.add(key); items.push({en, ru, need});
  }
  return {items, skipped};
}
async function pool(list, n, fn, stop){
  let i=0;
  await Promise.all(Array.from({length:Math.min(n,list.length)}, async()=>{ while(i<list.length && !stop()){ const it=list[i++]; try{ await fn(it); }catch{} } }));
}
let impBusy=false, impStop=false;
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
    items.forEach(x=>{ if(x.en && x.ru) ready.push(x); else failed.push([x.en||x.ru,"не удалось подобрать перевод"]); });
    // 2. сразу сохраняем карточки, чтобы ничего не потерялось
    const made=ready.map(x=>newCard({en:x.en, ru:x.ru}));
    made.forEach(c=>Store.saveCard(c));
    renderList();
    // 3. дополняем транскрипцией, аудио и примерами
    let withInfo=0, noInfo=0, stopped=false;
    if($("#impEx").checked && made.length){
      let n=0; const total=made.length; btn.textContent=`Остановить · 0/${total}`;
      const stopNow=()=>impStop;
      if(sample){
        for(let i=0;i<made.length && !impStop;i+=25){
          const chunk=made.slice(i,i+25);
          try{
            const r=await askJSON(examplesPrompt(chunk),"quick");
            (Array.isArray(r)?r:[]).forEach(x=>{ const c=chunk[x?.i]; if(!c) return; c.ipa=str(x.ipa,100); c.pos=str(x.pos,40); c.examples=(Array.isArray(x.examples)?x.examples:[]).filter(e=>e?.en).slice(0,3).map(e=>({en:str(e.en,300),ru:str(e.ru,300)})); Store.saveCard(c); withInfo++; });
          }catch{}
          n+=chunk.length; btn.textContent=`Остановить · ${Math.min(n,total)}/${total}`;
        }
      } else {
        await pool(made, 3, async c=>{
          if(Date.now()-FREE.limited<60000) { noInfo++; n++; return; }
          const d=await FREE.dict(c.en);
          if(d && (d.ipa||d.examples.length||d.audio)){ Object.assign(c,{ipa:d.ipa, pos:d.pos, audio:d.audio, examples:d.examples}); Store.saveCard(c); withInfo++; } else noInfo++;
          btn.textContent=`Остановить · ${++n}/${total}`;
        }, stopNow);
      }
      stopped=impStop;
      if(!sample) noInfo=made.length-withInfo;
    }
    // 4. отчёт
    const allSkipped=[...skipped,...failed];
    const keep=allSkipped.filter(([,why])=>why!=="уже есть").map(([l])=>l);
    $("#impText").value=keep.join("\n");
    let msg=`Добавлено ${made.length} ${plural(made.length,"слово","слова","слов")}.`;
    if($("#impEx").checked && made.length){
      msg += ` Транскрипция и примеры: ${withInfo} из ${made.length}.`;
      if(stopped) msg+=" Дополнение остановлено, остальные слова остались без примеров.";
      else if(noInfo && !sample) msg+=" Для остальных словарь ничего не нашёл (так бывает с фразами): примеры можно вписать в карточке.";
      if(!sample && Date.now()-FREE.limited<60000) msg+=" Словарь временно ограничил запросы, попробуйте позже.";
    }
    res.innerHTML=`<div class="feedback ${made.length?"ok":"no"} small">${esc(msg)}${reportSkipped(allSkipped)}</div>`;
    toast(`Добавлено ${made.length} ${plural(made.length,"слово","слова","слов")}`);
  } finally {
    impBusy=false; impStop=false; btn.disabled=false; btn.textContent="Импортировать"; renderList();
  }
};
function reportSkipped(sk){
  if(!sk.length) return "";
  return `<details style="margin-top:8px" open><summary class="small" style="cursor:pointer;font-weight:700">Не добавлено: ${sk.length}</summary><ul style="margin:6px 0 0;padding-left:18px">${sk.map(([l,why])=>`<li>${esc(l)} <span class="muted">— ${esc(why)}</span></li>`).join("")}</ul></details>`;
}

/* ============ words list ============ */
let filter="all";
$("#filters").onclick = e=>{ const b=e.target.closest("button"); if(!b) return; filter=b.dataset.f; $("#filters").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed", x===b)); renderList(); };
$("#search").oninput = renderList;
function renderList(){
  const q = norm($("#search").value);
  let list = allCards().sort((a,b)=>b.created-a.created);
  if(filter==="due") list=list.filter(isDue); else if(filter!=="all") list=list.filter(c=>status(c)===filter);
  if(q) list=list.filter(c=>norm(c.en).includes(q)||norm(c.ru).includes(q));
  const el=$("#wlist");
  if(!Store.cards.size){ el.innerHTML=`<div class="panel empty muted">Колода пуста. Добавьте первое слово выше.</div>`; return; }
  if(!list.length){ el.innerHTML=`<div class="panel empty muted">Ничего не найдено.</div>`; return; }
  el.innerHTML = `<div class="small muted" style="margin-bottom:6px">${list.length} ${plural(list.length,"карточка","карточки","карточек")}</div><div class="wlist">` + list.map(c=>`
    <div class="witem" role="button" tabindex="0" data-edit="${c.id}">
      ${sayBtn(c.en)}
      <div class="w"><b>${esc(c.en)}${c.demo?' <span class="chip">пример</span>':""}</b><span>${esc(c.ru)}</span></div>
      <span class="nextdue${isDue(c)?" due":""}">${dueLabel(c)}</span>
      ${boxesHtml(c)}
    </div>`).join("") + `</div>`;
  el.querySelectorAll("[data-edit]").forEach(r=>{ r.onclick=()=>openEdit(r.dataset.edit); r.onkeydown=e=>{ if(e.key==="Enter") openEdit(r.dataset.edit); }; });
}

/* edit modal */
function openModal(html){ $("#modalBody").innerHTML=html; $("#modal").hidden=false; }
function closeModal(){ $("#modal").hidden=true; }
$("#modal").addEventListener("click", e=>{ if(e.target.id==="modal") closeModal(); });
function openEdit(id){
  const c=Store.cards.get(id); if(!c) return;
  openModal(`<div class="row" style="justify-content:space-between"><h2 style="font-size:18px">Карточка</h2>${boxesHtml(c)}</div>
    <label class="f">English<input class="input" id="e-en" value="${esc(c.en)}"></label>
    <label class="f">Русский<input class="input" id="e-ru" value="${esc(c.ru)}"></label>
    <label class="f">Транскрипция<input class="input" id="e-ipa" value="${esc(c.ipa)}"></label>
    <label class="f">Примеры: по одному в строке, «English | перевод»<textarea class="input" id="e-ex">${esc(c.examples.map(x=>x.en+(x.ru?" | "+x.ru:"")).join("\n"))}</textarea></label>
    <div class="small muted">Следующее повторение: ${dueLabel(c)} · повторений: ${c.reps}</div>
    <div class="row" id="e-actions" style="justify-content:space-between">
      <div class="row"><button class="btn danger" id="e-del">Удалить</button><button class="btn ghost" id="e-reset">Сбросить прогресс</button></div>
      <div class="row"><button class="btn" id="e-cancel">Отмена</button><button class="btn primary" id="e-save">Сохранить</button></div>
    </div>`);
  $("#e-cancel").onclick=closeModal;
  $("#e-save").onclick=()=>{
    c.en=$("#e-en").value.trim()||c.en; c.ru=$("#e-ru").value.trim()||c.ru; c.ipa=$("#e-ipa").value.trim();
    c.examples=$("#e-ex").value.split("\n").map(l=>l.trim()).filter(Boolean).map(l=>{ const [en,ru]=l.split("|").map(s=>s.trim()); return {en, ru:ru||""}; });
    Store.saveCard(c); closeModal(); renderAll(); toast("Сохранено");
  };
  $("#e-reset").onclick=()=>{ c.box=0; c.due=0; c.reps=0; Store.saveCard(c); closeModal(); renderAll(); toast("Слово снова новое"); };
  $("#e-del").onclick=()=>{
    $("#e-actions").innerHTML=`<span class="small">Удалить «${esc(c.en)}» насовсем?</span><div class="row"><button class="btn" id="e-no">Нет</button><button class="btn primary" id="e-yes" style="background:var(--bad);border-color:var(--bad)">Удалить</button></div>`;
    $("#e-no").onclick=()=>openEdit(id);
    $("#e-yes").onclick=()=>{ Store.deleteCard(id); closeModal(); renderAll(); toast("Удалено"); };
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
function streakInfo(){
  const days=Store.stats.days||{}; let n=0; let t=Date.now();
  if(!days[dayKey(t)]) t-=DAY;
  while(days[dayKey(t)]){ n++; t-=DAY; }
  const last7=[]; for(let i=6;i>=0;i--) last7.push(!!days[dayKey(Date.now()-i*DAY)]);
  return {n,last7};
}
const SPK_W = SPK.replace('stroke="currentColor"','stroke="#fff"');
function heroHtml(cta){
  return `<section class="hero">
    <div class="hero-glass">
      <div class="hero-kicker">карточки английских слов</div>
      <h1 class="hero-title">Колода<span>.en</span></h1>
      <p>Перевод, примеры и произношение в одной карточке. Тренировки по 5–25 слов и повторения ровно тогда, когда слово начинает забываться.</p>
      <div class="row">${cta}</div>
    </div>
    <div class="hero-art" aria-hidden="true">
      <div class="hc hc3"><b>to cope</b><i>справляться</i></div>
      <div class="hc hc1"><span class="dot">${SPK_W}</span><b>receipt</b><i>/rɪˈsiːt/</i></div>
      <div class="hc hc2"><b>чек, квитанция</b><i>noun · B1</i></div>
    </div>
  </section>`;
}
function renderLearn(){
  const el=$("#v-learn"), cs=allCards();
  if(!cs.length){
    el.innerHTML = heroHtml(`<button class="btn primary" data-go="words">Добавить слово</button><button class="btn ghost" id="demoBtn">8 слов для пробы</button>`) + `
    <div class="sec-head"><h2>Колода — больше, чем список слов</h2><button class="pill-link" data-go="words">Добавить</button></div>
    <div class="grid3">
      <div class="ftile lime"><h3>Перевод за секунду</h3><p>Введите слово на английском или русском и выберите подходящий перевод из вариантов словаря.</p><span class="deco ring"></span></div>
      <div class="ftile"><h3>Примеры и звук</h3><p>Транскрипция, примеры предложений и озвучка — в каждой карточке.</p><span class="deco stackc"><i></i><i></i><i></i></span></div>
      <div class="ftile pinky"><h3>Повторения по плану</h3><p>Слово возвращается через 1, 3, 7, 16 дней и дальше — пока не запомнится надолго.</p><span class="deco bubble"></span></div>
    </div>`;
    $("#demoBtn").onclick=()=>{ DEMO.forEach((d,i)=>{ const c=newCard({...d, demo:true}); c.created+=i; Store.saveCard(c); }); renderAll(); toast("Добавлено 8 карточек"); };
    bindGo(el); return;
  }
  const fresh=cs.filter(c=>!c.box).length, due=cs.filter(isDue).length, n=Math.min(S().batch, fresh);
  const st=streakInfo(), today=Store.stats.days?.[dayKey()];
  const cta = due ? `<button class="btn primary" data-start="review">Повторить · ${due}</button>${fresh?`<button class="btn ghost" data-start="learn">Учить новые</button>`:""}`
            : fresh ? `<button class="btn primary" data-start="learn">Начать обучение · ${n}</button>`
            : `<button class="btn primary" data-go="words">Добавить слово</button>`;
  el.innerHTML = heroHtml(cta) + `
  <div class="sec-head"><h2>Сегодня в колоде</h2><button class="pill-link" data-go="stats">Прогресс</button></div>
  <div class="grid3">
    <div class="ftile lime">
      <div class="label">Новые слова</div>
      <div class="bignum">${fresh}</div>
      <p>${fresh?`${plural(fresh,"слово ждёт","слова ждут","слов ждут")} знакомства`:"Все слова уже в работе — добавьте новые"}</p>
      <button class="btn" data-start="learn" ${fresh?"":"disabled"}>${fresh?`Учить ${n} ${plural(n,"слово","слова","слов")}`:"Новых нет"}</button>
      <span class="deco ring"></span>
    </div>
    <div class="ftile">
      <div class="label">Повторение</div>
      <div class="bignum">${due}</div>
      <p>${due?"пора освежить в памяти":"на сегодня всё повторено"}</p>
      <button class="btn ${due?"pink":""}" data-start="review" ${due?"":"disabled"}>${due?"Повторить":"Готово"}</button>
      <span class="deco stackc"><i></i><i></i><i></i></span>
    </div>
    <div class="ftile pinky">
      <div class="label">Серия</div>
      <div class="bignum">${st.n}</div>
      <p>${plural(st.n,"день","дня","дней")} подряд${today?` · сегодня ${today.n} ${plural(today.n,"слово","слова","слов")}`:""}</p>
      <div class="streak" aria-label="Активность за 7 дней">${st.last7.map(on=>`<span class="${on?"on":""}"></span>`).join("")}</div>
      <button class="btn" data-go="words">+ Новое слово</button>
    </div>
  </div>
  ${AUTH.enabled && Store.mode==="local" ? `<div class="ftile nudge"><div><h3>Сохраните слова в аккаунте</h3><p>Сейчас колода живёт только в этом браузере. С аккаунтом слова не потеряются и будут на любом устройстве.</p></div><div class="row"><button class="btn primary" data-auth="signup">Регистрация</button><button class="btn" data-auth="signin">Вход</button></div></div>` : ""}
  <div class="sec-head"><h2>Недавно добавленные</h2><button class="pill-link" data-go="words">Все слова</button></div>
  <div class="grid2">
    ${cs.sort((a,b)=>b.created-a.created).slice(0,4).map(c=>`<div class="wordtile">${sayBtn(c.en,"en",false)}<div class="w"><b>${esc(c.en)}</b><span>${esc(c.ru)}${c.ipa?` · <span class="ipa" style="display:inline">${esc(c.ipa)}</span>`:""}</span></div>${boxesHtml(c)}</div>`).join("")}
  </div>`;
  el.querySelectorAll("[data-start]").forEach(b=>b.onclick=()=> b.dataset.start==="learn" ? startLearn() : startReview());
  el.querySelectorAll("[data-auth]").forEach(b=>b.onclick=()=>openAuth(b.dataset.auth));
  bindGo(el);
}
function bindGo(el){ el.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>{ go(b.dataset.go); if(b.dataset.go==="words") setTimeout(()=>addInput.focus(),50); }); }

/* ============ session engine ============ */
const FILLER = [["house","дом"],["window","окно"],["to borrow","одалживать"],["weather","погода"],["cheap","дешёвый"],["to arrive","прибывать"],["neighbour","сосед"],["to forget","забывать"],["kitchen","кухня"],["busy","занятой"],["to explain","объяснять"],["journey","поездка"]].map(([en,ru])=>({en,ru}));
let sess=null;
function modesOn(){ const m=S().modes; return m; }
function startLearn(){
  const list=allCards().filter(c=>!c.box).sort((a,b)=>a.created-b.created).slice(0,S().batch);
  if(list.length) buildSession("learn", list);
}
function startReview(){
  const list=allCards().filter(isDue).sort((a,b)=>a.due-b.due).slice(0,Math.max(30,S().batch*2));
  if(list.length) buildSession("review", list);
}
function buildSession(kind, list){
  const m=modesOn(), ids=list.map(c=>c.id), rounds=[];
  if(kind==="learn"){
    rounds.push({type:"intro", queue:ids.slice()});
    if(m.choice) rounds.push({type:"choice", dir:"fwd", queue:shuffle(ids)});
    if(m.match && ids.length>=2){ const sh=shuffle(ids), ch=[]; for(let i=0;i<sh.length;i+=5) ch.push(sh.slice(i,i+5)); if(ch.length>1 && ch[ch.length-1].length<2){ ch[ch.length-2].push(...ch.pop()); } rounds.push({type:"match", queue:ch}); }
    if(m.choice) rounds.push({type:"choice", dir:"rev", queue:shuffle(ids)});
    if(m.letters) rounds.push({type:"letters", queue:shuffle(ids)});
    if(m.typing) rounds.push({type:"typing", queue:shuffle(ids)});
    if(rounds.length===1) rounds.push({type:"choice", dir:"fwd", queue:shuffle(ids)});
  } else {
    if(m.choice || (!m.typing && !m.letters)) rounds.push({type:"choice", dir:"rev", queue:shuffle(ids)});
    if(m.typing) rounds.push({type:"typing", queue:shuffle(ids)});
    else if(m.letters) rounds.push({type:"letters", queue:shuffle(ids)});
  }
  sess={kind, ids, rounds, r:0, done:0, mistakes:Object.fromEntries(ids.map(i=>[i,0])), skipped:new Set(), answers:0, right:0, busy:false};
  sess.total = rounds.reduce((s,r)=>s+r.queue.length,0);
  $("#sess").hidden=false; document.body.style.overflow="hidden";
  next();
}
function cardOf(id){ return Store.cards.get(id); }
function front(c){ return S().first==="en" ? {t:c.en, l:"en"} : {t:c.ru, l:"ru"}; }
function back(c){ return S().first==="en" ? {t:c.ru, l:"ru"} : {t:c.en, l:"en"}; }
function updateBar(){ const p=sess.total?Math.round(sess.done/sess.total*100):0; $("#pbar").style.width=p+"%"; $("#sessCount").textContent=sess.done+"/"+sess.total; }
function next(){
  updateBar();
  while(sess.r<sess.rounds.length && !sess.rounds[sess.r].queue.length) sess.r++;
  if(sess.r>=sess.rounds.length) return finish();
  const round=sess.rounds[sess.r];
  sess.busy=false;
  ({intro:stepIntro, choice:stepChoice, match:stepMatch, letters:stepLetters, typing:stepTyping})[round.type](round, round.queue[0]);
}
function done(ok, id, requeue=true){
  const round=sess.rounds[sess.r]; round.queue.shift(); sess.done++;
  if(id!==undefined){ sess.answers++; if(ok) sess.right++; else { sess.mistakes[id]++; if(requeue){ round.queue.push(id); sess.total++; } } }
  next();
}
const MODE = {intro:"Знакомство", choice:"Выберите перевод", match:"Соедините пары", letters:"Соберите слово из букв", typing:"Напишите по-английски"};
function head(type, extra=""){ return `<div class="mode-tag"><span class="label">${MODE[type]}</span>${extra}</div>`; }
function exHtml(c, n=2){ return c.examples?.length ? `<ul class="ex-list">${c.examples.slice(0,n).map(x=>`<li>${sayBtn(x.en)}<div><div class="en">${esc(x.en)}</div><div class="ru">${esc(x.ru||"")}</div></div></li>`).join("")}</ul>` : ""; }
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
  <div class="sess-foot"><button class="btn" id="iKnow">Уже знаю</button><button class="btn primary" id="iNext">Дальше <kbd style="opacity:.6;font-size:11px">Enter</kbd></button></div>`;
  autoSpeak(f.t, f.l);
  $("#iNext").onclick=()=>done(true);
  $("#iKnow").onclick=()=>{
    sess.skipped.add(id);
    for(const r of sess.rounds){ if(r.type==="intro") continue; if(r.type==="match"){ r.queue=r.queue.map(g=>g.filter(x=>x!==id)).filter(g=>g.length>=2); } else r.queue=r.queue.filter(x=>x!==id); }
    sess.total = sess.done + sess.rounds.reduce((s,r)=>s+r.queue.length,0);
    done(true);
  };
  $("#iNext").focus();
}
function distractors(c, key, n=3){
  const pool = shuffle(allCards().filter(x=>x.id!==c.id && norm(x[key])!==norm(c[key])));
  const sessFirst = pool.sort((a,b)=>(sess.ids.includes(b.id)?1:0)-(sess.ids.includes(a.id)?1:0));
  const out=[]; const seen=new Set([norm(c[key])]);
  for(const x of [...sessFirst, ...shuffle(FILLER)]){ const v=x[key]; if(!seen.has(norm(v))){ seen.add(norm(v)); out.push(v); } if(out.length>=n) break; }
  return out;
}
function stepChoice(round, id){
  const c=cardOf(id);
  const ask = round.dir==="fwd" ? front(c) : back(c);
  const ans = round.dir==="fwd" ? back(c) : front(c);
  const key = ans.l;
  const opts = shuffle([ans.t, ...distractors(c, key)]);
  body().innerHTML = head("choice") + `
  <div class="flash"><div class="row" style="justify-content:center;flex-wrap:nowrap"><div class="word">${esc(ask.t)}</div>${sayBtn(ask.t,ask.l,false)}</div>${c.ipa&&ask.l==="en"?`<div class="ipa">${esc(c.ipa)}</div>`:""}</div>
  <div class="opts">${opts.map((o,i)=>`<button class="opt" data-o="${i}"><kbd>${i+1}</kbd><span>${esc(o)}</span></button>`).join("")}</div>
  <div id="fb"></div>`;
  if(ask.l==="en") autoSpeak(ask.t,"en");
  body().querySelectorAll("[data-o]").forEach(b=>b.onclick=()=>{
    if(sess.busy) return; sess.busy=true;
    const pick=opts[+b.dataset.o], ok = pick===ans.t;
    body().querySelectorAll("[data-o]").forEach(x=>{ x.disabled=true; if(opts[+x.dataset.o]===ans.t) x.classList.add("right"); });
    if(ok){ if(ans.l==="en") autoSpeak(ans.t,"en"); setTimeout(()=>done(true,id), 750); }
    else {
      b.classList.add("wrong");
      $("#fb").innerHTML=`<div class="feedback no">Правильно: <b>${esc(ans.t)}</b>. Слово вернётся в конце раунда.</div><div class="sess-foot"><button class="btn primary" id="go">Дальше</button></div>`;
      speak(c.en,"en"); $("#go").onclick=()=>done(false,id); $("#go").focus();
    }
  });
}
function stepMatch(round, group){
  const cs=group.map(cardOf).filter(Boolean);
  const left=shuffle(cs), right=shuffle(cs);
  let sel=null, left_n=cs.length; const err=new Set();
  body().innerHTML = head("match", `<span class="chip">${cs.length} ${plural(cs.length,"пара","пары","пар")}</span>`) + `
  <div class="match"><div class="col">${left.map(c=>`<button class="mitem" data-l="${c.id}">${esc(front(c).t)}</button>`).join("")}</div>
  <div class="col">${right.map(c=>`<button class="mitem" data-r="${c.id}">${esc(back(c).t)}</button>`).join("")}</div></div>`;
  const B=body();
  B.querySelectorAll("[data-l]").forEach(b=>b.onclick=()=>{ B.querySelectorAll("[data-l]").forEach(x=>x.classList.remove("sel")); sel=b.dataset.l; b.classList.add("sel"); const c=cardOf(sel); if(front(c).l==="en") autoSpeak(c.en,"en"); });
  B.querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>{
    if(!sel){ b.classList.add("err"); setTimeout(()=>b.classList.remove("err"),350); return; }
    const L=B.querySelector(`[data-l="${sel}"]`);
    if(b.dataset.r===sel){
      L.classList.add("done"); b.classList.add("done"); L.classList.remove("sel");
      sess.answers++; if(!err.has(sel)) sess.right++;
      sel=null; left_n--;
      if(!left_n) setTimeout(()=>{ const r=sess.rounds[sess.r]; r.queue.shift(); sess.done++; next(); }, 350);
    } else {
      if(!err.has(sel)){ err.add(sel); sess.mistakes[sel]++; }
      [L,b].forEach(x=>{ x.classList.add("err"); setTimeout(()=>x.classList.remove("err"),400); });
    }
  });
}
function contextHtml(c){
  const x=c.examples?.find(e=>e.ru); if(!x) return "";
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
  <div class="flash"><div class="row" style="justify-content:center;flex-wrap:nowrap"><div class="trans" style="font-size:24px;font-weight:600">${esc(c.ru)}</div>${sayBtn(c.ru,"ru")}</div>${contextHtml(c)}</div>
  <div class="slots" id="slots">${chars.map((ch,i)=> ch===" " ? `<span class="slot gap"></span>` : isL(ch) ? `<span class="slot" data-s="${i}"></span>` : `<span class="slot fixed">${esc(ch)}</span>`).join("")}</div>
  <div class="tiles" id="tiles"></div><div id="fb"></div>`;
  const renderTiles=()=>{ $("#tiles").innerHTML = tiles.map(t=>`<button class="tile" data-k="${t.k}">${esc(t.ch)}</button>`).join(""); $("#tiles").querySelectorAll("[data-k]").forEach(b=>b.onclick=()=>press(b)); };
  const press = b => {
    if(pos>=letterIdx.length) return;
    const t=tiles.find(x=>String(x.k)===b.dataset.k), need=chars[letterIdx[pos]].toLowerCase();
    if(t.ch===need){
      const slot=$(`[data-s="${letterIdx[pos]}"]`); slot.textContent=chars[letterIdx[pos]]; slot.classList.add("fill");
      tiles=tiles.filter(x=>x!==t); pos++; wrongInRow=0; renderTiles();
      if(pos>=letterIdx.length){ autoSpeak(target,"en"); const ok=errors<2;
        if(ok) setTimeout(()=>done(errors===0,id,false),700);
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
function stepTyping(round, id){
  const c=cardOf(id), target=c.en;
  let hinted=false;
  body().innerHTML = head("typing") + `
  <div class="flash"><div class="row" style="justify-content:center;flex-wrap:nowrap"><div class="trans" style="font-size:24px;font-weight:600">${esc(c.ru)}</div>${sayBtn(c.ru,"ru")}</div>${contextHtml(c)}</div>
  <form id="tf" class="stack" style="gap:10px"><input class="input type-in" id="ti" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="по-английски" aria-label="Ответ по-английски">
  <div class="row" style="justify-content:space-between"><div class="row"><button type="button" class="btn ghost" id="hint">Подсказка</button><button type="button" class="btn ghost" id="dunno">Не помню</button></div><button class="btn primary" type="submit" id="check">Проверить</button></div></form>
  <div id="fb"></div>`;
  const ti=$("#ti"); ti.focus();
  const accept = v => { const a=norm(v), t=norm(target), t2=t.replace(/^to /,""); if(a===t||a===t2) return "exact"; const d=Math.min(lev(a,t),lev(a,t2)); if(t.length>=5 && d<=1) return "typo"; return null; };
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
      else setTimeout(()=>done(!hinted,id,false),750);
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
  if(e.key==="Escape"){ askClose(); return; }
  const round=sess?.rounds[sess.r]; if(!round) return;
  if(round.type==="letters" && sess.keyHandler && !e.ctrlKey && !e.metaKey){ sess.keyHandler(e); return; }
  if(round.type==="choice" && /^[1-4]$/.test(e.key)){ $(`[data-o="${+e.key-1}"]`)?.click(); }
  if(e.key==="Enter" && !["INPUT","BUTTON","TEXTAREA","SELECT"].includes(document.activeElement?.tagName)){ const g=$("#go")||$("#iNext"); if(g){ e.preventDefault(); g.click(); } }
});
function askClose(){
  if(!sess || sess.finished){ closeSess(); return; }
  body().insertAdjacentHTML("afterbegin", `<div class="feedback no" id="qc"><div style="margin-bottom:8px">Прервать тренировку? Прогресс этой тренировки не сохранится.</div><div class="row"><button class="btn" id="qn">Продолжить</button><button class="btn primary" id="qy">Выйти</button></div></div>`);
  $("#qn").onclick=()=>$("#qc").remove(); $("#qy").onclick=closeSess;
}
$("#sessClose").onclick=askClose;
function closeSess(){ try{ speechSynthesis.cancel(); }catch{} $("#sess").hidden=true; document.body.style.overflow=""; sess=null; renderAll(); }

function finish(){
  sess.finished=true; updateBar();
  const now=Date.now(), rows=[];
  for(const id of sess.ids){
    const c=cardOf(id); if(!c) continue;
    const m=sess.mistakes[id];
    if(sess.skipped.has(id)){ c.box=4; }
    else if(sess.kind==="learn"){ c.box = m===0 ? 2 : 1; }
    else { if(m===0) c.box=Math.min(7,c.box+1); else if(m>=2){ c.box=1; c.lapses++; } }
    c.due = startOfDay(now) + INTERVALS[c.box]*DAY; c.reps++; c.last=now;
    Store.saveCard(c);
    rows.push({c, m, skip:sess.skipped.has(id)});
  }
  const k=dayKey(); const d=Store.stats.days[k] ||= {n:0,learned:0,reviewed:0,right:0,total:0};
  d.n+=rows.length; d[sess.kind==="learn"?"learned":"reviewed"]+=rows.length; d.right+=sess.right; d.total+=sess.answers;
  Store.saveStats();
  const acc = sess.answers ? Math.round(sess.right/sess.answers*100) : 100;
  const dueCount=allCards().filter(isDue).length, fresh=allCards().filter(c=>!c.box).length;
  body().innerHTML = `<div class="flash" style="gap:6px"><div class="label">${sess.kind==="learn"?"Обучение завершено":"Повторение завершено"}</div>
    <div class="bignum" style="font-size:52px">${acc}%</div><div class="muted">точность · ${rows.length} ${plural(rows.length,"слово","слова","слов")}</div></div>
    <div class="sum-list">${rows.map(r=>`<div class="sum-row"><b>${esc(r.c.en)}</b><span class="${r.m?"no":"ok"}">${r.skip?"уже знаю":r.m?`ошибок: ${r.m}`:"без ошибок"} · ${dueLabel(r.c)}</span></div>`).join("")}</div>
    <div class="sess-foot">${dueCount?`<button class="btn mark" id="more2">Повторить (${dueCount})</button>`:""}${fresh?`<button class="btn primary" id="more">Ещё ${Math.min(S().batch,fresh)} новых</button>`:""}<button class="btn" id="fin">Готово</button></div>`;
  $("#fin").onclick=closeSess;
  if($("#more")) $("#more").onclick=()=>{ sess=null; startLearn(); };
  if($("#more2")) $("#more2").onclick=()=>{ sess=null; startReview(); };
}

/* ============ progress ============ */
function renderStats(){
  const el=$("#v-stats"), cs=allCards();
  setTimeout(()=>bindGo(el));
  const cnt={new:0,learning:0,known:0}; cs.forEach(c=>cnt[status(c)]++);
  const due=cs.filter(isDue).length;
  const days=Store.stats.days||{}; let right=0,total=0; Object.values(days).forEach(d=>{right+=d.right||0; total+=d.total||0;});
  const st=streakInfo();
  // прогноз на 7 дней
  const fc=[]; for(let i=0;i<7;i++){ const s=startOfDay()+i*DAY, e=s+DAY; fc.push(cs.filter(c=>c.box>0 && (i===0 ? c.due<e : c.due>=s && c.due<e)).length); }
  const fmax=Math.max(1,...fc);
  const wd=["вс","пн","вт","ср","чт","пт","сб"];
  // активность 14 дней
  const act=[]; for(let i=13;i>=0;i--){ const t=Date.now()-i*DAY; act.push({t, n:days[dayKey(t)]?.n||0}); }
  const amax=Math.max(1,...act.map(a=>a.n));
  // распределение по уровням
  const byBox=Array(8).fill(0); cs.forEach(c=>byBox[c.box]++);
  const tot=Math.max(1,cs.length);
  el.innerHTML=`
  <div class="sec-head" style="margin-top:4px"><h2>Ваш прогресс</h2><button class="pill-link" data-go="learn">Учить</button></div>
  <div class="kpis">
    <div class="kpi"><b>${cs.length}</b><span>всего карточек</span></div>
    <div class="kpi"><b>${cnt.known}</b><span>выучено</span></div>
    <div class="kpi"><b>${cnt.learning}</b><span>в процессе</span></div>
    <div class="kpi"><b>${total?Math.round(right/total*100)+"%":"—"}</b><span>точность ответов</span></div>
  </div>
  <div class="panel stack" style="gap:10px">
    <div class="row" style="justify-content:space-between"><div class="label">Состояние колоды</div><span class="small muted">серия: ${st.n} ${plural(st.n,"день","дня","дней")}</span></div>
    <div class="stackbar" role="img" aria-label="Новые ${cnt.new}, учу ${cnt.learning}, выучено ${cnt.known}">
      <i style="width:${cnt.new/tot*100}%;background:var(--line)"></i><i style="width:${cnt.learning/tot*100}%;background:var(--pink)"></i><i style="width:${cnt.known/tot*100}%;background:var(--accent)"></i>
    </div>
    <div class="legend"><span style="--c:var(--line)">новые ${cnt.new}</span><span style="--c:var(--pink)">учу ${cnt.learning}</span><span style="--c:var(--accent)">выучено ${cnt.known}</span></div>
    <div class="small muted">Уровни 1–7: ${byBox.slice(1).map((n,i)=>`<span class="num">${i+1}: ${n}</span>`).join(" · ")}. Слово считается выученным с 4-го уровня, когда интервал повторения дошёл до 16 дней.</div>
  </div>
  <div class="panel">
    <div class="row" style="justify-content:space-between"><div class="label">Повторения на неделю</div><span class="small muted">сегодня: ${due}</span></div>
    <div class="bars">${fc.map((n,i)=>`<div class="bar"><em>${n||""}</em><i class="${i===0?"today":""}" style="height:${n/fmax*100}%"></i></div>`).join("")}</div>
    <div class="bar-labels">${fc.map((_,i)=>`<span>${i===0?"сег.":wd[new Date(Date.now()+i*DAY).getDay()]}</span>`).join("")}</div>
  </div>
  <div class="panel">
    <div class="row" style="justify-content:space-between"><div class="label">Активность за 2 недели</div><span class="small muted">слов в день</span></div>
    <div class="bars">${act.map((a,i)=>`<div class="bar"><em>${a.n||""}</em><i class="${i===13?"today":""}" style="height:${a.n/amax*100}%"></i></div>`).join("")}</div>
    <div class="bar-labels">${act.map(a=>`<span>${new Date(a.t).getDate()}</span>`).join("")}</div>
  </div>
  <div class="panel stack" style="gap:8px">
    <div class="label">Трудные слова</div>
    ${(()=>{ const hard=cs.filter(c=>c.lapses>0).sort((a,b)=>b.lapses-a.lapses).slice(0,6); return hard.length? hard.map(c=>`<div class="row" style="justify-content:space-between"><span><b>${esc(c.en)}</b> <span class="muted">— ${esc(c.ru)}</span></span><span class="chip">забыто ${c.lapses}×</span></div>`).join("") : `<div class="muted small">Пока нет: сюда попадут слова, которые забылись при повторении.</div>`; })()}
  </div>`;
}

/* ============ settings ============ */
function renderPrefs(){
  const s=S(), el=$("#v-prefs");
  const en=voices.filter(v=>/^en/i.test(v.lang)), hasRu=voices.some(v=>/^ru/i.test(v.lang));
  const seg=(key,opts)=>`<div class="seg" data-seg="${key}">${opts.map(([v,l])=>`<button type="button" data-v="${v}" aria-pressed="${s[key]===v}">${l}</button>`).join("")}</div>`;
  const sw=(k,l,d)=>`<div class="setrow"><div class="lbl"><b>${l}</b><span>${d}</span></div><label class="switch"><input type="checkbox" data-mode="${k}" ${s.modes[k]?"checked":""} aria-label="${l}"><span></span></label></div>`;
  el.innerHTML=`
  <div class="sec-head" style="margin-top:4px"><h2>Настройки</h2></div>
  <div class="panel">
    <div class="label" style="margin-bottom:4px">Обучение</div>
    <div class="setrow"><div class="lbl"><b>Слов за одну тренировку</b><span>от 5 до 25</span></div><div class="range"><input type="range" id="batch" min="5" max="25" value="${s.batch}" aria-label="Слов за тренировку"><output id="batchOut">${s.batch}</output></div></div>
    <div class="setrow"><div class="lbl"><b>Сначала показывать</b><span>язык лицевой стороны карточки</span></div>${seg("first",[["en","English"],["ru","Русский"]])}</div>
  </div>
  <div class="panel">
    <div class="label" style="margin-bottom:4px">Форматы упражнений</div>
    ${sw("choice","Выбор перевода","4 варианта, в обе стороны")}
    ${sw("match","Сопоставление пар","до 5 пар на экране")}
    ${sw("letters","Сборка из букв","слово собирается из перемешанных букв")}
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
    <div class="setrow"><div class="lbl"><b>Источник переводов</b><span>${SOURCE==="claude"?"Claude":"MyMemory + Free Dictionary API"}</span></div></div>
    ${SOURCE==="free"?`<div class="setrow" style="flex-wrap:wrap"><div class="lbl"><b>Email для MyMemory</b><span>Необязательно. Переводчик MyMemory бесплатно переводит около 5 000 символов в день, это примерно 30–50 новых карточек. Если указать email, лимит вырастет до 50 000. Подтверждать почту не нужно, адрес уходит только в MyMemory и сохраняется в ваших настройках.</span></div><input class="input" id="mmEmail" type="email" autocomplete="email" placeholder="you@example.com" value="${esc(s.mmEmail||"")}" style="max-width:260px"></div>`:""}
    <div class="setrow"><div class="lbl"><b>Резервная копия</b><span>скопировать колоду как JSON или вставить ранее сохранённую</span></div><div class="row"><button class="btn" id="exp">Копировать</button><button class="btn" id="imp">Вставить</button></div></div>
    <div class="setrow"><div class="lbl"><b>Очистить колоду</b><span>удалить все карточки и статистику</span></div><button class="btn danger" id="wipe">Очистить</button></div>
    <div id="dataArea"></div>
  </div>`;
  bindAccountPanel(el);
  const save=()=>{ Store.saveSettings(); };
  $("#batch").oninput=e=>{ s.batch=+e.target.value; $("#batchOut").textContent=s.batch; };
  $("#batch").onchange=save;
  $("#rate").onchange=e=>{ s.rate=+e.target.value; save(); renderPrefs(); speak("Nice to meet you","en"); };
  $("#voice").onchange=e=>{ s.voice=e.target.value; save(); tts("Nice to meet you","en"); };
  $("#native").onchange=e=>{ s.native=e.target.checked; save(); };
  if($("#mmEmail")) $("#mmEmail").onchange=e=>{ s.mmEmail=e.target.value.trim(); save(); toast(s.mmEmail?"Email сохранён":"Email убран"); };
  el.querySelectorAll("[data-seg]").forEach(g=>g.onclick=e=>{ const b=e.target.closest("button"); if(!b) return; s[g.dataset.seg]=b.dataset.v; save(); renderPrefs(); });
  el.querySelectorAll("[data-mode]").forEach(i=>i.onchange=()=>{ s.modes[i.dataset.mode]=i.checked; if(!Object.values(s.modes).some(Boolean)){ s.modes.choice=true; toast("Хотя бы один формат нужен — оставила выбор перевода"); renderPrefs(); } save(); });
  $("#exp").onclick=()=>{
    const json=JSON.stringify({cards:allCards(), stats:Store.stats},null,0);
    const done=()=>toast("Колода скопирована");
    const fallback=()=>{ $("#dataArea").innerHTML=`<textarea class="input" id="expText" readonly>${esc(json)}</textarea><p class="small muted">Выделите текст и скопируйте вручную.</p>`; $("#expText").select(); };
    try{ navigator.clipboard.writeText(json).then(done,fallback); }catch{ fallback(); }
  };
  $("#imp").onclick=()=>{
    $("#dataArea").innerHTML=`<div class="stack" style="gap:8px;margin-top:8px"><textarea class="input" id="impJson" placeholder="Вставьте сюда скопированный JSON"></textarea><button class="btn primary" id="impGo">Добавить в колоду</button></div>`;
    $("#impGo").onclick=()=>{ try{ const d=JSON.parse($("#impJson").value); let n=0; (Array.isArray(d.cards)?d.cards:[]).slice(0,10000).forEach(raw=>{ const c=sanitizeCard(raw); if(c){ Store.saveCard(c); n++; } }); const ds=sanitizeStats(d.stats); if(Object.keys(ds.days).length){ Store.stats.days={...ds.days, ...Store.stats.days}; Store.saveStats(); } toast(`Загружено ${n} ${plural(n,"карточка","карточки","карточек")}`); renderAll(); }catch{ toast("Не получилось прочитать JSON — проверьте, что скопирован целиком"); } };
  };
  $("#wipe").onclick=()=>{
    $("#dataArea").innerHTML=`<div class="feedback no" style="margin-top:8px"><div style="margin-bottom:8px">Удалить ${Store.cards.size} ${plural(Store.cards.size,"карточку","карточки","карточек")} и всю статистику?</div><div class="row"><button class="btn" id="wn">Отмена</button><button class="btn primary" id="wy" style="background:var(--bad);border-color:var(--bad)">Удалить всё</button></div></div>`;
    $("#wn").onclick=()=>$("#dataArea").innerHTML="";
    $("#wy").onclick=()=>{ [...Store.cards.keys()].forEach(id=>Store.deleteCard(id)); Store.stats={days:{}}; Store.saveStats(); renderAll(); toast("Колода очищена"); };
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
  if(!AUTH.enabled){ el.innerHTML=""; return; }
  if(Store.mode==="supa" && Store.user){
    const em=Store.user.email||"аккаунт";
    el.innerHTML=`<button class="avatar" id="acctBtn" title="${esc(em)}" aria-label="Аккаунт ${esc(em)}">${esc(em.charAt(0).toUpperCase())}</button>`;
    $("#acctBtn").onclick=()=>go("prefs");
  } else {
    el.innerHTML=`<button class="pill-link" id="acctBtn">Войти</button>`;
    $("#acctBtn").onclick=()=>openAuth("signin");
  }
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
    else say("Если такой аккаунт есть, мы отправили письмо со ссылкой. Проверьте почту и папку «Спам».", true);
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
    if(up && !data.session) return say("Почти готово: откройте письмо и подтвердите email, затем войдите.", true);
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
      <div class="row" style="justify-content:flex-end">${recovery?"":`<button type="button" class="btn" id="npCancel">Отмена</button>`}<button class="btn primary" type="submit">Сохранить</button></div>
    </form>`);
  if($("#npCancel")) $("#npCancel").onclick=closeModal;
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
      <button class="btn ghost small" data-priv style="align-self:flex-start;padding-left:0">Конфиденциальность</button>
    </div>`;
  return `<div class="panel stack" style="gap:6px">
    <div class="label">Аккаунт</div>
    <div class="setrow"><div class="lbl"><b>${esc(Store.user.email||"")}</b><span>${esc($("#sync")?.textContent||"")}</span></div><button class="btn" id="soBtn">Выйти</button></div>
    <div class="setrow"><div class="lbl"><b>Пароль</b><span>сменить пароль для входа по email</span></div><button class="btn" id="pwBtn">Сменить</button></div>
    <div class="setrow"><div class="lbl"><b>Удалить аккаунт</b><span>навсегда удалить аккаунт и все карточки с сервера</span></div><button class="btn danger" id="delAcc">Удалить</button></div>
    <button class="btn ghost small" data-priv style="align-self:flex-start;padding-left:0">Конфиденциальность</button>
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
    area.innerHTML=`<div class="feedback no small stack" style="gap:8px"><span>Аккаунт и все ${Store.cards.size} ${plural(Store.cards.size,"карточка","карточки","карточек")} будут удалены с сервера без возможности восстановления. Чтобы подтвердить, напишите <b>УДАЛИТЬ</b>.</span>
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
  openModal(`<h2 class="mtitle">Конфиденциальность</h2>
  <div class="privacy">
    <h3>Что хранится</h3>
    <p>Если вы не вошли — ничего не уходит на сервер: карточки, настройки и статистика лежат только в вашем браузере.</p>
    <p>Если вы вошли — на сервере хранятся ваш email, карточки (слова, переводы, примеры), настройки и статистика занятий. Больше ничего: ни имени, ни телефона, ни истории посещений.</p>
    <h3>Где и как</h3>
    <p>Данные лежат в базе Supabase в Европейском союзе (Франкфурт). Соединение зашифровано (HTTPS), данные на сервере тоже хранятся в зашифрованном виде. Пароль хранится только в виде необратимого хеша — его не видит никто, включая автора сайта.</p>
    <p>Каждая строчка базы привязана к вашему аккаунту, а правила доступа на сервере пропускают к ней только вас. Другие пользователи не могут ни прочитать, ни изменить ваши карточки.</p>
    <p>Автор сайта как владелец проекта технически имеет доступ к панели управления базой. Данные не продаются, не передаются третьим лицам и не используются для рекламы.</p>
    <h3>Внешние сервисы</h3>
    <p>Чтобы подобрать перевод, слово, которое вы вводите, отправляется в <a href="https://mymemory.translated.net" target="_blank" rel="noopener noreferrer">MyMemory</a> и <a href="https://dictionaryapi.dev" target="_blank" rel="noopener noreferrer">Free Dictionary API</a>. Уходит только само слово или пример, без email и без привязки к аккаунту. Email уходит в MyMemory, только если вы сами укажете его в настройках для увеличения лимита.</p>
    <p>При входе через Google аккаунт Google лишь подтверждает вашу личность; слова в Google не передаются.</p>
    <p>На сайте нет рекламы, счётчиков и сторонней аналитики. Шрифты и библиотеки загружаются с этого же сайта.</p>
    <h3>Ваши права</h3>
    <p>Скопировать все свои данные: Настройки → Резервная копия. Удалить аккаунт со всеми данными: Настройки → Аккаунт → Удалить — удаление происходит сразу и навсегда.</p>
  </div>
  <div class="row" style="justify-content:flex-end"><button class="btn primary" id="privOk">${back?"Назад":"Понятно"}</button></div>`);
  $("#privOk").onclick=()=> back ? back() : closeModal();
}

/* ============ routing ============ */
let view="learn";
const VIEWS=["learn","words","stats","prefs"];
function go(v){
  if(!VIEWS.includes(v)) v="learn"; view=v;
  VIEWS.forEach(x=>$("#v-"+x).hidden = x!==v);
  $("#tabs").querySelectorAll("button").forEach(b=>b.setAttribute("aria-current", b.dataset.view===v?"page":"false"));
  try{ history.replaceState(null,"","#"+v); }catch{}
  renderView(); window.scrollTo(0,0);
}
function renderView(){ ({learn:renderLearn, words:renderList, stats:renderStats, prefs:renderPrefs})[view](); }
function renderAll(){ renderView(); setSync(); }
$("#toLearn").onclick=()=>go("learn");
$("#tabs").onclick=e=>{ const b=e.target.closest("button"); if(b) go(b.dataset.view); };

/* ============ boot ============ */
Store.loadLocal();
go((location.hash||"").slice(1));
setSync(); renderSourceNote();
Store.connectClaude().then(()=>{ if(!sess) renderAll(); else setSync(); initAuth(); });
try{ navigator.storage?.persist?.().catch(()=>{}); }catch{}
document.addEventListener("click", e=>{ if(e.target.closest("#footPriv")){ e.preventDefault(); openPrivacy(); } });
