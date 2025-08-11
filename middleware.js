// middleware.js — минимальный прокси на rezka-ua.tv + PWA для Vercel (Edge)
export const config = { matcher: "/:path*" };

const ORIGIN  = "https://rezka-ua.tv";
const ICON    = "https://i.postimg.cc/XNzk2m7D/97-EA77-D1-6-FB8-4-CD4-9998-4565-D125-A48-F.png";
const ICON_QS = "?v=7";

export default async function middleware(req) {
  try {
    const url = new URL(req.url);

    // 1) Web App Manifest
    if (url.pathname === "/manifest.webmanifest") {
      return new Response(JSON.stringify({
        name: "Rezka (fullscreen)",
        short_name: "Rezka",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#000000",
        theme_color: "#000000",
        icons: [
          { src: "/icon-180.png" + ICON_QS, sizes: "180x180", type: "image/png" },
          { src: "/icon-192.png" + ICON_QS, sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png" + ICON_QS, sizes: "512x512", type: "image/png" },
        ],
      }), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" }});
    }

    // 2) Иконки
    if (["/icon-180.png", "/icon-192.png", "/icon-512.png"].includes(url.pathname)) {
      const r = await fetch(ICON);
      return new Response(await r.arrayBuffer(), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
    }

    // 3) Пробрасываем запрос на оригинал
    const upstream = new URL(url.pathname + url.search, ORIGIN);

    const fwd = new Headers(req.headers);
    fwd.set("Origin", ORIGIN);
    fwd.set("Referer", ORIGIN + "/");
    fwd.delete("accept-encoding");

    const method = req.method;
    const body   = (method === "GET" || method === "HEAD") ? undefined : await req.arrayBuffer().catch(() => undefined);

    const upstreamRes = await fetch(upstream, { method, headers: fwd, body, redirect: "follow" });

    // 4) Правим заголовки
    const h = new Headers(upstreamRes.headers);
    h.delete("content-security-policy");
    h.delete("x-frame-options");

    const ct = (h.get("content-type") || "").toLowerCase();
    if (!ct.includes("text/html")) {
      return new Response(upstreamRes.body, { status: upstreamRes.status, headers: h });
    }

    // 5) Правки HTML (иконки/манифест, убираем внешние абсолютные ссылки, баннеры)
    let html = await upstreamRes.text();

    // Вставляем manifest + apple-touch-icon и немного CSS (убрать баннеры и т.п.)
    const INJECT =
      `<link rel="manifest" href="/manifest.webmanifest">` +
      `<link rel="apple-touch-icon" href="/icon-180.png${ICON_QS}">` +
      `<style>
         .mobile-app-banner, .app-banner, .top-panel, .bottom-panel { display: none !important; }
         a[target="_blank"] { target-new: none; }
       </style>`;
    html = html.replace(/<\/head>/i, INJECT + "</head>");

    // Делаем абсолютные ссылки на rezka-ua.tv относительными (чтобы всё открывалось внутри)
    html = html
      .replace(/(href|src)\s*=\s*"(https?:)?\/\/rezka-ua\.tv\/([^"]*)"/ig, '$1="/$3"')
      .replace(/(href|src)\s*=\s*'(https?:)?\/\/rezka-ua\.tv\/([^']*)'/ig, "$1='/$3'");

    // Отключаем открытие в новом окне
    html = html.replace(/target="_blank"/ig, 'target="_self"');

    return new Response(html, {
      status: upstreamRes.status,
      headers: new Headers({
        ...Object.fromEntries(h),
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      })
    });
  } catch (e) {
    // Понятная ошибка на экране, если что-то пойдёт не так
    return new Response(
      `<!doctype html><meta charset="utf-8"><title>Error</title>
       <body style="background:#111;color:#ddd;font:16px/1.4 -apple-system,system-ui">
       <h1 style="color:#f55">Worker error</h1>
       <pre>${(e && e.stack) ? String(e.stack) : String(e)}</pre></body>`,
      { status: 502, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
    );
  }
}
