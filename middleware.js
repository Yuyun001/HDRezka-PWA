// middleware.js — прокси на rezka-ua.tv + PWA, для Vercel (Edge)
export const config = { matcher: '/:path*' };

const ORIGIN = 'https://rezka-ua.tv';
const ICON = 'https://i.postimg.cc/XNzk2m7D/97-EA77-D1-6-FBB-4-CD4-9998-4565-D125-A48-F.png';
const ICON_QS = '?v=7';

export default async function middleware(req) {
  const url = new URL(req.url);

  // PWA manifest
  if (url.pathname === '/manifest.webmanifest') {
    return new Response(JSON.stringify({
      name: 'Rezka (fullscreen)',
      short_name: 'Rezka',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#000000',
      theme_color: '#000000',
      icons: [
        { src: '/icon-180.png'+ICON_QS, sizes: '180x180', type: 'image/png' },
        { src: '/icon-192.png'+ICON_QS, sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png'+ICON_QS, sizes: '512x512', type: 'image/png' }
      ]
    }), { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-store' }});
  }

  // icons
  if (['/icon-180.png','/icon-192.png','/icon-512.png'].includes(url.pathname)) {
    const r = await fetch(ICON);
    return new Response(await r.arrayBuffer(), { headers: { 'Content-Type':'image/png', 'Cache-Control':'no-store' }});
  }

  // proxy
  const upstream = new URL(url.pathname + url.search, ORIGIN);
  const fwd = new Headers(req.headers);
  fwd.set('Origin', ORIGIN);
  fwd.set('Referer', ORIGIN + '/');
  fwd.delete('accept-encoding');

  const method = req.method;
  const body = (method==='GET'||method==='HEAD') ? undefined : await req.arrayBuffer().catch(()=>undefined);

  const res = await fetch(upstream, { method, headers: fwd, body, redirect: 'follow' });

  const h = new Headers(res.headers);
  h.delete('content-security-policy');
  h.delete('x-frame-options');

  const ct = (h.get('content-type')||'').toLowerCase();
  if (!ct.includes('text/html')) return new Response(res.body, { status: res.status, headers: h });

  // правим HTML, чтобы всё открывалось в том же окне и был фуллскрин
  let html = await res.text();

  // относительные ссылки
  html = html
    .replace(/(href|src)\s*=\s*"(https?:)?\/\/rezka-ua\.tv\/([^"]*)"/ig, '$1="/$3"')
    .replace(/(action)\s*=\s*"(https?:)?\/\/rezka-ua\.tv\/([^"]*)"/ig, '$1="/$3"')
    .replace(/\starget="_blank"/ig, '')
    .replace(/\srel="noopener[^"]*"/ig, '');

  // добавляем PWA-теги и фиксим window.open
  html = html.replace(/<head[^>]*>/i, m => `${m}
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icon-180.png${ICON_QS}">
<script>
window.open = function(u){ location.href = u; };
document.addEventListener('click', e => {
  const a = e.target.closest('a[href]');
  if (a && a.getAttribute('target') === '_blank') a.removeAttribute('target');
}, true);
</script>`);

  return new Response(html, { status: res.status, headers: h });
}
