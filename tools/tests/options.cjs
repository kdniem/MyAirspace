// Run: node tools/tests/options.cjs .
// Checks the URL options (js/config.js with js/styles.js): defaults, validation with silent fallback,
// show/hide/flags, datablock fields, style resolution, and that TV-page scripts stay ES2017.
const vm = require('vm'), fs = require('fs');
const ROOT = process.argv[2] || '.';
let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.log('FAIL', msg); } }

function cfg(qs) {
  const ctx = { console, Math, JSON, URLSearchParams, location: { search: qs } };
  ctx.window = ctx;
  // js/pwa.js (not loadable here) provides these two
  const DP = 'https://myairspace-nu.vercel.app/api/proxy';
  ctx.MA = { DEFAULT_PROXY: DP, proxyOk: (v) => v === DP || v === 'off' };
  vm.createContext(ctx);
  ['js/styles.js', 'js/config.js'].forEach((f) => vm.runInContext(fs.readFileSync(ROOT + '/' + f, 'utf8'), ctx, { filename: f }));
  return ctx.MA;
}

let c = cfg('').config;
ok(c.style === 'tower' && c.theme === 'dark' && c.font === 'mono', 'defaults');
ok(c.show.rings && c.show.compass && c.show.board && c.show.clock && c.show.weather && c.show.ground && c.show.trails, 'all elements on');
ok(c.fields.join() === 'callsign,fl,gs,type', 'default fields');
ok(c.speedUnit === 'kt' && c.pressure === 'hpa' && c.timeMode === 'both' && c.brightness === 1 && c.orient === 'north', 'unit defaults');

c = cfg('?style=chart').config;
ok(c.style === 'chart-paper' && c.theme === 'light', 'chart-paper defaults to the light theme');
ok(cfg('?style=chart-paper&theme=dark').config.theme === 'dark', 'explicit theme wins');
ok(cfg('?style=nonsense').config.style === 'tower', 'invalid style falls back to tower');
ok(cfg('?style=constructor').config.style === 'tower', 'prototype names are not styles');
ok(cfg('?style=fids').config.font === 'sans', 'style default font');
ok(cfg('?style=fids&font=mono').config.font === 'mono', 'font override');
// old ids keep working: each resolves to its new look (same font and theme defaults)
const OLD = { atc: 'tower', terminal: 'fids', airbus: 'efis-airbus', boeing: 'eicam-boeing', chart: 'chart-paper', night: 'nvg-night', military: 'tactical-olive' };
Object.keys(OLD).forEach((o) => {
  const a = cfg('?style=' + o).config, b = cfg('?style=' + OLD[o]).config;
  ok(a.style === OLD[o] && a.theme === b.theme && a.font === b.font, 'old style id ' + o + ' -> ' + OLD[o]);
});
ok(cfg('?style=CHART').config.style === 'chart-paper', 'old ids are case-insensitive');
ok(cfg('?font=comic').config.font === 'mono', 'invalid font');
ok(cfg('?accent=amber').config.accent === 'amber', 'accent name');
ok(cfg('?accent=ff8800').config.accent === '#ff8800', 'accent hex');
ok(cfg('?accent=%23abc').config.accent === '#abc', 'accent short hex');
ok(cfg('?accent=pink').config.accent === '', 'invalid accent');
ok(cfg('?brightness=9').config.brightness === 1.2 && cfg('?brightness=0').config.brightness === 0.5 && cfg('?brightness=x').config.brightness === 1, 'brightness clamped');
ok(cfg('?speed=kmh&pressure=inhg&time=utc').config.speedUnit === 'kmh', 'units');
ok(cfg('?speed=mph&pressure=psi&time=x').config.speedUnit === 'kt' && cfg('?time=x').config.timeMode === 'both', 'invalid units');
c = cfg('?show=rings,clock').config;
ok(c.show.rings && c.show.clock && !c.show.board && !c.show.weather && !c.labels && c.trailMin === 0, 'show= whitelist');
c = cfg('?hide=board,compass').config;
ok(!c.show.board && !c.show.compass && c.show.rings, 'hide=');
c = cfg('?rings=0&weather=0&ground=0&places=0&labels=0&trails=0').config;
ok(!c.show.rings && !c.show.weather && !c.show.ground && !c.places && !c.labels && c.trailMin === 0, 'single flags');
ok(cfg('?show=datablock,trails').config.labels === true, 'datablock alias in show=');
ok(cfg('?datablock=0').config.labels === false, 'datablock=0');
ok(cfg('?datablock=callsign,type,reg').config.fields.join() === 'callsign,type,reg', 'datablock order');
ok(cfg('?datablock=reg,reg,foo,speed').config.fields.join() === 'reg,gs', 'datablock validation and aliases');
ok(cfg('?datablock=foo').config.fields.join() === 'callsign,fl,gs,type', 'datablock all invalid');
ok(cfg('?title=Zuhause').config.title === 'Zuhause', 'title');
// focus view: view=airport and airport= (checked, silent fallback to HAM; no demo traffic unless asked)
ok(cfg('?view=airport').config.view === 'airport' && cfg('?view=nonsense').config.view === 'auto', 'view=airport and invalid view');
ok(cfg('').config.airport === 'HAM' && cfg('?airport=fra').config.airport === 'FRA', 'airport default and case');
ok(cfg('?airport=XYZW').config.airport === 'HAM' && cfg('?airport=__proto__').config.airport === 'HAM', 'airport invalid falls back to HAM');
ok(cfg('?view=airport').config.demo === false && cfg('?view=airport&demo=1').config.demo === true, 'focus view has no demo traffic by default');
ok(cfg('?orient=track').config.orient === 'north', 'track-up is not built: north');

// style table: every style resolves for both themes with all tokens, and unknown names fall back
const MA = cfg('');
MA.style.names().forEach((n) => ['dark', 'light'].forEach((t) => {
  const r = MA.style.resolve(n, t, {});
  ['--bg', '--panel', '--ink', '--dim', '--accent', '--target', '--special', '--warning'].forEach((k) => ok(/^#[0-9a-f]{6}$/.test(r.css[k]), n + '/' + t + ' ' + k));
  ok(r.c.plane > 0 && ['taper', 'dots', 'dash', 'none'].indexOf(r.c.trail) >= 0 && typeof r.c.badgeBg === 'string' && typeof r.c.ring === 'string', n + '/' + t + ' canvas palette');
  ok(['glyph', 'ring', 'dot', 'box', 'cross', 'diamond'].indexOf(r.c.symbol) >= 0 && ['plain', 'frame', 'tab'].indexOf(r.c.block) >= 0, n + '/' + t + ' symbol and block');
}));
ok(MA.style.resolve('zzz', 'dark').style === 'tower', 'resolve fallback');
ok(MA.style.canonical('atc') === 'tower' && MA.style.canonical('tower') === 'tower' && MA.style.canonical('nope') === null, 'canonical ids');
ok(MA.style.names().length === 7, 'seven looks');
// the style table has every field the renderer reads (a missing one would silently fall back)
MA.style.names().forEach((n) => {
  const st = MA.STYLES[n];
  ok(st.name && st.info && st.font && st.theme && st.weight && typeof st.caps === 'boolean' && typeof st.track === 'number', n + ' typography and labels');
  ok(st.plane && st.lw && st.trailW && st.trail && st.symbol && st.block && typeof st.br === 'number', n + ' look fields');
  ok(st.dark || st.light, n + ' has a palette');
});

// ES2017 only on the TV page: no optional chaining, nullish coalescing, class fields, modules
const TV = ['pwa', 'styles', 'config', 'theme', 'hint', 'geo', 'format', 'airlines', 'special', 'pick', 'demo', 'data', 'weather', 'glyphs', 'radar', 'airport', 'board', 'log', 'views', 'main', 'fullscreen', 'qr'];
TV.forEach((n) => {
  const src = fs.readFileSync(ROOT + '/js/' + n + '.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, "''").replace(/\/\/.*$/gm, '');
  ok(!/\?\.[A-Za-z_(\[]/.test(src), n + ': optional chaining');
  ok(!/\?\?/.test(src), n + ': nullish coalescing');
  ok(!/^\s*(export|import)\s/m.test(src), n + ': module syntax');
  ok(!/\bclass\s+\w+/.test(src), n + ': class');
  try { new vm.Script(fs.readFileSync(ROOT + '/js/' + n + '.js', 'utf8')); } catch (e) { ok(false, n + ': ' + e.message); }
});
console.log(fails ? fails + ' failed' : 'options: all passed');
process.exit(fails ? 1 : 0);
