/* Static map features for the Hamburg area, deliberately simplified:
   the radar is an ambient display, not a navigation chart. */
window.MA = window.MA || {};

MA.features = {
  // Runways as centre point, true heading and length (m).
  airports: [
    {
      code: 'HAM', name: 'Hamburg', lat: 53.6304, lon: 9.9883,
      runways: [
        { id: '15/33', lat: 53.6335, lon: 9.9878, hdg: 153, len: 3666 },
        { id: '05/23', lat: 53.6330, lon: 9.9845, hdg: 53, len: 3250 }
      ]
    },
    {
      code: 'XFW', name: 'Finkenwerder', lat: 53.5353, lon: 9.8355,
      runways: [
        { id: '05/23', lat: 53.5353, lon: 9.8355, hdg: 53, len: 3183 }
      ]
    }
  ],

  // Rivers and lakes as [lat, lon, widthKm] polylines.
  water: [
    { name: 'Elbe', pts: [
      [53.79, 9.41, 2.6], [53.70, 9.46, 2.4], [53.64, 9.52, 2.2], [53.605, 9.58, 2.0],
      [53.583, 9.66, 1.8], [53.566, 9.73, 1.6], [53.557, 9.79, 1.0], [53.548, 9.84, 0.7],
      [53.545, 9.89, 0.55], [53.544, 9.93, 0.5], [53.543, 9.96, 0.45], [53.540, 9.99, 0.4],
      [53.534, 10.02, 0.35], [53.525, 10.04, 0.3], [53.505, 10.06, 0.3], [53.47, 10.07, 0.3],
      [53.445, 10.10, 0.35], [53.425, 10.17, 0.35], [53.41, 10.25, 0.35], [53.42, 10.33, 0.35],
      [53.43, 10.39, 0.35]
    ] },
    { name: 'Süderelbe', pts: [
      [53.46, 10.07, 0.3], [53.475, 10.0, 0.3], [53.49, 9.96, 0.3], [53.51, 9.92, 0.3],
      [53.53, 9.88, 0.35], [53.542, 9.86, 0.4]
    ] },
    { name: 'Alster', closed: true, pts: [
      [53.555, 10.000, 0.1], [53.560, 10.008, 0.1], [53.572, 10.012, 0.1],
      [53.576, 10.006, 0.1], [53.569, 9.999, 0.1], [53.558, 9.996, 0.1]
    ] }
  ],

  places: [
    { name: 'Hamburg', lat: 53.5511, lon: 9.9937, major: true },
    { name: 'Altona', lat: 53.5503, lon: 9.9350 },
    { name: 'Norderstedt', lat: 53.7064, lon: 10.0105 },
    { name: 'Pinneberg', lat: 53.6603, lon: 9.7990 },
    { name: 'Quickborn', lat: 53.7290, lon: 9.9040 },
    { name: 'Ahrensburg', lat: 53.6747, lon: 10.2411 },
    { name: 'Wedel', lat: 53.5800, lon: 9.6990 },
    { name: 'Harburg', lat: 53.4600, lon: 9.9830 },
    { name: 'Bergedorf', lat: 53.4880, lon: 10.2130 },
    { name: 'Buxtehude', lat: 53.4770, lon: 9.7010 },
    { name: 'Stade', lat: 53.5990, lon: 9.4760 },
    { name: 'Elmshorn', lat: 53.7530, lon: 9.6520 },
    { name: 'Henstedt-Ulzburg', lat: 53.7900, lon: 9.9800 },
    { name: 'Bad Oldesloe', lat: 53.8110, lon: 10.3740 },
    { name: 'Geesthacht', lat: 53.4370, lon: 10.3780 },
    { name: 'Lüneburg', lat: 53.2490, lon: 10.4140 },
    { name: 'Buchholz', lat: 53.3270, lon: 9.8680 },
    { name: 'Reinbek', lat: 53.5100, lon: 10.2480 },
    { name: 'Glinde', lat: 53.5420, lon: 10.2100 }
  ]
};
