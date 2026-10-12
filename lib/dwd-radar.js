/* DWD radar composite -> compact lat/lon grid for the cockpit weather overlay (js/wxradar.js).
   Pure functions, shared by api/radar.js (Vercel Function) and tools/tests/wxradar-test.mjs.

   Source: Deutscher Wetterdienst, open data, composite/wn/composite_wn__LATEST.tar. The tar holds
   5-minute frames; the frame "_000" is the newest observation: an ODIM_H5 file with reflectivity
   (DBZH, raw uint16, gain/offset to dBZ) on a 1100 x 1200 grid of 1 km cells in polar stereographic
   projection (ellipsoid, from the file's own projdef). The server resamples it onto a regular lat/lon
   grid, codes each cell as a level of 5 dBZ (0 = none) and run-length encodes the result.
   Only the server ever sees the source; the browser gets the same grid for every viewer. */
import { File, Filters } from 'jsfive';
import zlib from 'node:zlib';

// Largest grid we accept: the newest WN frame is 1100 x 1200 cells, with headroom. Checked before any
// cell is read, so a hostile header cannot make the decoder allocate more than this.
export const MAX_CELLS = 1100 * 1200 * 2;

// gzip inflate with an output cap: a decompression bomb inside a chunk stops at the declared size.
// The cap is set per frame in decodeFrame (cells * 2 bytes for uint16); zlib throws past it.
export function inflateBounded(buf, maxBytes) {
  if (!(maxBytes > 0)) throw new Error('no chunk cap');
  const out = zlib.inflateSync(Buffer.from(buf), { maxOutputLength: maxBytes });
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}
let chunkCap = 0;
Filters.set(1, function (buf) { return inflateBounded(buf, chunkCap); });   // 1 = HDF5 deflate filter

// Output grid: north-west corner, cell size in degrees (about 2.2 km x 2.1 km at 50 N), size.
// Covers the DWD composite (lat 45.68 .. 55.86, lon 1.46 .. 18.73) with a small margin.
export const GRID = { north: 56.0, west: 1.4, dlat: 0.02, dlon: 0.03, rows: 520, cols: 580 };
export const MIN_DBZ = 15;   // below this nothing is coded (the client shows from 20 dBZ)
export const MAX_LEVEL = 15; // 75 dBZ and more share one level

// ustar archive: [{name, data}] for regular files
export function readTar(buf) {
  const out = [];
  let off = 0;
  while (off + 512 <= buf.length) {
    const name = buf.toString('latin1', off, off + 100).replace(/\0[\s\S]*$/, '');
    if (!name) break;                       // end-of-archive block
    const sizeField = buf.toString('latin1', off + 124, off + 136).replace(/[\0 ][\s\S]*$/, '');
    const size = parseInt(sizeField, 8);
    if (!(size >= 0) || off + 512 + size > buf.length) throw new Error('bad tar entry');
    const type = buf.toString('latin1', off + 156, off + 157);
    const start = off + 512;
    if (type === '0' || type === '\0' || type === '') out.push({ name: name, data: buf.subarray(start, start + size) });
    off = start + Math.ceil(size / 512) * 512;
  }
  return out;
}

// the newest frame of the WN composite: "..._000-hd5"
export function pickFrame(entries) {
  for (let i = 0; i < entries.length; i++) if (/^composite_wn_\d{8}_\d{4}_000-hd5$/.test(entries[i].name)) return entries[i];
  return null;
}

// Polar stereographic on the ellipsoid (Snyder 1987, north pole, lat_0 = 90), parameters from the
// file's projdef. fwd: [lat, lon] degrees -> [x, y] metres; inv: the reverse.
export function stereo(def) {
  const p = {};
  String(def).split(/\s+/).forEach(function (t) {
    const m = /^\+([a-z_0-9]+)=(.*)$/.exec(t);
    if (m) p[m[1]] = m[2];
  });
  if (p.proj !== 'stere' || +p.lat_0 !== 90) throw new Error('unsupported projection');
  const a = +p.a, b = +p.b, e2 = 1 - (b * b) / (a * a), e = Math.sqrt(e2);
  const rad = Math.PI / 180;
  function tOf(phi) {
    const s = Math.sin(phi);
    return Math.tan(Math.PI / 4 - phi / 2) / Math.pow((1 - e * s) / (1 + e * s), e / 2);
  }
  function mOf(phi) {
    const s = Math.sin(phi);
    return Math.cos(phi) / Math.sqrt(1 - e2 * s * s);
  }
  const phiC = +p.lat_ts * rad, tc = tOf(phiC), mc = mOf(phiC);
  const lon0 = +p.lon_0 * rad, x0 = +p.x_0, y0 = +p.y_0;
  return {
    fwd: function (lat, lon) {
      const rho = a * mc * tOf(lat * rad) / tc, dl = lon * rad - lon0;
      return [x0 + rho * Math.sin(dl), y0 - rho * Math.cos(dl)];
    },
    inv: function (x, y) {
      const dx = x - x0, dy = y - y0, rho = Math.sqrt(dx * dx + dy * dy);
      const t = rho * tc / (a * mc);
      let phi = Math.PI / 2 - 2 * Math.atan(t);
      for (let i = 0; i < 6; i++) {
        const s = Math.sin(phi);
        phi = Math.PI / 2 - 2 * Math.atan(t * Math.pow((1 - e * s) / (1 + e * s), e / 2));
      }
      return [phi / rad, (lon0 + Math.atan2(dx, -dy)) / rad];
    }
  };
}

// dBZ -> level (5 dBZ steps); 0 = not coded
export function levelOf(dbz) {
  if (!(dbz >= MIN_DBZ)) return 0;
  return Math.min(MAX_LEVEL, Math.floor(dbz / 5));
}

// ODIM string attributes are NUL-padded fixed-width fields
function cleanStr(v) {
  return String(v === undefined || v === null ? '' : v).replace(/\0[\s\S]*$/, '').trim();
}

// Reads one ODIM frame. Returns the grid metadata and the raw uint16 values (row-major, rows = ysize).
export function decodeFrame(data) {
  const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const f = new File(ab);
  const what = f.get('dataset1/data1/what').attrs;
  const where = f.get('where').attrs;
  const meta = f.get('dataset1/what').attrs;
  if (cleanStr(what.quantity) !== 'DBZH') throw new Error('unexpected quantity');
  const ds = f.get('dataset1/data1/data');
  const shape = ds.shape;
  if (shape[0] !== where.ysize || shape[1] !== where.xsize) throw new Error('shape mismatch');
  const cells = shape[0] * shape[1];
  if (!(cells > 0) || cells > MAX_CELLS) throw new Error('frame too large');
  if (ds.dtype !== '<u2') throw new Error('unexpected dtype');
  chunkCap = cells * 2;
  let raw;
  try { raw = ds.value; } finally { chunkCap = 0; }
  return {
    gain: what.gain, offset: what.offset, nodata: what.nodata, undetect: what.undetect,
    xsize: where.xsize, ysize: where.ysize, xscale: where.xscale, yscale: where.yscale,
    projdef: cleanStr(where.projdef),
    ul: [where.UL_lat, where.UL_lon],
    time: isoTime(cleanStr(meta.startdate), cleanStr(meta.starttime)),
    raw: raw
  };
}

// "20261012" + "165003" -> "2026-10-12T16:50:03Z"
export function isoTime(date, time) {
  const d = String(date).trim(), t = String(time).trim();
  if (!/^\d{8}$/.test(d) || !/^\d{6}$/.test(t)) return null;
  return d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8) + 'T' +
    t.slice(0, 2) + ':' + t.slice(2, 4) + ':' + t.slice(4, 6) + 'Z';
}

// Native cells -> levels on the output grid (max over the native cells that fall into a grid cell).
export function toLevels(frame, grid) {
  const g = grid || GRID;
  const out = new Uint8Array(g.rows * g.cols);
  const P = stereo(frame.projdef);
  // the file's UL corner is the outer edge of cell (0, 0): its centre lies half a cell inside
  const xy0 = P.fwd(frame.ul[0], frame.ul[1]);
  const raw = frame.raw, nodata = frame.nodata, undetect = frame.undetect;
  for (let j = 0; j < frame.ysize; j++) {
    for (let i = 0; i < frame.xsize; i++) {
      const v = raw[j * frame.xsize + i];
      if (v === nodata || v === undetect) continue;
      const lvl = levelOf(v * frame.gain + frame.offset);
      if (!lvl) continue;
      const ll = P.inv(xy0[0] + (i + 0.5) * frame.xscale, xy0[1] - (j + 0.5) * frame.yscale);
      const r = Math.floor((g.north - ll[0]) / g.dlat), c = Math.floor((ll[1] - g.west) / g.dlon);
      if (!(r >= 0 && r < g.rows && c >= 0 && c < g.cols)) continue;   // also rejects NaN
      const k = r * g.cols + c;
      if (out[k] < lvl) out[k] = lvl;
    }
  }
  return out;
}

// Run-length code over the row-major levels: [level, count, level, count, ...]
export function encodeRuns(levels) {
  const out = [];
  let i = 0;
  while (i < levels.length) {
    const v = levels[i];
    let j = i + 1;
    while (j < levels.length && levels[j] === v) j++;
    out.push(v, j - i);
    i = j;
  }
  return out;
}

export function decodeRuns(runs, n) {
  const out = new Uint8Array(n);
  let k = 0;
  for (let p = 0; p + 1 < runs.length; p += 2) {
    const v = runs[p], len = runs[p + 1];
    if (k + len > n) throw new Error('runs overflow');
    for (let q = 0; q < len; q++) out[k++] = v;
  }
  if (k !== n) throw new Error('runs too short');
  return out;
}

// tar bytes -> the JSON answer of /api/radar (throws on anything unexpected)
export function radarFromTar(buf, fetchedAt) {
  const frame = pickFrame(readTar(buf));
  if (!frame) throw new Error('no frame');
  const f = decodeFrame(frame.data);
  if (!f.time) throw new Error('no time');
  const levels = toLevels(f, GRID);
  return {
    v: 1,
    source: 'DWD',
    product: 'WN composite, observed reflectivity',
    obs: f.time,
    fetched: fetchedAt,
    grid: { north: GRID.north, west: GRID.west, dlat: GRID.dlat, dlon: GRID.dlon, rows: GRID.rows, cols: GRID.cols },
    levels: 'dBZ / 5, 0 = none',
    runs: encodeRuns(levels)
  };
}
