"use strict";
/* ============ Курс по English File Intermediate ============
   Раздел «Курс»: по каждому уроку учебника — слова, правило, задания и разговорная практика.
   Слова можно добавить в колоду (дальше работают интервальные повторения), правило — в заметки по грамматике.
   Содержание лежит в course/*.js, прогресс — в настройках пользователя (S().course = { "1A":[слова %, грамматика %, флаги] }). */
(() => {
const DONE = 80;                       // порог «шаг пройден», %
const F_VOC = 1, F_RULE = 2, F_SAY = 4; // флаги в прогрессе урока
const CR = { screen: "home", id: null, run: null };

const lessons = () => window.COURSE || [];
const lessonById = id => lessons().find(l => l.id === id);
const unitList = () => { const m = new Map(); lessons().forEach(l => { if (!m.has(l.u)) m.set(l.u, []); m.get(l.u).push(l); }); return [...m]; };
const prog = () => (S().course ||= {});
const pOf = id => { const p = prog()[id]; return Array.isArray(p) ? p : [0, 0, 0]; };
function setProg(id, fn) { const p = pOf(id).slice(); fn(p); prog()[id] = p; Store.saveSettings(); }
const stepsOf = l => { const [w, g, f] = pOf(l.id); return [
  { k: "v", t: l.pe ? "Фразы" : "Слова", d: `${l.v.length} ${l.pe ? "фраз" : plural(l.v.length, "слово", "слова", "слов")}`, done: !!(f & F_VOC) },
  { k: "w", t: l.pe ? "Практика фраз" : "Практика слов", d: w ? `лучший результат ${w}%` : "задания по словам урока", done: w >= DONE, score: w },
  { k: "r", t: "Грамматика", d: l.gr.title, done: !!(f & F_RULE) },
  { k: "g", t: "Практика грамматики", d: g ? `лучший результат ${g}%` : `${(l.x || []).length} заданий`, done: g >= DONE, score: g },
  { k: "s", t: "Говорим", d: "скажите вслух и сверьтесь с образцом", done: !!(f & F_SAY) } ]; };
const lessonPct = l => Math.round(stepsOf(l).filter(s => s.done).length / 5 * 100);
const lessonDone = l => stepsOf(l).every(s => s.done);
const nextStep = l => stepsOf(l).find(s => !s.done) || null;
const el = () => $("#v-course");
const top = () => window.scrollTo(0, 0);
const plain = s => String(s || "").replace(/…/g, "").replace(/[?!.]+$/, "").trim();

/* ---------- проверка ответов ---------- */
const CONTR = [[/\bwon't\b/g, "will not"], [/\bcan't\b/g, "cannot"], [/n't\b/g, " not"], [/'m\b/g, " am"], [/'re\b/g, " are"], [/'ve\b/g, " have"], [/'ll\b/g, " will"]];
function variants(s) {
  const t = norm(s).replace(/[,;"“”]/g, "").replace(/\s+/g, " ");
  const bases = [t];
  if (/'s\b/.test(t)) bases.push(t.replace(/'s\b/g, " is"), t.replace(/'s\b/g, " has"));
  if (/'d\b/.test(t)) bases.push(t.replace(/'d\b/g, " would"), t.replace(/'d\b/g, " had"));
  const out = new Set();
  for (const b of bases) { let x = b; for (const [r, v] of CONTR) x = x.replace(r, v); out.add(x.replace(/\bcan not\b/g, "cannot").replace(/\s+/g, " ").trim()); }
  return out;
}
function sameAnswer(user, answers) {
  const u = variants(user);
  return answers.some(a => { for (const v of variants(a)) if (u.has(v)) return true; return false; });
}

/* ---------- сборка вопросов ---------- */
const hilite = s => esc(s).replace(/_{3,}/g, '<span class="blank">_____</span>');
function pool(l) { const own = l.v; if (own.length >= 6) return own; return own.concat(shuffle(lessons().flatMap(x => x.v)).slice(0, 8)); }
function vocabQs(l, n = 12) {
  const items = shuffle(l.v).slice(0, n), qs = [];
  const wrong = (it, idx) => shuffle(pool(l).filter(x => x[0] !== it[0] && x[idx] !== it[idx])).slice(0, 3).map(x => x[idx]);
  items.forEach((it, i) => {
    const [en, ru, ex, exru, form] = it, head = plain(en).replace(/^to /i, ""), key = form || head;
    const m = ex && key ? ex.toLowerCase().indexOf(key.toLowerCase()) : -1;
    const phrase = /[…?!]/.test(en) || en.split(" ").length > 3;
    const kind = i % 4;
    if (kind === 0) qs.push({ k: "choice", p: en, say: en, sub: "Что это значит?", a: ru, o: shuffle([ru, ...wrong(it, 1)]), why: `${en} — ${ru}` });
    else if (kind === 1 && m >= 0) qs.push({ k: "type", mode: "cloze", p: ex.slice(0, m) + "___" + ex.slice(m + key.length), sub: exru ? `${exru} · подсказка: ${ru}` : `подсказка: ${ru}`, a: [ex.slice(m, m + key.length)], full: ex, why: `${en} — ${ru}` });
    else if (kind === 3 && !phrase) qs.push({ k: "type", mode: "ru2en", p: ru, sub: `Напишите по-английски: ${head.split(" ").length > 1 ? head.split(" ").length + " сл., начало «" + head.split(" ")[0][0] + "…»" : head.length + " букв, начало «" + head[0] + "»"}`, a: [...new Set([head, plain(en)])], hint: en, sp: en, why: `${ru} — ${en}`, fuzzy: true });
    else qs.push({ k: "choice", p: ru, sub: "Как это по-английски?", a: en, o: shuffle([en, ...wrong(it, 0)]), sayAns: true, why: `${ru} — ${en}` });
  });
  (l.odd || []).slice(0, 2).forEach(([w, i, why]) => qs.push({ k: "choice", p: "Какое слово лишнее?", sub: "Три слова из одной группы, одно не подходит", a: w[i], o: shuffle(w), why }));
  return shuffle(qs);
}
function grammarQs(l) {
  return shuffle((l.x || []).map(x => {
    if (x.t === "gap") return { k: "type", mode: "gap", p: x.q, a: x.a, why: x.w, full: x.q.replace(/_{3,}/g, x.a[0]) };
    if (x.t === "pick") return { k: "choice", p: x.q, a: x.o[0], o: shuffle(x.o), why: x.w, full: /_{3,}/.test(x.q) ? x.q.replace(/_{3,}/g, x.o[0]) : "" };
    if (x.t === "fix") return { k: "type", mode: "fix", p: x.q, sub: "Исправьте ошибку и напишите предложение целиком", a: x.a, why: x.w, full: x.a[0] };
    if (x.t === "tr") return { k: "type", mode: "tr", p: x.ru, sub: "Переведите на английский", a: x.a, why: "", self: true, full: x.a[0] };
    if (x.t === "order") return { k: "order", p: x.ru, a: [x.a, ...x.alt], full: x.a };
    return null;
  }).filter(Boolean));
}
function tokens(sentence) {
  const t = sentence.replace(/[?.!]+$/, "").split(" ");
  if (t[0] && !/^I($|['’])/.test(t[0])) t[0] = t[0][0].toLowerCase() + t[0].slice(1);
  return t;
}

/* ---------- прогон заданий ---------- */
function startRun(kind, id, qs) {
  if (!qs.length) { toast("В этом уроке пока нет заданий"); return; }
  CR.run = { kind, id, qs, queue: qs.map((_, i) => i), pos: 0, total: qs.length, firstOk: 0, tried: new Set(), missed: [], busy: false };
  CR.screen = "run"; renderCourse(true); top();
}
const bodyEl = () => $("#crsBody");
function runHead(r) {
  const p = Math.round((r.total - r.queue.length + r.pos) / r.total * 100);
  return `<div class="row crs-runtop"><button class="btn ghost" id="crsExit" type="button">← Выйти</button><div class="pbar" style="flex:1"><i style="width:${Math.min(100, p)}%"></i></div><span class="small muted">${Math.min(r.total, r.total - r.queue.length + r.pos + 1)} / ${r.total}</span></div>`;
}
function renderRun() {
  const r = CR.run; if (!r) { CR.screen = "home"; return renderCourse(true); }
  if (r.pos >= r.queue.length) return finishRun();
  const q = r.qs[r.queue[r.pos]]; r.busy = false;
  const label = q.k === "order" ? "Соберите предложение" : q.mode === "gap" ? "Вставьте форму" : q.mode === "fix" ? "Найдите ошибку" : q.mode === "tr" ? "Переведите" : q.mode === "cloze" ? "Вставьте слово" : q.mode === "ru2en" ? "Напишите по-английски" : "Выберите";
  let h = `<div class="stack crs-run">${runHead(r)}<div class="mode-tag"><span class="label">${label}</span></div>`;
  if (q.k === "choice") {
    h += `<div class="flash"><div class="word crs-p">${hilite(q.p)}</div>${q.say ? sayBtn(q.p, "en", false) : ""}${q.sub ? `<div class="small muted">${esc(q.sub)}</div>` : ""}</div>
    <div class="opts">${q.o.map((o, i) => `<button class="opt" type="button" data-o="${i}"><kbd>${i + 1}</kbd><span>${esc(o)}</span></button>`).join("")}</div>`;
  } else if (q.k === "type") {
    h += `<div class="flash"><div class="word crs-p ${q.mode === "fix" ? "crs-bad" : ""}">${hilite(q.p)}</div>${q.sub ? `<div class="small muted">${esc(q.sub)}</div>` : ""}</div>
    <form id="crsForm" class="stack" style="gap:10px"><input class="input type-in" id="crsIn" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${q.mode === "fix" || q.mode === "tr" ? "ваше предложение" : "по-английски"}" aria-label="Ответ"><button class="btn primary wide" type="submit">Проверить</button>
    <div class="row hintrow"><button type="button" class="btn ghost" id="crsHint">Подсказка</button><button type="button" class="btn ghost" id="crsIdk">Не знаю</button></div></form>`;
  } else {
    r.pick = []; r.bank = shuffle(tokens(q.a[0]).map((t, i) => ({ t, i })));
    h += `<div class="flash"><div class="word crs-p">${esc(q.p)}</div><div class="small muted">Нажимайте слова по порядку</div></div>
    <div class="crs-built" id="crsBuilt" aria-live="polite"></div><div class="crs-bank" id="crsBank"></div>
    <div class="row hintrow"><button type="button" class="btn ghost" id="crsReset">Сбросить</button><button type="button" class="btn primary" id="crsCheck" disabled>Проверить</button></div>`;
  }
  h += `<div id="crsFb"></div></div>`;
  el().innerHTML = `<div class="panel" id="crsBody">${h}</div>`;
  $("#crsExit").onclick = () => { CR.run = null; CR.screen = CR.id && lessonById(CR.id) ? "lesson" : "home"; renderCourse(true); top(); };
  if (q.k === "choice") bindChoice(q); else if (q.k === "type") bindType(q); else bindOrder(q);
}
function feedback(q, ok, shown, extra = "") {
  const r = CR.run, full = q.full || (q.k === "choice" ? q.a : q.a[0]);
  const say = q.sp || q.full || (q.k === "choice" ? (isCyr(q.a) ? q.p : q.a) : "");
  if (say && /[a-z]/i.test(say) && !isCyr(say)) autoSpeak(say, "en");
  if (!ok && !r.tried.has(r.queue[r.pos])) { r.missed.push(q); }
  const right = q.k === "choice" ? q.a : q.k === "order" ? q.a[0] : q.a.join(" / ");
  const full2 = q.full && q.full !== right ? `<div class="small" style="margin-top:6px">${esc(q.full)} ${sayBtn(q.full)}</div>` : "";
  $("#crsFb").innerHTML = `<div class="feedback ${ok ? "ok" : "no"}">${ok ? "Верно. " : shown ? "" : "Не совсем. "}${ok ? "" : `Правильно: <b>${esc(right)}</b>`}${full2}${q.why ? `<div class="small" style="margin-top:6px;font-weight:500">${esc(q.why)}</div>` : ""}${extra}</div>
    <div class="sess-foot"><button class="btn primary" id="crsNext" type="button">Дальше</button></div>`;
  const nx = $("#crsNext"); nx.onclick = () => advance(ok); nx.focus();
}
function advance(ok) {
  const r = CR.run; if (!r) return;
  const idx = r.queue[r.pos];
  if (ok) { if (!r.tried.has(idx)) r.firstOk++; r.pos++; }
  else { if (!r.tried.has(idx)) { r.tried.add(idx); r.queue.push(idx); } r.pos++; }
  renderRun();
}
function bindChoice(q) {
  const btns = [...document.querySelectorAll("#crsBody [data-o]")];
  btns.forEach(b => b.onclick = () => {
    const r = CR.run; if (r.busy) return; r.busy = true;
    const ok = q.o[+b.dataset.o] === q.a;
    btns.forEach(x => { x.disabled = true; if (q.o[+x.dataset.o] === q.a) x.classList.add("right"); });
    if (!ok) b.classList.add("wrong");
    feedback(q, ok, false);
  });
}
function bindType(q) {
  const inp = $("#crsIn"); inp.focus(); let hinted = false;
  const finish = (ok, shown, extra) => { CR.run.busy = true; inp.disabled = true; inp.classList.add(ok ? "right" : "wrong"); $("#crsForm").querySelectorAll("button").forEach(b => b.disabled = true); feedback(q, ok, shown, extra); };
  const wrongWithSelf = () => {
    const extra = q.self ? `<div class="row" style="margin-top:10px"><button class="btn" type="button" id="crsMine">Мой вариант тоже верен</button></div>` : "";
    finish(false, false, extra);
    const b = $("#crsMine"); if (b) b.onclick = () => { b.disabled = true; const ms = CR.run.missed; if (ms[ms.length - 1] === q) ms.pop(); $("#crsNext").onclick = () => advance(true); $("#crsFb .feedback").className = "feedback ok"; toast("Засчитано"); };
  };
  $("#crsForm").onsubmit = e => {
    e.preventDefault(); const r = CR.run; if (r.busy) return;
    const v = inp.value.trim(); if (!v) return;
    let ok;
    if (q.fuzzy) ok = q.a.some(a => answerMatch(v, a)); else ok = sameAnswer(v, q.a);
    if (ok) finish(!hinted, false); else wrongWithSelf();
  };
  $("#crsHint").onclick = () => {
    hinted = true; const t = q.hint || q.a[0]; const cur = inp.value; let i = 0;
    while (i < cur.length && i < t.length && cur[i].toLowerCase() === t[i].toLowerCase()) i++;
    inp.value = t.slice(0, Math.min(t.length, i + (q.mode === "fix" || q.mode === "tr" ? 12 : 1))); inp.focus();
  };
  $("#crsIdk").onclick = () => { if (CR.run.busy) return; finish(false, true); };
}
function bindOrder(q) {
  const r = CR.run, built = $("#crsBuilt"), bank = $("#crsBank"), chk = $("#crsCheck");
  const paint = () => {
    built.innerHTML = r.pick.map((t, k) => `<button type="button" class="tok on" data-u="${k}">${esc(t.t)}</button>`).join("") || '<span class="small muted">Здесь появится предложение</span>';
    bank.innerHTML = r.bank.filter(t => !r.pick.includes(t)).map(t => `<button type="button" class="tok" data-b="${t.i}">${esc(t.t)}</button>`).join("");
    chk.disabled = r.bank.length !== r.pick.length;
    built.querySelectorAll("[data-u]").forEach(b => b.onclick = () => { if (r.busy) return; r.pick.splice(+b.dataset.u, 1); paint(); });
    bank.querySelectorAll("[data-b]").forEach(b => b.onclick = () => { if (r.busy) return; r.pick.push(r.bank.find(t => t.i === +b.dataset.b)); paint(); });
  };
  paint();
  $("#crsReset").onclick = () => { if (r.busy) return; r.pick = []; paint(); };
  chk.onclick = () => {
    if (r.busy) return; r.busy = true;
    const mine = r.pick.map(t => t.t).join(" ");
    const ok = sameAnswer(mine, q.a.map(a => a.replace(/[?.!]+$/, "")));
    built.classList.add(ok ? "right" : "wrong"); chk.disabled = true; $("#crsReset").disabled = true;
    feedback(q, ok, false);
  };
}
function finishRun() {
  const r = CR.run, pct = Math.round(r.firstOk / r.total * 100);
  const isRev = r.kind === "rev", l = lessonById(r.id);
  let note = "";
  if (!isRev && l) {
    const before = pOf(l.id), idx = r.kind === "w" ? 0 : 1;
    if (pct > before[idx]) setProg(l.id, p => { p[idx] = pct; });
    if (pct >= DONE && before[idx] < DONE) note = "Шаг пройден.";
  } else if (isRev) {
    const key = "R" + r.id, b = pOf(key)[0]; if (pct > b) setProg(key, p => { p[0] = pct; });
  }
  const msg = pct >= 90 ? "Отличная работа." : pct >= DONE ? "Хороший результат." : pct >= 50 ? "Неплохо, но стоит повторить." : "Пока тяжело. Перечитайте материал и попробуйте снова.";
  const miss = r.missed.slice(0, 8).map(q => { const a = q.k === "choice" ? q.a : q.k === "order" ? q.a[0] : q.a[0]; const who = q.full && q.full !== a ? q.full : a; return `<li><span class="en">${esc(who)}</span>${q.why ? `<div class="ru">${esc(q.why)}</div>` : ""}</li>`; }).join("");
  el().innerHTML = `<div class="panel stack crs-done"><div class="crs-score"><b>${pct}%</b><span>с первого раза</span></div><p style="text-align:center;margin:0;font-weight:600">${msg} ${note}</p>
    ${miss ? `<div><div class="label small muted" style="margin-bottom:6px">Где были ошибки</div><ul class="ex-list">${miss}</ul></div>` : ""}
    <div class="row" style="justify-content:center"><button class="btn primary" id="crsAgain" type="button">Ещё раз</button><button class="btn" id="crsBack" type="button">${isRev ? "К урокам" : "К уроку"}</button></div></div>`;
  $("#crsAgain").onclick = () => { if (isRev) startReview(r.id); else startRun(r.kind, r.id, r.kind === "w" ? vocabQs(l) : grammarQs(l)); };
  $("#crsBack").onclick = () => { CR.run = null; CR.screen = isRev ? "home" : "lesson"; renderCourse(true); top(); };
  top();
}
function startReview(u) {
  const ls = (unitList().find(([n]) => n === +u) || [0, []])[1];
  const qs = shuffle(ls.flatMap(l => [...vocabQs(l, 6).slice(0, 4), ...grammarQs(l).slice(0, 4)])).slice(0, 24);
  CR.id = null; startRun("rev", u, qs);
}

/* ---------- говорим ---------- */
function startSay(l) {
  const items = (l.say || []).map((x, i) => ({ ru: x[0], en: x[1] }));
  if (!items.length) { toast("Для этого урока нет разговорных заданий"); return; }
  CR.say = { id: l.id, queue: shuffle(items), pos: 0, total: items.length, shown: false }; CR.screen = "say"; renderCourse(true); top();
}
function renderSay() {
  const s = CR.say, l = lessonById(s.id);
  if (!s.queue.length) {
    setProg(l.id, p => { p[2] |= F_SAY; });
    el().innerHTML = `<div class="panel stack crs-done"><div class="crs-score"><b>✓</b><span>разговорная практика пройдена</span></div><p style="text-align:center;margin:0;font-weight:600">Скажите эти фразы ещё раз сегодня вечером в реальной ситуации: так они закрепятся.</p><div class="row" style="justify-content:center"><button class="btn primary" id="crsBack" type="button">К уроку</button></div></div>`;
    $("#crsBack").onclick = () => { CR.say = null; CR.screen = "lesson"; renderCourse(true); top(); }; return;
  }
  const it = s.queue[0], done = s.total - s.queue.length;
  el().innerHTML = `<div class="panel"><div class="stack crs-run"><div class="row crs-runtop"><button class="btn ghost" id="crsExit" type="button">← Выйти</button><div class="pbar" style="flex:1"><i style="width:${Math.round(done / s.total * 100)}%"></i></div><span class="small muted">${done} / ${s.total}</span></div>
    <div class="mode-tag"><span class="label">Скажите вслух</span></div>
    <div class="flash"><div class="word crs-p" style="font-size:clamp(20px,5vw,28px)">${esc(it.ru)}</div><div class="small muted">Произнесите ответ по-английски вслух, потом откройте образец</div></div>
    <div id="crsModel">${s.shown ? `<div class="flash"><div class="word crs-p" style="font-size:clamp(22px,5.5vw,32px)">${esc(it.en)}</div>${sayBtn(it.en, "en", false)}<div class="small muted">Это один из естественных вариантов: ваш может отличаться, если смысл и форма верны.</div></div><div class="row" style="justify-content:center"><button class="btn primary" data-r="ok" type="button">Сказала так</button><button class="btn" data-r="near" type="button">Почти</button><button class="btn" data-r="no" type="button">Не вышло</button></div>` : `<div class="row" style="justify-content:center"><button class="btn primary" id="crsShow" type="button">Показать образец</button></div>`}</div></div></div>`;
  $("#crsExit").onclick = () => { CR.say = null; CR.screen = "lesson"; renderCourse(true); top(); };
  const sh = $("#crsShow"); if (sh) sh.onclick = () => { s.shown = true; renderSay(); autoSpeak(it.en, "en"); };
  el().querySelectorAll("[data-r]").forEach(b => b.onclick = () => { s.shown = false; const c = s.queue.shift(); if (b.dataset.r !== "ok") s.queue.push(c); renderSay(); });
}

/* ---------- слова и правило ---------- */
function deckInfo(l) {
  const tag = "ef-" + l.id.toLowerCase(), have = l.v.filter(x => typeof findDupEn === "function" && findDupEn(x[0])).length;
  return { tag, have, total: l.v.length };
}
function addToDeck(l) {
  const tag = "ef-" + l.id.toLowerCase(), fresh = [], touched = [];
  for (const [en, ru, ex, exru] of l.v) {
    const old = findDupEn(en);
    if (old) { if (!old.tags.includes(tag)) { old.tags = cleanTags([...old.tags, tag]); touched.push(old); } continue; }
    const c = newCard({ en, ru, examples: ex ? [{ en: ex, ru: exru || "", pin: true }] : [], tags: [tag] }); c.created += fresh.length; fresh.push(c);
  }
  if (fresh.length || touched.length) Store.saveMany([...fresh, ...touched]);
  knownCache = null;
  toast(fresh.length ? `Добавлено в колоду: ${fresh.length}. Тег «${tag}». Слова пойдут в обычные тренировки.` : "Все слова урока уже в колоде");
  if (fresh.length && typeof fillDeck === "function") fillDeck(fresh).catch(() => {});
  renderCourse(true);
}
function addNote(l) {
  const title = `${l.id} · ${l.gr.title}`;
  if (allNotes().some(n => n.title === title)) { toast("Эта заметка уже есть в «Грамматике»"); return; }
  const n = sanitizeNote({ title, tags: ["курс", "ef-" + l.id.toLowerCase()], rule: l.gr.rule, examples: l.gr.ex.map(([en, ru]) => ({ en, ru })), mistakes: l.gr.bad.map(([bad, good, why]) => ({ bad, good, why })), mine: "" });
  if (!n) return; Store.saveNote(n); toast("Правило добавлено в «Грамматику»");
  renderCourse(true);
}
function renderVocab(l) {
  const di = deckInfo(l), allIn = di.have >= di.total;
  const rows = l.v.map(([en, ru, ex, exru]) => `<div class="crs-w"><div class="row" style="flex-wrap:nowrap;gap:8px"><b class="crs-en">${esc(en)}</b>${sayBtn(en)}<span class="crs-ru">${esc(ru)}</span></div>${ex ? `<div class="crs-ex"><span class="en">${esc(ex)}</span> ${sayBtn(ex)}<div class="ru">${esc(exru || "")}</div></div>` : ""}</div>`).join("");
  const pr = (l.pr || []).length ? `<div class="crs-pron"><div class="label small muted">Произношение</div>${l.pr.map(([a, b]) => `<div class="crs-pr"><b>${esc(a)}</b><span>${esc(b)}</span>${/[a-z]/i.test(b) && !isCyr(b) ? sayBtn(b) : ""}</div>`).join("")}</div>` : "";
  el().innerHTML = `<div class="stack">${lessonTop(l, "vocab")}<div class="panel stack"><p class="small muted" style="margin:0">Прочитайте слова вместе с примерами и послушайте произношение. Затем добавьте их в колоду: там они будут возвращаться через интервалы, пока не запомнятся надолго.</p>
    <div class="row"><button class="btn pink" id="crsAdd" type="button">${allIn ? "Все слова уже в колоде" : `Добавить в колоду (${di.total - di.have})`}</button><span class="small muted">тег «${esc(di.tag)}»</span></div></div>
    ${l.vn ? `<div class="panel"><div class="label small muted">Важно</div><p style="margin:4px 0 0">${esc(l.vn)}</p></div>` : ""}
    <div class="panel crs-words">${rows}</div>${pr}
    <div class="row" style="justify-content:space-between"><button class="btn ghost" id="crsToLesson" type="button">К уроку</button><button class="btn primary" id="crsVDone" type="button">Прочитала, дальше</button></div></div>`;
  $("#crsAdd").onclick = () => { if (!allIn) addToDeck(l); };
  $("#crsToLesson").onclick = () => goLesson(l.id);
  $("#crsVDone").onclick = () => { setProg(l.id, p => { p[2] |= F_VOC; }); startRun("w", l.id, vocabQs(l)); };
  bindBack();
}
function renderRule(l) {
  const g = l.gr, noted = allNotes().some(n => n.title === `${l.id} · ${g.title}`);
  const ex = g.ex.map(([en, ru]) => `<li>${sayBtn(en)}<div><div class="en">${esc(en)}</div><div class="ru">${esc(ru)}</div></div></li>`).join("");
  const bad = g.bad.map(([b, gd, why]) => `<div class="gmis"><span class="gbad">❌ <s>${esc(b)}</s></span><span class="ggood">✅ ${esc(gd)} ${sayBtn(gd)}</span><span class="small muted">${esc(why)}</span></div>`).join("");
  el().innerHTML = `<div class="stack">${lessonTop(l, "rule")}<div class="panel stack"><h3 class="crs-h">${esc(g.title)}</h3><div class="grule">${fmtText(g.rule)}</div></div>
    <div class="panel stack"><div class="label small muted">Примеры</div><ul class="ex-list">${ex}</ul></div>
    ${bad ? `<div class="panel stack"><div class="label small muted">Частые ошибки</div>${bad}</div>` : ""}
    <div class="row"><button class="btn pink" id="crsNote" type="button">${noted ? "Уже в заметках" : "Добавить в мои заметки"}</button></div>
    <div class="row" style="justify-content:space-between"><button class="btn ghost" id="crsToLesson" type="button">К уроку</button><button class="btn primary" id="crsRDone" type="button">Понятно, к заданиям</button></div></div>`;
  $("#crsNote").onclick = () => { if (!noted) addNote(l); };
  $("#crsToLesson").onclick = () => goLesson(l.id);
  $("#crsRDone").onclick = () => { setProg(l.id, p => { p[2] |= F_RULE; }); startRun("g", l.id, grammarQs(l)); };
  bindBack();
}

/* ---------- экраны ---------- */
const dots = l => stepsOf(l).map(s => `<i class="${s.done ? "on" : ""}"></i>`).join("");
function lessonTop(l, here) {
  return `<div class="row crs-lt"><button class="btn ghost" id="crsHome" type="button">← Все уроки</button><span class="chip lang">${l.pe ? "PE" : esc(l.id)}</span><b>${esc(l.t)}</b></div>`;
}
function bindBack() { const b = $("#crsHome"); if (b) b.onclick = () => { CR.screen = "home"; CR.id = null; renderCourse(true); top(); }; }
function goLesson(id) { CR.id = id; CR.screen = "lesson"; renderCourse(true); top(); }
function openStep(l, k) {
  CR.id = l.id;
  if (k === "v") { CR.screen = "vocab"; renderCourse(true); top(); }
  else if (k === "w") startRun("w", l.id, vocabQs(l));
  else if (k === "r") { CR.screen = "rule"; renderCourse(true); top(); }
  else if (k === "g") startRun("g", l.id, grammarQs(l));
  else startSay(l);
}
function renderLesson(l) {
  const st = stepsOf(l), nx = st.find(s => !s.done);
  el().innerHTML = `<div class="stack">${lessonTop(l)}<div class="panel stack"><div><h2 class="crs-h" style="margin:0">${esc(l.t)}</h2><p class="muted" style="margin:4px 0 0">${esc(l.ru)}</p></div><p class="small" style="margin:0"><b>Грамматика:</b> ${esc(l.gram)}</p></div>
    <div class="crs-steps">${st.map((s, i) => `<button class="crs-step${s.done ? " done" : ""}${nx && nx.k === s.k ? " next" : ""}" type="button" data-k="${s.k}"><span class="crs-n">${s.done ? "✓" : i + 1}</span><span class="crs-st"><b>${esc(s.t)}</b><span>${esc(s.d)}</span></span><span class="crs-go">${nx && nx.k === s.k ? "Дальше" : s.done ? "Ещё раз" : ""}</span></button>`).join("")}</div>
    ${lessonDone(l) ? `<div class="feedback ok">Урок пройден. Слова в колоде будут возвращаться на повторение, а закрепить тему поможет «Повтор юнита».</div>` : ""}</div>`;
  bindBack();
  el().querySelectorAll("[data-k]").forEach(b => b.onclick = () => openStep(l, b.dataset.k));
}
function renderHome() {
  const us = unitList(), all = lessons();
  if (!all.length) { el().innerHTML = `<div class="panel"><p class="muted" style="margin:0">Курс не загрузился. Обновите страницу.</p></div>`; return; }
  const doneN = all.filter(lessonDone).length, pct = Math.round(all.reduce((s, l) => s + lessonPct(l), 0) / all.length);
  const cur = all.find(l => !lessonDone(l)) || all[0], curStep = nextStep(cur);
  const unitsHtml = us.map(([u, ls]) => {
    const dn = ls.filter(lessonDone).length, rev = pOf("R" + u)[0];
    return `<div class="crs-unit"><div class="sec-head" style="margin-top:0"><h2>Юнит ${u}</h2><span class="chip">${dn} из ${ls.length}</span></div>
      <div class="crs-rows">${ls.map(l => `<button class="crs-row${lessonDone(l) ? " done" : ""}" type="button" data-l="${l.id}"><span class="chip lang">${l.pe ? "PE" : esc(l.id)}</span><span class="crs-rt"><b>${esc(l.t)}</b><span>${esc(l.ru)}</span></span><span class="crs-dots" aria-label="пройдено шагов: ${stepsOf(l).filter(s => s.done).length} из 5">${dots(l)}</span></button>`).join("")}</div>
      <div class="row" style="margin-top:10px"><button class="btn" type="button" data-rev="${u}">Повтор юнита ${u}</button>${rev ? `<span class="small muted">лучший результат ${rev}%</span>` : `<span class="small muted">смешанные задания по всем урокам юнита</span>`}</div></div>`;
  }).join("");
  el().innerHTML = `<div class="stack"><div class="panel crs-hero"><div><div class="label small muted">English File Intermediate</div><h2 class="crs-h" style="margin:2px 0 6px">Курс по учебнику</h2><p class="muted" style="margin:0">Слова, правила и задания по каждому уроку учебника. Новые слова идут в колоду, правила в заметки, а разговорная практика переносит их в жизнь.</p></div>
    <div class="crs-prog"><div class="pbar"><i style="width:${pct}%"></i></div><span class="small muted">пройдено уроков: ${doneN} из ${all.length} · ${pct}%</span></div>
    <div class="row"><button class="btn primary" id="crsCont" type="button">${doneN ? "Продолжить" : "Начать"}: ${cur.pe ? "PE" : esc(cur.id)} ${esc(cur.t)}</button></div></div>${unitsHtml}</div>`;
  $("#crsCont").onclick = () => { if (curStep) openStep(cur, curStep.k); else goLesson(cur.id); };
  el().querySelectorAll("[data-l]").forEach(b => b.onclick = () => goLesson(b.dataset.l));
  el().querySelectorAll("[data-rev]").forEach(b => b.onclick = () => startReview(b.dataset.rev));
}
window.renderCourse = function (force) {
  const root = el(); if (!root) return;
  if (!force && (CR.screen === "run" || CR.screen === "say")) return;     // не стираем идущие задания при фоновых обновлениях
  const l = CR.id ? lessonById(CR.id) : null;
  if (CR.screen === "run") return renderRun();
  if (CR.screen === "say" && CR.say) return renderSay();
  if (CR.screen === "vocab" && l) return renderVocab(l);
  if (CR.screen === "rule" && l) return renderRule(l);
  if (CR.screen === "lesson" && l) return renderLesson(l);
  CR.screen = "home"; renderHome();
};
document.addEventListener("keydown", e => {
  if (typeof view === "undefined" || view !== "course" || CR.screen !== "run" || !CR.run) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = document.activeElement?.tagName;
  if (/^[1-4]$/.test(e.key) && tag !== "INPUT") $(`#crsBody [data-o="${+e.key - 1}"]`)?.click();
  if (e.key === "Enter" && !["INPUT", "BUTTON", "TEXTAREA"].includes(tag)) { const n = $("#crsNext"); if (n) { e.preventDefault(); n.click(); } }
});
if (typeof view !== "undefined" && view === "course") window.renderCourse(true);
})();
