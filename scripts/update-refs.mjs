import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = resolve(import.meta.dirname, '..');

// Files where WebP is smaller (from conversion output)
const webpMap = {
  'Berlin-Skyline-Sunset.jpg': true,
  'Berlin_reichstag_west_panorama_2.jpg': true,
  'Perfil copy.jpeg': true,
  'Perfil.jpeg': true,
  'Rosenstrasse.jpg': true,
  'Sachsen.jpg': true,
  'alt.jpg': true,
  'blog/arte-urbano-hero.jpg': true,
  'blog/berlin-con-poco-presupuesto-hero.jpg': true,
  'blog/free-tour-hero.jpg': true,
  'blog/que-comer-en-berlin-hero.jpg': true,
  'blog/sachsenhausen-hero.jpg': true,
  'blog/techno-berlin-hero.jpg': true,
  'blog/tour-privado-berlin-guia-local.jpg': true,
  'csm_stolper_4_d0150b66fc.jpg': true,
  'muro.jpg': true,
  'og-image.jpg': true,
  'reichstag4-1.jpg': true,
  'titelbild_denkmal.jpg': true,
};

function findHtml(dir) {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (full.includes('node_modules') || full.includes('scripts') || full.includes('.claude') || full.includes('.git')) continue;
    if (e.isDirectory()) {
      results.push(...findHtml(full));
    } else if (e.name.endsWith('.html')) {
      results.push(full);
    }
  }
  return results;
}

const htmlFiles = findHtml(ROOT);
let totalReplacements = 0;

for (const htmlPath of htmlFiles) {
  let content = readFileSync(htmlPath, 'utf8');
  let changed = false;

  for (const [jpgFile, _] of Object.entries(webpMap)) {
    const webpFile = jpgFile.replace(/\.(jpg|jpeg|JPG|JPEG)$/i, '.webp');

    // Replace all occurrences of the jpg filename with webp
    while (content.includes(jpgFile)) {
      content = content.replace(jpgFile, webpFile);
      changed = true;
      totalReplacements++;
    }
  }

  if (changed) {
    writeFileSync(htmlPath, content);
    console.log(`✓ ${htmlPath.replace(ROOT + '/', '')}`);
  }
}

console.log(`\n${totalReplacements} references updated.`);
