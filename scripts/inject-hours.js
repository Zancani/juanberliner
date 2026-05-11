#!/usr/bin/env node
/**
 * Injects hours from hours.json into berlin-map.html as a HOURS constant,
 * and updates openPanel to show them in the info section.
 * Run after scrape-hours.js.
 */

const fs   = require('fs');
const path = require('path');

const HTML_FILE   = path.join(__dirname, '..', 'berlin-map.html');
const HOURS_FILE  = path.join(__dirname, 'hours.json');
const BACKUP_FILE = path.join(__dirname, '..', 'berlin-map.html.bak2');

if (!fs.existsSync(HOURS_FILE)) {
  console.error('hours.json not found — run scrape-hours.js first.');
  process.exit(1);
}

const hours = JSON.parse(fs.readFileSync(HOURS_FILE, 'utf8'));
const found = Object.values(hours).filter(Boolean).length;
console.log(`Loaded ${found} hours entries from hours.json`);

let html = fs.readFileSync(HTML_FILE, 'utf8');
fs.writeFileSync(BACKUP_FILE, html);
console.log('Backup saved: berlin-map.html.bak2');

// ── 1. Add HOURS constant ─────────────────────────────────────────────────
const MARKER = '// ── HOURS (scraped)';
const ANCHOR = '// ── PHOTO URLS (scraped)';
const newConstant = `${MARKER} ───────────────────────────────────────────────────\nconst HOURS = ${JSON.stringify(hours, null, 2)};\n\n`;

if (html.includes(MARKER)) {
  html = html.replace(/\/\/ ── HOURS \(scraped\)[^\n]*\nconst HOURS = \{[\s\S]*?\};\n\n/, newConstant);
  console.log('Updated existing HOURS constant.');
} else {
  html = html.replace(ANCHOR, newConstant + ANCHOR);
  console.log('Inserted HOURS constant.');
}

// ── 2. Patch openPanel to show hours ─────────────────────────────────────
const OLD_INFO = `  document.getElementById('p-info').innerHTML = '';`;
const NEW_INFO = `  const info = document.getElementById('p-info');
  info.innerHTML = '';
  const hrs = HOURS[place.name];
  if (hrs) {
    info.innerHTML = \`<div class="p-row"><span class="p-icon">🕐</span><span class="p-val">\${hrs}</span></div>\`;
  }`;

if (!html.includes('const hrs = HOURS[place.name]')) {
  html = html.replace(OLD_INFO, NEW_INFO);
  console.log('Patched openPanel to display hours.');
} else {
  console.log('openPanel already patched, skipping.');
}

fs.writeFileSync(HTML_FILE, html);
console.log(`\n✓ berlin-map.html updated with ${found} opening hours.`);
console.log('Review the site, then:  git add berlin-map.html && git commit && git push');
