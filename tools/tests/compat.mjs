/* Old-browser guard for the TV page (Tizen / webOS / old Safari, roughly Chrome 63 / ES2017).
   Run: node tools/tests/compat.mjs
   1. Every script that index.html loads (and sw.js) must parse as a classic script and use no syntax newer than ES2017.
   2. Those scripts must not call APIs newer than ES2017 (flat, flatMap, at, fromEntries, replaceAll, structuredClone, ...).
   3. css/style.css must not use CSS that browsers of 2018 ignore without a fallback (:has, @container, @layer, nesting, ...).
      css/setup.css (phone page) is not checked. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const findings = [];
const add = (file, line, what) => findings.push(file + (line ? ':' + line : '') + '  ' + what);

// blank out comments and string/template contents but keep line numbers and length
function strip(src, css) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  if (!css) {
    out = out.replace(/(^|[^:\\])\/\/.*$/gm, (m, a) => a + ' '.repeat(m.length - a.length));
    out = out.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, (m) => "'" + ' '.repeat(m.length - 2) + "'");
  }
  return out;
}
const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

// ---- 1 + 2: scripts ----
const html = read('index.html');
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]).filter((s) => !/^https?:/.test(s));
scripts.push('sw.js');
const SYNTAX = [
  [/\?\.(?![0-9])/, 'optional chaining (?.)'],
  [/\?\?/, 'nullish coalescing (??)'],
  [/^\s*(export|import)\s/m, 'ES module syntax'],
  [/\bclass\s+\w+/, 'class declaration (use only if all target browsers support it; ES2015, but class fields are not)'],
  [/^\s*(static\s+)?#?\w+\s*=\s*[^=>]*;\s*$/m, null], // placeholder, class fields are caught below
  [/\bcatch\s*\{/, 'optional catch binding'],
  [/\{\s*\.\.\.\w|,\s*\.\.\.\w+\s*\}/, 'object spread/rest (ES2018)'],
  [/\(\?<[=!]/, 'regex lookbehind (ES2018)'],
  [/\(\?<\w+>/, 'regex named groups (ES2018)'],
  [/\/[gimuy]*s[gimuy]*(?=[\s,;.)])/, null],
  [/\bfor\s+await\b/, 'for await (ES2018)'],
  [/\b\d[\d_]*_\d+\b/, 'numeric separators'],
  [/\b\d+n\b/, 'BigInt literal'],
  [/&&=|\|\|=|\?\?=/, 'logical assignment']
];
const APIS = [
  [/\.flatMap\s*\(/, 'Array.prototype.flatMap'],
  [/\.flat\s*\(/, 'Array.prototype.flat'],
  [/\.at\s*\(\s*-?\d*\s*\)/, 'Array/String .at()'],
  [/Object\.fromEntries/, 'Object.fromEntries'],
  [/\.replaceAll\s*\(/, 'String.prototype.replaceAll'],
  [/structuredClone\s*\(/, 'structuredClone'],
  [/\.matchAll\s*\(/, 'String.prototype.matchAll'],
  [/\.trimStart\s*\(|\.trimEnd\s*\(/, 'trimStart/trimEnd'],
  [/Promise\.(allSettled|any)\s*\(/, 'Promise.allSettled/any'],
  [/\.finally\s*\(/, 'Promise.prototype.finally (Chrome 63+, check the oldest TV)'],
  [/globalThis/, 'globalThis'],
  [/\bBigInt\b/, 'BigInt'],
  [/Array\.prototype\.findLast|\.findLast(Index)?\s*\(/, 'findLast'],
  [/Object\.hasOwn\s*\(/, 'Object.hasOwn'],
  [/new\s+AbortController|AbortSignal\.timeout/, 'AbortController/AbortSignal.timeout'],
  [/\.replaceChildren\s*\(|\.toSorted\s*\(|\.toReversed\s*\(/, 'replaceChildren/toSorted/toReversed'],
  [/queueMicrotask|requestIdleCallback/, 'queueMicrotask/requestIdleCallback (needs a guard)']
];
for (const f of [...new Set(scripts)]) {
  const raw = read(f);
  try { new vm.Script(raw, { filename: f }); } catch (e) { add(f, 0, 'does not parse as a classic script: ' + e.message); continue; }
  const src = strip(raw, false);
  for (const [re, what] of SYNTAX) {
    if (!what) continue;
    const m = re.exec(src);
    if (m) add(f, lineOf(src, m.index), what);
  }
  for (const [re, what] of APIS) {
    const m = re.exec(src);
    if (m) add(f, lineOf(src, m.index), what);
  }
}

// ---- 3: TV stylesheet ----
const cssRaw = read('css/style.css');
const css = strip(cssRaw, true);
const CSS = [
  [/:has\s*\(/, ':has() (Chrome 105)'],
  [/@container\b|container-type\s*:/, 'container queries (Chrome 105)'],
  [/@layer\b/, '@layer (Chrome 99)'],
  [/@scope\b/, '@scope'],
  [/:is\s*\(|:where\s*\(/, ':is()/:where() (Chrome 88)'],
  [/:focus-visible/, ':focus-visible (Chrome 86)'],
  [/\baspect-ratio\s*:/, 'aspect-ratio (Chrome 88)'],
  [/\binset\s*:/, 'inset shorthand (Chrome 87)'],
  [/\bgap\s*:/, 'gap on flexbox (Chrome 84); grid gap only from Chrome 66'],
  [/\b(d|s|l)vh\b|\b(d|s|l)vw\b/, 'dvh/svh/lvh units (Chrome 108)'],
  [/color-mix\s*\(|oklch\s*\(|oklab\s*\(|\blch\s*\(|\blab\s*\(/, 'color-mix / oklch / lab colours'],
  [/rgba?\([^)]*\/\s*[\d.%]+\s*\)/, 'rgb(r g b / a) space syntax (Chrome 65 for rgb() with slash)'],
  [/\bsubgrid\b/, 'subgrid'],
  [/:not\([^)]*,[^)]*\)/, ':not() with a selector list (Chrome 88)'],
  [/\bscroll-snap|\boverscroll-behavior|\bbackdrop-filter/, null],
  [/\bclamp\s*\(|\bmin\s*\(|\bmax\s*\(/, 'min()/max()/clamp() (Chrome 79; needs a fallback declaration before it)'],
  [/\binitial-letter|\btext-wrap\s*:\s*balance|\bfield-sizing/, 'new text/layout properties'],
  [/\bgrid-template/, 'CSS grid (Chrome 57; README says flexbox only)']
];
for (const [re, what] of CSS) {
  if (!what) continue;
  const m = re.exec(css);
  if (m) add('css/style.css', lineOf(css, m.index), what + '  -> ' + cssRaw.split('\n')[lineOf(css, m.index) - 1].trim().slice(0, 80));
}
// nesting: a rule block that contains another rule block, or a "&" selector
(function nesting() {
  let depth = 0, line = 1, stackAt = [];
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '\n') line++;
    if (ch === '{') {
      const head = css.slice(Math.max(0, css.lastIndexOf('}', i - 1), css.lastIndexOf(';', i - 1), css.lastIndexOf('{', i - 1)) + 1, i).trim();
      const isAt = head[0] === '@';
      if (depth > 0 && !stackAt[depth - 1] && !isAt) add('css/style.css', line, 'nested rule (CSS nesting, Chrome 112): ' + head.slice(0, 60));
      stackAt[depth++] = isAt;
    } else if (ch === '}') { depth--; }
  }
  if (/(^|[\s,{;])&\s*[.:#\w\[]/m.test(css)) add('css/style.css', 0, 'nesting selector (&)');
})();

if (findings.length) {
  console.log('compat: ' + findings.length + ' finding(s) for old TV browsers');
  findings.forEach((f) => console.log('  ' + f));
  process.exit(1);
}
console.log('compat: ' + scripts.length + ' scripts (ES2017 syntax and APIs) and css/style.css are clean');
