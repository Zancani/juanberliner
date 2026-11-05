// Genera las páginas en inglés bajo /en/ a partir de las páginas bilingües.
// Uso: node scripts/build-en.mjs  (ejecútalo después de editar cualquier página)
// Las páginas en español son la fuente; nunca edites los archivos de /en a mano.
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';

const SITE = 'https://juanberliner.com';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const content = JSON.parse(fs.readFileSync(path.join(root, 'scripts/en-content.json'), 'utf8'));
const PAGES = Object.keys(content.pages);
const p = path.posix;

const pretty = f => f.replace(/(^|\/)index\.html$/, '$1');
const urlOf = (f, en) => `${SITE}/${en ? 'en/' : ''}${pretty(f)}`;
const isExternal = v => !v || /^(https?:|mailto:|tel:|data:|#|\/|javascript:)/.test(v);

// ── Enlaces entre idiomas y hreflang: se escriben en la página fuente ──
function patchSource(file) {
  const abs = path.join(root, file);
  let s = fs.readFileSync(abs, 'utf8');
  const enHref = p.relative(p.dirname(file), 'en/' + file);
  s = s.replace(/\s*<link rel="alternate" hreflang[^>]*>/g, '');
  const tags = `\n  <link rel="alternate" hreflang="es" href="${urlOf(file)}" />\n  <link rel="alternate" hreflang="en" href="${urlOf(file, true)}" />\n  <link rel="alternate" hreflang="x-default" href="${urlOf(file)}" />`;
  s = s.replace('</head>', `${tags.trimStart().padStart(0)}\n</head>`);
  // El idioma lo decide la página, no el navegador del visitante
  s = s.replace(/localStorage\.setItem\('lang',\s*[^)]*\);?\s*/g, '');
  s = s.replace(/localStorage\.getItem\('lang'\)/g, 'document.documentElement.lang');
  // Botón de idioma → enlace real
  s = s.replace(/<button class="lang-toggle" onclick="toggleLang\(\)"[^>]*>([\s\S]*?)<\/button>/, `<a class="lang-toggle" href="${enHref}" hreflang="en" aria-label="Switch language" title="Switch language">$1</a>`);
  s = s.replace(/<button class="lang-btn active" id="btn-es"[^>]*>ES<\/button>/, `<a class="lang-btn active" id="btn-es" href="berlin-map.html" hreflang="es" aria-current="true">ES</a>`);
  s = s.replace(/<button class="lang-btn" id="btn-en"[^>]*>EN<\/button>/, `<a class="lang-btn" id="btn-en" href="${enHref}" hreflang="en">EN</a>`);
  // Rutas usadas desde JavaScript
  s = s.replace(`heroVideo.src = 'timelapse.mp4';`, `heroVideo.src = heroVideo.dataset.src;`);
  s = s.replace(/<video([^>]*\bid="hero-video"(?:(?!data-src)[^>])*)>/, '<video$1 data-src="timelapse.mp4">');
  fs.writeFileSync(abs, s);
  return s;
}

function rewriteAsset(file, v) {
  if (isExternal(v)) return v;
  const [, target, rest] = v.match(/^([^?#]*)(.*)$/);
  return p.relative(p.dirname('en/' + file), p.join(p.dirname(file), target)) + rest;
}
const isMirrored = (file, v) => {
  const t = p.join(p.dirname(file), v.split(/[?#]/)[0]);
  return PAGES.includes(t) || PAGES.includes(p.join(t, 'index.html')) || t === '.';
};
const enUrl = u => {
  if (!u.startsWith(SITE) || /\.(webp|jpe?g|png|svg|avif)$/.test(u)) return u;
  const f = u.slice(SITE.length + 1) || 'index.html';
  const key = f.endsWith('/') || f === '' ? f + 'index.html' : f;
  return PAGES.includes(key) ? urlOf(key, true) : u;
};

function buildEn(file, source) {
  const [title, desc] = content.pages[file];
  const $ = cheerio.load(source);
  $('.lang-es, .l-es').remove();
  $('.lang-en').removeClass('lang-en');
  $('.l-en').removeClass('l-en').removeAttr('style');
  $('[class=""]').removeAttr('class');
  $('html').attr('lang', 'en');
  $('body').addClass('lang-en');

  $('title').text(title);
  $('meta[name="description"]').attr('content', desc);
  $('meta[property="og:title"], meta[name="twitter:title"]').attr('content', title);
  $('meta[property="og:description"], meta[name="twitter:description"]').attr('content', desc);
  $('meta[property="og:url"]').attr('content', urlOf(file, true));
  $('meta[property="og:locale"]').attr('content', 'en_US');
  $('link[rel="canonical"]').attr('href', urlOf(file, true));

  $('a[href="/"]').attr('href', p.relative(p.dirname(file), 'index.html'));

  // Rutas: las páginas traducidas se quedan en /en; lo demás apunta a la raíz
  $('a[href]').each((_, el) => { const v = $(el).attr('href'); if (!isExternal(v) && !isMirrored(file, v)) $(el).attr('href', rewriteAsset(file, v)); });
  $('link[href], script[src], img[src], source[src], video[src], video[poster], video[data-src], source[srcset]').each((_, el) => {
    for (const a of ['href', 'src', 'poster', 'data-src', 'srcset']) { const v = $(el).attr(a); if (v) $(el).attr(a, rewriteAsset(file, v)); }
  });

  // Idioma: el enlace vuelve a la página en español
  const esHref = p.relative(p.dirname('en/' + file), file);
  $('a.lang-toggle').attr({ href: esHref, hreflang: 'es', 'aria-label': 'Ver en español', title: 'Ver en español' });
  $('a#btn-es').attr('href', esHref).removeAttr('aria-current');
  $('a#btn-en').attr({ href: p.basename(file), 'aria-current': 'true' });

  // Textos que solo existían en español
  $('img[alt]').each((_, el) => { const t = content.alts[$(el).attr('alt')]; if (t) $(el).attr('alt', t); });
  for (const a of ['aria-label', 'title']) $(`[${a}]`).each((_, el) => { const t = content.aria[$(el).attr(a)]; if (t) $(el).attr(a, t); });

  $('body *').contents().filter((_, n) => n.type === 'text').each((_, n) => {
    const raw = n.data, t = raw.replace(/\s+/g, ' ').trim(), en = content.strings[t];
    if (en && !['SCRIPT', 'STYLE'].includes($(n).parent().prop('tagName'))) n.data = raw.replace(raw.trim(), en);
  });

  // Datos estructurados
  $('script[type="application/ld+json"]').each((_, el) => {
    const d = JSON.parse($(el).html());
    const h1 = $('h1').first().text().trim();
    if (d['@type'] === 'FAQPage') {
      d.mainEntity = $('details').toArray().map(x => ({ '@type': 'Question', name: $(x).find('summary').text().trim(), acceptedAnswer: { '@type': 'Answer', text: $(x).find('p').first().text().trim() } }));
    } else {
      if (d['@type'] === 'TouristTrip') { d.name = h1; d.description = desc; }
      if (d['@type'] === 'BlogPosting') { d.headline = h1; d.description = desc; d.inLanguage = 'en'; }
      if (d['@type'] === 'TourOperator') d.description = desc;
      if (d['@type'] === 'BreadcrumbList') d.itemListElement.forEach((it, i, all) => { if (i === 0) it.name = 'Home'; if (i === all.length - 1) it.name = h1; });
    }
    const walk = o => { for (const k in o) { if (typeof o[k] === 'string') { if (k !== 'image') o[k] = enUrl(o[k]); if (o[k] === 'Berlín') o[k] = 'Berlin'; } else if (o[k] && typeof o[k] === 'object') walk(o[k]); } };
    walk(d);
    $(el).text('\n' + JSON.stringify(d, null, 2) + '\n');
  });

  const out = path.join(root, 'en', file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, $.html());
}

function buildSitemap() {
  const f = path.join(root, 'sitemap.xml');
  let x = fs.readFileSync(f, 'utf8').replace(/\s*<url>\s*<loc>[^<]*\/en\/[\s\S]*?<\/url>/g, '');
  const blocks = [...x.matchAll(/<url>[\s\S]*?<\/url>/g)].map(m => m[0]);
  const en = blocks.map(b => b.replace(/<loc>([^<]*)<\/loc>/, (_, u) => `<loc>${enUrl(u)}</loc>`)).filter(b => b.includes('/en/'));
  fs.writeFileSync(f, x.replace('</urlset>', en.map(b => '  ' + b).join('\n') + '\n</urlset>'));
  return en.length;
}

for (const file of PAGES) buildEn(file, patchSource(file));
console.log('páginas en inglés:', PAGES.length, '| sitemap añadió:', buildSitemap());
