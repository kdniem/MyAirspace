/* Runs the whole safety net in order and exits non-zero on any failure.
   Run: node tools/tests/run-all.mjs [--no-browser] [--quick]     (npm test)
   Steps: syntax check, URL options + ES2017 scan (options.cjs), view rotation (rotation-test.cjs), old-browser guard (compat.mjs),
   contrast, chart background (chart-test.cjs), proxy, browser suite (needs Playwright + Chromium; PLAYWRIGHT_PATH points at the package). */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const files = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.js')).map((f) => dir + '/' + f);
const steps = [];

steps.push({
  name: 'syntax (node --check)',
  run() {
    const bad = [];
    for (const f of [...files('js'), ...files('api'), 'sw.js']) {
      // classic scripts are checked from stdin (a .js file here would be parsed as a module: package.json "type": "module")
      const isModule = f.startsWith('api/');
      const r = isModule
        ? spawnSync(process.execPath, ['--check', f], { cwd: ROOT, encoding: 'utf8' })
        : spawnSync(process.execPath, ['--check', '--input-type=commonjs', '-'], { cwd: ROOT, encoding: 'utf8', input: fs.readFileSync(path.join(ROOT, f), 'utf8') });
      if (r.status !== 0) bad.push(f + ': ' + String(r.stderr).split('\n').slice(0, 4).join(' | '));
    }
    return { ok: !bad.length, out: bad.join('\n') || 'all files parse' };
  }
});
const cmd = (name, args, extra) => steps.push(Object.assign({
  name,
  run() {
    const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', env: process.env, maxBuffer: 64 * 1024 * 1024 });
    return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') };
  }
}, extra));

cmd('URL options + ES2017 scan (options.cjs)', ['tools/tests/options.cjs', '.']);
cmd('board selection (pick-test.cjs)', ['tools/tests/pick-test.cjs', '.']);
cmd('view rotation (rotation-test.cjs)', ['tools/tests/rotation-test.cjs', '.']);
cmd('diagnostics log (diag-test.cjs)', ['tools/tests/diag-test.cjs', '.']);
cmd('saved settings (prefs-test.cjs)', ['tools/tests/prefs-test.cjs', '.']);
cmd('glyph kinds (glyph-test.cjs)', ['tools/tests/glyph-test.cjs', '.']);
cmd('old-browser guard (compat.mjs)', ['tools/tests/compat.mjs']);
cmd('contrast', ['tools/contrast.mjs']);
cmd('chart background (chart-test.cjs)', ['tools/tests/chart-test.cjs', '.']);
cmd('proxy', ['tools/tests/proxy-test.mjs']);
cmd('proxy (incl. /api/radar)', ['tools/tests/proxy-test.mjs']);
cmd('weather radar decoding (wxradar-test.mjs)', ['tools/tests/wxradar-test.mjs']);
if (!argv.includes('--no-browser')) cmd('browser suite', ['tools/tests/browser.mjs'].concat(argv.includes('--quick') ? ['--quick'] : []));

const rows = [];
for (const s of steps) {
  const t0 = Date.now();
  console.log('\n=== ' + s.name + ' ===');
  let r;
  try { r = s.run(); } catch (e) { r = { ok: false, out: String(e && e.stack || e) }; }
  const lines = r.out.trim().split('\n');
  // keep the log short: everything on failure, the tail on success
  console.log((r.ok ? lines.slice(-12) : lines.slice(-60)).join('\n'));
  rows.push({ name: s.name, ok: r.ok, s: ((Date.now() - t0) / 1000).toFixed(1) });
}
console.log('\n=== summary ===');
rows.forEach((r) => console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + r.name + '  (' + r.s + ' s)'));
const failed = rows.filter((r) => !r.ok).length;
console.log(failed ? '\n' + failed + ' step(s) failed' : '\nall steps passed');
process.exit(failed ? 1 : 0);
