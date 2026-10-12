/* Besondere Flugzeuge: recognises rare or interesting aircraft for the glow, badge and toast.
   classify() runs once per poll (main.js ingest) and returns one of the shared constant
   objects below (never mutate them), so it allocates nothing.
   Sources: emergency squawks per ICAO Doc 4444; type designators per ICAO Doc 8643;
   callsign prefixes are ICAO three-letter designators or radio names as seen in ADS-B feeds. */
(function (MA) {
  function S(key, label, alert) { return { key: key, label: label, alert: !!alert }; }

  // 1. emergency squawks: highest priority, drawn in red
  var SQUAWK = {
    '7500': S('alert', 'ENTFÜHRUNG', true),
    '7600': S('alert', 'FUNKAUSFALL', true),
    '7700': S('alert', 'NOTFALL', true)
  };

  // 2. ICAO type codes. Common widebodies (B77W, B789, A359 …) are deliberately not special.
  var GIANT = S('giant', 'A380'), JUMBO = S('giant', 'JUMBO'), BELUGA = S('giant', 'BELUGA'),
    ANTONOV = S('giant', 'ANTONOV'), OLD = S('rare', 'OLDTIMER'), MIL = S('military', 'MILITÄR');
  var TYPES = {
    A388: GIANT, A3ST: BELUGA, A337: BELUGA, A124: ANTONOV, A225: ANTONOV, AN22: ANTONOV,
    CONC: OLD, DC3: OLD, DC6: OLD, JU52: OLD,
    A400: S('military', 'A400M'), C130: S('military', 'HERCULES'), C30J: S('military', 'HERCULES'),
    EUFI: MIL, F35: MIL, F16: MIL, TOR: MIL
  };

  // 3. callsign prefixes. The police and military lists are UNVERIFIED heuristics and
  //    intentionally short: BPO = Bundespolizei; PIRAT/HUMMEL/LIBELLE = state police
  //    helicopter radio names; GAF = Luftwaffe, RCH = USAF "Reach", NATO = AWACS,
  //    RRR = RAF "Ascot", CTM = French AF, BAF/NAF/IAM = Belgian/Dutch/Italian AF.
  var CALLSIGNS = [
    [/^CHX\d/, S('rescue', 'RETTUNG')],                      // ADAC Luftrettung "Christoph"
    [/^(BPO\d|PIRAT|HUMMEL|LIBELLE)/, S('police', 'POLIZEI')],
    [/^(GAF|RCH|NATO|RRR|CTM|BAF|NAF|IAM)\d/, MIL]
  ];

  var AIRBUS = S('airbus', 'AIRBUS'); // test and transfer flights (AIB/BGA), see MA.fmt.isAirbusSpecial

  MA.special = {
    classify: function (ac) {
      if (SQUAWK[ac.squawk]) return SQUAWK[ac.squawk];
      var t = ac.type || '';
      if (TYPES[t]) return TYPES[t];
      if (/^B74/.test(t)) return JUMBO;
      var cs = ac.callsign || '';
      for (var i = 0; i < CALLSIGNS.length; i++) if (CALLSIGNS[i][0].test(cs)) return CALLSIGNS[i][1];
      if (MA.fmt.isAirbusSpecial(ac)) return AIRBUS;
      return null;
    }
  };
})(window.MA);
