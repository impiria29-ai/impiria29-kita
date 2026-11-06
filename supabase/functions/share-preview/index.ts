const APP_ROOT = "https://impiria29-ai.github.io/impiria29-kita/";
const ALLOWED_TYPES = new Set(["announcement", "event", "poll", "residentNotice"]);
const TYPE_CODES: Record<string, string> = { announcement: "a", event: "e", poll: "p", residentNotice: "h" };
const CODE_TYPES = Object.fromEntries(Object.entries(TYPE_CODES).map(([type, code]) => [code, type]));

const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const plainText = (value: unknown) => String(value ?? "")
  .replace(/<\s*br\s*\/?>/gi, " ")
  .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, " ")
  .replace(/<[^>]*>/g, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&#x27;/gi, "'")
  .replace(/\s+/g, " ")
  .trim();

function appLink(type: string, id: string) {
  const route = type === "event" ? "acara" : type === "poll" ? "undian" : type === "residentNotice" ? "hebahan" : "pengumuman";
  const key = type === "poll" ? "poll" : type;
  return `${APP_ROOT}#${route}?${key}=${encodeURIComponent(id)}`;
}

function htmlPage(title: string, description: string, imageUrl: string, previewUrl: string, appUrl: string) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeImage = escapeHtml(imageUrl);
  const safePreviewUrl = escapeHtml(previewUrl);
  const safeAppUrl = escapeHtml(appUrl);
  return `<!doctype html><html lang="ms"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle} · Impiria29 Kita</title><meta name="description" content="${safeDescription}"><meta property="og:type" content="article"><meta property="og:site_name" content="Impiria29 Kita"><meta property="og:title" content="${safeTitle}"><meta property="og:description" content="${safeDescription}"><meta property="og:url" content="${safePreviewUrl}"><meta property="og:image" content="${safeImage}"><meta property="og:image:alt" content="${safeTitle}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${safeTitle}"><meta name="twitter:description" content="${safeDescription}"><meta name="twitter:image" content="${safeImage}"><meta name="robots" content="noindex,nofollow"><style>body{margin:0;padding:40px 18px;background:#f5f8f5;color:#1e2e29;font:16px Arial,sans-serif}.card{max-width:560px;margin:8vh auto;padding:26px;border:1px solid #e1e9e2;border-radius:20px;background:white;box-shadow:0 16px 50px #173f3518}img{display:block;width:100%;max-height:320px;object-fit:cover;border-radius:13px;margin-bottom:20px}h1{font-size:24px;line-height:1.25}p{color:#66766d;line-height:1.6}.open{display:inline-block;margin-top:12px;padding:13px 18px;border-radius:10px;background:#173f35;color:white;text-decoration:none;font-weight:bold}</style></head><body><main class="card"><img src="${safeImage}" alt=""><p>IMPIRIA29 KITA · TAMAN ANGGERIK PERMAI 1</p><h1>${safeTitle}</h1><p>${safeDescription}</p><a class="open" href="${safeAppUrl}">Buka dalam Impiria29 Kita</a></main><script>setTimeout(()=>location.replace(${JSON.stringify(appUrl)}),350)</script></body></html>`;
}

async function signature(type: string, id: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${type}:${id}`)));
  return btoa(String.fromCharCode(...digest)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function compactSignature(type: string, id: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${type}:${id}`))).slice(0, 16);
  return btoa(String.fromCharCode(...digest)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function encodeId(id: string) {
  const hex = id.replaceAll("-", "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error("Rekod ini tiada ID perkongsian yang sah.");
  const bytes = new Uint8Array(hex.match(/.{2}/g)!.map((part) => parseInt(part, 16)));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeId(encoded: string) {
  const binary = atob(encoded.replaceAll("-", "+").replaceAll("_", "/") + "==");
  if (binary.length !== 16) throw new Error("Invalid compact record id");
  const hex = Array.from(binary, (char) => char.charCodeAt(0).toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

Deno.serve(async (request) => {
  const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey" };
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(request.url);
  if (url.searchParams.get("health") === "1") return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });

  let type = url.searchParams.get("type") ?? "";
  let id = url.searchParams.get("id") ?? "";
  let token = url.searchParams.get("token") ?? "";
  const compact = url.searchParams.get("s") ?? "";
  if (compact) {
    const match = compact.match(/^([aehp])([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})$/i);
    if (!match) return new Response("Pautan perkongsian tidak sah.", { status: 400, headers: corsHeaders });
    type = CODE_TYPES[match[1].toLowerCase()] || "";
    try { id = decodeId(match[2]); } catch { return new Response("Pautan perkongsian tidak sah.", { status: 400, headers: corsHeaders }); }
    token = match[3];
  }
  if (!ALLOWED_TYPES.has(type) || !id || id.length > 120) return new Response("Pautan perkongsian tidak sah.", { status: 400, headers: corsHeaders });

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!projectUrl || !serviceKey || !publicKey) return new Response("Pratonton perkongsian tidak tersedia.", { status: 503, headers: corsHeaders });

  const collection = type === "announcement" ? "announcements" : type === "event" ? "events" : type === "residentNotice" ? "residentNotices" : "polls";
  if (request.method === "POST") {
    const bearer = request.headers.get("Authorization") ?? "";
    if (!bearer.startsWith("Bearer ")) return new Response("Sila log masuk untuk berkongsi.", { status: 401, headers: corsHeaders });
    const userResponse = await fetch(`${projectUrl}/auth/v1/user`, { headers: { apikey: publicKey, Authorization: bearer } });
    if (!userResponse.ok) return new Response("Sesi log masuk tidak sah.", { status: 401, headers: corsHeaders });
    const snapshotResponse = await fetch(`${projectUrl}/rest/v1/rpc/get_app_snapshot`, { method: "POST", headers: { apikey: publicKey, Authorization: bearer, "Content-Type": "application/json" }, body: "{}" });
    if (!snapshotResponse.ok) return new Response("Akaun ini tidak dibenarkan berkongsi kandungan.", { status: 403, headers: corsHeaders });
    const snapshot = await snapshotResponse.json();
    const record = (Array.isArray(snapshot?.[collection]) ? snapshot[collection] : []).find((item: any) => String(item?.id) === id);
    if (!record) return new Response("Kandungan ini tidak dapat diakses oleh akaun anda.", { status: 404, headers: corsHeaders });
    if (type === "residentNotice" && (record.status !== "published" || record.audience !== "Semua penduduk")) return new Response("Hebahan ini tidak dibuka untuk perkongsian awam.", { status: 403, headers: corsHeaders });
    let encodedId;
    try { encodedId = encodeId(id); } catch { return new Response("ID rekod ini tidak boleh dikongsi.", { status: 400, headers: corsHeaders }); }
    const shortToken = `${TYPE_CODES[type]}${encodedId}.${await compactSignature(type, id, serviceKey)}`;
    const shareUrl = `${url.origin}${url.pathname}?s=${encodeURIComponent(shortToken)}`;
    return new Response(JSON.stringify({ url: shareUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }

  const expected = compact ? await compactSignature(type, id, serviceKey) : await signature(type, id, serviceKey);
  if (!token || token !== expected) return new Response("Pautan pratonton tidak sah.", { status: 403, headers: corsHeaders });
  const response = await fetch(`${projectUrl}/rest/v1/community_state?select=data&state_key=eq.impiria29`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
  if (!response.ok) return new Response("Maklumat perkongsian tidak dapat dimuatkan.", { status: 503, headers: corsHeaders });
  const rows = await response.json();
  const snapshot = rows?.[0]?.data ?? {};
  const record = (Array.isArray(snapshot[collection]) ? snapshot[collection] : []).find((item: any) => String(item?.id) === id);
  if (!record) return new Response("Kandungan ini tidak ditemui.", { status: 404, headers: corsHeaders });
  if (type === "residentNotice" && (record.status !== "published" || record.audience !== "Semua penduduk")) return new Response("Hebahan ini tidak dibuka untuk perkongsian awam.", { status: 403, headers: corsHeaders });

  const title = String(type === "poll" ? record.question : record.title || "Makluman komuniti").slice(0, 180);
  const body = plainText(type === "announcement" || type === "residentNotice" ? record.body : record.description);
  const details = type === "event"
    ? [record.date, record.time, record.location].filter(Boolean).join(" · ")
    : type === "poll"
      ? `Undian komuniti · ${(Array.isArray(record.options) ? record.options : []).slice(0, 4).join(" / ")}`
      : type === "residentNotice" ? "Hebahan penduduk · Impiria29 Kita"
      : record.date ? `Pengumuman komuniti · ${record.date}` : "Pengumuman komuniti";
  const description = `${details}${body ? ` · ${body}` : ""}`.slice(0, 280);
  const appUrl = appLink(type, id);
  const shareUrl = compact ? `${url.origin}${url.pathname}?s=${encodeURIComponent(compact)}` : `${url.origin}${url.pathname}?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`;
  const imageData = typeof record.image === "string" ? record.image : "";

  if (url.searchParams.get("asset") === "image") {
    const match = imageData.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) return new Response("Tiada gambar untuk kandungan ini.", { status: 404 });
    const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
    return new Response(bytes, { headers: { ...corsHeaders, "Content-Type": match[1], "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
  }

  const imageUrl = imageData.startsWith("data:image/") ? `${shareUrl}&asset=image` : `${APP_ROOT}icon-512.png`;
  return new Response(htmlPage(title, description, imageUrl, shareUrl, appUrl), {
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" },
  });
});

