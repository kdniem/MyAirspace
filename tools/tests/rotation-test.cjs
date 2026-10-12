// Run: node tools/tests/rotation-test.cjs .
// The rotation scheduler (js/rotation.js) as a pure function: simulates 10 minutes in one-second steps and checks
// the order and the length of every view, the duplicate weighting, the board skip without passes, and the fixed lists.
const vm = require('vm'), fs = require('fs');
const ROOT = process.argv[2] || '.';
let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.log('FAIL', msg); } }

const ctx = { console, Math, JSON };
ctx.window = ctx;
ctx.MA = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ROOT + '/js/rotation.js', 'utf8'), ctx, { filename: 'js/rotation.js' });
const rot = ctx.MA.rotation;

// Simulates `seconds` in steps of one second. hasPasses(t) tells when the log has its first pass (seconds).
// Returns the segments [{name, from, to}] (to = exclusive end, clipped to the simulated time).
function simulate(entries, dur, seconds, hasPasses) {
  const s = rot.create(entries, { radar: dur.radar * 1000, board: dur.board * 1000, airport: dur.airport * 1000 });
  const segs = [];
  let cur = null;
  for (let t = 0; t <= seconds; t++) {
    s.tick(t * 1000, hasPasses(t));
    const name = s.name();
    if (!cur || cur.name !== name) {
      if (cur) cur.to = t;
      cur = { name, from: t, to: seconds };
      segs.push(cur);
    }
  }
  return segs.filter((g) => g.to > g.from);   // a view that starts in the very last second has no length
}
const compact = (segs) => segs.map((g) => g.name + ' ' + g.from + '-' + g.to).join(' | ');
const always = () => true;

// 1) the old rotation radar,board with 240 s / 40 s: 10 minutes
{
  const segs = simulate(['radar', 'board'], { radar: 240, board: 40 }, 600, always);
  const want = 'radar 0-240 | board 240-280 | radar 280-520 | board 520-560 | radar 560-600';
  ok(compact(segs) === want, 'radar,board 240/40: ' + compact(segs));
}

// 2) radar,board,airport with 240 / 40 / 60 s: 10 minutes, the airport follows the board
{
  const segs = simulate(['radar', 'board', 'airport'], { radar: 240, board: 40, airport: 60 }, 600, always);
  const want = 'radar 0-240 | board 240-280 | airport 280-340 | radar 340-580 | board 580-600';   // the last one is cut at 600 s
  ok(compact(segs) === want, 'radar,board,airport 240/40/60: ' + compact(segs));
  // the first segment of each view and its length
  const lens = segs.filter((g) => g.to !== 600).map((g) => g.name + ' ' + (g.to - g.from));
  ok(lens.join() === 'radar 240,board 40,airport 60,radar 240', 'lengths: ' + lens.join());
}

// 3) the same list with other durations, and the order airport first
{
  const segs = simulate(['airport', 'radar', 'board'], { radar: 90, board: 30, airport: 45 }, 600, always);
  const want = 'airport 0-45 | radar 45-135 | board 135-165 | airport 165-210 | radar 210-300 | board 300-330 | airport 330-375 | radar 375-465 | board 465-495 | airport 495-540 | radar 540-600';
  ok(compact(segs) === want, 'airport,radar,board 90/30/45: ' + compact(segs));
}

// 4) duplicates weight a view: radar,radar,board gives two radar sections for each board
{
  const segs = simulate(['radar', 'radar', 'board'], { radar: 60, board: 30, airport: 60 }, 300, always);
  // radar 0-60, radar 60-120 (the entry after the first radar), board 120-150, radar 150-210, radar 210-270, board 270-300
  ok(compact(segs) === 'radar 0-120 | board 120-150 | radar 150-270 | board 270-300', 'radar,radar,board: ' + compact(segs));
}

// 5) the board is skipped while there are no passes: the first pass comes at 300 s
{
  const segs = simulate(['radar', 'board'], { radar: 60, board: 30 }, 360, (t) => t >= 300);
  // at 60 s the board is next but the log is empty: skip to radar again (radar runs another 60 s), so the
  // first board appears at 300 s, when the passes exist and the radar section is over
  const firstBoard = segs.filter((g) => g.name === 'board')[0];
  ok(firstBoard && firstBoard.from === 300, 'first board at 300 s, got ' + compact(segs));
  ok(!segs.some((g) => g.name === 'board' && g.from < 300), 'no board before the first pass: ' + compact(segs));
  ok(compact(segs) === 'radar 0-300 | board 300-330 | radar 330-360', 'skip keeps radar: ' + compact(segs));
}

// 6) a board first in the list with no passes starts with the next view
{
  const segs = simulate(['board', 'airport'], { radar: 240, board: 40, airport: 20 }, 100, (t) => t >= 50);
  ok(segs[0].name === 'airport' && segs[0].from === 0, 'a board first with no passes is skipped at the start: ' + compact(segs));
}

// 7) fixed single views never change, with or without passes
{
  ok(compact(simulate(['radar'], { radar: 240, board: 40, airport: 60 }, 600, always)) === 'radar 0-600', 'fixed radar');
  ok(compact(simulate(['airport'], { radar: 240, board: 40, airport: 60 }, 600, always)) === 'airport 0-600', 'fixed airport');
  ok(compact(simulate(['board'], { radar: 240, board: 40, airport: 60 }, 600, () => false)) === 'board 0-600', 'fixed board shows even without passes');
  ok(compact(simulate(['board', 'board'], { radar: 240, board: 40, airport: 60 }, 600, () => false)) === 'board 0-600', 'board-only list never skips');
}

// 8) tick returns the view left when it changes, null otherwise
{
  const s = rot.create(['radar', 'airport'], { radar: 10000, board: 40000, airport: 10000 });
  ok(s.tick(0, true) === null && s.name() === 'radar', 'start');
  ok(s.tick(9000, true) === null, 'still radar at 9 s');
  ok(s.tick(10000, true) === 'radar' && s.name() === 'airport', 'radar to airport at 10 s returns radar');
  ok(s.tick(15000, true) === null, 'airport still running');
  ok(s.tick(20000, true) === 'airport' && s.name() === 'radar', 'airport to radar at 20 s');
}

// 9) a long run stays on the cycle: 60 minutes, radar,board,airport, the segment order repeats exactly
{
  const segs = simulate(['radar', 'board', 'airport'], { radar: 240, board: 40, airport: 60 }, 3600, always);
  const order = segs.map((g) => g.name);
  let cyc = true;
  for (let i = 0; i < order.length; i++) if (order[i] !== ['radar', 'board', 'airport'][i % 3]) cyc = false;
  ok(cyc, 'the order repeats radar,board,airport over an hour');
  ok(segs.every((g) => g.to === 3600 || g.to - g.from === ({ radar: 240, board: 40, airport: 60 })[g.name]), 'each full section has its duration');
}

console.log(fails ? fails + ' failed' : 'rotation: all passed');
process.exit(fails ? 1 : 0);
