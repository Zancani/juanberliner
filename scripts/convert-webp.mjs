import sharp from 'sharp';
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, unlinkSync } from 'fs';
import { resolve, join, dirname, relative } from 'path';

const ROOT = resolve(import.meta.dirname, '..');

function findFiles(dir, ext, exclude = []) {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (exclude.some(x => full.includes(x))) continue;
    if (e.isDirectory()) {
      results.push(...findFiles(full, ext, exclude));
    } else if (e.name.match(new RegExp(`\\.(${ext})$`, 'i'))) {
      results.push(full);
    }
  }
  return results;
}

const exclude = ['node_modules', 'scripts', '.claude', '.git', 'dist', 'Takeout'];
const jpegs = findFiles(ROOT, 'jpg|jpeg', exclude);

console.log(`${jpegs.length} JPEGs found\n`);

const converted = []; // { jpgPath, webpPath, origKB, newKB, reduction }

for (const jpgPath of jpegs) {
  const origSize = statSync(jpgPath).size;
  const origKB = Math.round(origSize / 1024);

  if (origKB < 30) {
    console.log(`SKIP ${relative(ROOT, jpgPath)} — ${origKB}KB (ya es chico)`);
    continue;
  }

  const metadata = await sharp(jpgPath).metadata();
  let quality;
  if (metadata.width > 2000) quality = 78;
  else if (metadata.width > 1200) quality = 82;
  else quality = 85;

  const webpPath = jpgPath.replace(/\.(jpg|jpeg|JPG|JPEG)$/i, '.webp');
  await sharp(jpgPath).webp({ quality }).toFile(webpPath);

  const newSize = statSync(webpPath).size;
  const newKB = Math.round(newSize / 1024);
  const reduction = Math.round((1 - newSize / origSize) * 100);

  const rel = relative(ROOT, jpgPath);

  if (newSize >= origSize) {
    unlinkSync(webpPath);
    console.log(`KEEP ${rel} — ${origKB}KB (WebP ${newKB}KB, más grande)`);
  } else {
    converted.push({ jpgPath, webpPath, origKB, newKB, reduction, rel });
    console.log(`WEBP ${rel}  ${origKB}KB → ${newKB}KB (${reduction}%)`);
  }
}

// Save manifest
writeFileSync(resolve(ROOT, 'scripts/webp-manifest.json'), JSON.stringify(converted, null, 2));

const totalOrig = converted.reduce((s, c) => s + c.origKB, 0);
const totalNew = converted.reduce((s, c) => s + c.newKB, 0);
console.log(`\n${converted.length} converted. ${Math.round(totalOrig/1024)}MB → ${Math.round(totalNew/1024)}MB (${Math.round((1-totalNew/totalOrig)*100)}% saved)`);
