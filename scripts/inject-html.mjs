/**
 * inject-html.mjs
 * ───────────────────────────────────────────────────────────────────
 * Reads dist/index.html (built by vite-plugin-singlefile — a single,
 * fully self-contained HTML file with all CSS and JS inlined) and
 * replaces the INDEX_HTML PROGMEM block inside esp32/RTK_Tracker.ino.
 *
 * Usage:  node scripts/inject-html.mjs
 * Typically called via:  npm run build:esp32
 * ───────────────────────────────────────────────────────────────────
 */

import { readFileSync, writeFileSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = resolve(__dirname, '..');

const HTML_FILE = resolve(root, 'dist/index.html');
const INO_FILE  = resolve(root, 'esp32/RTK_Tracker.ino');

// Raw-string delimiter used in the .ino — must not appear in the HTML.
const DELIMITER  = 'WEBAPP';
const OPEN_TAG   = `const char INDEX_HTML[] PROGMEM = R"${DELIMITER}(`;
const CLOSE_TAG  = `)${DELIMITER}";`;

// ── Read inputs ──────────────────────────────────────────────────────
const html = readFileSync(HTML_FILE, 'utf8').trimEnd();
const ino  = readFileSync(INO_FILE,  'utf8');

// ── Safety check: delimiter must not appear inside the HTML ──────────
if (html.includes(CLOSE_TAG)) {
  console.error(`\n[inject-html] ❌  Built HTML contains the raw-string delimiter: ${CLOSE_TAG}`);
  console.error('               Change DELIMITER in this script to something unique.\n');
  process.exit(1);
}

// ── Locate the PROGMEM block ─────────────────────────────────────────
const openIdx  = ino.indexOf(OPEN_TAG);
const closeIdx = ino.indexOf(CLOSE_TAG, openIdx);

if (openIdx === -1 || closeIdx === -1) {
  console.error('\n[inject-html] ❌  Could not find INDEX_HTML PROGMEM block in RTK_Tracker.ino');
  console.error(`               Expected to find: ${OPEN_TAG} … ${CLOSE_TAG}\n`);
  process.exit(1);
}

// ── Replace the block content ────────────────────────────────────────
const updated =
  ino.slice(0, openIdx + OPEN_TAG.length) +
  '\n' +
  html  +
  '\n' +
  ino.slice(closeIdx);   // starts with ")WEBAPP";"

writeFileSync(INO_FILE, updated);

// ── Report ───────────────────────────────────────────────────────────
const kb = (html.length / 1024).toFixed(1);
const inoKb = (statSync(INO_FILE).size / 1024).toFixed(1);
console.log(`\n[inject-html] ✅  Injected ${kb} KB of HTML into esp32/RTK_Tracker.ino`);
console.log(`               Sketch is now ${inoKb} KB total.\n`);
