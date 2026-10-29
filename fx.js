/* Колода: живые эффекты. Появление блоков при прокрутке, счётчики с набором цифр, конфетти из бумажных квадратов за верный ответ.
   Всё это только украшение: без JS приложение работает. */
(()=>{
"use strict";
const doc=document;
const reduce=()=>matchMedia("(prefers-reduced-motion: reduce)").matches;
/* ---- счётчики: цифры набираются от прошлого значения ---- */
const lastNum=new Map();
function countUp(el, key){
  if(el.dataset.cu) return; const to=parseFloat(el.textContent); if(!isFinite(to)) return;
  el.dataset.cu="1"; const from=lastNum.has(key)?lastNum.get(key):0; lastNum.set(key,to);
  if(reduce() || from===to){ return; }
  const t0=performance.now(), dur=900;
  const tick=t=>{ const k=Math.min(1,(t-t0)/dur), e=1-Math.pow(1-k,3); el.textContent=String(Math.round(from+(to-from)*e)); if(k<1 && el.isConnected) requestAnimationFrame(tick); else el.textContent=String(to); };
  requestAnimationFrame(tick);
}
const io="IntersectionObserver" in window?new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add("in"); io.unobserve(e.target);} }),{rootMargin:"0px 0px -8% 0px",threshold:.05}):null;
function revealOnScroll(el){
  if(!io||el.dataset.rv||reduce()) return; el.dataset.rv="1";
  const r=el.getBoundingClientRect(); if(r.top<innerHeight*0.92) return; /* уже на экране: хватит анимации rise */
  el.style.animation="none"; el.classList.add("rv"); io.observe(el);
}
let pend=false;
function decorate(){
  pend=false;
  doc.querySelectorAll(".view > *, #v-learn > *, #v-how > *, #v-stats > *, #v-course > *, #v-grammar > *").forEach(revealOnScroll);
  doc.querySelectorAll(".prog-num b,.pstat b,.acts .bignum,.kpi b").forEach((b,i)=>countUp(b, (b.closest("section,div")?.className||"")+i));
  checkSession();
}
/* ---- конфетти за верный ответ: бумажные квадраты и кружки ---- */
const COLS=["#8A1538","#FF8FB8","#FFE97A","#9CCBFF","#2A3DB8","#7FE3B4"];
function chip(x,y,i,o){
  const p=doc.createElement("i"); p.className="petal-p"+(i%3===0?" dot":"")+(o.fall?" fall":"");
  const c=COLS[i%COLS.length];
  p.style.cssText=o.fall
    ?`left:${x}px;top:-20px;--dx:${(Math.random()*160-80)|0}px;--dy:${innerHeight+40}px;--r:${(Math.random()*900-450)|0}deg;--c:${c};--w:${9+Math.random()*9|0}px;animation-duration:${2.4+Math.random()*2}s;animation-delay:${Math.random()*1.2}s`
    :`left:${x}px;top:${y}px;--dx:${Math.cos(o.a)*o.d}px;--dy:${Math.sin(o.a)*o.d-60}px;--r:${(Math.random()*720-360)|0}deg;--c:${c};--w:${8+Math.random()*8|0}px;animation-duration:${.8+Math.random()*.7}s`;
  doc.body.append(p); p.addEventListener("animationend",()=>p.remove(),{once:true});
}
function burst(x,y,n=16,spread=1){
  if(reduce()) return;
  for(let i=0;i<n;i++) chip(x,y,i,{a:Math.random()*Math.PI*2,d:(60+Math.random()*120)*spread});
}
function rain(){
  if(reduce()) return;
  for(let i=0;i<46;i++) chip(Math.random()*innerWidth,0,i,{fall:true});
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
/* ---- запуск ---- */
const mo=new MutationObserver(()=>{ if(!pend){ pend=true; requestAnimationFrame(decorate); } });
function start(){ mo.observe(doc.body,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]}); decorate(); }
if(doc.readyState==="loading") doc.addEventListener("DOMContentLoaded",start); else start();
})();
