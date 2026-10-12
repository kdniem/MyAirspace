// Run: node tools/tests/prefs-test.cjs .
// Saved dashboard settings (js/prefs.js) and their merge into the URL options (js/config.js):
// validation, storage that throws, which URL parameters decide a key, and that the address always wins.
const vm = require('vm'), fs = require('fs');
const ROOT = process.argv[2] || '.';
let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.log('FAIL', msg); } }

// one page: storage is a plain object, top === self (not embedded) unless `embedded`
function page(search, stored, opts) {
  opts = opts || {};
  const store = {};
  if (stored !== undefined) store['ma.settings'] = typeof stored === 'string' ? stored : JSON.stringify(stored);
  const ls = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { if (opts.throwStorage) throw new Error('blocked'); store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
  const ctx = { console, Math, JSON, URLSearchParams, location: { search: search || '', hostname: 'x' }, localStorage: ls };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.top = opts.embedded ? {} : ctx;
  ctx.navigator = {};
  vm.createContext(ctx);
  ['js/styles.js', 'js/prefs.js', 'js/config.js'].forEach((f) => vm.runInContext(fs.readFileSync(ROOT + '/' + f, 'utf8'), ctx, { filename: f }));
  return { MA: ctx.MA, store };
}

// ---- clean(): only valid stored values survive
{
  const P = page('', undefined).MA.prefs;
  const c = P.clean({ style: 'eicam-boeing', theme: 'sepia', brightness: 0.8, view: 'airport', chartbg: 1, labels: false,
    trails: 'yes', places: true, weather: false, lat: 53.5, lon: 9.9, style2: 'x' });
  ok(c.style === 'eicam-boeing' && c.brightness === 0.8 && c.view === 'airport', 'valid values kept');
  ok(!('theme' in c) && !('chartbg' in c) && !('trails' in c), 'invalid theme, non-boolean chartbg and trails dropped');
  ok(c.labels === false && c.places === true && c.weather === false, 'booleans kept');
  ok(!('lat' in c) && !('lon' in c) && !('style2' in c), 'no location and no unknown keys are stored');
  ok(P.clean({ style: 'nonsense' }).style === undefined, 'unknown style dropped');
  ok(P.clean({ style: 'constructor' }).style === undefined, 'prototype names are not styles');
  ok(P.clean({ brightness: 9 }).brightness === undefined && P.clean({ brightness: 0.5 }).brightness === 0.5, 'brightness range 0.5 to 1.2');
  ok(P.clean({ brightness: 0.8333 }).brightness === 0.83, 'brightness rounded to 2 decimals');
  ok(P.clean({ brightness: NaN }).brightness === undefined, 'NaN brightness dropped');
  ok(Object.keys(P.clean(null)).length === 0 && Object.keys(P.clean('x')).length === 0, 'non-objects give nothing');
  ok(Object.keys(P.clean(JSON.parse('{"__proto__":{"style":"tower"}}'))).length === 0, '__proto__ is ignored');
}

// ---- storage: read tolerates damage, save/clear never throw
{
  const a = page('', 'not json').MA.prefs;
  ok(Object.keys(a.read()).length === 0, 'broken JSON reads as empty');
  const b = page('', '{"style":"nvg-night","theme":"light"}').MA.prefs;
  ok(b.read().style === 'nvg-night' && b.read().theme === 'light', 'valid JSON reads');
  const s = page('', undefined, { throwStorage: true }).MA.prefs;
  let threw = false;
  try { s.save('style', 'nvg-night'); s.clear(); } catch (e) { threw = true; }
  ok(!threw, 'blocked storage does not throw on save or clear');
  ok(s.save('style', 'nvg-night') === false, 'blocked storage reports the failed save');
  const t = page('', undefined).MA.prefs;
  t.save('style', 'nvg-night'); t.save('view', 'bogus'); t.save('labels', false);
  const got = t.read();
  ok(got.style === 'nvg-night' && !('view' in got) && got.labels === false, 'save keeps other keys and drops invalid values');
  t.save('style', 'nonsense');
  ok(!('style' in t.read()), 'saving an invalid value removes the key');
  t.clear();
  ok(Object.keys(t.read()).length === 0, 'clear removes the stored settings');
}

// ---- mentions(): the keys the address itself decides
{
  const P = page('', undefined).MA.prefs;
  const m = (s, k) => P.mentions(s, k);
  ok(m('?style=tower', 'style') && !m('?theme=dark', 'style'), 'style by its parameter');
  ok(m('?theme=light', 'theme') && m('?brightness=1', 'brightness') && m('?view=board', 'view') && m('?chartbg=1', 'chartbg'), 'theme, brightness, view and chartbg by their parameters');
  ok(m('?font=sans', 'font'), 'font counts as set by the address');
  ok(m('?wx=0', 'weather') && m('?weather=1', 'weather') && !m('?wx', 'trails'), 'weather by wx or weather');
  ok(!m('?wx=radar', 'weather') && m('?wx=radar&weather=0', 'weather'), 'wx=radar is the rain overlay, not the weather box');
  ok(m('?datablock=0', 'labels') && m('?datablock=callsign,fl', 'labels') && m('?labels=0', 'labels'), 'labels by datablock or labels');
  ok(!m('?label=Hamburg', 'labels'), 'label= is the place name, not the data block switch');
  ok(m('?trail=6', 'trails') && m('?trails=0', 'trails') && !m('?wx', 'trails'), 'trail= and trails= both decide trails (the length sets it on)');
  ok(m('?show=board', 'labels') && m('?show=board', 'places') && m('?show=board', 'trails'), 'show= decides every element');
  ok(m('?hide=trails', 'trails') && !m('?hide=board', 'labels') && m('?hide=trail', 'trails'), 'hide= lists by name and alias');
  ok(m('?hide=wx', 'weather') && m('?hide=datablock', 'labels') && !m('?hide=places', 'labels'), 'hide= aliases map to the stored key');
  ok(!m('', 'style') && !m('?lat=53&lon=9', 'theme'), 'no parameters, nothing decided');
}

// ---- config.js: saved values apply where the address is silent; the address wins
{
  const saved = { style: 'eicam-boeing', theme: 'light', brightness: 0.8, view: 'board', chartbg: true, labels: false, trails: false, places: false, weather: false };
  let c = page('?lat=53.5&lon=9.9', saved).MA.config;
  ok(c.style === 'eicam-boeing' && c.font === 'sans', 'saved style and its font apply');
  ok(c.theme === 'light' && c.brightness === 0.8 && c.view === 'board', 'saved theme, brightness and view apply');
  ok(c.chartbg === true, 'saved chartbg applies');
  ok(c.show.labels === false && c.show.trails === false && c.show.places === false && c.show.weather === false, 'saved Ebenen apply');
  ok(c.trailMin === 0 && c.labels === false && c.places === false, 'saved trails 0 and labels/places flags follow');
  ok(c.demo === false, 'a saved view does not turn on the demo');

  c = page('?lat=53.5&lon=9.9&style=tower&theme=dark&brightness=1&view=radar&chartbg=0&labels=1&trails=1&places=1&wx=1', saved).MA.config;
  ok(c.style === 'tower' && c.font === 'mono' && c.theme === 'dark' && c.brightness === 1 && c.view === 'radar', 'URL style, theme, brightness and view win over saved ones');
  ok(c.chartbg === false, 'URL chartbg=0 wins');
  ok(c.show.labels === true && c.show.trails === true && c.show.places === true && c.show.weather === true, 'URL element flags win');

  c = page('?lat=53.5&lon=9.9&show=board', { labels: false, trails: false, places: false, weather: false }).MA.config;
  ok(c.show.labels === false && c.show.places === false && c.show.weather === false, 'show= lets the URL decide every element, saved toggles are ignored');
  ok(c.show.board === true, 'show=board keeps the board');

  c = page('?lat=53.5&lon=9.9&datablock=0', { labels: true }).MA.config;
  ok(c.show.labels === false, 'datablock=0 in the address beats a saved labels=true');

  c = page('?lat=53.5&lon=9.9&trail=6', { trails: false }).MA.config;
  ok(c.show.trails === true && c.trailMin === 6, 'trail=6 in the address beats a saved trails=false');

  c = page('?lat=53.5&lon=9.9', 'garbage').MA.config;
  ok(c.style === 'tower' && c.theme === 'dark' && c.brightness === 1 && c.view === 'auto', 'damaged storage falls back to the defaults');

  c = page('?lat=53.5&lon=9.9', { style: 'nonsense', view: 'airport', brightness: 3 }).MA.config;
  ok(c.style === 'tower' && c.brightness === 1 && c.view === 'airport', 'invalid saved values are dropped, valid ones kept');

  c = page('?style=chart', {}).MA.config;
  ok(c.theme === 'light', 'style defaults still apply without saved values');

  c = page('?lat=53.5&lon=9.9', { style: 'tactical-olive' }, { embedded: true }).MA.config;
  ok(c.style === 'tower', 'inside an embedded page (setup preview) saved values do not apply');
}

console.log(fails ? fails + ' failed' : 'prefs: all passed');
process.exit(fails ? 1 : 0);
