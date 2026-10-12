#!/usr/bin/env python3
"""Builds data/airport-detail.js: aprons, taxiways, taxilanes, runways,
terminals, hangars, gates, stands and helipads around the airports of
data/geo-features.js, from OpenStreetMap (c) OpenStreetMap contributors, ODbL.

Usage: python3 -I tools/build-airport-detail.py [cache_dir] [--only HAM,FRA]

Data source: the OSM editing API (https://api.openstreetmap.org/api/0.6/map),
because Overpass is not reachable from every build machine. API etiquette:
 - descriptive User-Agent, at least 1.5 s between requests, retries with
   back-off, no parallel requests;
 - a bbox answers at most 50000 nodes ('400 too many nodes'); such tiles are
   split into four and fetched again;
 - every raw tile is stored in cache_dir (default: $MA_OSM_CACHE or
   ~/.cache/myairspace-osm), so re-runs are fully offline. Delete the
   directory to refresh. The cache is never committed.
A first run needs on the order of 150 requests for all five airports.
"""
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

API = 'https://api.openstreetmap.org/api/0.6/map?bbox=%s'
UA = 'MyAirspace-build/1.0 (+https://github.com/kdniem/MyAirspace)'
SLEEP = 1.6
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'airport-detail.js')

# code: (ICAO, ref lat, ref lon, half lat, half lon, keep radius km)
AIRPORTS = {
    'HAM': ('EDDH', 53.6304, 9.9882, 0.045, 0.075, 4.2),
    'XFW': ('EDHI', 53.5353, 9.8356, 0.045, 0.075, 3.6),
    'FRA': ('EDDF', 50.0267, 8.5584, 0.060, 0.100, 6.5),
    'FMO': ('EDDG', 52.1338, 7.6885, 0.045, 0.075, 3.8),
    'CPH': ('EKCH', 55.6179, 12.6560, 0.060, 0.100, 5.0),
}
TOL_M = 2.0
MIN_AREA_M2 = 50.0
MIN_LINE_M = 12.0
TILE = 0.03
MAX_BYTES = 120 * 1024
KINDS = ('apron', 'taxiway', 'taxilane', 'runway', 'terminal', 'hangar', 'gate', 'stand', 'helipad')


def log(*a):
    print(*a, file=sys.stderr)


# --- download ---------------------------------------------------------------
def fetch(bbox, cache):
    key = 'tile_%.5f_%.5f_%.5f_%.5f.osm' % bbox
    path = os.path.join(cache, key)
    if os.path.exists(path):
        return [path]
    url = API % ('%.5f,%.5f,%.5f,%.5f' % bbox)
    for attempt in range(5):
        time.sleep(SLEEP)
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
            with open(path + '.part', 'wb') as f:
                f.write(data)
            os.replace(path + '.part', path)
            log('fetched', key, len(data) // 1024, 'KB')
            return [path]
        except urllib.error.HTTPError as e:
            if e.code == 400:  # too many nodes -> split into four
                w, s, e2, n = bbox
                mx, my = (w + e2) / 2, (s + n) / 2
                out = []
                for b in ((w, s, mx, my), (mx, s, e2, my), (w, my, mx, n), (mx, my, e2, n)):
                    out += fetch(tuple(round(v, 5) for v in b), cache)
                return out
            log('HTTP', e.code, key, 'retry')
            time.sleep(5 * (attempt + 1))
        except Exception as e:  # network hiccup
            log('error', e, key, 'retry')
            time.sleep(5 * (attempt + 1))
    raise SystemExit('giving up on ' + key)


def tiles(lat, lon, hl, ho):
    out = []
    y = lat - hl
    while y < lat + hl - 1e-9:
        x = lon - ho
        while x < lon + ho - 1e-9:
            out.append((round(x, 5), round(y, 5), round(min(x + TILE, lon + ho), 5),
                        round(min(y + TILE, lat + hl), 5)))
            x += TILE
        y += TILE
    return out


# --- geometry ---------------------------------------------------------------
def dp(pts, tol):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if L == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
                d = math.hypot(px - ax - t * dx, py - ay - t * dy)
            if d > best:
                best, bi = d, i
        if best > tol:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]


def area(pts):
    s = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2


def length(pts):
    return sum(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(len(pts) - 1))


# --- OSM parsing ------------------------------------------------------------
def parse(paths):
    nodes, ways, rels = {}, {}, {}
    for p in paths:
        for _, el in ET.iterparse(p, events=('end',)):
            t = el.tag
            if t == 'node':
                tags = {c.get('k'): c.get('v') for c in el.findall('tag')}
                nodes[el.get('id')] = (float(el.get('lat')), float(el.get('lon')), tags)
            elif t == 'way':
                ways[el.get('id')] = ([n.get('ref') for n in el.findall('nd')],
                                      {c.get('k'): c.get('v') for c in el.findall('tag')})
            elif t == 'relation':
                tags = {c.get('k'): c.get('v') for c in el.findall('tag')}
                if tags.get('type') == 'multipolygon':
                    rels[el.get('id')] = ([(m.get('ref'), m.get('role')) for m in el.findall('member')
                                           if m.get('type') == 'way'], tags)
            else:
                continue
            el.clear()
    return nodes, ways, rels


def join_rings(segs):
    """Merge open node-id lists into closed rings."""
    segs = [list(s) for s in segs if len(s) > 1]
    rings = []
    while segs:
        cur = segs.pop()
        while cur[0] != cur[-1]:
            for i, s in enumerate(segs):
                if s[0] == cur[-1]:
                    cur += s[1:]
                elif s[-1] == cur[-1]:
                    cur += s[::-1][1:]
                elif s[-1] == cur[0]:
                    cur = s[:-1] + cur
                elif s[0] == cur[0]:
                    cur = s[::-1][:-1] + cur
                else:
                    continue
                segs.pop(i)
                break
            else:
                break
        if cur[0] == cur[-1] and len(cur) >= 4:
            rings.append(cur)
    return rings


def classify(tags):
    a = tags.get('aeroway')
    b = tags.get('building')
    if a in ('apron', 'taxiway', 'taxilane', 'runway', 'gate', 'helipad'):
        return a
    if a == 'terminal' or b == 'terminal':
        return 'terminal'
    if a == 'hangar' or b == 'hangar':
        return 'hangar'
    if a == 'parking_position':
        return 'stand'
    return None


def build(code, nodes, ways, rels):
    icao, rlat, rlon, _, _, radius = AIRPORTS[code]
    kx, ky = 111320.0 * math.cos(math.radians(rlat)), 110540.0

    def xy(nid):
        n = nodes.get(nid)
        return None if n is None else ((n[1] - rlon) * kx, (n[0] - rlat) * ky)

    def near(x, y):
        return math.hypot(x, y) <= radius * 1000

    def ll(p):
        return [round(rlat + p[1] / ky, 5), round(rlon + p[0] / kx, 5)]

    res = {k: [] for k in KINDS}

    def centroid(pts):
        return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)

    def add_poly(kind, ring_ids, tags):
        pts = [xy(i) for i in ring_ids]
        if any(p is None for p in pts) or area(pts) < MIN_AREA_M2:
            return
        if not near(*centroid(pts)):
            return
        s = dp(pts[:-1], TOL_M)
        if len(s) < 3 or area(s) < MIN_AREA_M2:
            return
        poly = [ll(p) for p in s]
        name = tags.get('name') or ''
        if kind == 'apron':
            res['apron'].append(poly)
        elif kind == 'runway':
            res['runway'].append({'ref': tags.get('ref', ''), 'poly': poly})
        else:
            res[kind].append({'name': name, 'poly': poly} if name else {'poly': poly})

    for rid, (members, tags) in rels.items():
        kind = classify(tags)
        if kind not in ('apron', 'terminal', 'hangar'):
            continue
        outer = [ways[w][0] for w, role in members if role in ('outer', '') and w in ways]
        for ring in join_rings(outer):
            add_poly(kind, ring, tags)

    for wid, (nds, tags) in ways.items():
        kind = classify(tags)
        if not kind:
            continue
        closed = len(nds) >= 4 and nds[0] == nds[-1]
        if kind in ('apron', 'terminal', 'hangar'):
            if closed:
                add_poly(kind, nds, tags)
        elif kind in ('taxiway', 'taxilane', 'runway'):
            if closed and kind == 'runway' and tags.get('area') == 'yes':
                add_poly(kind, nds, tags)
                continue
            pts = [xy(i) for i in nds]
            if any(p is None for p in pts) or not near(*centroid(pts)):
                continue
            s = dp(pts, TOL_M)
            if length(s) < MIN_LINE_M:
                continue
            item = {'ref': tags.get('ref', ''), 'pts': [ll(p) for p in s]}
            if kind != 'runway' and not item['ref']:
                del item['ref']
            res[kind].append(item)
        else:  # gate, stand, helipad given as way
            pts = [xy(i) for i in nds]
            if any(p is None for p in pts):
                continue
            c = centroid(pts)
            if near(*c):
                res[kind].append({'ref': tags.get('ref') or tags.get('name') or '', 'p': ll(c)})

    for nid, (lat, lon, tags) in nodes.items():
        kind = classify(tags)
        if kind not in ('gate', 'stand', 'helipad'):
            continue
        if near((lon - rlon) * kx, (lat - rlat) * ky):
            res[kind].append({'ref': tags.get('ref') or tags.get('name') or '',
                              'p': [round(lat, 5), round(lon, 5)]})

    for k in ('gate', 'stand', 'helipad'):
        uniq, keys = [], set()
        for it in res[k]:
            key = (it['ref'], tuple(it['p']))
            if key in keys:
                continue
            keys.add(key)
            if not it['ref']:
                it = {'p': it['p']}
            uniq.append(it)
        res[k] = uniq
    return res


def dump(d):
    return json.dumps(d, separators=(',', ':'), ensure_ascii=False)


def shrink(code, res):
    """Trim to MAX_BYTES: longest taxilanes kept first, then unnamed stands go."""
    def size():
        return len(dump(res).encode('utf-8'))
    if size() > MAX_BYTES and res['taxilane']:
        res['taxilane'].sort(key=lambda t: -len(t['pts']))
        while size() > MAX_BYTES and res['taxilane']:
            res['taxilane'] = res['taxilane'][:int(len(res['taxilane']) * 0.85)]
    if size() > MAX_BYTES:
        res['stand'] = [s for s in res['stand'] if s.get('ref')]
    if size() > MAX_BYTES:
        log('WARNING', code, 'still above target:', size())


def main():
    args = sys.argv[1:]
    only = None
    if '--only' in args:
        i = args.index('--only')
        only = args[i + 1].split(',')
        del args[i:i + 2]
    cache = args[0] if args else os.environ.get('MA_OSM_CACHE') or os.path.expanduser('~/.cache/myairspace-osm')
    os.makedirs(cache, exist_ok=True)
    out = {}
    for code, (icao, rlat, rlon, hl, ho, radius) in AIRPORTS.items():
        if only and code not in only:
            continue
        paths = []
        for b in tiles(rlat, rlon, hl, ho):
            paths += fetch(b, cache)
        nodes, ways, rels = parse(sorted(set(paths)))
        res = build(code, nodes, ways, rels)
        shrink(code, res)
        out[code] = res
        log(code, {k: len(v) for k, v in res.items()}, len(dump(res).encode('utf-8')) // 1024, 'KB')
    if only:  # keep the other airports from the existing file
        try:
            txt = open(OUT, encoding='utf-8').read()
            old = json.loads(txt[txt.index('MA.airportDetail = ') + 19:].rstrip().rstrip(';'))
            old.update(out)
            out = old
        except Exception:
            pass
    head = ('/* Generated by tools/build-airport-detail.py - do not edit by hand.\n'
            '   Data (c) OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright).\n'
            '   Regenerate: python3 -I tools/build-airport-detail.py [cache_dir]\n'
            '   Coordinates [lat, lon], 5 decimals, simplified (~2 m). Not for navigation. */\n'
            'window.MA = window.MA || {};\n\n')
    body = 'MA.airportDetail = {' + ','.join('"%s":%s' % (k, dump(out[k])) for k in AIRPORTS if k in out) + '};\n'
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(head + body)
    log('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')


if __name__ == '__main__':
    main()
