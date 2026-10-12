/* Motion (URL option motion=off|calm|full, README "Bewegung"): small, cheap animations for the TV.
   The timing curves are pure functions (tests: tools/tests/motion-test.cjs); the draw helpers are the ones
   js/radar.js and the showcase page (motion.html) share. Cost: a few canvas strokes per frame, no shadowBlur,
   no per-frame allocation (colour strings are cached on the palette array), the clock is the frame loop's `now`
   (js/main.js), and nothing runs while off. Loaded before js/radar.js; ES2017 only. */
(function (MA) {
  var TAU = Math.PI * 2;
  var GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  // what each level turns on and how strongly ("off" has no entry: nothing runs)
  var LEVELS = {
    calm: {
      sweepAlpha: 0.07, sweepTrail: 1, sweepMs: 6000,   // radar sweep: alpha of the line, lines in its fading wedge, one revolution
      ringMs: 1600, ringAlpha: 0.55, ringEchoMs: 0,      // arrival ring: lifetime, peak alpha, delay of a second ring (0 = none)
      fadeInMs: 600,                                     // arrival: the symbol fades in over this time
      runwayMs: 4000, runwayMin: 0.75,                   // runway in use: breathing cycle, dimmest level
      alertMs: 3000, alertMin: 0.5,                      // emergency frame: slow pulse period, dimmest level
      trailGrowMs: 1000, rowHlMs: 900                    // new trail draws on, Anzeigetafel row sweep
    },
    full: {
      sweepAlpha: 0.11, sweepTrail: 4, sweepMs: 6000,
      ringMs: 1600, ringAlpha: 0.8, ringEchoMs: 350,
      fadeInMs: 600,
      runwayMs: 4000, runwayMin: 0.6,
      alertMs: 2000, alertMin: 0.3,
      trailGrowMs: 1000, rowHlMs: 900
    }
  };
  // split-flap: the same for every cell and both levels (board and Anzeigetafel); off = instant
  var FLAP = { stepMs: 45, steps: 14 };

  var P = null;   // parameters of the current level, null while off

  function setLevel(name) {
    var known = Object.prototype.hasOwnProperty.call(LEVELS, name);
    MA.motion.level = known ? name : 'off';
    P = known ? LEVELS[name] : null;
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('data-motion', MA.motion.level);
    }
  }

  /* ---------- pure timing curves ---------- */

  function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
  // fast start, soft landing; 0 at 0, 1 at 1
  function easeOut(t) { var u = 1 - clamp01(t); return 1 - u * u * u; }
  // angle of the sweep line in radians, clockwise from north; one revolution per periodMs
  function sweepAngle(now, periodMs) { return ((now % periodMs) + periodMs) % periodMs / periodMs * TAU; }
  // 0..1..0 breathing cycle (sinusoidal), 0 at t = 0
  function breath(now, periodMs) { return 0.5 - 0.5 * Math.cos(TAU * now / periodMs); }
  // progress 0..1 of a ring that lives lifeMs; -1 before it starts and after it is gone
  function ringProgress(age, lifeMs) { return age < 0 || age >= lifeMs ? -1 : easeOut(age / lifeMs); }
  // 0..1 over fadeMs, 0 before the start
  function fadeIn(age, fadeMs) { return age <= 0 ? 0 : easeOut(age / fadeMs); }
  // 0..1 over growMs (a new trail reaching its full length)
  function trailGrow(age, growMs) { return age <= 0 ? 0 : easeOut(age / growMs); }
  // alpha between min and 1 over one breathing cycle
  function alphaCycle(now, periodMs, min) { return min + (1 - min) * breath(now, periodMs); }
  // which of the `steps` frames the flap is in: 0 at the start, `steps` when settled
  function flapStep(elapsedMs, stepMs, steps) {
    var s = Math.floor(elapsedMs / stepMs);
    return s < 0 ? 0 : (s > steps ? steps : s);
  }
  // one flap frame: the settled prefix of the target, the rest random glyphs; spaces and symbols never flip
  function flapText(target, step, steps, rnd) {
    if (step >= steps) return target;
    var settled = Math.floor(target.length * step / steps), out = '';
    for (var i = 0; i < target.length; i++) {
      var ch = target.charAt(i);
      out += (i < settled || /[^A-Z0-9]/.test(ch)) ? ch : GLYPHS.charAt(Math.floor(rnd() * GLYPHS.length));
    }
    return out;
  }

  /* ---------- draw helpers (canvas 2D; the caller has set the transform) ---------- */

  // "rgb(r,g,b)" for a palette triple, built once and kept on the array (palettes are rebuilt only on a theme change)
  function cssOf(rgb) {
    if (!rgb._css) rgb._css = 'rgb(' + Math.round(rgb[0]) + ',' + Math.round(rgb[1]) + ',' + Math.round(rgb[2]) + ')';
    return rgb._css;
  }

  // radar sweep: a faint line from home to the main ring and a short fading wedge behind it
  function sweep(ctx, cx, cy, R, now, rgb, unit) {
    if (!P) return;
    var n = P.sweepTrail, a = sweepAngle(now, P.sweepMs), i, t;
    ctx.strokeStyle = cssOf(rgb);
    ctx.lineWidth = 1.2 * unit;
    ctx.lineCap = 'butt';
    for (i = n - 1; i >= 0; i--) {
      t = a - i * 0.05;
      ctx.globalAlpha = P.sweepAlpha * (n - i) / n;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.sin(t) * R, cy - Math.cos(t) * R);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // arrival: a ring expands once from the aircraft (6 to 32 units), fading out; `at` is when it first came in
  function drawArrival(ctx, x, y, unit, now, at, rgb) {
    if (!P || at === undefined) return;
    ctx.strokeStyle = cssOf(rgb);
    ctx.lineWidth = 1.3 * unit;
    ringAt(ctx, x, y, unit, now - at, P.ringAlpha);
    if (P.ringEchoMs) ringAt(ctx, x, y, unit, now - at - P.ringEchoMs, P.ringAlpha);
    ctx.globalAlpha = 1;
  }
  function ringAt(ctx, x, y, unit, age, peak) {
    var k = ringProgress(age, P.ringMs);
    if (k < 0) return;
    ctx.globalAlpha = peak * (1 - k);
    ctx.beginPath();
    ctx.arc(x, y, (6 + 26 * k) * unit, 0, TAU);
    ctx.stroke();
  }

  // a new trail draws on: its points slide from the aircraft back to where they are, over trailGrowMs.
  // pp (the projected points, the last one is the aircraft) is changed in place
  // share of the grown trail at `now` (1 when done, off, or no start time)
  function trailGrowth(now, t0) {
    if (!P || t0 === undefined) return 1;
    return trailGrow(now - t0, P.trailGrowMs);
  }
  function growTrail(pp, cur, now, t0) {
    var g = trailGrowth(now, t0), i;
    if (g >= 1) return;
    for (i = 0; i < pp.length - 1; i++) {
      pp[i][0] = cur[0] + (pp[i][0] - cur[0]) * g;
      pp[i][1] = cur[1] + (pp[i][1] - cur[1]) * g;
    }
  }

  // an arriving symbol's opacity factor: 0 to 1 over fadeInMs (1 when there is nothing to fade)
  function arrivalFade(now, at) {
    if (!P || at === undefined) return 1;
    return fadeIn(now - at, P.fadeInMs);
  }

  // runways in use: alpha factor of the approach line (dimmest at the low point of the cycle)
  // (no time given: a static layer, such as the focus view's cached base, stays steady)
  function runwayAlpha(now) { return P && typeof now === 'number' ? alphaCycle(now, P.runwayMs, P.runwayMin) : 1; }
  // emergency squawk: alpha of the red frame; steady (1) while off
  function alertAlpha(now) { return P ? alphaCycle(now, P.alertMs, P.alertMin) : 1; }

  // corner brackets around a symbol (the same look as Radar.prototype.drawBrackets); used by the showcase
  function brackets(ctx, x, y, h, color, width) {
    var k = h * 0.55;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) {
      ctx.moveTo(x + c[0] * h, y + c[1] * (h - k));
      ctx.lineTo(x + c[0] * h, y + c[1] * h);
      ctx.lineTo(x + c[0] * (h - k), y + c[1] * h);
    });
    ctx.stroke();
  }

  MA.motion = {
    level: 'off',
    setLevel: setLevel,
    enabled: function () { return !!P; },
    levels: LEVELS,
    flap: { stepMs: FLAP.stepMs, steps: FLAP.steps },
    rowHighlightMs: function () { return P ? P.rowHlMs : 0; },
    curves: {
      clamp01: clamp01, easeOut: easeOut, sweepAngle: sweepAngle, breath: breath, ringProgress: ringProgress,
      fadeIn: fadeIn, trailGrow: trailGrow, alphaCycle: alphaCycle, flapStep: flapStep, flapText: flapText
    },
    sweep: sweep,
    drawArrival: drawArrival,
    arrivalFade: arrivalFade,
    trailGrowth: trailGrowth,
    growTrail: growTrail,
    runwayAlpha: runwayAlpha,
    alertAlpha: alertAlpha,
    brackets: brackets
  };

  setLevel((MA.config && MA.config.motion) || 'calm');
})(window.MA);
