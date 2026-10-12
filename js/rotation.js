/* Rotation of the views (radar, board, airport) for view=auto: a pure scheduler, no DOM, so it can be tested
   in Node (tools/tests/rotation-test.cjs). js/views.js and js/main.js use it.
   entries: the rotation in order, e.g. ['radar', 'board', 'airport']; a duplicate weights a view.
   durMs: milliseconds per view, { radar, board, airport }.
   A board entry is skipped when there are no passes yet (only in a list that has another view);
   the schedule then goes on with the entry after it. */
(function (MA) {
  function Scheduler(entries, durMs) {
    this.entries = entries.slice();
    this.dur = durMs;
    this.i = 0;
    this.since = null;
    this.mixed = this.entries.some(function (e) { return e !== 'board'; });
  }

  Scheduler.prototype.name = function () { return this.entries[this.i]; };

  // Index of the first entry after `from` (wrapping around) that may show now; `from` = -1 starts at 0.
  Scheduler.prototype._pick = function (from, hasPasses) {
    var n = this.entries.length;
    for (var k = 1; k <= n; k++) {
      var j = (from + k) % n;
      if (this.entries[j] === 'board' && this.mixed && !hasPasses) continue;
      return j;
    }
    return from;
  };

  // Advance to `now`. Returns the name of the view that was left if the view changed, else null.
  Scheduler.prototype.tick = function (now, hasPasses) {
    if (this.since === null) {
      this.since = now;
      this.i = this._pick(-1, hasPasses);
      return null;
    }
    if (now - this.since < this.dur[this.name()]) return null;
    var prev = this.name();
    this.i = this._pick(this.i, hasPasses);
    this.since = now;
    return prev !== this.name() ? prev : null;
  };

  MA.rotation = {
    create: function (entries, durMs) { return new Scheduler(entries, durMs); },
    Scheduler: Scheduler
  };
})(window.MA);
