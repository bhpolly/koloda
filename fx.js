/* Колода: живые эффекты. Цветы рисуются кодом (градиентные лепестки, раскрытие, покачивание), луг с бабочкой,
   наклон карточек за курсором, лепестки за верный ответ, счётчики. Всё это только украшение: без JS приложение работает. */
(()=>{
"use strict";
const NS="http://www.w3.org/2000/svg", doc=document;
const reduce=()=>matchMedia("(prefers-reduced-motion: reduce)").matches;
const fine=matchMedia("(hover:hover) and (pointer:fine)").matches;
/* ---- плоские цветы в духе бумажной аппликации: сплошные цвета, без градиентов ---- */
const C={pink:"#E9578F", pinkL:"#F6B3CC", pinkS:"#F2A0BF", mustard:"#F0B13A", mustardL:"#F8D07A", orange:"#D2742B", cream:"#F5E9D5", sage:"#A5C48A", sageD:"#86A96B", olive:"#7B7A2B", ink:"#1A1A1A"};
function sprite(){}
const P_ROUND="M0 0C-36-8-46-50-18-68C-8-74 8-74 18-68C46-50 36-8 0 0Z";
const P_NARROW="M0 0C-11-8-13-46 0-66C13-46 11-8 0 0Z";
function ring(n,off,sc,P,fill,base,extra=""){
  let s=""; for(let i=0;i<n;i++) s+=`<g class="pt" style="--a:${(off+i*360/n).toFixed(1)}deg;--s:${sc};--i:${base+i}"><g class="pf" style="--i:${i}"><path d="${P}" fill="${fill}"${extra}/></g></g>`;
  return s;
}
function dots(n,r,fill,rad=1.6){ let s=""; for(let i=0;i<n;i++){ const a=i*2.39996, d=r*Math.sqrt((i+.5)/n); s+=`<circle cx="${(d*Math.cos(a)).toFixed(1)}" cy="${(d*Math.sin(a)).toFixed(1)}" r="${rad}" fill="${fill}"/>`; } return s; }
function headFor(kind){
  if(kind==="lime")   /* горчичная ромашка */
    return ring(12,0,1,P_NARROW,C.mustard,0)+ring(12,15,.66,P_NARROW,C.mustardL,12)+`<circle r="13" fill="${C.orange}"/>${dots(9,9,"#F2B65A",1.5)}`;
  if(kind==="blush")  /* кремовый цветок с розовой серединой */
    return ring(6,0,1,P_ROUND,C.cream,0)+ring(6,30,.58,P_ROUND,"#EFD9BC",6)+`<circle r="12" fill="${C.pinkS}"/>${dots(8,8,C.pink,1.5)}`;
  /* розовый мак */
  return ring(5,0,1,P_ROUND,C.pink,0)+ring(5,36,.66,P_ROUND,C.pinkL,5)+`<circle r="11" fill="${C.mustard}"/>${dots(10,7,C.orange,1.4)}`;
}
function tulipHead(){
  const back="M0 60C-34 56-46 16-36-30C-30-52-14-68-4-84C0-56 4-24 10 8Z";
  const one=(d,a,fill,i)=>`<g class="pt" style="--a:${a}deg;--s:1;--i:${i}"><g class="pf" style="--i:${i}"><path d="${d}" fill="${fill}"/></g></g>`;
  return one(back,0,"#E9578F",0)+`<g transform="scale(-1 1)">${one(back,0,"#E9578F",1)}</g>`+one("M0 64C-38 58-46 16-34-26C-26-52-10-72 0-90C10-72 26-52 34-26C46 16 38 58 0 64Z",0,C.cream,2)+`<path d="M0 60C-8 30-8-20 0-84" stroke="#fff" stroke-opacity=".35" stroke-width="3" fill="none" stroke-linecap="round"/>`;
}
const LEAF="M0 0C-26-4-56-22-76-58C-44-60-14-42 0 0Z";
const leaf=(x,y,rot,sc,dl,fill)=>`<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})"><g class="leaf" style="animation-delay:${dl}s"><path d="${LEAF}" fill="${fill}"/><path d="M0 0C-22-8-46-26-66-52" stroke="rgba(26,26,26,.22)" stroke-width="1.6" fill="none"/></g></g>`;
function flowerSVG(kind, opt={}){
  const stem=opt.stem!==false, lean=opt.lean||0;
  const head=kind==="tulip"?tulipHead():headFor(kind);
  const hx=140, hy=kind==="tulip"?152:140;
  const sd=`M140 400C${132-lean*.4} 330 ${150+lean*.3} 250 ${hx+lean} ${hy+24}`;
  const st=stem?`<path class="stem" d="${sd}" stroke="${C.sage}" stroke-width="9" fill="none" stroke-linecap="round"/>
    ${leaf(136,330,-6,1,0,C.olive)}${leaf(143,268,186,.82,-1.7,C.sageD)}`:"";
  return `<svg viewBox="0 ${stem?0:30} 280 ${stem?400:222}" aria-hidden="true" focusable="false">${st}<g transform="translate(${hx+lean} ${hy})"><g class="head">${head}</g></g></svg>`;
}
const CAT=`<img class="cat" src="art/cat.svg" alt="" width="120" height="132">`;
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
    [["tulip",130,"1%",.74,.1,5.8,-3,8],["pink",171,"7%",.6,.3,6.2,2,-10],["lime",153,"19%",.74,.5,5.6,-3,6],["blush",195,"29%",.6,.2,6.6,3,-8],
     ["pink",228,"47%",.74,.4,5.9,-2,12],["lime",192,"60%",.74,.15,6.4,4,-12],["blush",247,"71%",.74,.35,6.0,-3,8],["tulip",156,"84%",.6,.25,5.5,3,-6],["pink",208,"91%",.74,.05,6.3,-2,10]]
      .forEach(([k,sz,l,v,dl,sw,t,ln])=>w.append(gf(k,{w:sz,l,b:-Math.round(sz*1.43*(1-v)),dl,sw,tilt:t,lean:ln})));
    const c=doc.createElement("div"); c.className="catwrap"; c.innerHTML=CAT; w.append(c);
  },
  welcome:w=>{
    [["pink",150,"3%",.62,.1,5.6,-3,8],["lime",120,"17%",.6,.3,6.4,4,-8],["blush",160,"30%",.62,.2,5.9,-4,6],["tulip",110,"46%",.6,.45,6.6,3,-6],["lime",150,"56%",.62,.15,5.2,-2,10]]
      .forEach(([k,sz,l,v,dl,sw,t,ln])=>w.append(gf(k,{w:sz,l,b:-Math.round(sz*1.43*(1-v)),dl,sw,tilt:t,lean:ln})));
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
  const cols=["#F2A0BF","#A5C48A","#F0B13A","#E9578F","#F5E9D5"];
  for(let i=0;i<n;i++){
    const p=doc.createElement("i"); p.className="petal-p";
    const a=Math.random()*Math.PI*2, d=(60+Math.random()*120)*spread;
    p.style.cssText=`left:${x}px;top:${y}px;--dx:${Math.cos(a)*d}px;--dy:${Math.sin(a)*d-60}px;--r:${(Math.random()*720-360)|0}deg;--c:${cols[i%cols.length]};--w:${8+Math.random()*8|0}px;animation-duration:${.8+Math.random()*.7}s`;
    doc.body.append(p); p.addEventListener("animationend",()=>p.remove(),{once:true});
  }
}
function rain(){
  if(reduce()) return;
  const cols=["#F2A0BF","#A5C48A","#F0B13A","#E9578F"], W=innerWidth;
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
