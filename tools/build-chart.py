#!/usr/bin/env python3
"""Builds data/chart-features.js for the optional chart background (chartbg=1, js/chart.js).

Sources (see THIRD_PARTY.md):
  - Airspaces and tall obstacles: OpenAIP public data exports (https://www.openaip.net/data/exports),
    licence CC BY-NC 4.0 (attribution is shown in the app; the app itself stays free of charge).
  - Navaids (VOR, NDB, DME) and airport magnetic variation: OurAirports navaids.csv, public domain.
  - Airport positions: OurAirports airports.csv, public domain.

Nothing here is copied from an aeronautical chart. Only the open data above is used; the drawing is ours.
The output is committed, so the viewer never calls a third party.

Limits: airspaces and navaids within RADIUS_KM of each airport in AIRPORTS, for the countries in COUNTRIES.
Usage: python3 tools/build-chart.py [cache_dir]
"""
import csv
import json
import math
import os
import sys
import urllib.request

OPENAIP = 'https://s3.openaip.net/openaip-system-exports/'
OURAIRPORTS = 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/'

# Airports of the app (same as tools/build-geo.py): ICAO codes.
AIRPORTS = ['EDDH', 'EDDF', 'EDDG', 'EKCH']
COUNTRIES = ['de', 'dk', 'nl', 'se']         # OpenAIP country files; the neighbours matter near Münster and Copenhagen
RADIUS_KM = 75.0
SIMPLIFY_KM = 0.2                            # Douglas-Peucker tolerance: about 1 px at the 200 km maximum radius
OBSTACLE_MIN_M = 150                         # tall obstacles only: the chart would fill up with wind turbines otherwise
MAX_BYTES = 150 * 1024

# OpenAIP airspace type -> chart class (see the enum in the OpenAIP API schema).
CLASS_OF_TYPE = {
    4: ('ctl', 'CTR'), 7: ('ctl', 'TMA'), 26: ('ctl', 'CTA'), 13: ('ctl', 'ATZ'), 14: ('ctl', 'MATZ'),
    5: ('ctl', 'TMZ'), 6: ('ctl', 'RMZ'), 23: ('ctl', 'TIZ'), 24: ('ctl', 'TIA'), 34: ('ctl', 'LTA'),
    35: ('ctl', 'UTA'), 36: ('ctl', 'MCTR'),
    1: ('res', 'R'), 8: ('res', 'TRA'), 9: ('res', 'TSA'), 25: ('res', 'MTA'), 17: ('res', 'ALERT'), 18: ('res', 'WARN'),
    2: ('dng', 'D'),
    3: ('pro', 'P'),
    19: ('oth', 'PROT'), 28: ('oth', 'PARA'), 29: ('oth', 'LOR'), 32: ('oth', 'VFR'), 0: ('oth', ''),
}
# Left out on purpose: FIR/UIR/ADIZ (very large), gliding sectors (dozens of small ones, clutter), airways and
# military routes (lines, not areas), ACC, FIS, TFR.

NAV_TYPES = {'VOR': 'VOR', 'VOR-DME': 'VOR', 'VORTAC': 'VOR', 'TACAN': 'VOR', 'DVOR': 'VOR', 'DVOR-DME': 'VOR',
             'DVORTAC': 'VOR', 'NDB': 'NDB', 'NDB-DME': 'NDB', 'DME': 'DME'}


def fetch(url, cache):
    path = os.path.join(cache, url.rsplit('/', 1)[1])
    if not os.path.exists(path):
        print('download', url, file=sys.stderr)
        with urllib.request.urlopen(url, timeout=300) as r, open(path, 'wb') as f:
            f.write(r.read())
    return path


def km_per_deg(lat):
    return 110.574, 111.32 * math.cos(math.radians(lat))


def to_km(p, ref):
    """[lat, lon] -> planar km around ref."""
    ky, kx = km_per_deg(ref[0])
    return ((p[1] - ref[1]) * kx, (p[0] - ref[0]) * ky)


def seg_dist(p, a, b):
    """Distance in km from point p to segment a-b (all [lat, lon])."""
    x, y = to_km(p, p)
    ax, ay = to_km(a, p)
    bx, by = to_km(b, p)
    dx, dy = bx - ax, by - ay
    l2 = dx * dx + dy * dy
    t = 0 if l2 == 0 else max(0, min(1, -(ax * dx + ay * dy) / l2))
    return math.hypot(ax + dx * t, ay + dy * t)


def near_any(ring, centres):
    """True if a [lat, lon] ring comes within RADIUS_KM of any centre, or a centre lies inside it."""
    for c in centres:
        for i in range(len(ring) - 1):
            if seg_dist(c, ring[i], ring[i + 1]) <= RADIUS_KM:
                return True
        if point_in_ring(c, ring):
            return True
    return False


def point_in_ring(p, ring):
    inside = False
    lat, lon = p
    for i in range(len(ring) - 1):
        a, b = ring[i], ring[i + 1]
        if (a[0] > lat) != (b[0] > lat):
            x = a[1] + (lat - a[0]) * (b[1] - a[1]) / (b[0] - a[0])
            if lon < x:
                inside = not inside
    return inside


def simplify(pts, tol):
    """Douglas-Peucker on [lat, lon] points, tolerance in km."""
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    best, idx = 0, 0
    for i in range(1, len(pts) - 1):
        d = seg_dist(pts[i], a, b) if a != b else math.hypot(*to_km(pts[i], a))
        if d > best:
            best, idx = d, i
    if best <= tol:
        return [a, b]
    return simplify(pts[:idx + 1], tol)[:-1] + simplify(pts[idx:], tol)


def limit_text(lim):
    """OpenAIP limit {value, unit, referenceDatum} -> short chart text."""
    if not lim:
        return ''
    v, unit, ref = lim.get('value') or 0, lim.get('unit'), lim.get('referenceDatum')
    if unit == 6:                       # flight level
        return 'FL%03d' % int(v)
    if v == 0 and ref == 0:
        return 'SFC'
    if unit == 1:                       # feet
        return '%d ft%s' % (int(v), ' GND' if ref == 0 else '')
    return '%d m%s' % (int(v), ' GND' if ref == 0 else '')


def rnd(v):
    return round(v, 4)


def main():
    cache = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '.cache')
    os.makedirs(cache, exist_ok=True)

    with open(fetch(OURAIRPORTS + 'airports.csv', cache), encoding='utf-8') as f:
        ap_rows = {r['ident']: r for r in csv.DictReader(f)}
    centres = [[float(ap_rows[i]['latitude_deg']), float(ap_rows[i]['longitude_deg'])] for i in AIRPORTS]
    ap_out = []
    for icao in AIRPORTS:
        r = ap_rows[icao]
        ap_out.append({'icao': icao, 'lat': rnd(float(r['latitude_deg'])), 'lon': rnd(float(r['longitude_deg'])), 'name': r['name']})

    # --- navaids (OurAirports, public domain) and magnetic variation per airport
    navs, decl = [], {}
    with open(fetch(OURAIRPORTS + 'navaids.csv', cache), encoding='utf-8') as f:
        for r in csv.DictReader(f):
            if r['iso_country'].lower() not in COUNTRIES or r['type'] not in NAV_TYPES or not r['latitude_deg']:
                continue
            p = [float(r['latitude_deg']), float(r['longitude_deg'])]
            if not any(seg_dist(p, c, c) <= RADIUS_KM for c in centres):
                continue
            kind = NAV_TYPES[r['type']]
            if kind == 'NDB':
                freq = '%d kHz' % int(float(r['frequency_khz'] or 0))
            elif kind == 'VOR':
                freq = '%.2f' % (float(r['frequency_khz'] or 0) / 1000.0)
            else:
                freq = ''                  # DME: the paired frequency is not shown
            if r['magnetic_variation_deg']:
                # the declination of the navaid nearest to each airport is used for the magnetic marker
                for ai, c in enumerate(centres):
                    dd = seg_dist(p, c, c)
                    key = AIRPORTS[ai]
                    if dd <= 30 and (key not in decl or dd < decl[key][1]):
                        decl[key] = (float(r['magnetic_variation_deg']), dd)
            navs.append({'id': r['ident'], 'k': r['type'], 'g': kind, 'f': freq.replace('.', ','),
                         'lat': rnd(p[0]), 'lon': rnd(p[1])})
    for a in ap_out:
        a['decl'] = round(decl[a['icao']][0], 2) if a['icao'] in decl else 0

    # --- airspaces and tall obstacles (OpenAIP exports)
    air = []
    seen = set()
    obst = []
    for cc in COUNTRIES:
        with open(fetch(OPENAIP + cc + '_asp.geojson', cache), encoding='utf-8') as f:
            feats = json.load(f)['features']
        for ft in feats:
            pr = ft['properties']
            cls = CLASS_OF_TYPE.get(pr.get('type'))
            if not cls or ft['geometry']['type'] != 'Polygon':
                continue
            ring = [[c[1], c[0]] for c in ft['geometry']['coordinates'][0]]
            if not near_any(ring, centres):
                continue
            key = (pr.get('name'), pr.get('type'), ring[0][0], ring[0][1], len(ring))
            if key in seen:
                continue
            seen.add(key)
            pts = simplify(ring, SIMPLIFY_KM)
            if len(pts) < 4:
                continue
            name = (pr.get('name') or '').strip()
            name = name[:28] if name else cls[1]
            air.append({'n': name, 't': cls[0], 'c': cls[1], 'hi': limit_text(pr.get('upperLimit')),
                        'lo': limit_text(pr.get('lowerLimit')),
                        'p': [[rnd(p[0]), rnd(p[1])] for p in pts]})
        with open(fetch(OPENAIP + cc + '_obs.geojson', cache), encoding='utf-8') as f:
            for ft in json.load(f)['features']:
                el = (ft['properties'].get('elevation') or {})
                h = el.get('value') or 0
                if el.get('unit', 0) != 0 or h < OBSTACLE_MIN_M:
                    continue
                lon, lat = ft['geometry']['coordinates']
                if not any(seg_dist([lat, lon], c, c) <= RADIUS_KM for c in centres):
                    continue
                obst.append([rnd(lat), rnd(lon), int(h)])

    doc = {'src': {'airspace': 'OpenAIP (CC BY-NC 4.0)', 'navaid': 'OurAirports (public domain)'},
           'airports': ap_out, 'navaids': navs, 'airspaces': air, 'obstacles': obst}
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'chart-features.js')
    body = json.dumps(doc, ensure_ascii=False, separators=(',', ':'))
    with open(out, 'w', encoding='utf-8') as f:
        f.write('/* Generated by tools/build-chart.py - do not edit by hand.\n'
                '   Airspaces and obstacles: OpenAIP, CC BY-NC 4.0 (https://www.openaip.net). Navaids and airports: OurAirports, public domain.\n'
                '   Simplified on purpose: a background for the radar, not a navigation chart. */\n'
                'window.MA = window.MA || {};\n\nMA.chartData = ' + body + ';\n')
    size = os.path.getsize(out)
    print('wrote', out, size, 'bytes;', len(air), 'airspaces,', len(navs), 'navaids,', len(obst), 'obstacles',
          file=sys.stderr)
    if size > MAX_BYTES:
        sys.exit('chart-features.js is %d bytes, above the %d limit' % (size, MAX_BYTES))


if __name__ == '__main__':
    main()
