// Cloudflare Worker: пересылает запросы Колоды в YandexGPT и добавляет разрешение для браузера (CORS).
// Ключ API здесь не хранится: он приходит из вашего браузера в заголовке и сразу уходит дальше в Яндекс.
// Принимает запросы только с сайта Колоды.
const ALLOWED_ORIGINS = ["https://bhpolly.github.io"];
const TARGET = "https://llm.api.cloud.yandex.net/v1/chat/completions";

export default {
  async fetch(req) {
    const origin = req.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, content-type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!ALLOWED_ORIGINS.includes(origin)) return new Response("forbidden", { status: 403, headers: cors });
    const url = new URL(req.url);
    if (req.method !== "POST" || url.pathname !== "/v1/chat/completions") return new Response("not found", { status: 404, headers: cors });
    const r = await fetch(TARGET, {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": req.headers.get("authorization") || "" },
      body: req.body,
    });
    const h = new Headers(cors);
    h.set("content-type", r.headers.get("content-type") || "application/json");
    return new Response(r.body, { status: r.status, headers: h });
  },
};
