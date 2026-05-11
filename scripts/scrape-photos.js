#!/usr/bin/env node
/**
 * Scrapes Bing Images to find one photo per place in berlin-map.html
 * Bing stores direct source URLs (no Google proxy issues)
 * Saves progress incrementally → photo-urls.json  (resumable if interrupted)
 * Then run:  node inject-photos.js
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs   = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const HTML_FILE   = path.join(__dirname, '..', 'berlin-map.html');
const OUTPUT_FILE = path.join(__dirname, 'photo-urls.json');

// ── Extract place names from the PLACES array in berlin-map.html ────────────
function getPlaceNames() {
  const html = fs.readFileSync(HTML_FILE, 'utf8');
  const matches = [...html.matchAll(/\{ name:"([^"]+)"/g)];
  return matches.map(m => m[1]);
}

const delay = ms => new Promise(r => setTimeout(r, ms));

// ── Fetch one photo URL from Bing Images ────────────────────────────────────
async function fetchPhotoUrl(page, placeName) {
  const q = encodeURIComponent(`${placeName} Berlin`);

  try {
    await page.goto(`https://www.bing.com/images/search?q=${q}&form=HDRSC2&first=1`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
  } catch {
    return null;
  }

  await delay(600 + Math.random() * 300);

  // Bing stores image data in anchor elements with a JSON "m" attribute
  // that contains "murl" — the direct source image URL
  const url = await page.evaluate(() => {
    // Method 1: parse the "m" attribute on the first .iusc anchor
    const anchors = [...document.querySelectorAll('a.iusc')];
    for (const a of anchors) {
      try {
        const data = JSON.parse(a.getAttribute('m') || '{}');
        if (data.murl && data.murl.startsWith('http')) return data.murl;
      } catch (_) {}
    }

    // Method 2: scan page HTML for "murl" JSON field
    const html = document.documentElement.innerHTML;
    const matches = [...html.matchAll(/"murl":"(https?:[^"]+)"/g)];
    for (const m of matches) {
      const u = m[1].replace(/\\u002F/g, '/');
      if (u.startsWith('http')) return u;
    }

    // Method 3: grab src of first result image that looks real
    const imgs = [...document.querySelectorAll('img.mimg, .iusc img')].filter(img =>
      img.src && img.src.startsWith('http') && img.naturalWidth > 100
    );
    return imgs[0]?.src || null;
  });

  return url;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const places = getPlaceNames();
  console.log(`Found ${places.length} places in berlin-map.html\n`);

  // Load previous results to allow resuming
  let results = {};
  if (fs.existsSync(OUTPUT_FILE)) {
    results = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    const done = Object.keys(results).length;
    if (done > 0) console.log(`Resuming: ${done} places already scraped\n`);
  }

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--window-size=1280,900', '--no-sandbox'],
    defaultViewport: { width: 1280, height: 900 },
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  );

  for (let i = 0; i < places.length; i++) {
    const name = places[i];

    if (Object.prototype.hasOwnProperty.call(results, name)) {
      console.log(`[${i+1}/${places.length}] ${name} — skipping (already done)`);
      continue;
    }

    process.stdout.write(`[${i+1}/${places.length}] ${name} ... `);

    try {
      const url = await fetchPhotoUrl(page, name);
      results[name] = url || null;
      console.log(url ? `✓  ${url.slice(0, 70)}` : '✗ not found');
    } catch (e) {
      results[name] = null;
      console.log(`✗ error: ${e.message.split('\n')[0]}`);
    }

    // Save after every place — safe to Ctrl+C and resume
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));

    await delay(1200 + Math.random() * 800);
  }

  await browser.close();

  const found = Object.values(results).filter(Boolean).length;
  console.log(`\n✓ Done! Photos found: ${found}/${places.length}`);
  console.log(`Saved to: photo-urls.json`);
  console.log(`\nNext step: node inject-photos.js`);
}

main().catch(err => { console.error(err); process.exit(1); });
