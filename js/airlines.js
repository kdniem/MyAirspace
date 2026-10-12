/* Airline badges: a self-made, deliberately logo-free identification of the operator.
   NO third-party images are requested and NO trademarked artwork is bundled (see README, THIRD_PARTY.md).
   A badge is a flat tile in an approximate livery colour with the IATA code (or the ICAO prefix when no
   IATA code is known). The text colour (black or white) is chosen automatically for >= 4.5:1.
   Add an airline: one line in MA.airlines, keyed by the ICAO designator (first 3 letters of the callsign).
     ICAO: [IATA, display name, livery colour]
   Plain ES2017 for old TV browsers. */
(function (MA) {
  var T = {
    // Germany, Austria, Switzerland
    DLH: ['LH', 'Lufthansa', '#0c1c5a'], CLH: ['CL', 'Lufthansa CityLine', '#0c1c5a'], LHX: ['VL', 'Lufthansa City', '#0c1c5a'],
    GEC: ['LH', 'Lufthansa Cargo', '#0c1c5a'], EWG: ['EW', 'Eurowings', '#b4005a'], OCN: ['4Y', 'Discover', '#0a8f95'],
    CFG: ['DE', 'Condor', '#f2b800'], TUI: ['X3', 'TUIfly', '#d3191f'], SXS: ['XQ', 'SunExpress', '#f5a300'],
    MBU: ['', 'Marabu', '#00a3a3'], SWR: ['LX', 'Swiss', '#e2001a'], EDW: ['WK', 'Edelweiss', '#c8102e'],
    AUA: ['OS', 'Austrian', '#c8102e'], LDM: ['OE', 'Laudamotion', '#c8102e'],
    // Western Europe
    BAW: ['BA', 'British Airways', '#1d3c78'], SHT: ['BA', 'British Airways Shuttle', '#1d3c78'], VIR: ['VS', 'Virgin Atlantic', '#c8102e'],
    KLM: ['KL', 'KLM', '#00a1de'], KLC: ['WA', 'KLM Cityhopper', '#00a1de'], TRA: ['HV', 'Transavia', '#00a651'],
    TVF: ['TO', 'Transavia France', '#00a651'], AFR: ['AF', 'Air France', '#0b2a63'], HOP: ['A5', 'Air France Hop', '#0b2a63'],
    BEL: ['SN', 'Brussels Airlines', '#17307a'], LGL: ['LG', 'Luxair', '#0072ce'], IBE: ['IB', 'Iberia', '#d7192d'],
    VLG: ['VY', 'Vueling', '#ffcc00'], TAP: ['TP', 'TAP Portugal', '#d6001c'], EIN: ['EI', 'Aer Lingus', '#008c5a'],
    EZY: ['U2', 'easyJet', '#ff6600'], EJU: ['EC', 'easyJet Europe', '#ff6600'], EZS: ['DS', 'easyJet Switzerland', '#ff6600'],
    RYR: ['FR', 'Ryanair', '#073590'], RUK: ['RK', 'Ryanair UK', '#073590'], LAV: ['', 'Ryanair Sun', '#073590'],
    EXS: ['LS', 'Jet2', '#e51d2a'], TOM: ['BY', 'TUI Airways', '#d3191f'], AZA: ['AZ', 'ITA Airways', '#0b2b5c'], ITY: ['AZ', 'ITA Airways', '#0b2b5c'],
    // Northern and Eastern Europe
    SAS: ['SK', 'SAS', '#1f2a6b'], NOZ: ['DY', 'Norwegian', '#d81939'], NAX: ['DY', 'Norwegian', '#d81939'], NSZ: ['DY', 'Norwegian', '#d81939'],
    FIN: ['AY', 'Finnair', '#0b1560'], ICE: ['FI', 'Icelandair', '#00467f'], WIF: ['WF', 'Widerøe', '#0070b8'], DAT: ['DX', 'Danish Air', '#006aa7'],
    BTI: ['BT', 'airBaltic', '#8cc63e'], LOT: ['LO', 'LOT', '#11397e'], CSA: ['OK', 'Czech Airlines', '#c8102e'], TVS: ['QS', 'Smartwings', '#d4001a'],
    WZZ: ['W6', 'Wizz Air', '#c6007e'], CTN: ['OU', 'Croatia Airlines', '#1c3f94'], AEE: ['A3', 'Aegean', '#0d3b8e'],
    // Turkey, Middle East, Africa
    THY: ['TK', 'Turkish Airlines', '#c8102e'], PGT: ['PC', 'Pegasus', '#f6b600'], UAE: ['EK', 'Emirates', '#d71921'],
    QTR: ['QR', 'Qatar Airways', '#5c0632'], ETD: ['EY', 'Etihad', '#bd8b13'], SVA: ['SV', 'Saudia', '#0a7d4a'], ELY: ['LY', 'El Al', '#0a3a73'],
    MSR: ['MS', 'Egyptair', '#0b3d91'], RAM: ['AT', 'Royal Air Maroc', '#c1272d'], ETH: ['ET', 'Ethiopian', '#1b6b2f'], KZR: ['KC', 'Air Astana', '#0b2f6b'],
    // Americas and Asia
    UAL: ['UA', 'United', '#1d3b8b'], DAL: ['DL', 'Delta', '#b1122e'], AAL: ['AA', 'American', '#0a67b4'], ACA: ['AC', 'Air Canada', '#d6142a'],
    SIA: ['SQ', 'Singapore Airlines', '#11265a'], CPA: ['CX', 'Cathay Pacific', '#00655b'], CCA: ['CA', 'Air China', '#d4002a'],
    ANA: ['NH', 'ANA', '#1d4e9e'], JAL: ['JL', 'Japan Airlines', '#c8102e'], KAL: ['KE', 'Korean Air', '#00256c'],
    // Cargo
    FDX: ['FX', 'FedEx', '#4d148c'], UPS: ['5X', 'UPS', '#4a2c14'], BCS: ['QY', 'DHL (EAT)', '#ffcc00'], DHK: ['D0', 'DHL Air UK', '#ffcc00'],
    DHX: ['', 'DHL', '#ffcc00'], CLX: ['CV', 'Cargolux', '#0a2d6e'], GTI: ['5Y', 'Atlas Air', '#0b2b5a'], BOX: ['3S', 'AeroLogic', '#ffcc00'],
    // Business, rescue, authorities, manufacturers
    NJE: ['', 'NetJets Europe', '#202020'], VJT: ['', 'VistaJet', '#a30d1c'], GES: ['', 'Gestair', '#3a4a5a'],
    CHX: ['', 'ADAC Luftrettung', '#ffcc00'], DCA: ['', 'Rega', '#d71920'], HDI: ['', 'Heli Service', '#0c5a9e'], BPO: ['', 'Bundespolizei', '#0b6b3a'],
    GAF: ['', 'Luftwaffe', '#3f463a'], RCH: ['', 'USAF Air Mobility', '#34456a'], RRR: ['', 'Royal Air Force', '#34456a'],
    AIB: ['', 'Airbus', '#00205b'], BGA: ['', 'Airbus Beluga', '#00205b']
  };

  var airlines = {};
  Object.keys(T).forEach(function (k) {
    airlines[k] = { icao: k, iata: T[k][0], name: T[k][1], color: T[k][2] };
  });

  /* ---------- helpers ---------- */

  function channel(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function lum(h) {
    h = String(h).replace('#', '');
    return 0.2126 * channel(parseInt(h.substr(0, 2), 16)) + 0.7152 * channel(parseInt(h.substr(2, 2), 16)) + 0.0722 * channel(parseInt(h.substr(4, 2), 16));
  }
  function ratio(a, b) {
    var l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  // black or white, whichever reads better on the tile (always >= 4.5:1 for any colour)
  function textOn(bg) { return ratio('#ffffff', bg) >= ratio('#000000', bg) ? '#ffffff' : '#000000'; }

  /* Badge description for an aircraft {callsign, type}:
       kind 'airline'  known operator: brand colour, IATA (or ICAO) code
       kind 'unknown'  airline-like callsign (3 letters + digit) not in the table: neutral tile, ICAO prefix
       kind 'type'     private/GA (registration-like callsign): neutral tile with the type designator */
  function info(ac) {
    var cs = String((ac && ac.callsign) || '').toUpperCase();
    var m = /^([A-Z]{3})\d/.exec(cs);
    if (m) {
      var a = airlines[m[1]];
      if (a) {
        var bg = a.color;
        return { kind: 'airline', icao: a.icao, code: a.iata || a.icao, name: a.name, bg: bg, fg: textOn(bg) };
      }
      return { kind: 'unknown', icao: m[1], code: m[1], name: '', bg: null, fg: null };
    }
    var t = String((ac && ac.type) || '').toUpperCase();
    return { kind: 'type', icao: '', code: t || 'GA', name: '', bg: null, fg: null };
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // DOM badge (board, list). Colours: brand tile inline, neutral and mono through CSS custom properties.
  function html(inf, mono) {
    if (!inf) return '';
    var cls = 'bdg' + (mono ? ' bdg-mono' : (inf.kind === 'airline' ? '' : ' bdg-n'));
    var st = !mono && inf.kind === 'airline' ? ' style="background:' + inf.bg + ';color:' + inf.fg + '"' : '';
    var title = inf.name ? ' title="' + esc(inf.name) + '"' : '';
    return '<span class="' + cls + '"' + st + title + '>' + esc(inf.code) + '</span>';
  }

  /* Canvas badge. opts: {font (css family), weight, radius, edge, mono, ink, neutralBg, neutralFg, alpha}.
     Returns the width; with ctx === null only measures (needs opts.measure = a 2d context). */
  function metrics(mctx, inf, h, opts) {
    var px = Math.max(8, Math.round(h * 0.62));
    mctx.font = (opts.weight || 600) + ' ' + px + 'px ' + opts.font;
    var tw = mctx.measureText(inf.code).width;
    return { px: px, w: Math.max(h * 1.3, Math.ceil(tw + h * 0.55)) };
  }
  function draw(ctx, inf, x, y, h, opts) {
    var m = metrics(ctx, inf, h, opts), w = m.w, r = Math.min(opts.radius || 0, h / 2);
    var brand = !opts.mono && inf.kind === 'airline';
    ctx.save();
    if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
    ctx.beginPath();
    if (r > 0.5) {
      ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    } else ctx.rect(x, y, w, h);
    if (!opts.mono) { ctx.fillStyle = brand ? inf.bg : opts.neutralBg; ctx.fill(); }
    ctx.lineWidth = 1;
    ctx.strokeStyle = opts.mono ? opts.ink : opts.edge;
    ctx.stroke();
    ctx.fillStyle = opts.mono ? opts.ink : (brand ? inf.fg : opts.neutralFg);
    ctx.font = (opts.weight || 600) + ' ' + m.px + 'px ' + opts.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(inf.code, x + w / 2, y + h / 2 + h * 0.04);
    ctx.restore();
    return w;
  }

  MA.airlines = airlines;
  MA.badge = {
    info: info, html: html, draw: draw, width: function (ctx, inf, h, opts) { return metrics(ctx, inf, h, opts).w; },
    textOn: textOn, ratio: ratio
  };
})(window.MA);
