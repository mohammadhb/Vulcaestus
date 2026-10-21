import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require('sharp');
} catch {
  const base = resolve('node_modules/.pnpm');
  const entry = (await readdir(base)).find((name) => name.startsWith('sharp@'));
  if (!entry) throw new Error('sharp is not installed; run pnpm install first');
  sharp = require(resolve(base, entry, 'node_modules/sharp'));
}

const dark = '#0b0f16';
const white = '#ffffff';

function mark(fill) {
  return `<path d="M40 30 L88 4 L166 120 L244 4 L292 30 L184 182 L184 360 L136 360 L136 182 Z" fill="${fill}"/>
  <rect x="96" y="222" width="128" height="40" fill="${fill}"/>`;
}

function stacked(fill, background = 'none') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  ${background === 'none' ? '' : `<rect width="1024" height="1024" fill="${background}"/>`}
  <g transform="translate(296 34) scale(1.35)">${mark(fill)}</g>
  <g fill="${fill}" font-family="Avenir Next, Futura, Century Gothic, Helvetica, Arial, sans-serif">
    <text x="512" y="790" text-anchor="middle" font-size="132" font-weight="500" letter-spacing="1">vulcaestus</text>
    <path d="M692 748 Q744 674 798 748" fill="none" stroke="${fill}" stroke-width="14"/>
    <rect x="238" y="752" width="654" height="13"/>
  </g>
</svg>`;
}

function markOnly(fill) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 380" width="320" height="380">${mark(fill)}</svg>`;
}

const publicDir = resolve('apps/web/public/brand');
const appDir = resolve('apps/web/app');
await mkdir(publicDir, { recursive: true });

const files = {
  'vulcaestus-mark-light.svg': markOnly(white),
  'vulcaestus-mark-dark.svg': markOnly(dark),
  'vulcaestus-logo-light.svg': stacked(white),
  'vulcaestus-logo-dark.svg': stacked(dark),
  'vulcaestus-logo-light-bg.svg': stacked(dark, white),
};

for (const [name, svg] of Object.entries(files)) {
  await writeFile(resolve(publicDir, name), `${svg}\n`);
}

async function png(svg, path, width) {
  await sharp(Buffer.from(svg)).resize({ width }).png().toFile(path);
}

await png(markOnly(white), resolve(publicDir, 'vulcaestus-mark-light.png'), 512);
await png(markOnly(dark), resolve(publicDir, 'vulcaestus-mark-dark.png'), 512);
await png(stacked(white), resolve(publicDir, 'vulcaestus-logo-light.png'), 1024);
await png(stacked(dark), resolve(publicDir, 'vulcaestus-logo-dark.png'), 1024);
await png(markOnly(dark), resolve(appDir, 'icon.png'), 512);
await png(markOnly(dark), resolve(appDir, 'apple-icon.png'), 180);

console.log('Generated Vulcaestus logo assets in apps/web/public/brand and apps/web/app.');
