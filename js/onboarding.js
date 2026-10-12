/* Guided first-run setup on setup.html: shows the existing cards one step at a time
   (welcome, location, style, fine tuning, TV address). Form fields stay where they are, so
   js/setup.js keeps reading and building the URL unchanged; this script only toggles which
   cards are visible (body[data-step], see css/setup.css) and gates "Weiter" on a valid location.
   Active for new visitors only: not when lat/lon are already in the address, not after finishing
   or skipping once (localStorage ma.onboarded), and ?wizard=0 / ?wizard=1 force it off / on. */
(function () {
  'use strict';

  var KEY = 'ma.onboarded';
  var q = new URLSearchParams(location.search);
  var $ = function (id) { return document.getElementById(id); };

  function stored() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function remember() { try { localStorage.setItem(KEY, '1'); } catch (e) { /* storage blocked: wizard shows again next time */ } }

  var force = q.get('wizard');
  var on = force === '1' || (force !== '0' && !(q.has('lat') && q.has('lon')) && !stored());

  var STEPS = [
    { name: 'Willkommen', lead: '', next: 'Los geht’s' },
    { name: 'Standort', lead: 'Wo soll dein Radar zentriert sein? Meist ist das dein Zuhause.', next: 'Weiter' },
    { name: 'Stil', lead: 'Wähle einen Look. In der Vorschau siehst du sofort, wie er wirkt.', next: 'Weiter' },
    { name: 'Feinschliff', lead: 'Radius, Einheiten und Nachtruhe. Die Vorgaben passen meistens, du kannst alles später ändern.', next: 'Weiter' },
    { name: 'Fernseher', lead: 'Fast geschafft: bring die Adresse auf den Fernseher.', next: 'Fertig' }
  ];

  var restart = $('wz-restart');
  if (!on) return;
  if (restart) restart.parentNode.hidden = true;

  var body = document.body;
  var wz = $('wz'), nav = $('wz-nav');
  var btnBack = $('wz-back'), btnNext = $('wz-next'), btnSkip = $('wz-skip');
  var hasLoc = false;
  var step = 0;

  document.addEventListener('ma:update', function (e) { hasLoc = !!(e.detail && e.detail.loc); refresh(); });

  function refresh() {
    var s = STEPS[step];
    body.setAttribute('data-step', String(step + 1));
    $('wz-step').textContent = step === 0 ? '' : 'Schritt ' + step + ' von ' + (STEPS.length - 1) + ' · ' + s.name;
    $('wz-lead').textContent = s.lead;
    $('wz-lead').hidden = !s.lead;
    var dots = $('wz-dots').children;
    for (var i = 0; i < dots.length; i++) {
      dots[i].className = i + 1 < step ? 'done' : (i + 1 === step ? 'cur' : '');
    }
    $('wz-dots').hidden = step === 0;
    btnBack.hidden = step === 0;
    btnSkip.hidden = step === STEPS.length - 1;
    btnNext.textContent = s.next;
    btnNext.disabled = step === 1 && !hasLoc;
    var hint = step === 1 && !hasLoc;
    btnNext.title = hint ? 'Wähle zuerst einen Standort.' : '';
  }

  function go(n) {
    step = Math.max(0, Math.min(STEPS.length - 1, n));
    refresh();
    var visible = Array.prototype.filter.call(document.querySelectorAll('.card'), function (c) { return c.offsetParent !== null; })[0];
    var h = visible && visible.querySelector('h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    window.scrollTo(0, 0);
  }

  function finish() {
    remember();
    body.classList.remove('wizard');
    body.removeAttribute('data-step');
    wz.hidden = true;
    nav.hidden = true;
    if (restart) restart.parentNode.hidden = false;
    window.scrollTo(0, 0);
  }

  btnBack.addEventListener('click', function () { go(step - 1); });
  btnNext.addEventListener('click', function () {
    if (step === STEPS.length - 1) finish(); else go(step + 1);
  });
  btnSkip.addEventListener('click', finish);

  body.classList.add('wizard');
  wz.hidden = false;
  nav.hidden = false;
  refresh();
})();
