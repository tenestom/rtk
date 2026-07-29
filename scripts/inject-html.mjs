/**
 * inject-html.mjs
 * ───────────────────────────────────────────────────────────────────
 * Reads dist/index.html (built by vite-plugin-singlefile — a single,
 * fully self-contained HTML file with all CSS and JS inlined),
 * gzip-compresses it with Node's built-in zlib, then replaces the
 * INDEX_HTML PROGMEM block inside esp32/RTK_Tracker.ino with a
 * uint8_t byte array so the ESP32 can serve it with
 * Content-Encoding: gzip.
 *
 * Before (raw string, ~310 KB uncompressed):
 *   const char INDEX_HTML[] PROGMEM = R"WEBAPP(...html...)WEBAPP";
 *
 * After (gzip bytes, ~85 KB compressed):
 *   const uint8_t INDEX_HTML[] PROGMEM = { 0x1f,0x8b,... };
 *   const size_t  INDEX_HTML_LEN = 87654;
 *
 * Usage:  node scripts/inject-html.mjs
 * Typically called via:  npm run build:esp32
 * ───────────────────────────────────────────────────────────────────
 */

import { readFileSync, writeFileSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { gzipSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = resolve(__dirname, '..');

const HTML_FILE = resolve(root, 'dist/index.html');
const INO_FILE  = resolve(root, 'esp32/RTK_Tracker.ino');

// ── Marker comments used in the .ino to delimit the auto-generated block ──
const OPEN_MARKER  = '// @@BEGIN_INDEX_HTML_GZ@@';
const CLOSE_MARKER = '// @@END_INDEX_HTML_GZ@@';

// ── Read and compress ─────────────────────────────────────────────────────
const html       = readFileSync(HTML_FILE);                       // Buffer
const compressed = gzipSync(html, { level: 9 });                  // Buffer

// ── Format as a C byte array (16 bytes per line for readability) ──────────
const COLS = 16;
const hexLines = [];
for (let i = 0; i < compressed.length; i += COLS) {
  const slice = compressed.slice(i, i + COLS);
  hexLines.push('  ' + [...slice].map(b => `0x${b.toString(16).padStart(2, '0')}`).join(','));
}
const arrayBody = hexLines.join(',\n');

const cBlock =
  `const uint8_t INDEX_HTML_GZ[] PROGMEM = {\n` +
  arrayBody + '\n' +
  `};\n` +
  `const size_t INDEX_HTML_GZ_LEN = ${compressed.length};\n`;

// ── Locate existing block in the .ino and replace it ─────────────────────
const ino      = readFileSync(INO_FILE, 'utf8');
const openIdx  = ino.indexOf(OPEN_MARKER);
const closeIdx = ino.indexOf(CLOSE_MARKER, openIdx);

if (openIdx === -1 || closeIdx === -1) {
  console.error('\n[inject-html] ❌  Could not find marker comments in RTK_Tracker.ino');
  console.error(`               Expected: ${OPEN_MARKER}`);
  console.error(`               And:      ${CLOSE_MARKER}\n`);
  process.exit(1);
}

const updated =
  ino.slice(0, openIdx + OPEN_MARKER.length) +
  '\n' +
  cBlock +
  ino.slice(closeIdx);   // starts with CLOSE_MARKER

writeFileSync(INO_FILE, updated);

// ── Report ────────────────────────────────────────────────────────────────
const rawKb  = (html.length        / 1024).toFixed(1);
const gzKb   = (compressed.length  / 1024).toFixed(1);
const ratio  = ((1 - compressed.length / html.length) * 100).toFixed(0);
const inoKb  = (statSync(INO_FILE).size / 1024).toFixed(1);
console.log(`\n[inject-html] ✅  HTML: ${rawKb} KB raw → ${gzKb} KB gzip (−${ratio}%)`);
console.log(`               Sketch is now ${inoKb} KB total.\n`);
