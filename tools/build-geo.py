#!/usr/bin/env python3
"""Builds data/geo-features.js: runways from OurAirports, rivers / coasts /
lakes from Natural Earth (both public domain), clipped around the
airports listed in AREAS. Hamburg keeps its hand-drawn Elbe, Alster and town
list (more detailed than Natural Earth at this scale).

Usage: python3 tools/build-geo.py [cache_dir]
"""
import csv
import io
import json
import math
import os
import sys
import urllib.request

OURAIRPORTS = 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/'
NATURAL_EARTH = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/'

# Airports shown on the map: ICAO, display code, name.
AIRPORTS = [
    ('EDDH', 'HAM', 'Hamburg'),
    ('EDHI', 'XFW', 'Finkenwerder'),
    ('EDDF', 'FRA', 'Frankfurt'),
    ('EDDG', 'FMO', 'Münster/Osnabrück'),
    ('EKCH', 'CPH', 'Kopenhagen'),
]

# Areas that get Natural Earth water: centre ICAO, half extent in degrees.
AREAS = [('EDDF', 1.0, 1.6), ('EDDG', 1.0, 1.6), ('EKCH', 1.0, 1.6)]

SIMPLIFY_KM = 0.1

# --- Hamburg, hand-drawn: [lat, lon, widthKm] ---------------------------------
HAMBURG_WATER = [
    {'name': 'Elbe', 'kind': 'river', 'pts': [
        [53.79, 9.41, 2.6], [53.70, 9.46, 2.4], [53.64, 9.52, 2.2], [53.605, 9.58, 2.0],
        [53.583, 9.66, 1.8], [53.566, 9.73, 1.6], [53.557, 9.79, 1.0], [53.548, 9.84, 0.7],
        [53.545, 9.89, 0.55], [53.544, 9.93, 0.5], [53.543, 9.96, 0.45], [53.540, 9.99, 0.4],
        [53.534, 10.02, 0.35], [53.525, 10.04, 0.3], [53.505, 10.06, 0.3], [53.47, 10.07, 0.3],
        [53.445, 10.10, 0.35], [53.425, 10.17, 0.35], [53.41, 10.25, 0.35], [53.42, 10.33, 0.35],
        [53.43, 10.39, 0.35]]},
    {'name': 'Süderelbe', 'kind': 'river', 'pts': [
        [53.46, 10.07, 0.3], [53.475, 10.0, 0.3], [53.49, 9.96, 0.3], [53.51, 9.92, 0.3],
        [53.53, 9.88, 0.35], [53.542, 9.86, 0.4]]},
    {'name': 'Alster', 'kind': 'lake', 'closed': True, 'pts': [
        [53.555, 10.000, 0.1], [53.560, 10.008, 0.1], [53.572, 10.012, 0.1],
        [53.576, 10.006, 0.1], [53.569, 9.999, 0.1], [53.558, 9.996, 0.1]]},
]

# Towns around the other airports (Natural Earth's places are too sparse at this scale).
AREA_PLACES = [
    # Frankfurt
    ('Frankfurt', 50.1109, 8.6821, True), ('Offenbach', 50.1006, 8.7665), ('Darmstadt', 49.8728, 8.6512),
    ('Rüsselsheim', 49.9897, 8.4231), ('Mainz', 50.0012, 8.2763), ('Wiesbaden', 50.0782, 8.2398),
    ('Hanau', 50.1328, 8.9169), ('Bad Homburg', 50.2268, 8.6182), ('Langen', 49.9938, 8.6694),
    ('Neu-Isenburg', 50.0533, 8.6948), ('Kelsterbach', 50.0611, 8.5306), ('Mörfelden', 49.9775, 8.5672),
    ('Groß-Gerau', 49.9214, 8.4818), ('Eschborn', 50.1436, 8.5711), ('Höchst', 50.0995, 8.5414),
    # Münster/Osnabrück
    ('Münster', 51.9607, 7.6261, True), ('Osnabrück', 52.2799, 8.0472, True), ('Greven', 52.0917, 7.6086),
    ('Emsdetten', 52.1728, 7.5276), ('Lengerich', 52.1871, 7.8661), ('Ladbergen', 52.1367, 7.7397),
    ('Tecklenburg', 52.2194, 7.8128), ('Ibbenbüren', 52.2774, 7.7166), ('Rheine', 52.2806, 7.4406),
    ('Telgte', 51.9819, 7.7856), ('Saerbeck', 52.1739, 7.6339), ('Westerkappeln', 52.3156, 7.8781),
    ('Nordwalde', 52.0833, 7.4833),
    # Kopenhagen
    ('København', 55.6761, 12.5683, True), ('Malmö', 55.6050, 13.0038, True), ('Dragør', 55.5936, 12.6714),
    ('Kastrup', 55.6345, 12.6406), ('Ørestad', 55.6290, 12.5790), ('Hvidovre', 55.6573, 12.4743),
    ('Hellerup', 55.7310, 12.5700), ('Brøndby', 55.6500, 12.4200),
    ('Ishøj', 55.6150, 12.3510), ('Taastrup', 55.6500, 12.2930), ('Lund', 55.7047, 13.1910),
    ('Vellinge', 55.4717, 13.0217), ('Køge', 55.4580, 12.1821),
]

HAMBURG_PLACES = [
    ('Hamburg', 53.5511, 9.9937, True), ('Altona', 53.5503, 9.9350), ('Norderstedt', 53.7064, 10.0105),
    ('Pinneberg', 53.6603, 9.7990), ('Quickborn', 53.7290, 9.9040), ('Ahrensburg', 53.6747, 10.2411),
    ('Wedel', 53.5800, 9.6990), ('Harburg', 53.4600, 9.9830), ('Bergedorf', 53.4880, 10.2130),
    ('Buxtehude', 53.4770, 9.7010), ('Stade', 53.5990, 9.4760), ('Elmshorn', 53.7530, 9.6520),
    ('Henstedt-Ulzburg', 53.7900, 9.9800), ('Bad Oldesloe', 53.8110, 10.3740),
    ('Geesthacht', 53.4370, 10.3780), ('Lüneburg', 53.2490, 10.4140), ('Buchholz', 53.3270, 9.8680),
    ('Reinbek', 53.5100, 10.2480), ('Glinde', 53.5420, 10.2100),
]


def fetch(url, cache):
    path = os.path.join(cache, url.rsplit('/', 1)[1])
    if not os.path.exists(path):
        print('download', url, file=sys.stderr)
        with urllib.request.urlopen(url, timeout=120) as r, open(path, 'wb') as f:
            f.write(r.read())
    return path


def km(a, b):
    lat = math.radians((a[0] + b[0]) / 2)
    return math.hypot((a[0] - b[0]) * 110.574, (a[1] - b[1]) * 111.32 * math.cos(lat))


def simplify(pts, tol):
    """Douglas-Peucker on [lat, lon] points, tolerance in km."""
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    ab = km(a, b)
    best, idx = 0, 0
    for i in range(1, len(pts) - 1):
        p = pts[i]
        if ab == 0:
            d = km(a, p)
        else:  # distance of p to line a-b (Heron)
            s1, s2 = km(a, p), km(p, b)
            s = (ab + s1 + s2) / 2
            d = 2 * math.sqrt(max(0, s * (s - ab) * (s - s1) * (s - s2))) / ab
        if d > best:
            best, idx = d, i
    if best <= tol:
        return [a, b]
    return simplify(pts[:idx + 1], tol)[:-1] + simplify(pts[idx:], tol)


def clip_runs(coords, box):
    """Split a [lon, lat] line into runs of points inside box (keeping one point beyond)."""
    s, n, w, e = box
    inside = [s <= c[1] <= n and w <= c[0] <= e for c in coords]
    runs, cur = [], []
    for i, c in enumerate(coords):
        near = inside[i] or (i > 0 and inside[i - 1]) or (i + 1 < len(coords) and inside[i + 1])
        if near:
            cur.append([c[1], c[0]])
        elif cur:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    return [r for r in runs if len(r) > 1]


def lines_of(geom):
    t, c = geom['type'], geom['coordinates']
    if t == 'LineString':
        return [c]
    if t == 'MultiLineString':
        return c
    if t == 'Polygon':
        return c[:1]
    if t == 'MultiPolygon':
        return [p[0] for p in c]
    return []


def rnd(v):
    return round(v, 4)


def main():
    cache = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '.cache')
    os.makedirs(cache, exist_ok=True)

    with open(fetch(OURAIRPORTS + 'airports.csv', cache), encoding='utf-8') as f:
        ap_rows = {r['ident']: r for r in csv.DictReader(f)}
    with open(fetch(OURAIRPORTS + 'runways.csv', cache), encoding='utf-8') as f:
        rw_rows = [r for r in csv.DictReader(f) if r['closed'] == '0' and r['le_latitude_deg']]

    airports = []
    for icao, code, name in AIRPORTS:
        a = ap_rows[icao]
        rws = []
        for r in rw_rows:
            if r['airport_ident'] != icao:
                continue
            rws.append({
                'id': r['le_ident'] + '/' + r['he_ident'],
                'a': [rnd(float(r['le_latitude_deg'])), rnd(float(r['le_longitude_deg']))],
                'b': [rnd(float(r['he_latitude_deg'])), rnd(float(r['he_longitude_deg']))],
            })
        airports.append({'code': code, 'icao': icao, 'name': name,
                         'lat': rnd(float(a['latitude_deg'])), 'lon': rnd(float(a['longitude_deg'])),
                         'runways': rws})

    boxes = []
    for icao, dlat, dlon in AREAS:
        a = ap_rows[icao]
        lat, lon = float(a['latitude_deg']), float(a['longitude_deg'])
        boxes.append((lat - dlat, lat + dlat, lon - dlon, lon + dlon))

    water = list(HAMBURG_WATER)
    sources = [
        ('ne_10m_rivers_europe.geojson', 'river'),
        ('ne_10m_rivers_lake_centerlines.geojson', 'river'),
        ('ne_10m_coastline.geojson', 'coast'),
        ('ne_10m_lakes.geojson', 'lake'),
    ]
    seen = set()
    for fname, kind in sources:
        with open(fetch(NATURAL_EARTH + fname, cache), encoding='utf-8') as f:
            data = json.load(f)
        for feat in data['features']:
            props = feat.get('properties') or {}
            name = props.get('name') or props.get('name_en') or ''
            rank = props.get('scalerank') or 10
            width = {'river': 0.4 if rank <= 5 else 0.22, 'coast': 0.12, 'lake': 0.1}[kind]
            for line in lines_of(feat['geometry']):
                for box in boxes:
                    for run in clip_runs(line, box):
                        pts = simplify(run, SIMPLIFY_KM)
                        key = (kind, rnd(pts[0][0]), rnd(pts[0][1]), rnd(pts[-1][0]), rnd(pts[-1][1]), len(pts))
                        if len(pts) < 2 or key in seen:
                            continue
                        seen.add(key)
                        item = {'name': name, 'kind': kind,
                                'pts': [[rnd(p[0]), rnd(p[1]), width] for p in pts]}
                        if kind == 'lake' and km(pts[0], pts[-1]) < 0.5:
                            item['closed'] = True
                        water.append(item)

    places = [dict(name=p[0], lat=p[1], lon=p[2], **({'major': True} if len(p) > 3 else {}))
              for p in HAMBURG_PLACES + AREA_PLACES]

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'geo-features.js')
    with open(out, 'w', encoding='utf-8') as f:
        f.write('/* Generated by tools/build-geo.py - do not edit by hand.\n'
                '   Runways: OurAirports. Water outside Hamburg: Natural Earth.\n'
                '   Both public domain. Simplified on purpose: an ambient display, not a chart. */\n'
                'window.MA = window.MA || {};\n\nMA.features = ')
        json.dump({'airports': airports, 'water': water, 'places': places}, f,
                  ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    print('wrote', out, os.path.getsize(out), 'bytes;', len(water), 'water lines,', len(places), 'places',
          file=sys.stderr)


if __name__ == '__main__':
    main()
