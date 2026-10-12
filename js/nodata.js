/* Degraded-data notice (ES2017 classic script, no network). Shown while the last poll failed on every source:
   js/data.js rejects a fetch only after all of its routes and providers failed, so failures > 0 means that.
   The notice is removed by the first successful poll. Text is set with textContent only.
   The pure state function is tested in tools/tests/nodata-test.cjs. */
(function (MA) {
  var TEXT = 'Keine Flugdaten – Quelle nicht erreichbar, neuer Versuch läuft';

  // true while every source failed on the last poll (status as kept in js/main.js)
  function wanted(status) {
    return !!status && status.failures > 0;
  }

  // el: the notice element (or null on pages without it); returns whether the notice is shown
  function apply(el, status) {
    var on = wanted(status);
    if (!el) return on;
    if (el.textContent !== TEXT) el.textContent = TEXT;
    el.hidden = !on;
    return on;
  }

  MA.nodata = { TEXT: TEXT, wanted: wanted, apply: apply };
})(window.MA = window.MA || {});
