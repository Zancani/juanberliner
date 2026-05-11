#!/usr/bin/env node
/**
 * Fetches opening hours for each place using two sources:
 *   1) OpenStreetMap Overpass API — free, no key, structured opening_hours tag
 *   2) Puppeteer + Bing search fallback for anything not in OSM
 *
 * Saves to hours.json. Then run: node inject-hours.js
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

puppeteer.use(StealthPlugin());

const HTML_FILE   = path.join(__dirname, '..', 'berlin-map.html');
const OUTPUT_FILE = path.join(__dirname, 'hours.json');

// Extract place data (name + lat/lon) from the HTML
function getPlaces() {
  const html = fs.readFileSync(HTML_FILE, 'utf8');
  return [...html.matchAll(/\{ name:"([^"]+)", lat:([\d.]+), lon:([\d.]+)/g)]
    .map(m => ({ name: m[1], lat: parseFloat(m[2]), lon: parseFloat(m[3]) }));
}

const delay = ms => new Promise(r => setTimeout(r, ms));

// ── Format OSM opening_hours string into something readable ───────────────────
function formatOsmHours(raw) {
  if (!raw) return null;
  // Normalize: "Mo-Fr 09:00-18:00; Sa 10:00-16:00" → keep as-is but clean up
  return raw
    .replace(/;/g, '  ·  ')
    .replace(/,/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Query Overpass API for a place by name near lat/lon ───────────────────────
function overpassQuery(name, lat, lon) {
  // 0.01° ≈ 1 km radius around the place
  const d = 0.012;
  const bbox = `${lat-d},${lon-d},${lat+d},${lon+d}`;
  const escaped = name.replace(/"/g, '\\"');
  const query = `[out:json][timeout:10];
(
  node["name"="${escaped}"](${bbox});
  way["name"="${escaped}"](${bbox});
  relation["name"="${escaped}"](${bbox});
);
out tags;`;

  return new Promise((resolve, reject) => {
    const body = 'data=' + encodeURIComponent(query);
    const req = https.request({
      hostname: 'overpass-api.de',
      path: '/api/interpreter',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const elements = json.elements || [];
          // Find the element with opening_hours
          for (const el of elements) {
            if (el.tags && el.tags.opening_hours) {
              return resolve(formatOsmHours(el.tags.opening_hours));
            }
          }
          resolve(null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(12000, () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

// ── Bing search fallback ───────────────────────────────────────────────────────
async function bingHours(page, placeName) {
  const q = encodeURIComponent(`${placeName} Berlin opening hours`);
  try {
    await page.goto(`https://www.bing.com/search?q=${q}&setlang=en`, {
      waitUntil: 'networkidle2',
      timeout: 25000,
    });
  } catch { return null; }

  await delay(1500);

  return await page.evaluate(() => {
    // Try JSON-LD structured data first (most reliable)
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const d = JSON.parse(script.textContent);
        const arr = Array.isArray(d) ? d : [d];
        for (const item of arr) {
          if (item.openingHours) {
            const h = Array.isArray(item.openingHours) ? item.openingHours : [item.openingHours];
            return h.join('  ·  ');
          }
          if (item.openingHoursSpecification) {
            return item.openingHoursSpecification
              .map(s => `${[s.dayOfWeek].flat().join('/')} ${s.opens || ''}–${s.closes || ''}`)
              .join('  ·  ');
          }
        }
      } catch (_) {}
    }

    // Try visible hours text in Bing's knowledge panel
    const text = document.body.innerText;
    const dayMatch = text.match(
      /((Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[^\n]{5,60}(AM|PM|Closed|Open)[^\n]{0,30}\n?){2,}/gi
    );
    if (dayMatch) return dayMatch[0].replace(/\n+/g, '  ·  ').replace(/\s{2,}/g, ' ').trim().slice(0, 200);

    // "Open · Closes 10 PM" style snippet
    const openMatch = text.match(/(Open now|Closed now|Opens at|Closes at)[^\n.]{3,40}/i);
    if (openMatch) return openMatch[0].trim();

    return null;
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const places = getPlaces();
  console.log(`Found ${places.length} places\n`);

  let results = {};
  if (fs.existsSync(OUTPUT_FILE)) {
    results = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    console.log(`Resuming: ${Object.keys(results).length} already done\n`);
  }

  // ── Pass 1: OpenStreetMap (no browser needed) ──────────────────────────────
  const needsBing = [];
  console.log('── Pass 1: OpenStreetMap Overpass API ──────────────────────');
  for (const place of places) {
    if (Object.prototype.hasOwnProperty.call(results, place.name)) {
      if (!results[place.name]) needsBing.push(place);
      continue;
    }
    process.stdout.write(`  ${place.name} ... `);
    const hrs = await overpassQuery(place.name, place.lat, place.lon);
    results[place.name] = hrs || null;
    if (hrs) {
      console.log(`✓  ${hrs.slice(0, 60)}`);
    } else {
      console.log('– not in OSM');
      needsBing.push(place);
    }
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
    await delay(300); // be polite to Overpass
  }

  const osmFound = Object.values(results).filter(Boolean).length;
  console.log(`\nOSM: ${osmFound} found, ${needsBing.length} need Bing fallback\n`);

  if (needsBing.length === 0) {
    console.log('All done from OSM!');
  } else {
    // ── Pass 2: Bing fallback for places not in OSM ───────────────────────────
    console.log('── Pass 2: Bing search fallback ─────────────────────────────');
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

    for (let i = 0; i < needsBing.length; i++) {
      const place = needsBing[i];
      process.stdout.write(`[${i+1}/${needsBing.length}] ${place.name} ... `);
      try {
        const hrs = await bingHours(page, place.name);
        results[place.name] = hrs || null;
        console.log(hrs ? `✓  ${hrs.slice(0, 60)}` : '✗ not found');
      } catch (e) {
        results[place.name] = null;
        console.log(`✗ ${e.message.split('\n')[0]}`);
      }
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
      await delay(1800 + Math.random() * 800);
    }

    await browser.close();
  }

  const total = Object.values(results).filter(Boolean).length;
  console.log(`\n✓ Done! Hours found: ${total}/${places.length}`);
  console.log(`Saved to: hours.json`);
  console.log(`\nNext: node inject-hours.js`);
}

main().catch(err => { console.error(err); process.exit(1); });
