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
// public: on by default (public CORS proxies and the other providers); public=0 (and the other off-words of bool()) turns it off
ok(cfg('').config.public === true && cfg('?public=1').config.public === true, 'public defaults to on');
ok(cfg('?public=0').config.public === false && cfg('?public=off').config.public === false, 'public=0 turns it off');
ok(cfg('?public=banana').config.public === true && cfg('?public=').config.public === true, 'invalid public falls back to on');
// focus view: view=airport and airport= (checked, silent fallback to HAM; no demo traffic unless asked)
ok(cfg('?view=airport').config.view === 'airport' && cfg('?view=nonsense').config.view === 'auto', 'view=airport and invalid view');
ok(cfg('').config.airport === 'HAM' && cfg('?airport=fra').config.airport === 'FRA', 'airport default and case');
ok(cfg('?airport=XYZW').config.airport === 'HAM' && cfg('?airport=__proto__').config.airport === 'HAM', 'airport invalid falls back to HAM');
ok(cfg('?view=airport').config.demo === false && cfg('?view=airport&demo=1').config.demo === true, 'focus view has no demo traffic by default');
ok(cfg('?orient=track').config.orient === 'north', 'track-up is not built: north');
ok(cfg('?motion=full').config.motion === 'full' && cfg('?motion=off').config.motion === 'off', 'motion levels');
ok(cfg('').config.motion === 'calm' && cfg('?motion=loud').config.motion === 'calm', 'motion default calm, invalid falls back silently');

// rotation (views=, the durations): order, duplicates, silent drops, fallbacks, fixed views and clamped seconds
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const DEFAULT_ROT = ['radar', 'board'];
ok(same(cfg('').config.views, DEFAULT_ROT) && same(cfg('?view=auto').config.views, DEFAULT_ROT), 'default rotation is radar,board');
ok(same(cfg('?views=radar,board,airport').config.views, ['radar', 'board', 'airport']), 'views= keeps the order');
ok(same(cfg('?views=airport,radar').config.views, ['airport', 'radar']), 'views= in any order');
ok(same(cfg('?views=board,radar,board').config.views, ['board', 'radar', 'board']), 'views= duplicates weight a view');
ok(same(cfg('?views=RADAR,%20airport%20').config.views, ['radar', 'airport']), 'views= case and spaces');
ok(same(cfg('?views=radar,foo,airport,,xyz').config.views, ['radar', 'airport']), 'views= invalid entries dropped silently');
ok(same(cfg('?views=__proto__,airport,constructor,board').config.views, ['airport', 'board']), 'views= prototype names are not views');
ok(same(cfg('?views=').config.views, DEFAULT_ROT) && same(cfg('?views=radar').config.views, DEFAULT_ROT), 'empty and single-entry views= fall back to radar,board');
ok(same(cfg('?views=foo,bar').config.views, DEFAULT_ROT), 'all-invalid views= falls back to radar,board');
ok(same(cfg('?view=nonsense&views=airport,radar').config.views, ['airport', 'radar']), 'invalid view= is auto, so views= applies');
ok(same(cfg('?view=airport&views=radar,board').config.views, ['airport']), 'fixed view=airport ignores views=');
ok(same(cfg('?view=radar&views=board,airport').config.views, ['radar']), 'fixed view=radar ignores views=');
ok(same(cfg('?view=board').config.views, ['board']), 'fixed view=board is a one-entry list');
ok(cfg('?views=radar,airport&view=auto').config.view === 'auto', 'view stays auto with a rotation');
ok(cfg('').config.radarSec === 240 && cfg('').config.boardSec === 40 && cfg('').config.airportSec === 60, 'duration defaults 240 / 40 / 60');
ok(cfg('?radarsec=120&boardsec=20&airportsec=90').config.radarSec === 120 && cfg('?radarsec=120&boardsec=20&airportsec=90').config.airportSec === 90, 'durations as given');
ok(cfg('?airportsec=5').config.airportSec === 10 && cfg('?airportsec=99999').config.airportSec === 3600, 'airportsec clamped to 10..3600');
ok(cfg('?airportsec=abc').config.airportSec === 60 && cfg('?airportsec=NaN').config.airportSec === 60, 'airportsec junk is the default');
ok(cfg('?radarsec=5').config.radarSec === 10 && cfg('?radarsec=-3').config.radarSec === 10 && cfg('?radarsec=99999').config.radarSec === 3600, 'radarsec clamped to 10..3600');
ok(cfg('?boardsec=2').config.boardSec === 5 && cfg('?boardsec=9999').config.boardSec === 600, 'boardsec clamped to 5..600');
ok(cfg('?radarsec=x&boardsec=y').config.radarSec === 240 && cfg('?radarsec=x&boardsec=y').config.boardSec === 40, 'radarsec and boardsec junk are the defaults');

// res= (drawing resolution of the radar canvas): auto | 1 | 2, any other value silently means auto
ok(cfg('').config.res === 'auto', 'res defaults to auto');
ok(cfg('?res=1').config.res === '1' && cfg('?res=2').config.res === '2' && cfg('?res=auto').config.res === 'auto', 'res=1, res=2, res=auto');
ok(cfg('?res=RES').config.res === 'auto' && cfg('?res=2').config.res === '2', 'res is case-insensitive for the valid values');
['3', '2x', '0', '1.5', '', 'high'].forEach((v) => ok(cfg('?res=' + v).config.res === 'auto', 'res=' + v + ' falls back to auto'));

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
const TV = ['pwa', 'styles', 'prefs', 'config', 'theme', 'hint', 'geo', 'format', 'airlines', 'special', 'pick', 'demo', 'data', 'weather', 'glyphs', 'render-scale', 'motion', 'chart', 'radar', 'airport', 'board', 'log', 'rotation', 'views', 'settings', 'main', 'fullscreen', 'qr'];
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
