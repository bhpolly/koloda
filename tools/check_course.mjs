// Проверка данных курса: node tools/check_course.mjs
import fs from "node:fs"; import vm from "node:vm"; import path from "node:path";
const dir = new URL("../course/", import.meta.url).pathname;
const ctx = { }; ctx.window = ctx; vm.createContext(ctx);
const files = ["lib.js", ...fs.readdirSync(dir).filter(f => /^[up]\d+\.js$/.test(f)).sort((a, b) => (a[0] === b[0] ? 0 : a[0] < b[0] ? 1 : -1) || +a.slice(1, -3) - +b.slice(1, -3))];
for (const f of files) vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), ctx, { filename: f });
const L = ctx.COURSE, errs = [], warn = [], ids = new Set();
const plain = s => s.replace(/…/g, "").replace(/[?!.]+$/, "").trim();
for (const l of L) {
  const at = m => errs.push(`${l.id}: ${m}`);
  if (ids.has(l.id)) at("повтор id"); ids.add(l.id);
  for (const k of ["u", "t", "ru", "gram"]) if (!l[k]) at("нет " + k);
  if (!l.gr?.title || !l.gr?.rule || !l.gr.ex?.length || !l.gr.bad?.length) at("неполное правило");
  if (!l.v || l.v.length < 8) at("мало слов: " + (l.v?.length || 0));
  const seen = new Set();
  for (const v of l.v || []) {
    if (v.length < 4 || v.some(x => typeof x !== "string" || !x.trim())) at("слово без полей: " + v[0]);
    if (seen.has(v[0].toLowerCase())) at("дубль слова: " + v[0]); seen.add(v[0].toLowerCase());
    const head = v[4] || plain(v[0]).replace(/^to /i, "");
    if (v[2] && !v[2].toLowerCase().includes(head.toLowerCase())) warn.push(`${l.id}: в примере нет «${v[0]}» (будет вопрос без пропуска)`);
  }
  for (const [w, i, why] of l.odd || []) if (!(w.length === 4 && i >= 0 && i < 4 && why)) at("odd: " + w);
  const x = l.x || []; if (x.length < 12) at("мало заданий: " + x.length);
  for (const e of x) {
    if (e.t === "gap") { if (!/_{3,}/.test(e.q)) at("gap без ___: " + e.q); if (!e.a?.length) at("gap без ответа: " + e.q); if (!e.w) warn.push(`${l.id}: gap без пояснения: ${e.q}`); }
    else if (e.t === "pick") { if (e.o.length < 2 || new Set(e.o).size !== e.o.length) at("pick варианты: " + e.q); if (!e.w) warn.push(`${l.id}: pick без пояснения: ${e.q}`); }
    else if (e.t === "fix") { if (!e.a?.length || e.a.includes(e.q)) at("fix: " + e.q); }
    else if (e.t === "order") { if (e.a.split(" ").length < 3) at("order слишком короткий: " + e.a); }
    else if (e.t === "tr") { if (!e.a?.length) at("tr: " + e.ru); }
    else at("неизвестный тип " + e.t);
  }
  if (!(l.say?.length >= 3)) at("мало say");
}
console.log(`уроков: ${L.length}; слов: ${L.reduce((s, l) => s + l.v.length, 0)}; заданий: ${L.reduce((s, l) => s + (l.x || []).length, 0)}`);
L.forEach(l => console.log(`  ${l.id.padEnd(4)} слов ${String(l.v.length).padStart(2)}  заданий ${String((l.x || []).length).padStart(2)}  say ${l.say?.length}  odd ${(l.odd || []).length}`));
if (warn.length) console.log("\nПредупреждения:\n" + warn.map(w => " - " + w).join("\n"));
if (errs.length) { console.log("\nОШИБКИ:\n" + errs.map(w => " - " + w).join("\n")); process.exit(1); } else console.log("\nОшибок нет");
