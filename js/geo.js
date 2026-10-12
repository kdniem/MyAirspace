/* Small geodesy helpers. */
(function (MA) {
  var R = 6371.0088; // mean earth radius, km
  var rad = Math.PI / 180;

  MA.geo = {
    distKm: function (lat1, lon1, lat2, lon2) {
      var dLat = (lat2 - lat1) * rad;
      var dLon = (lon2 - lon1) * rad;
      var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    },

    bearing: function (lat1, lon1, lat2, lon2) {
      var y = Math.sin((lon2 - lon1) * rad) * Math.cos(lat2 * rad);
      var x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) -
        Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lon2 - lon1) * rad);
      return (Math.atan2(y, x) / rad + 360) % 360;
    },

    /* Moves the displayed position (ac.dlat/dlon) one frame: the aircraft keeps flying on its own
       (track, ground speed) and new fixes only correct it gently. The correction may slow an
       aircraft down but never push it backwards, so late or slightly inconsistent fixes cannot
       make it jump forth and back. Target = last fix (ac.lat/lon at ac.ts) flown on to `now`. */
    glide: function (ac, now, dt, maxAgeMs) {
      var moving = ac.track !== null && ac.track !== undefined && ac.gs > 30;
      var age = Math.min(maxAgeMs, Math.max(0, now - ac.ts));
      var tlat = ac.lat, tlon = ac.lon, vkm = 0, ux = 0, uy = 0;
      if (moving) {
        vkm = ac.gs * 1.852 / 3600000;               // km per ms
        var t = ac.track * rad;
        ux = Math.sin(t); uy = Math.cos(t);
        var p = MA.geo.dest(ac.lat, ac.lon, ac.track, vkm * age);
        tlat = p[0]; tlon = p[1];
      }
      var kx = 111.32 * Math.cos(ac.dlat * rad), ky = 110.574;
      var cx = (tlon - ac.dlon) * kx, cy = (tlat - ac.dlat) * ky;   // error to the target, km
      var k = Math.min(1, dt / 1200);
      cx *= k; cy *= k;
      var mx = 0, my = 0;
      if (moving) {
        var step = vkm * Math.min(dt, 100);          // own motion this frame (a long pause counts as 100 ms)
        mx = ux * step; my = uy * step;
        var along = cx * ux + cy * uy;               // correction along the track
        var floor = -0.8 * step;                     // at most 80 % of the own motion backwards
        if (along < floor) { cx -= (along - floor) * ux; cy -= (along - floor) * uy; }
      }
      ac.dlon += (mx + cx) / kx;
      ac.dlat += (my + cy) / ky;
    },

    // point reached from (lat, lon) going `km` along initial bearing `brg`
    dest: function (lat, lon, brg, km) {
      var d = km / R, b = brg * rad, p1 = lat * rad, l1 = lon * rad;
      var p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
      var l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
      return [p2 / rad, ((l2 / rad + 540) % 360) - 180];
    }
  };
})(window.MA);
