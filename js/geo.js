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

    // point reached from (lat, lon) going `km` along initial bearing `brg`
    dest: function (lat, lon, brg, km) {
      var d = km / R, b = brg * rad, p1 = lat * rad, l1 = lon * rad;
      var p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
      var l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
      return [p2 / rad, ((l2 / rad + 540) % 360) - 180];
    }
  };
})(window.MA);
