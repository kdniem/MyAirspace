// Renders icons/icon.svg to the PNG app icons with the preinstalled Playwright Chromium.
// Usage: node tools/build-icons.mjs   (from the repo root)
// Full-bleed variants (apple-touch, maskable) drop the rounded corners: the OS applies its own mask.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');

const svg = readFileSync('icons/icon.svg', 'utf8');
const square = svg.replace('rx="112"', 'rx="0"');
const jobs = [
  ['icons/icon-192.png', 192, svg],
  ['icons/icon-512.png', 512, svg],
  ['icons/icon-maskable-512.png', 512, square],
  ['icons/apple-touch-icon.png', 180, square]
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size, src] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent('<style>html,body{margin:0;background:transparent}svg{display:block;width:' + size +
    'px;height:' + size + 'px}</style>' + src);
  await page.screenshot({ path: file, omitBackground: true });
  console.log(file, size);
}
await browser.close();
