/* Display formatting: units, compass, airline and aircraft-type names.
   Unit conversions follow the OpenSky flight-tracker helpers (ft/kt, 8-point compass). */
(function (MA) {
  var AIRLINES = {
    DLH: 'Lufthansa', CLH: 'Lufthansa CityLine', LHX: 'Lufthansa City', GEC: 'Lufthansa Cargo',
    EWG: 'Eurowings', OCN: 'Discover', CFG: 'Condor', TUI: 'TUIfly', SXS: 'SunExpress',
    MBU: 'Marabu', BAW: 'British Airways', SHT: 'British Airways', KLM: 'KLM', AFR: 'Air France',
    SWR: 'Swiss', AUA: 'Austrian', BEL: 'Brussels Airlines', SAS: 'SAS', NOZ: 'Norwegian',
    NAX: 'Norwegian', NSZ: 'Norwegian', FIN: 'Finnair', ICE: 'Icelandair', BTI: 'airBaltic',
    LOT: 'LOT', EZY: 'easyJet', EJU: 'easyJet Europe', EZS: 'easyJet Switzerland',
    RYR: 'Ryanair', RUK: 'Ryanair UK', WZZ: 'Wizz Air', VLG: 'Vueling', IBE: 'Iberia',
    TAP: 'TAP Portugal', AEE: 'Aegean', THY: 'Turkish Airlines', PGT: 'Pegasus',
    UAE: 'Emirates', QTR: 'Qatar Airways', ETD: 'Etihad', MSR: 'Egyptair', CTN: 'Croatia Airlines',
    LGL: 'Luxair', EXS: 'Jet2', ENT: 'Enter Air', CAI: 'Corendon', TOM: 'TUI Airways',
    UAL: 'United', DAL: 'Delta', AAL: 'American', ACA: 'Air Canada', SIA: 'Singapore Airlines',
    CCA: 'Air China', CPA: 'Cathay Pacific', BCS: 'DHL', DHK: 'DHL', DHX: 'DHL', UPS: 'UPS',
    FDX: 'FedEx', CLX: 'Cargolux', GTI: 'Atlas Air', AIB: 'Airbus', BGA: 'Airbus Beluga',
    CHX: 'ADAC Luftrettung', BPO: 'Bundespolizei', GAF: 'Luftwaffe', DCA: 'Rega',
    HDI: 'Heli Service', NJE: 'NetJets', VJT: 'VistaJet', GES: 'Gestair', DAT: 'Danish Air',
    WIF: 'Widerøe', SVA: 'Saudia', ELY: 'El Al', RAM: 'Royal Air Maroc', AZA: 'ITA Airways',
    ITY: 'ITA Airways', KZR: 'Air Astana', AHY: 'Azerbaijan Airlines', BLA: 'Blue Air',
    TRA: 'Transavia', TVF: 'Transavia France', HOP: 'Air France Hop', KLC: 'KLM Cityhopper'
  };

  var TYPES = {
    A19N: 'A319neo', A20N: 'A320neo', A21N: 'A321neo', A318: 'A318', A319: 'A319',
    A320: 'A320', A321: 'A321', A332: 'A330-200', A333: 'A330-300', A339: 'A330neo',
    A343: 'A340-300', A346: 'A340-600', A359: 'A350-900', A35K: 'A350-1000', A388: 'A380',
    A3ST: 'Beluga', A337: 'BelugaXL', BCS1: 'A220-100', BCS3: 'A220-300',
    B737: '737-700', B738: '737-800', B739: '737-900', B38M: '737 MAX 8', B39M: '737 MAX 9',
    B744: '747-400', B748: '747-8', B752: '757-200', B763: '767-300', B772: '777-200',
    B77L: '777-200LR', B77W: '777-300ER', B788: '787-8', B789: '787-9', B78X: '787-10',
    E170: 'E170', E175: 'E175', E190: 'E190', E195: 'E195', E290: 'E190-E2', E295: 'E195-E2',
    CRJ7: 'CRJ700', CRJ9: 'CRJ900', CRJX: 'CRJ1000', DH8D: 'Dash 8-400', AT72: 'ATR 72',
    AT75: 'ATR 72', AT76: 'ATR 72-600', AT45: 'ATR 42', AT46: 'ATR 42-600', SB20: 'Saab 2000',
    EC35: 'H135', EC45: 'H145', EC30: 'H130', EC55: 'H155', H160: 'H160', A139: 'AW139',
    C172: 'Cessna 172', C152: 'Cessna 152', P28A: 'Piper PA-28', DA40: 'DA40', DA42: 'DA42',
    PC12: 'PC-12', C25A: 'Citation CJ2', C56X: 'Citation XLS', GLF6: 'G650', GLEX: 'Global Express',
    CL35: 'Challenger 350', A400: 'A400M', C130: 'C-130', EUFI: 'Eurofighter', A310: 'A310'
  };

  var COMPASS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];

  function thousands(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  MA.fmt = {
    airlineCode: function (callsign) {
      var m = /^([A-Z]{3})\d/.exec(callsign || '');
      return m ? m[1] : null;
    },

    airline: function (callsign) {
      var code = MA.fmt.airlineCode(callsign);
      return code && AIRLINES[code] ? AIRLINES[code] : '';
    },

    typeName: function (type, desc) {
      if (type && TYPES[type]) return TYPES[type];
      if (type) return type;
      return desc || '';
    },

    isAirbusSpecial: function (ac) {
      var cs = ac.callsign || '';
      return ac.type === 'A3ST' || ac.type === 'A337' || /^(AIB|BGA)/.test(cs);
    },

    isRotorcraft: function (ac) {
      return ac.category === 'A7' ||
        /^(EC\d\d|H1\d\d|H160|AS\d\d|R22|R44|R66|B06|B407|A109|A119|A139|A169|A189|S76|S92|NH90)$/.test(ac.type || '');
    },

    // altitude (ft input) split into LED value and unit line
    alt: function (ft, units) {
      if (ft === null || ft === undefined) return { val: '-----', unit: '' };
      if (units === 'm') return { val: thousands(Math.round(ft * 0.3048 / 10) * 10), unit: 'm' };
      if (ft >= 18000) return { val: 'FL' + ('00' + Math.round(ft / 100)).slice(-3), unit: 'Flugfläche' };
      return { val: thousands(Math.round(ft / 50) * 50), unit: 'ft' };
    },

    altShort: function (ft) {
      if (ft === null || ft === undefined) return '';
      if (ft >= 18000) return 'FL' + Math.round(ft / 100);
      return (Math.round(ft / 100) / 10).toFixed(1) + 'k';
    },

    vs: function (fpm) {
      if (fpm === null || fpm === undefined) return '';
      if (fpm > 300) return '↑ ' + thousands(Math.abs(fpm)) + '/min';
      if (fpm < -300) return '↓ ' + thousands(Math.abs(fpm)) + '/min';
      return '→ Reiseflug';
    },

    phase: function (ac) {
      if (ac.vrate > 300) return 'up';
      if (ac.vrate < -300) return 'down';
      return 'level';
    },

    compass: function (deg) {
      return COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
    },

    km: function (km) {
      return km < 10 ? km.toFixed(1).replace('.', ',') : String(Math.round(km));
    },

    kmh: function (kt) {
      return Math.round(kt * 1.852);
    }
  };
})(window.MA);
