/* Demo mode (?demo=1): simulated Hamburg traffic in the same shape as the
   adsb.lol API, for testing without network access. */
(function (MA) {
  var g = MA.geo;
  var HAM = { lat: 53.6330, lon: 9.9860 };
  var XFW = { lat: 53.5353, lon: 9.8355 };

  function from(p, brg, km, alt) {
    var d = g.dest(p.lat, p.lon, brg, km);
    return { lat: d[0], lon: d[1], alt: alt };
  }

  // Each flight follows a polyline of {lat, lon, alt} at `kt`, looping.
  function flights(HAM, XFW) { return [
    { hex: '3c4b26', cs: 'DLH8NA', r: 'D-AINR', t: 'A20N', kt: 160, off: 0.05, route: ['MUC', 'HAM'],
      path: [from(HAM, 53, 46, 7000), from(HAM, 53, 20, 3500), from(HAM, 53, 9, 2200), from(HAM, 53, 1.6, 50)] },
    { hex: '3c6587', cs: 'EWG7LK', r: 'D-AEWS', t: 'A320', kt: 230, off: 0.55, route: ['HAM', 'PMI'],
      path: [from(HAM, 153, 1.8, 0), from(HAM, 333, 6, 2800), from(HAM, 320, 22, 9000), from(HAM, 250, 60, 24000)] },
    { hex: '4ca7b5', cs: 'RYR5TQ', r: 'EI-IGR', t: 'B38M', kt: 165, off: 0.4, route: ['STN', 'HAM'],
      path: [from(HAM, 53, 48, 7500), from(HAM, 53, 22, 3800), from(HAM, 53, 9, 2200), from(HAM, 53, 1.6, 50)] },
    { hex: '3c0e6a', cs: 'BGA114E', r: 'F-GXLJ', t: 'A337', kt: 150, off: 0.2, route: ['TLS', 'XFW'],
      path: [from(XFW, 53, 40, 6000), from(XFW, 53, 15, 3000), from(XFW, 53, 1.6, 50)] },
    { hex: '4a8226', cs: 'SAS4291', r: 'SE-ROS', t: 'A20N', kt: 450, off: 0.1, route: ['OSL', 'FRA'],
      path: [from(HAM, 20, 80, 37000), from(HAM, 200, 80, 37000)] },
    { hex: '89645b', cs: 'UAE59', r: 'A6-EVL', t: 'A388', kt: 170, off: 0.75, route: ['DXB', 'HAM'],
      path: [from(HAM, 53, 50, 8000), from(HAM, 53, 24, 4000), from(HAM, 53, 9, 2200), from(HAM, 53, 1.6, 50)] },
    { hex: '3c5ef8', cs: 'CHX12', r: 'D-HXAA', t: 'EC35', kt: 110, off: 0.3, route: null, cat: 'A7',
      path: [from(HAM, 200, 9, 1500), from(HAM, 120, 18, 1500), from(HAM, 60, 12, 1200), from(HAM, 200, 9, 1500)] },
    { hex: '3962a5', cs: 'AIB01', r: 'F-WMIL', t: 'A35K', kt: 280, off: 0.6, route: ['XFW', 'XFW'],
      path: [from(XFW, 233, 1.6, 0), from(XFW, 233, 14, 6000), from(XFW, 300, 30, 12000), from(XFW, 20, 35, 12000),
        from(XFW, 53, 25, 5000), from(XFW, 53, 1.6, 50)] },
    { hex: '4b1814', cs: 'SWR1057', r: 'HB-JCS', t: 'BCS3', kt: 250, off: 0.85, route: ['HAM', 'ZRH'],
      path: [from(HAM, 233, 1.6, 0), from(HAM, 233, 9, 3500), from(HAM, 200, 30, 11000), from(HAM, 180, 70, 26000)] },
    { hex: '4d2273', cs: 'WZZ1BQ', r: '9H-WDC', t: 'A21N', kt: 470, off: 0.3, route: ['GDN', 'LTN'],
      path: [from(HAM, 95, 90, 35000), from(HAM, 265, 90, 35000)] },
    // emergency (squawk 7700) returning to HAM: shows the red special-aircraft highlight
    { hex: '3c66b3', cs: 'DLH4CK', r: 'D-AIZR', t: 'A320', sq: '7700', kt: 190, off: 0.15, route: null,
      path: [from(HAM, 100, 40, 9000), from(HAM, 53, 18, 3500), from(HAM, 53, 1.6, 50)] }
  ]; }
  var anchorPt = HAM, FLIGHTS = flights(HAM, XFW);

  function prep(f) {
    var len = 0;
    f.seg = [];
    for (var i = 0; i < f.path.length - 1; i++) {
      var a = f.path[i], b = f.path[i + 1];
      var d = g.distKm(a.lat, a.lon, b.lat, b.lon);
      f.seg.push({ a: a, b: b, d: d, brg: g.bearing(a.lat, a.lon, b.lat, b.lon) });
      len += d;
    }
    f.len = len;
    f.durMs = len / (f.kt * 1.852) * 3600 * 1000;
  }
  FLIGHTS.forEach(prep);

  // focus view: the same traffic, moved to the chosen airport (ground traffic keeps its offsets); null = back to HAM
  function anchor(a) {
    anchorPt = a ? { lat: a.lat, lon: a.lon } : HAM;
    FLIGHTS = flights(anchorPt, anchorPt);
    FLIGHTS.forEach(prep);
  }

  function state(f, now) {
    var t = ((now / f.durMs + f.off) % 1) * f.len;
    for (var i = 0; i < f.seg.length; i++) {
      var s = f.seg[i];
      if (t <= s.d || i === f.seg.length - 1) {
        var k = Math.min(1, t / s.d);
        var alt = s.a.alt + (s.b.alt - s.a.alt) * k;
        var minutes = s.d / (f.kt * 1.852) * 60;
        return {
          hex: f.hex, flight: f.cs + '  ', r: f.r, t: f.t, category: f.cat || 'A3',
          lat: s.a.lat + (s.b.lat - s.a.lat) * k,
          lon: s.a.lon + (s.b.lon - s.a.lon) * k,
          alt_baro: alt < 30 ? 'ground' : Math.round(alt),
          gs: f.kt, track: s.brg,
          baro_rate: Math.round((s.b.alt - s.a.alt) / minutes),
          squawk: f.sq || '',
          seen_pos: 0.4
        };
      }
      t -= s.d;
    }
  }

  MA.demo = {
    anchor: function (a) { anchor(a); },
    snapshot: function () {
      var now = Date.now();
      var dl = anchorPt.lat - HAM.lat, dn = anchorPt.lon - HAM.lon;
      var list = FLIGHTS.map(function (f) { return state(f, now); });
      // parked / taxiing aircraft at HAM and XFW
      [['3C6444', 'DLH7K', 'A320', 53.6340, 9.9960, 40], ['3C65A1', 'EWG2B', 'A319', 53.6330, 9.9915, 0],
       ['4B1814', 'SWR93', 'A321', 53.6285, 9.9840, 0], ['3C4DD2', 'CFG5T', 'B738', 53.6262, 9.9795, 220],
       ['3C66B7', 'AIB02', 'A320', 53.5357, 9.8408, 0]].forEach(function (g) {
        list.push({ hex: g[0], flight: g[1] + '  ', t: g[2], category: 'A3', lat: g[3] + dl, lon: g[4] + dn, alt_baro: 'ground',
          gs: g[5] ? 8 : 0, track: g[5] || 0, squawk: '', seen_pos: 0.4 });
      });
      return { ac: list, now: now };
    },
    route: function (callsign) {
      for (var i = 0; i < FLIGHTS.length; i++) if (FLIGHTS[i].cs === callsign) return FLIGHTS[i].route;
      return null;
    },
    // static weather in the aviationweather.gov shape (south-west wind, matching the 23 arrivals)
    metar: function () {
      var t = Math.floor(Date.now() / 1000) - 12 * 60;
      return [
        { icaoId: 'EDDH', obsTime: t, wdir: 230, wspd: 12, wgst: 22, visib: '6+', temp: 14, dewp: 8, altim: 1013,
          clouds: [{ cover: 'FEW', base: 2500 }, { cover: 'BKN', base: 4200 }], fltCat: 'VFR',
          rawOb: 'METAR EDDH 120820Z 23012G22KT 9999 FEW025 BKN042 14/08 Q1013 NOSIG' },
        { icaoId: 'EDHI', obsTime: t, wdir: 230, wspd: 11, visib: '6+', temp: 14, dewp: 8, altim: 1013,
          clouds: [{ cover: 'FEW', base: 2500 }], fltCat: 'VFR',
          rawOb: 'METAR EDHI 120820Z 23011KT 9999 FEW025 14/08 Q1013' },
        // focus view airports (simulated, same wind as the 23 arrivals)
        { icaoId: 'EDDF', obsTime: t, wdir: 250, wspd: 9, visib: '6+', temp: 13, dewp: 7, altim: 1012,
          clouds: [{ cover: 'SCT', base: 3000 }], fltCat: 'VFR',
          rawOb: 'METAR EDDF 120820Z 25009KT 9999 SCT030 13/07 Q1012' },
        { icaoId: 'EDDG', obsTime: t, wdir: 230, wspd: 10, visib: '6+', temp: 14, dewp: 8, altim: 1013,
          clouds: [{ cover: 'FEW', base: 2500 }], fltCat: 'VFR',
          rawOb: 'METAR EDDG 120820Z 23010KT 9999 FEW025 14/08 Q1013' },
        { icaoId: 'EKCH', obsTime: t, wdir: 230, wspd: 12, visib: '6+', temp: 15, dewp: 9, altim: 1014,
          clouds: [{ cover: 'SCT', base: 2000 }], fltCat: 'VFR',
          rawOb: 'METAR EKCH 120820Z 23012KT 9999 SCT020 15/09 Q1014' }
      ];
    }
  };
})(window.MA);
