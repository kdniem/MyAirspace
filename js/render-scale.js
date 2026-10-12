/* Backing-store scale of the radar canvas (js/radar.js) and the frame-time guard, as pure functions:
   no DOM here, so tools/tests/render-scale-test.cjs can check them in node. Classic script, ES2017.

   scale: the canvas is drawn at `scale` device pixels per CSS pixel, so AirPlay mirroring and high-DPI
   screens get a sharp picture. auto = max(devicePixelRatio, min(2, 3840 / cssWidth)); res=1 and res=2
   are fixed (1x, 2x). Every choice is capped at 3840 px wide and 8.3 M pixels in total (old TV and
   tablet memory limits) and never goes below 1.

   guard: when the p95 frame time stays above 40 ms for 10 s, the scale drops one step (x 0.75, not
   below 1) and the guard then waits another 10 s before it may drop again. The scale comes back one
   step at a time after p95 has stayed below 25 ms for 30 s. The 25 to 40 ms band changes nothing. */
(function (MA) {
  var MAX_W = 3840;
  var MAX_PIX = 8300000;
  var SLOW_MS = 40, FAST_MS = 25;         // p95 thresholds (hysteresis)
  var SLOW_FOR_MS = 10000, FAST_FOR_MS = 30000;
  var STEP = 0.75;

  function num(v, def) { return typeof v === 'number' && isFinite(v) && v > 0 ? v : def; }

  // o: { cssW, cssH, dpr, res: 'auto' | '1' | '2' } -> scale (1 or more, fractional allowed)
  function choose(o) {
    var cw = Math.max(1, num(o.cssW, 1)), ch = Math.max(1, num(o.cssH, 1)), dpr = num(o.dpr, 1);
    var want;
    if (o.res === '1') want = 1;
    else if (o.res === '2') want = 2;
    else want = Math.max(dpr, Math.min(2, MAX_W / cw));
    var s = Math.min(want, MAX_W / cw, Math.sqrt(MAX_PIX / (cw * ch)));
    return s > 1 ? Math.floor(s * 100 + 1e-9) / 100 : 1;   // two decimals, rounded down: the caps still hold
  }

  // scale of guard level `level` below `target` (level 0 = target)
  function scaleAt(target, level) {
    return Math.max(1, Math.round(target * Math.pow(STEP, level) * 100) / 100);
  }

  // guard state: { target, level, over, calm } (over / calm: ms the condition has held, -1 = not held)
  function guard(target) {
    return { target: target, level: 0, over: -1, calm: -1 };
  }

  // one evaluation: p95 of the recent frame times (ms) and the ms since the previous evaluation.
  // Returns 'down', 'up' or null; the caller applies scaleAt(g.target, g.level) when it changes.
  function step(g, p95, dtMs) {
    var dt = Math.max(0, num(dtMs, 0));
    if (p95 > SLOW_MS) {
      g.calm = -1;
      g.over = (g.over < 0 ? 0 : g.over) + dt;
      if (g.over >= SLOW_FOR_MS && scaleAt(g.target, g.level + 1) < scaleAt(g.target, g.level)) {
        g.level++;
        g.over = 0;                      // wait another 10 s before the next step
        return 'down';
      }
      return null;
    }
    g.over = -1;
    if (p95 < FAST_MS && g.level > 0) {
      g.calm = (g.calm < 0 ? 0 : g.calm) + dt;
      if (g.calm >= FAST_FOR_MS) { g.level--; g.calm = 0; return 'up'; }
      return null;
    }
    g.calm = -1;
    return null;
  }

  // sliding window of frame deltas (ms): the last `size` frames, pushed once per frame
  function window_(size) {
    return { buf: new Float64Array(size), n: 0, i: 0, size: size, tmp: new Float64Array(size) };
  }
  function push(w, ms) {
    w.buf[w.i] = ms;
    w.i = (w.i + 1) % w.size;
    if (w.n < w.size) w.n++;
  }
  function clear(w) { w.n = 0; w.i = 0; }
  // percentile p (0..1) of the window; NaN while the window is empty
  function percentile(w, p) {
    if (!w.n) return NaN;
    var a = w.tmp.subarray(0, w.n);
    for (var i = 0; i < w.n; i++) a[i] = w.buf[i];
    a.sort();
    return a[Math.min(w.n - 1, Math.floor(w.n * p))];
  }

  MA.renderScale = {
    choose: choose,
    scaleAt: scaleAt,
    guard: guard,
    step: step,
    window: window_,
    push: push,
    clear: clear,
    percentile: percentile,
    SLOW_MS: SLOW_MS,
    FAST_MS: FAST_MS
  };
})(window.MA || (window.MA = {}));
