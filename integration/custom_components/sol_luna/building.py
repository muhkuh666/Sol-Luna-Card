"""3D-Gebäudemodell (LoD2) aus CityJSON lesen – z. B. Geobasis NRW (OGC API 3dg)."""
from __future__ import annotations

import json
from math import cos, radians
from typing import Any

# OGC API Features NRW – Gebäude als CityJSON, Abfrage per bbox (CRS84, Grad)
NRW_URL = (
    "https://ogc-api.nrw.de/3dg/v1/collections/building/items"
    "?f=cityjson&limit=50&bbox={w:.6f},{s:.6f},{e:.6f},{n:.6f}"
)


def _docs(raw: str | bytes) -> list[dict[str, Any]]:
    """CityJSON-Dokument oder CityJSONSeq (eine JSON-Zeile pro Feature) einlesen."""
    text = raw.decode("utf-8") if isinstance(raw, bytes) else raw
    text = text.strip()
    try:
        return [json.loads(text)]
    except json.JSONDecodeError:
        return [json.loads(line) for line in text.splitlines() if line.strip()]


def _point_in_poly(x: float, y: float, poly: list[tuple[float, float]]) -> bool:
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def _surfaces(geom: dict[str, Any]) -> list[tuple[list[int], str]]:
    """Alle Außenringe einer CityJSON-Geometrie mit Semantik (RoofSurface/WallSurface/GroundSurface)."""
    out: list[tuple[list[int], str]] = []
    gtype = geom.get("type")
    bnd = geom.get("boundaries", [])
    sem = geom.get("semantics") or {}
    stypes = [s.get("type", "") for s in sem.get("surfaces", [])]
    values = sem.get("values")

    def kind(idx: Any) -> str:
        return stypes[idx] if isinstance(idx, int) and 0 <= idx < len(stypes) else ""

    if gtype in ("MultiSurface", "CompositeSurface"):
        for i, surf in enumerate(bnd):
            out.append((surf[0], kind(values[i] if values else None)))
    elif gtype == "Solid":
        for s_i, shell in enumerate(bnd):
            for i, surf in enumerate(shell):
                v = values[s_i][i] if values else None
                out.append((surf[0], kind(v)))
    elif gtype in ("MultiSolid", "CompositeSolid"):
        for so_i, solid in enumerate(bnd):
            for s_i, shell in enumerate(solid):
                for i, surf in enumerate(shell):
                    v = values[so_i][s_i][i] if values else None
                    out.append((surf[0], kind(v)))
    return out


def parse_building(raw: str | bytes, lat: float, lon: float) -> dict[str, Any] | None:
    """Gebäude am Standort (oder das nächstgelegene) als Flächen in lokalen Metern liefern.

    Ergebnis: {"faces": [{"t": "r"|"w"|"g", "p": [[x, y, z], …]}, …], "height": m, …}
    x = Ost, y = Nord, z = über Gelände; Ursprung = Mitte des Grundrisses.
    """
    buildings: list[dict[str, Any]] = []
    base_transform = None
    for doc in _docs(raw):
        if doc.get("type") == "CityJSON" and "transform" in doc:
            base_transform = doc["transform"]
        tr = doc.get("transform") or base_transform or {"scale": [1, 1, 1], "translate": [0, 0, 0]}
        verts = doc.get("vertices") or []
        sc, tl = tr["scale"], tr["translate"]
        real = [(v[0] * sc[0] + tl[0], v[1] * sc[1] + tl[1], v[2] * sc[2] + tl[2]) for v in verts]
        objs = doc.get("CityObjects") or {}
        # Gebäude mit Teilen zusammenfassen
        for oid, obj in objs.items():
            if obj.get("type") != "Building" or obj.get("parents"):
                continue
            ids = [oid] + list(obj.get("children", []))
            surfs: list[tuple[list[tuple[float, float, float]], str]] = []
            for cid in ids:
                cobj = objs.get(cid) or {}
                geoms = cobj.get("geometry") or []
                lod2 = [g for g in geoms if str(g.get("lod", "")).startswith("2")] or geoms
                for g in lod2:
                    for ring, kind in _surfaces(g):
                        pts = [real[i] for i in ring if i < len(real)]
                        if len(pts) >= 3:
                            surfs.append((pts, kind))
            if surfs:
                buildings.append({"id": oid, "attrs": obj.get("attributes", {}), "surfs": surfs})
    if not buildings:
        return None

    # Koordinatenart erkennen: Grad (CRS84) oder Meter (UTM o. ä.)
    sample = buildings[0]["surfs"][0][0][0]
    degrees = abs(sample[0]) <= 180 and abs(sample[1]) <= 90
    k_lat = 111_320.0
    k_lon = 111_320.0 * cos(radians(lat))

    def to_local_xy(p: tuple[float, float, float]) -> tuple[float, float]:
        if degrees:
            return ((p[0] - lon) * k_lon, (p[1] - lat) * k_lat)
        return (p[0], p[1])

    # Standort in Meter-Koordinaten (für UTM: Schwerpunkt der Gebäude, später per Punkt-im-Polygon)
    def footprint(b: dict[str, Any]) -> list[tuple[float, float]]:
        ground = [s for s, k in b["surfs"] if k == "GroundSurface"]
        if ground:
            return [to_local_xy(p) for p in ground[0]]
        allp = [to_local_xy(p) for s, _ in b["surfs"] for p in s]
        xs, ys = [p[0] for p in allp], [p[1] for p in allp]
        return [(min(xs), min(ys)), (max(xs), min(ys)), (max(xs), max(ys)), (min(xs), max(ys))]

    def centroid(poly: list[tuple[float, float]]) -> tuple[float, float]:
        return (sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly))

    if degrees:
        home = (0.0, 0.0)
    else:
        # UTM-Zone 32 (EPSG:25832) aus lat/lon grob bestimmen – für die Auswahl genügt eine Näherung
        home = _latlon_to_utm32(lat, lon)

    chosen = None
    for b in buildings:
        if _point_in_poly(home[0], home[1], footprint(b)):
            chosen = b
            break
    if chosen is None:
        chosen = min(buildings, key=lambda b: (centroid(footprint(b))[0] - home[0]) ** 2 + (centroid(footprint(b))[1] - home[1]) ** 2)

    fp = footprint(chosen)
    cx, cy = centroid(fp)
    zmin = min(p[2] for s, _ in chosen["surfs"] for p in s)
    faces = []
    for pts, kind in chosen["surfs"]:
        t = "r" if kind == "RoofSurface" else "g" if kind == "GroundSurface" else "w"
        loc = []
        for p in pts:
            x, y = to_local_xy(p)
            loc.append([round(x - cx, 2), round(y - cy, 2), round(p[2] - zmin, 2)])
        faces.append({"t": t, "p": loc})
    zmax = max(f[2] for face in faces for f in face["p"])
    attrs = chosen.get("attrs") or {}
    return {
        "faces": faces,
        "height": round(zmax, 2),
        "roof_type": attrs.get("roofType") or attrs.get("dachform"),
        "id": chosen["id"],
        "source": "Geobasis NRW, dl-de/zero-2-0",
    }


def _latlon_to_utm32(lat: float, lon: float) -> tuple[float, float]:
    """Geografische Koordinaten → UTM Zone 32N (ETRS89 ≈ WGS84), Genauigkeit im Zentimeterbereich."""
    from math import sin, sqrt, tan

    a, f = 6378137.0, 1 / 298.257222101
    e2 = f * (2 - f)
    k0, lon0 = 0.9996, radians(9.0)
    phi, lam = radians(lat), radians(lon)
    n = a / sqrt(1 - e2 * sin(phi) ** 2)
    t = tan(phi) ** 2
    c = e2 / (1 - e2) * cos(phi) ** 2
    aa = cos(phi) * (lam - lon0)
    m = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi
             - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * sin(2 * phi)
             + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * sin(4 * phi)
             - (35 * e2 ** 3 / 3072) * sin(6 * phi))
    ep2 = e2 / (1 - e2)
    x = k0 * n * (aa + (1 - t + c) * aa ** 3 / 6 + (5 - 18 * t + t * t + 72 * c - 58 * ep2) * aa ** 5 / 120) + 500000.0
    y = k0 * (m + n * tan(phi) * (aa ** 2 / 2 + (5 - t + 9 * c + 4 * c * c) * aa ** 4 / 24
                                  + (61 - 58 * t + t * t + 600 * c - 330 * ep2) * aa ** 6 / 720))
    return x, y
