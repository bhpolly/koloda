// Собирает vendor/ipa-us.json.gz: слово -> американская транскрипция (IPA) из CMU Pronouncing Dictionary.
// Запуск: npm i cmu-pronouncing-dictionary && node tools/build_ipa.mjs
import { dictionary } from "cmu-pronouncing-dictionary";
import { gzipSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const V = { AA:"ɑ", AE:"æ", AH:"ʌ", AO:"ɔ", AW:"aʊ", AY:"aɪ", EH:"ɛ", ER:"ɝ", EY:"eɪ", IH:"ɪ", IY:"i", OW:"oʊ", OY:"ɔɪ", UH:"ʊ", UW:"u" };
const C = { B:"b", CH:"tʃ", D:"d", DH:"ð", F:"f", G:"ɡ", HH:"h", JH:"dʒ", K:"k", L:"l", M:"m", N:"n", NG:"ŋ", P:"p", R:"r", S:"s", SH:"ʃ", T:"t", TH:"θ", V:"v", W:"w", Y:"j", Z:"z", ZH:"ʒ" };
const ONSETS = new Set(["P R","P L","B R","B L","T R","D R","K R","K L","G R","G L","F R","F L","TH R","SH R","S P","S T","S K","S M","S N","S L","S W","T W","K W","D W","HH Y","S P R","S T R","S K R","S P L","S K W","P Y","B Y","K Y","M Y","F Y","V Y"]);

function convert(arpa) {
  const ph = arpa.split(" ").map(p => ({ b: p.replace(/\d/, ""), s: (p.match(/\d/) || [""])[0] }));
  const out = ph.map(p => p.b in V ? (p.b === "AH" ? (p.s === "0" ? "ə" : "ʌ") : p.b === "ER" ? (p.s === "0" ? "ɚ" : "ɝ") : V[p.b]) : C[p.b]);
  if (out.some(x => !x)) return null;
  const marks = new Map();
  ph.forEach((p, i) => {
    if (!(p.b in V) || (p.s !== "1" && p.s !== "2")) return;
    // начало слога: идём назад по согласным, пока они образуют допустимое начало слога
    let j = i;
    while (j > 0 && !(ph[j - 1].b in V)) {
      const cluster = ph.slice(j - 1, i).map(x => x.b).join(" ");
      if (j === i || ONSETS.has(cluster)) j--; else break;
    }
    marks.set(j, p.s === "1" ? "ˈ" : "ˌ");
  });
  let s = "";
  out.forEach((x, i) => { if (marks.has(i)) s += marks.get(i); s += x; });
  return s;
}

const res = {};
for (const [w, p] of Object.entries(dictionary)) {
  if (!/^[a-z']+$/.test(w)) continue;
  const first = p.split(" | ")[0];
  const ipa = convert(first);
  if (ipa) res[w] = ipa;
}
mkdirSync("vendor", { recursive: true });
const buf = gzipSync(Buffer.from(JSON.stringify(res)), { level: 9 });
writeFileSync("vendor/ipa-us.json.gz", buf);
console.log(Object.keys(res).length, "слов,", (buf.length / 1048576).toFixed(2), "МБ");
