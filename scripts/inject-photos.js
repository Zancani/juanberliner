#!/usr/bin/env node
/**
 * Injects scraped photo URLs from photo-urls.json into berlin-map.html
 * Run this after scrape-photos.js finishes.
 */

const fs   = require('fs');
const path = require('path');

const HTML_FILE   = path.join(__dirname, '..', 'berlin-map.html');
const URLS_FILE   = path.join(__dirname, 'photo-urls.json');
const BACKUP_FILE = path.join(__dirname, '..', 'berlin-map.html.bak');

if (!fs.existsSync(URLS_FILE)) {
  console.error('photo-urls.json not found — run scrape-photos.js first.');
  process.exit(1);
}

const photoUrls = JSON.parse(fs.readFileSync(URLS_FILE, 'utf8'));
const found = Object.values(photoUrls).filter(Boolean).length;
console.log(`Loaded ${found} photo URLs from photo-urls.json`);

let html = fs.readFileSync(HTML_FILE, 'utf8');

// Backup the original file
fs.writeFileSync(BACKUP_FILE, html);
console.log('Backup saved: berlin-map.html.bak');

// ── 1. Add or replace the PHOTO_URLS constant ──────────────────────────────
const MARKER     = '// ── PHOTO URLS (scraped)';
const ANCHOR     = '// ── PHOTO URL (source.unsplash.com';
const newConstant = `${MARKER} ────────────────────────────────────────\nconst PHOTO_URLS = ${JSON.stringify(photoUrls, null, 2)};\n\n`;

if (html.includes(MARKER)) {
  // Replace existing block (from marker to the blank line before the next comment)
  html = html.replace(/\/\/ ── PHOTO URLS \(scraped\)[^\n]*\nconst PHOTO_URLS = \{[\s\S]*?\};\n\n/, newConstant);
  console.log('Updated existing PHOTO_URLS constant.');
} else if (html.includes(ANCHOR)) {
  html = html.replace(ANCHOR, newConstant + ANCHOR);
  console.log('Inserted PHOTO_URLS constant.');
} else {
  console.error('Could not find insertion point in berlin-map.html. Aborting.');
  process.exit(1);
}

// ── 2. Patch getPhotoUrl to check PHOTO_URLS first ────────────────────────
const CHECK_LINE = '  if (PHOTO_URLS[place.name]) return PHOTO_URLS[place.name];';

if (!html.includes(CHECK_LINE)) {
  html = html.replace(
    'function getPhotoUrl(place) {\n  const catKw',
    `function getPhotoUrl(place) {\n${CHECK_LINE}\n  const catKw`
  );
  console.log('Patched getPhotoUrl to use scraped URLs with Unsplash fallback.');
} else {
  console.log('getPhotoUrl already patched, skipping.');
}

fs.writeFileSync(HTML_FILE, html);
console.log(`\n✓ berlin-map.html updated with ${found} scraped photos.`);
console.log('Review the site, then:  git add berlin-map.html && git commit && git push');
