/* Decoding and parsing tests for the DWD radar overlay (lib/dwd-radar.js) with a small ODIM HDF5
   fixture (tools/tests/fixtures/wn-small-000.h5: 40 x 50 cells of 1 km, real projdef and corners).
   Run: node tools/tests/wxradar-test.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { Filters } from 'jsfive';
import { fileURLToPath } from 'node:url';
import * as R from '../../lib/dwd-radar.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fixture = fs.readFileSync(path.join(HERE, 'fixtures/wn-small-000.h5'));
let n = 0;
function t(name, fn) { fn(); n++; console.log('ok  ' + name); }

// a ustar archive with the given [name, Buffer] entries
function makeTar(entries) {
  const parts = [];
  for (const [name, data] of entries) {
    const h = Buffer.alloc(512, 0);
    h.write(name, 0, 'latin1');
    h.write('0000644\0', 100, 'latin1');
    h.write(data.length.toString(8).padStart(11, '0') + '\0', 124, 'latin1');
    h.write('0', 156, 'latin1');
    h.write('ustar\0', 257, 'latin1');
    parts.push(h, data, Buffer.alloc((512 - (data.length % 512)) % 512, 0));
  }
  parts.push(Buffer.alloc(1024, 0));
  return Buffer.concat(parts);
}

const FRAME = 'composite_wn_20261012_1650_000-hd5';
const P = R.stereo(R.decodeFrame(fixture).projdef);
const f = R.decodeFrame(fixture);

t('tar: entries with odd sizes, end-of-archive', () => {
  const tar = makeTar([['a.txt', Buffer.from('hallo')], ['b.bin', Buffer.alloc(600, 7)]]);
  const es = R.readTar(tar);
  assert.deepEqual(es.map((e) => e.name), ['a.txt', 'b.bin']);
  assert.equal(es[0].data.toString(), 'hallo');
  assert.equal(es[1].data.length, 600);
});

t('tar: a truncated archive is refused', () => {
  const tar = makeTar([['a.txt', Buffer.alloc(900, 1)]]);
  assert.throws(() => R.readTar(tar.subarray(0, 700)), /bad tar/);
});

t('pickFrame takes only the newest frame (_000)', () => {
  const es = [{ name: 'composite_wn_20261012_1650_005-hd5' }, { name: FRAME }, { name: 'x.txt' }];
  assert.equal(R.pickFrame(es).name, FRAME);
  assert.equal(R.pickFrame([{ name: 'composite_wn_20261012_1650_005-hd5' }]), null);
});

t('stereo: corners of the file (edges) are 1100 x 1200 km apart and round-trip', () => {
  const UL = P.fwd(55.862087108249824, 1.463301510256666);
  const UR = P.fwd(55.845438563255755, 18.73161645466747);
  const LL = P.fwd(45.696425377390064, 3.5669946350078914);
  assert.ok(Math.abs(UR[0] - UL[0] - 1100000) < 2, 'UR dx ' + (UR[0] - UL[0]));
  assert.ok(Math.abs(UR[1] - UL[1]) < 2, 'UR dy');
  assert.ok(Math.abs(LL[1] - UL[1] + 1200000) < 2, 'LL dy ' + (LL[1] - UL[1]));
  const back = P.inv(UR[0], UR[1]);
  assert.ok(Math.abs(back[0] - 55.845438563255755) < 1e-7 && Math.abs(back[1] - 18.73161645466747) < 1e-7, back.join(','));
  for (const [la, lo] of [[47.2, 6.1], [52.5, 13.4], [50.03, 8.57]]) {
    const q = P.inv(...P.fwd(la, lo));
    assert.ok(Math.abs(q[0] - la) < 1e-7 && Math.abs(q[1] - lo) < 1e-7, 'round trip ' + la + ',' + lo);
  }
});

t('levelOf: 5 dBZ steps from 15 dBZ, capped, not coded below', () => {
  assert.equal(R.levelOf(14.9), 0);
  assert.equal(R.levelOf(15), 3);
  assert.equal(R.levelOf(19.9), 3);
  assert.equal(R.levelOf(20), 4);
  assert.equal(R.levelOf(46), 9);
  assert.equal(R.levelOf(80), R.MAX_LEVEL);
  assert.equal(R.levelOf(NaN), 0);
});

t('decodeFrame: metadata, time and raw values of the fixture', () => {
  assert.equal(f.time, '2026-10-12T16:50:03Z');
  assert.equal(f.xsize, 40);
  assert.equal(f.ysize, 50);
  assert.equal(f.raw.length, 40 * 50);
  assert.equal(f.raw.filter((v) => v === f.nodata).length, 1);
  assert.equal(f.projdef.indexOf('+proj=stere') === 0, true);
});

t('decodeFrame: a file with another quantity is refused', () => {
  // the same bytes with the quantity replaced (same length keeps the HDF5 offsets valid)
  const bad = Buffer.from(fixture);
  const at = bad.indexOf(Buffer.from('DBZH'));
  assert.ok(at > 0);
  bad.write('ACRR', at, 'latin1');
  assert.throws(() => R.decodeFrame(bad), /quantity/);
});

// Expected output cells, derived independently of toLevels: each native cell centre -> grid cell
function expectedLevels() {
  const g = R.GRID, out = new Map();
  const xy0 = P.fwd(f.ul[0], f.ul[1]);
  for (let j = 0; j < f.ysize; j++) for (let i = 0; i < f.xsize; i++) {
    const v = f.raw[j * f.xsize + i];
    if (v === f.nodata || v === f.undetect) continue;
    const lvl = R.levelOf(v * f.gain + f.offset);
    if (!lvl) continue;
    const ll = P.inv(xy0[0] + (i + 0.5) * 1000, xy0[1] - (j + 0.5) * 1000);
    const r = Math.floor((g.north - ll[0]) / g.dlat), c = Math.floor((ll[1] - g.west) / g.dlon);
    const k = r * g.cols + c;
    out.set(k, Math.max(out.get(k) || 0, lvl));
  }
  return out;
}

t('toLevels: coded cells match the independent mapping; faint and missing cells are 0', () => {
  const levels = R.toLevels(f, R.GRID);
  assert.equal(levels.length, R.GRID.rows * R.GRID.cols);
  const exp = expectedLevels();
  let nz = 0;
  for (let k = 0; k < levels.length; k++) {
    if (levels[k]) nz++;
    assert.equal(levels[k], exp.get(k) || 0, 'cell ' + k);
  }
  assert.equal(nz, exp.size);
  assert.ok(nz >= 3, 'block and cell are visible');
  assert.ok(Array.from(exp.values()).indexOf(9) >= 0 && Array.from(exp.values()).indexOf(5) >= 0);
});

t('runs: encode/decode round trip, wrong length refused', () => {
  const levels = R.toLevels(f, R.GRID);
  const runs = R.encodeRuns(levels);
  assert.deepEqual(Array.from(R.decodeRuns(runs, levels.length)), Array.from(levels));
  assert.throws(() => R.decodeRuns(runs, levels.length + 1), /too short/);
  assert.throws(() => R.decodeRuns([0, 99999999], 10), /overflow/);
});

t('radarFromTar: JSON answer for the newest frame, small', () => {
  const tar = makeTar([['composite_wn_20261012_1650_005-hd5', Buffer.from('not used')], [FRAME, fixture]]);
  const out = R.radarFromTar(tar, 42);
  assert.equal(out.v, 1);
  assert.equal(out.obs, '2026-10-12T16:50:03Z');
  assert.equal(out.fetched, 42);
  assert.deepEqual(out.grid, { north: R.GRID.north, west: R.GRID.west, dlat: R.GRID.dlat, dlon: R.GRID.dlon, rows: R.GRID.rows, cols: R.GRID.cols });
  assert.deepEqual(Array.from(R.decodeRuns(out.runs, R.GRID.rows * R.GRID.cols)), Array.from(R.toLevels(f, R.GRID)));
  assert.ok(JSON.stringify(out).length < 20000);
});

t('radarFromTar: an archive without the newest frame is refused', () => {
  assert.throws(() => R.radarFromTar(makeTar([['x', Buffer.from('y')]]), 1), /no frame/);
});

t('isoTime: DWD date and time fields, padded values', () => {
  assert.equal(R.isoTime('20261012', '165003'), '2026-10-12T16:50:03Z');
  assert.equal(R.isoTime('2026101', '165003'), null);
});

t('client parity: js/wxradar.js decodes the same runs and steps as the server', () => {
  // the browser module is a classic script (window.MA); run it in a sandbox and compare its decoder
  const src = fs.readFileSync(path.join(HERE, '../../js/wxradar.js'), 'utf8');
  const ctx = { window: { MA: {} }, console };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const W = ctx.window.MA.wxradar;
  const levels = R.toLevels(f, R.GRID);
  const runs = R.encodeRuns(levels);
  assert.deepEqual(Array.from(W._decodeRuns(runs, levels.length)), Array.from(levels));
  assert.throws(() => W._decodeRuns([3, 5], 4), /bad runs/);
  assert.throws(() => W._decodeRuns([3], 1), /bad runs/);
  const parsed = W._parseAnswer(R.radarFromTar(makeTar([[FRAME, fixture]]), 1));
  assert.equal(parsed.obs, Date.parse('2026-10-12T16:50:03Z'));
  assert.deepEqual(Array.from(parsed.levels), Array.from(levels));
  assert.equal(parsed.demo, false);
  assert.throws(() => W._parseAnswer({ v: 2 }), /bad answer/);
  // steps: leicht 20-34 dBZ (4..6), mäßig 35-44 (7..8), stark 45-54 (9..10), sehr stark 55+ (11..15)
  assert.deepEqual([3, 4, 6, 7, 8, 9, 10, 11, 15].map(W._stepOf), [-1, 0, 0, 1, 1, 2, 2, 3, 3]);
  // the demo grid is labelled and shows steps
  const demo = W._demo({ lat: 53.55, lon: 9.99 });
  assert.equal(demo.demo, true);
  assert.ok(Array.from(demo.levels).some((v) => v >= 9), 'demo has strong cells');
});

t('inflate: output past the declared chunk size is refused (decompression bomb)', () => {
  const bomb = zlib.deflateSync(Buffer.alloc(8 * 1024 * 1024, 0));     // 8 MB of zeros in a few KB
  assert.ok(bomb.length < 64 * 1024);
  assert.throws(() => R.inflateBounded(bomb, R.MAX_CELLS * 2), { code: 'ERR_BUFFER_TOO_LARGE' });
  const ok = zlib.deflateSync(Buffer.alloc(1000, 7));
  assert.equal(R.inflateBounded(ok, 2640000).byteLength, 1000);
  assert.throws(() => R.inflateBounded(ok, 0), /no chunk cap/);
});

t('jsfive gzip filter (id 1) is the bounded one: no chunk cap set outside a frame read', () => {
  const bomb = zlib.deflateSync(Buffer.alloc(1024 * 1024, 0));
  const ab = bomb.buffer.slice(bomb.byteOffset, bomb.byteOffset + bomb.byteLength);
  assert.throws(() => Filters.get(1)(ab, 2, null), /no chunk cap/);
});

t('frame too large: a declared grid above MAX_CELLS is refused before any cell is read', () => {
  const big = fs.readFileSync(path.join(HERE, 'fixtures/wn-oversize.h5'));   // 1201 x 2300 declared
  assert.ok(1201 * 2300 > R.MAX_CELLS);
  assert.throws(() => R.decodeFrame(big), /frame too large/);
});

t('toLevels: cells with non-finite coordinates are skipped, not written', () => {
  const broken = Object.assign({}, f, { xscale: NaN });   // every cell centre becomes NaN
  const levels = R.toLevels(broken, R.GRID);
  assert.equal(levels.reduce((a, b) => a + b, 0), 0);
});

console.log(n + ' wxradar tests passed');
