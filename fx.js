/* Колода: живые эффекты. Цветы рисуются кодом (градиентные лепестки, раскрытие, покачивание), луг с бабочкой,
   наклон карточек за курсором, лепестки за верный ответ, счётчики. Всё это только украшение: без JS приложение работает. */
(()=>{
"use strict";
const NS="http://www.w3.org/2000/svg", doc=document;
const reduce=()=>matchMedia("(prefers-reduced-motion: reduce)").matches;
const fine=matchMedia("(hover:hover) and (pointer:fine)").matches;
const KINDS={
  pink :{p:["#FFD6EA","#FF74B8","#C21B6B"], c:["#FCFFE0","#C9F26B","#6DB81E"]},
  lime :{p:["#F3FFC2","#C9F26B","#4E9E12"], c:["#FFEFF7","#FF9FCF","#E0307F"]},
  blush:{p:["#FFFFFF","#FFC4E1","#F2609F"], c:["#FCFFE0","#C9F26B","#6DB81E"]}
};
/* ---- общие градиенты (один раз на страницу) ---- */
function sprite(){
  if(doc.getElementById("fx-defs")) return;
  let g="";
  for(const [k,v] of Object.entries(KINDS)){
    g+=`<linearGradient id="g-${k}-b" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${v.p[2]}"/><stop offset=".5" stop-color="${v.p[1]}"/><stop offset="1" stop-color="${v.p[0]}"/></linearGradient>
    <linearGradient id="g-${k}-f" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${v.p[2]}"/><stop offset=".45" stop-color="${v.p[1]}"/><stop offset="1" stop-color="${v.p[0]}"/></linearGradient>
    <radialGradient id="g-${k}-c" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="${v.c[0]}"/><stop offset=".5" stop-color="${v.c[1]}"/><stop offset="1" stop-color="${v.c[2]}"/></radialGradient>`;
  }
  g+=`<radialGradient id="g-sheen" cx=".3" cy=".3" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <radialGradient id="g-dome" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#2d5a05" stop-opacity=".35"/></radialGradient>
  <linearGradient id="g-tulip" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#C9F26B"/><stop offset=".22" stop-color="#FFA6D1"/><stop offset=".7" stop-color="#FF8FC6"/><stop offset="1" stop-color="#FFD3EA"/></linearGradient>
  <linearGradient id="g-tulip-s" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#8FD13A"/><stop offset=".25" stop-color="#E8479A"/><stop offset=".8" stop-color="#FF8FC6"/><stop offset="1" stop-color="#FFC1E0"/></linearGradient>
  <filter id="fx-r" x="-25%" y="-25%" width="150%" height="150%"><feTurbulence type="fractalNoise" baseFrequency=".028 .05" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G" result="d"/><feDropShadow in="d" dx="0" dy="3" stdDeviation="3" flood-color="#8A0F4D" flood-opacity=".55"/></filter>
  <filter id="fx-r2" x="-25%" y="-25%" width="150%" height="150%"><feTurbulence type="fractalNoise" baseFrequency=".04 .07" numOctaves="2" seed="9" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="6" xChannelSelector="R" yChannelSelector="G" result="d"/><feDropShadow in="d" dx="0" dy="2" stdDeviation="2" flood-color="#8A0F4D" flood-opacity=".4"/></filter>
  <filter id="fx-r3" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="2" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="4" xChannelSelector="R" yChannelSelector="G" result="d"/><feDropShadow in="d" dx="0" dy="2" stdDeviation="2" flood-color="#1d4a05" flood-opacity=".3"/></filter>
  <linearGradient id="g-stem" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9BE04A"/><stop offset="1" stop-color="#4C9A1E"/></linearGradient>
  <linearGradient id="g-leaf" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#6FBF2A"/><stop offset="1" stop-color="#DDFF8E"/></linearGradient>
  <linearGradient id="g-wing1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE3F1"/><stop offset="1" stop-color="#FF8FC4"/></linearGradient>
  <linearGradient id="g-wing2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F4FFC8"/><stop offset="1" stop-color="#A5E04A"/></linearGradient>`;
  const s=doc.createElementNS(NS,"svg"); s.setAttribute("id","fx-defs"); s.setAttribute("width","0"); s.setAttribute("height","0"); s.setAttribute("aria-hidden","true"); s.style.cssText="position:absolute;width:0;height:0;overflow:hidden";
  s.innerHTML=`<defs>${g}</defs>`; doc.body.prepend(s);
}
/* ---- один цветок: лепестки с жилками, объёмом, неровным краем; стебель и листья ---- */
const P_POPPY="M0 0C-16-8-52-28-54-62C-56-90-30-104-12-98C-5-107 7-107 13-98C32-104 58-88 54-60C52-28 16-8 0 0Z";
const V_POPPY="M0-4C-8-30-18-58-24-88M0-4C0-34-1-62 0-96M0-4C8-30 18-58 24-88M0-4C-14-22-34-40-47-64M0-4C14-22 34-40 47-64";
const P_PEONY="M0 0C-26-4-48-24-48-50C-48-74-28-84-13-80C-6-87 6-87 13-80C28-84 48-74 48-50C48-24 26-4 0 0Z";
const V_PEONY="M0-4C-8-24-16-46-20-72M0-4C0-28 0-52 0-80M0-4C8-24 16-46 20-72M0-4C-14-16-32-32-40-52M0-4C14-16 32-32 40-52";
const P_GERB="M0 0C-9-10-13-44-5-90C-3-98 3-98 5-90C13-44 9-10 0 0Z";
const V_GERB="M0-6C-1-30-1-60 0-88";
function petal(kind,P,V,grad,extra=""){
  return `<path d="${P}" fill="url(#g-${kind}-${grad})" stroke="rgba(255,244,250,.6)" stroke-width="1"/>
  <path d="${V}" stroke="rgba(130,10,72,.2)" stroke-width=".9" fill="none" stroke-linecap="round"/>
  <path d="${P}" fill="url(#g-sheen)"/>${extra}`;
}
function ring(kind,n,off,sc,P,V,grad,base,filt){
  let s=""; for(let i=0;i<n;i++){
    s+=`<g class="pt" style="--a:${(off+i*360/n).toFixed(1)}deg;--s:${sc};--i:${base+i}"><g class="pf" style="--i:${i}">${petal(kind,P,V,grad)}</g></g>`;
  } return `<g filter="url(#${filt||"fx-r"})">${s}</g>`;
}
const SEEDS=n=>{ let s=""; for(let i=0;i<n;i++){ const r=2.7*Math.sqrt(i+1)*1.2, a=i*2.39996; s+=`<circle cx="${(r*Math.cos(a)).toFixed(1)}" cy="${(r*Math.sin(a)).toFixed(1)}" r="${(1.1+((i*7)%3)*.25).toFixed(2)}" fill="${i%3?"rgba(60,90,10,.6)":"rgba(255,255,255,.7)"}"/>`; } return s; };
function stamens(n,r0,r1){
  let s=""; for(let i=0;i<n;i++){ const a=i*360/n+((i*37)%11), l=r1-((i*13)%7); s+=`<g transform="rotate(${a.toFixed(1)})"><path d="M0-${r0}C${(i%2?3:-3)}-${(r0+l)/2} ${(i%2?-2:2)}-${l-4} 0-${l}" stroke="rgba(110,14,62,.55)" stroke-width="1" fill="none"/><circle cy="-${l}" r="1.9" fill="#7A0F45"/></g>`; } return s;
}
function headFor(kind){
  const sh="";
  if(kind==="lime"){        /* ромашка-гербера: два венчика узких лепестков */
    return sh+ring(kind,17,0,1.02,P_GERB,V_GERB,"b",0,"fx-r3")+ring(kind,15,12,.74,P_GERB,V_GERB,"f",17,"fx-r3")+
      `<circle r="20" fill="url(#g-${kind}-c)" stroke="rgba(60,90,10,.4)" stroke-width="1"/>${SEEDS(26)}
       <circle r="20" fill="url(#g-dome)"/>`;
  }
  if(kind==="blush"){       /* пион: плотные слои пышных лепестков */
    return sh+ring(kind,8,6,1.05,P_PEONY,V_PEONY,"b",0)+ring(kind,7,28,.82,P_PEONY,V_PEONY,"f",8)+
      ring(kind,6,10,.6,P_PEONY,V_PEONY,"f",15)+ring(kind,5,40,.38,P_PEONY,V_PEONY,"b",21,"fx-r2")+
      `<circle r="9" fill="url(#g-${kind}-c)" opacity=".95"/><circle r="9" fill="url(#g-dome)"/>`;
  }
  /* мак: широкие мятые лепестки + тычинки */
  return sh+ring(kind,5,8,1.04,P_POPPY,V_POPPY,"b",0)+ring(kind,5,44,.86,P_POPPY,V_POPPY,"f",5)+ring(kind,4,22,.58,P_POPPY,V_POPPY,"f",10,"fx-r2")+
    `<g>${stamens(30,10,30)}</g><circle r="11" fill="url(#g-${kind}-c)" stroke="rgba(60,90,10,.4)" stroke-width="1"/>
     <path d="M-8 0H8M0-8V8M-5.6-5.6L5.6 5.6M5.6-5.6L-5.6 5.6" stroke="rgba(60,90,10,.35)" stroke-width=".8"/><circle r="11" fill="url(#g-dome)"/>`;
}
function tulipHead(){
  const p=(d,a,gr)=>`<g class="pt" style="--a:${a}deg;--s:1;--i:${a?1:0}"><g class="pf" style="--i:${a?1:2}"><path d="${d}" fill="url(#${gr})" stroke="rgba(255,244,250,.55)" stroke-width="1"/><path d="${d}" fill="url(#g-sheen)"/></g></g>`;
  const back="M0 66C-40 62-54 22-42-26C-35-56-16-78-2-100C4-70 8-34 14 8Z";
  return `<g filter="url(#fx-r2)">${p(back,0,"g-tulip-s")}<g transform="scale(-1 1)">${p(back,0,"g-tulip-s")}</g>
   ${p("M0 70C-44 64-56 18-42-30C-34-60-14-84 0-106C14-84 34-60 42-30C56 18 44 64 0 70Z",0,"g-tulip")}
   <path d="M0 66C-10 30-12-20 0-100M-18 62C-26 20-26-30-12-86M18 62C26 20 26-30 12-86" stroke="rgba(130,10,72,.16)" stroke-width="1" fill="none"/></g>`;
}
const LEAF="M0 0C-26-4-62-24-88-66C-52-66-18-44 0 0Z";
const leaf=(x,y,rot,sc,dl)=>`<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})"><g class="leaf" style="animation-delay:${dl}s"><g filter="url(#fx-r3)"><path d="${LEAF}" fill="url(#g-leaf)" stroke="rgba(40,90,10,.3)" stroke-width=".8"/><path d="M0 0C-24-8-50-26-80-62" stroke="rgba(30,80,8,.35)" stroke-width="1.4" fill="none"/><path d="M-20-8L-26-26M-34-14L-44-30M-48-22L-60-32M-30-8L-36 4M-46-18L-56-8" stroke="rgba(30,80,8,.2)" stroke-width=".8" fill="none"/></g></g></g>`;
let _fid=0;
function flowerSVG(kind, opt={}){
  const stem=opt.stem!==false, lean=opt.lean||0;
  const head=kind==="tulip"?tulipHead():headFor(kind);
  const hx=140, hy=kind==="tulip"?152:140;
  const sd=`M140 400C${132-lean*.4} 330 ${150+lean*.3} 250 ${hx+lean} ${hy+24}`;
  const st=stem?`<path class="stem" d="${sd}" stroke="url(#g-stem)" stroke-width="8" fill="none" stroke-linecap="round"/>
    <path d="${sd}" stroke="rgba(255,255,255,.35)" stroke-width="1.6" fill="none" stroke-linecap="round" transform="translate(-1.6 0)"/>
    ${leaf(136,330,-6,1,0)}${leaf(143,268,186,.82,-1.7)}`:"";
  return `<svg viewBox="0 ${stem?0:30} 280 ${stem?400:222}" aria-hidden="true" focusable="false">${st}<g transform="translate(${hx+lean} ${hy})"><g class="head">${head}</g></g></svg>`;
}
const BFLY=`<svg viewBox="0 0 80 60" aria-hidden="true"><g class="bw bw-l"><path d="M40 28C26 6 6 6 4 20C3 32 24 36 40 30Z" fill="url(#g-wing1)" stroke="#161616" stroke-width="1.6" stroke-linejoin="round"/><path d="M40 32C26 34 10 44 16 54C24 60 38 46 40 36Z" fill="url(#g-wing2)" stroke="#161616" stroke-width="1.6" stroke-linejoin="round"/></g>
  <g class="bw bw-r"><path d="M40 28C54 6 74 6 76 20C77 32 56 36 40 30Z" fill="url(#g-wing1)" stroke="#161616" stroke-width="1.6" stroke-linejoin="round"/><path d="M40 32C54 34 70 44 64 54C56 60 42 46 40 36Z" fill="url(#g-wing2)" stroke="#161616" stroke-width="1.6" stroke-linejoin="round"/></g>
  <rect x="37.5" y="20" width="5" height="26" rx="2.5" fill="#161616"/><path d="M39 21C36 12 32 9 30 8M41 21C44 12 48 9 50 8" stroke="#161616" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>`;
/* ---- расстановка ---- */
const bloomed=new Set();
function gf(kind, o){
  const d=doc.createElement("div"); d.className="gf"+(o.cls?" "+o.cls:"");
  const st=d.style; st.width=o.w+"px"; if(o.l!=null) st.left=o.l; if(o.r!=null) st.right=o.r; st.bottom=(o.b??-30)+"px"; if(o.t!=null){ st.top=o.t; st.bottom="auto"; }
  st.setProperty("--sw",(o.sw||5)+"s"); st.setProperty("--dl",(o.dl||0)+"s"); st.setProperty("--tilt",(o.tilt||0)+"deg"); if(o.z) st.zIndex=o.z;
  d.innerHTML=flowerSVG(kind,{stem:o.stem,lean:o.lean}); return d;
}
function wrap(el, key, build, cls){
  const w=doc.createElement("div"); w.className="fx-deco "+(cls||"");
  if(bloomed.has(key)) w.classList.add("settled"); else bloomed.add(key);
  build(w); el.prepend(w);
}
const SPECS={
  hero:w=>{
    /* [вид, ширина, left, видимая доля, задержка, период качания, наклон, изгиб стебля] */
    [["tulip",100,"1%",.74,.1,5.8,-3,8],["pink",132,"7%",.6,.3,6.2,2,-10],["lime",118,"19%",.74,.5,5.6,-3,6],["blush",150,"29%",.6,.2,6.6,3,-8],
     ["pink",176,"47%",.74,.4,5.9,-2,12],["lime",148,"60%",.74,.15,6.4,4,-12],["blush",190,"71%",.74,.35,6.0,-3,8],["tulip",120,"84%",.6,.25,5.5,3,-6],["pink",160,"91%",.74,.05,6.3,-2,10]]
      .forEach(([k,sz,l,v,dl,sw,t,ln])=>w.append(gf(k,{w:sz,l,b:-Math.round(sz*1.43*(1-v)),dl,sw,tilt:t,lean:ln})));
    const f=doc.createElement("div"); f.className="bfly"; f.innerHTML=`<div class="bob">${BFLY}</div>`; w.append(f);
    for(let i=0;i<7;i++){ const p=doc.createElement("i"); p.className="pollen"; p.style.cssText=`left:${8+i*13}%;--dl:${(i*.9).toFixed(1)}s;--du:${(5+i%3*1.6).toFixed(1)}s`; w.append(p); }
  },
  welcome:w=>{
    [["pink",150,"3%",.62,.1,5.6,-3,8],["lime",120,"17%",.6,.3,6.4,4,-8],["blush",160,"30%",.62,.2,5.9,-4,6],["tulip",110,"46%",.6,.45,6.6,3,-6],["lime",150,"56%",.62,.15,5.2,-2,10]]
      .forEach(([k,sz,l,v,dl,sw,t,ln])=>w.append(gf(k,{w:sz,l,b:-Math.round(sz*1.43*(1-v)),dl,sw,tilt:t,lean:ln})));
    const f=doc.createElement("div"); f.className="bfly b2"; f.innerHTML=`<div class="bob">${BFLY}</div>`; w.append(f);
  },
  tile:w=>w.append(gf("blush",{w:120,r:"-18px",b:-70,sw:5.5,dl:.1,tilt:-6,lean:-8})),
  tile2:w=>w.append(gf("pink",{w:120,r:"-18px",b:-70,sw:6,dl:.2,tilt:6,lean:8})),
  mascot:w=>w.append(gf("pink",{w:124,r:"128px",b:-66,sw:5.2,dl:.2,tilt:-4,lean:6})),
  card:w=>{ w.append(gf("lime",{w:118,r:"-8px",b:-76,sw:5.4,dl:.1,tilt:6,lean:-8})); w.append(gf("tulip",{w:84,r:"96px",b:-62,sw:6.2,dl:.35,tilt:-5,lean:6})); },
  logo:w=>{ const d=doc.createElement("div"); d.className="gf head-only"; d.innerHTML=flowerSVG("lime",{stem:false}); w.append(d); }
};
const RULES=[
  [".prog","hero",SPECS.hero,"meadow"],
  [".welcome","welcome",SPECS.welcome,"meadow wm"],
  [".acts .ftile.lime","tile",SPECS.tile,"corner"],
  [".acts .ftile.compact:not(.lime):not(.addtile)","tile2",SPECS.tile2,"corner"],
  [".howinv","mascot",SPECS.mascot,"corner"],
  [".flash:not(:has(.ex-list))","card",SPECS.card,"corner"],
  [".logo","logo",SPECS.logo,"logo-fx"]
];
const lastNum=new Map();
function countUp(el, key){
  if(el.dataset.cu) return; const to=parseFloat(el.textContent); if(!isFinite(to)) return;
  el.dataset.cu="1"; const from=lastNum.has(key)?lastNum.get(key):0; lastNum.set(key,to);
  if(reduce() || from===to){ return; }
  const t0=performance.now(), dur=900;
  const tick=t=>{ const k=Math.min(1,(t-t0)/dur), e=1-Math.pow(1-k,3); el.textContent=String(Math.round(from+(to-from)*e)); if(k<1 && el.isConnected) requestAnimationFrame(tick); else el.textContent=String(to); };
  requestAnimationFrame(tick);
}
let pend=false;
function decorate(){
  pend=false; sprite();
  for(const [sel,key,fn,cls] of RULES) doc.querySelectorAll(sel).forEach(el=>{
    if(el.querySelector(":scope>.fx-deco")) return;
    wrap(el, key+(el.matches(".flash")?"":""), fn, cls);
  });
  doc.querySelectorAll(".prog-num b,.pstat b,.acts .bignum,.kpi b").forEach((b,i)=>countUp(b, (b.closest("section,div")?.className||"")+i));
  checkSession();
}
/* ---- лепестки за верный ответ ---- */
function burst(x,y,n=16,spread=1){
  if(reduce()) return;
  const cols=["#FF9FCF","#C9F26B","#FFFFFF","#E8348F","#A8E04A"];
  for(let i=0;i<n;i++){
    const p=doc.createElement("i"); p.className="petal-p";
    const a=Math.random()*Math.PI*2, d=(60+Math.random()*120)*spread;
    p.style.cssText=`left:${x}px;top:${y}px;--dx:${Math.cos(a)*d}px;--dy:${Math.sin(a)*d-60}px;--r:${(Math.random()*720-360)|0}deg;--c:${cols[i%cols.length]};--w:${8+Math.random()*8|0}px;animation-duration:${.8+Math.random()*.7}s`;
    doc.body.append(p); p.addEventListener("animationend",()=>p.remove(),{once:true});
  }
}
function rain(){
  if(reduce()) return;
  const cols=["#FF9FCF","#C9F26B","#FFFFFF","#E8348F"], W=innerWidth;
  for(let i=0;i<46;i++){
    const p=doc.createElement("i"); p.className="petal-p fall";
    p.style.cssText=`left:${Math.random()*W}px;top:-20px;--dx:${(Math.random()*160-80)|0}px;--dy:${innerHeight+40}px;--r:${(Math.random()*900-450)|0}deg;--c:${cols[i%4]};--w:${9+Math.random()*9|0}px;animation-duration:${2.4+Math.random()*2}s;animation-delay:${Math.random()*1.2}s`;
    doc.body.append(p); p.addEventListener("animationend",()=>p.remove(),{once:true});
  }
}
function checkSession(){
  const B=doc.getElementById("sessBody"); if(!B) return;
  const wrong=B.querySelector(".opt.wrong,.feedback.no,.mitem.err");
  const hit=el=>{ if(!el||el.dataset.fx) return; el.dataset.fx="1"; const r=el.getBoundingClientRect(); burst(r.left+r.width/2, r.top+r.height/2, 14); };
  if(!wrong){
    hit(B.querySelector(".opt.right"));
    hit(B.querySelector(".feedback.ok"));
  }
  B.querySelectorAll(".mitem.done").forEach(el=>{ if(!el.dataset.fx){ el.dataset.fx="1"; const r=el.getBoundingClientRect(); burst(r.left+r.width/2,r.top+r.height/2,8,.7); } });
  const fin=B.querySelector("#fin"); if(fin && !B.dataset.rain){ B.dataset.rain="1"; rain(); }
  if(!fin) delete B.dataset.rain;
}
/* ---- наклон и блик за курсором ---- */
if(fine){
  let cur=null;
  const SEL=".ftile,.feat,.pstat,.howstep,.kpi";
  doc.addEventListener("pointermove",e=>{
    if(reduce()) return;
    const t=e.target.closest&&e.target.closest(SEL);
    if(cur && cur!==t){ cur.style.setProperty("--rx","0deg"); cur.style.setProperty("--ry","0deg"); cur.classList.remove("hot"); }
    cur=t; if(!t) return;
    const r=t.getBoundingClientRect(), x=(e.clientX-r.left)/r.width, y=(e.clientY-r.top)/r.height;
    t.style.setProperty("--ry",((x-.5)*8).toFixed(2)+"deg"); t.style.setProperty("--rx",((.5-y)*8).toFixed(2)+"deg");
    t.style.setProperty("--gx",(x*100).toFixed(0)+"%"); t.style.setProperty("--gy",(y*100).toFixed(0)+"%"); t.classList.add("hot");
  },{passive:true});
  doc.addEventListener("pointerleave",()=>{ if(cur){ cur.style.setProperty("--rx","0deg"); cur.style.setProperty("--ry","0deg"); cur=null; } },true);
}
window.__fx={flowerSVG,sprite};
/* ---- запуск ---- */
const mo=new MutationObserver(()=>{ if(!pend){ pend=true; requestAnimationFrame(decorate); } });
function start(){ mo.observe(doc.body,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]}); decorate(); }
if(doc.readyState==="loading") doc.addEventListener("DOMContentLoaded",start); else start();
})();
