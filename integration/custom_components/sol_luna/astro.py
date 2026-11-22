"""Astronomische Berechnungen (Port aus der Sol & Luna Card, Meeus/JPL)."""
from __future__ import annotations

from dataclasses import dataclass
from math import acos, asin, atan2, cos, degrees, radians, sin, sqrt, tan
from typing import Callable

DAY_MS = 86_400_000
HOUR_MS = 3_600_000
MIN_MS = 60_000
AU_KM = 149_597_870.7
SYNODIC = 29.530589


def to_days(ms: float) -> float:
    """Tage seit J2000.0 aus Unix-Millisekunden."""
    return ms / DAY_MS - 0.5 + 2440588 - 2451545


def norm360(x: float) -> float:
    return x % 360.0


def wrap180(x: float) -> float:
    return (x + 180.0) % 360.0 - 180.0


def clamp(x: float, a: float, b: float) -> float:
    return max(a, min(b, x))


@dataclass
class SunCore:
    lon: float
    R: float
    T: float
    om: float


def sun_core(d: float) -> SunCore:
    T = d / 36525
    M = norm360(357.52911 + 35999.05029 * T - 0.0001537 * T * T)
    L0 = norm360(280.46646 + 36000.76983 * T + 0.0003032 * T * T)
    Mr = radians(M)
    C = ((1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(Mr)
         + (0.019993 - 0.000101 * T) * sin(2 * Mr) + 0.000289 * sin(3 * Mr))
    v = M + C
    e = 0.016708634 - 0.000042037 * T
    R = 1.000001018 * (1 - e * e) / (1 + e * cos(radians(v)))
    om = 125.04 - 1934.136 * T
    lon = norm360(L0 + C - 0.00569 - 0.00478 * sin(radians(om)))
    return SunCore(lon, R, T, om)


def obliq(T: float, om: float) -> float:
    return radians(23.439291 - 0.0130042 * T + 0.00256 * cos(radians(om)))


def sidereal_deg(d: float) -> float:
    return 280.46061837 + 360.98564736629 * d + 0.000387933 * (d / 36525) ** 2


def ecl_to_eq(lon: float, lat: float, eps: float) -> tuple[float, float]:
    l, b = radians(lon), radians(lat)
    ra = atan2(sin(l) * cos(eps) - tan(b) * sin(eps), cos(l))
    dec = asin(sin(b) * cos(eps) + cos(b) * sin(eps) * sin(l))
    return ra, dec


def horizontal(ra: float, dec: float, d: float, lat: float, lng: float) -> tuple[float, float, float]:
    phi = radians(lat)
    H = radians(sidereal_deg(d) + lng) - ra
    alt = asin(sin(phi) * sin(dec) + cos(phi) * cos(dec) * cos(H))
    az = atan2(sin(H), cos(H) * sin(phi) - tan(dec) * cos(phi)) + 3.141592653589793
    return alt, az, H


MOON_LR = [
    (0, 0, 1, 0, 6288774, -20905355), (2, 0, -1, 0, 1274027, -3699111), (2, 0, 0, 0, 658314, -2955968),
    (0, 0, 2, 0, 213618, -569925), (0, 1, 0, 0, -185116, 48888), (0, 0, 0, 2, -114332, -3149),
    (2, 0, -2, 0, 58793, 246158), (2, -1, -1, 0, 57066, -152138), (2, 0, 1, 0, 53322, -170733),
    (2, -1, 0, 0, 45758, -204586), (0, 1, -1, 0, -40923, -129620), (1, 0, 0, 0, -34720, 108743),
    (0, 1, 1, 0, -30383, 104755), (2, 0, 0, -2, 15327, 10321), (0, 0, 1, 2, -12528, 0),
    (0, 0, 1, -2, 10980, 79661), (4, 0, -1, 0, 10675, -34782), (0, 0, 3, 0, 10034, -23210),
    (4, 0, -2, 0, 8548, -21636), (2, 1, -1, 0, -7888, 24208), (2, 1, 0, 0, -6766, 30824),
    (1, 0, -1, 0, -5163, -8379), (1, 1, 0, 0, 4987, -16675), (2, -1, 1, 0, 4036, -12831),
    (2, 0, 2, 0, 3994, -10445), (4, 0, 0, 0, 3861, -11650), (2, 0, -3, 0, 3665, 14403),
    (0, 1, -2, 0, -2689, -7003), (2, 0, -1, 2, -2602, 0), (2, -1, -2, 0, 2390, 10056),
    (1, 0, 1, 0, -2348, 6322), (2, -2, 0, 0, 2236, -9884),
]
MOON_B = [
    (0, 0, 0, 1, 5128122), (0, 0, 1, 1, 280602), (0, 0, 1, -1, 277693), (2, 0, 0, -1, 173237),
    (2, 0, -1, 1, 55413), (2, 0, -1, -1, 46271), (2, 0, 0, 1, 32573), (0, 0, 2, 1, 17198),
    (2, 0, 1, -1, 9266), (0, 0, 2, -1, 8822), (2, -1, 0, -1, 8216), (2, 0, -2, -1, 4324),
    (2, 0, 1, 1, 4200), (2, 1, 0, -1, -3359), (2, -1, -1, 1, 2463), (2, -1, 0, 1, 2211),
    (2, -1, -1, -1, 2065), (0, 1, -1, -1, -1870), (4, 0, -1, -1, 1828), (0, 1, 0, 1, -1794),
    (0, 0, 0, 3, -1749), (0, 1, -1, 1, -1565), (1, 0, 0, 1, -1491), (0, 1, 1, 1, -1475),
    (0, 1, 1, -1, -1410), (0, 1, 0, -1, -1344), (1, 0, 0, -1, -1335),
]


def moon_ecl(d: float) -> tuple[float, float, float, float, float]:
    """Länge, Breite (Grad), Entfernung (km), T, Ω."""
    T = d / 36525
    Lp = norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T * T)
    D = radians(norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T))
    M = radians(norm360(357.5291092 + 35999.0502909 * T))
    Mp = radians(norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T))
    F = radians(norm360(93.272095 + 483202.0175233 * T - 0.0036539 * T * T))
    A1, A2, A3 = radians(119.75 + 131.849 * T), radians(53.09 + 479264.29 * T), radians(313.45 + 481266.484 * T)
    E = 1 - 0.002516 * T - 0.0000074 * T * T
    Lr = radians(Lp)
    sl = sr = sb = 0.0
    for a, b, c, f, l, r in MOON_LR:
        arg = a * D + b * M + c * Mp + f * F
        e = 1 if b == 0 else (E if abs(b) == 1 else E * E)
        sl += l * e * sin(arg)
        sr += r * e * cos(arg)
    for a, b, c, f, s in MOON_B:
        e = 1 if b == 0 else (E if abs(b) == 1 else E * E)
        sb += s * e * sin(a * D + b * M + c * Mp + f * F)
    sl += 3958 * sin(A1) + 1962 * sin(Lr - F) + 318 * sin(A2)
    sb += -2235 * sin(Lr) + 382 * sin(A3) + 175 * sin(A1 - F) + 175 * sin(A1 + F) + 127 * sin(Lr - Mp) - 115 * sin(Lr + Mp)
    om = 125.04452 - 1934.136261 * T
    return norm360(Lp + sl / 1e6 - 0.00478 * sin(radians(om))), sb / 1e6, 385000.56 + sr / 1000, T, om


@dataclass
class Body:
    alt: float
    az: float


@dataclass
class MoonState:
    alt: float
    alt_topo: float
    az: float
    dist: float
    illumination: float
    phase: float
    lon: float


def sun_position(ms: float, lat: float, lng: float) -> Body:
    d = to_days(ms)
    s = sun_core(d)
    ra, dec = ecl_to_eq(s.lon, 0, obliq(s.T, s.om))
    alt, az, _ = horizontal(ra, dec, d, lat, lng)
    return Body(degrees(alt), norm360(degrees(az)))


def moon_position(ms: float, lat: float, lng: float) -> MoonState:
    d = to_days(ms)
    lon, mlat, dist, T, om = moon_ecl(d)
    s = sun_core(d)
    ra, dec = ecl_to_eq(lon, mlat, obliq(T, om))
    alt, az, _ = horizontal(ra, dec, d, lat, lng)
    rkm = s.R * AU_KM
    psi = acos(clamp(cos(radians(mlat)) * cos(radians(lon - s.lon)), -1, 1))
    inc = atan2(rkm * sin(psi), dist - rkm * cos(psi))
    par = asin(6378.14 / dist)
    return MoonState(
        alt=degrees(alt), alt_topo=degrees(alt - par * cos(alt)), az=norm360(degrees(az)), dist=dist,
        illumination=(1 + cos(inc)) / 2, phase=norm360(lon - s.lon) / 360, lon=lon,
    )


def elongation(ms: float) -> float:
    d = to_days(ms)
    return norm360(moon_ecl(d)[0] - sun_core(d).lon)


def sun_lon(ms: float) -> float:
    return sun_core(to_days(ms)).lon


def find_cross(fn: Callable[[float], float], target: float, t0: float, step: float, max_steps: int) -> float | None:
    """Erster Zeitpunkt >= t0, an dem fn (monoton wachsend mod 360) den Zielwert überschreitet."""
    def diff(t: float) -> float:
        return wrap180(fn(t) - target)
    a, da = t0, diff(t0)
    for _ in range(max_steps):
        b = a + step
        db = diff(b)
        if da < 0 <= db and db - da < 120:
            lo, hi = a, b
            for _ in range(40):
                mid = (lo + hi) / 2
                if diff(mid) < 0:
                    lo = mid
                else:
                    hi = mid
            return (lo + hi) / 2
        a, da = b, db
    return None


PHASE_KEYS = [
    "new_moon", "waxing_crescent", "first_quarter", "waxing_gibbous",
    "full_moon", "waning_gibbous", "last_quarter", "waning_crescent",
]


def phase_key(p: float) -> str:
    if p < 0.0339 or p > 0.9661:
        return PHASE_KEYS[0]
    for lim, i in ((0.2161, 1), (0.2839, 2), (0.4661, 3), (0.5339, 4), (0.7161, 5), (0.7839, 6)):
        if p < lim:
            return PHASE_KEYS[i]
    return PHASE_KEYS[7]


SKY_PHASES = ["night", "twilight", "blue_hour", "golden_hour", "day"]


def band(alt: float) -> int:
    if alt < -12:
        return 0
    if alt < -6:
        return 1
    if alt < -4:
        return 2
    if alt < 6:
        return 3
    return 4


def segments(samples: list[tuple[float, bool]]) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    start = None
    for i, (t, ok) in enumerate(samples):
        if ok and start is None:
            start = t
        if (not ok or i == len(samples) - 1) and start is not None:
            out.append((start, t))
            start = None
    return out


def crossings(times: list[float], vals: list[float], thr: float) -> list[tuple[float, bool]]:
    out = []
    for i in range(1, len(vals)):
        a, b = vals[i - 1] - thr, vals[i] - thr
        if (a < 0 <= b) or (a >= 0 > b):
            f = a / (a - b)
            out.append((times[i - 1] + f * (times[i] - times[i - 1]), a < 0))
    return out


def kp_needed(lat: float) -> int:
    """Faustregel: benötigter Kp für Polarlicht am Horizont (Europa)."""
    return int(clamp(round((66 - abs(lat)) / 2), 1, 9))


def glow_chance(total: float | None, low: float | None, mid: float | None, high: float | None) -> int | None:
    """Abendrot-/Morgenrot-Chance 0–100 aus Wolkenschichten."""
    if total is None:
        return None
    if low is None or high is None:
        return round(clamp(1 - abs(total - 45) / 45, 0, 1) * 60)
    hm = max(high, (mid or 0) * 0.9)
    s = clamp(1 - abs(hm - 55) / 55, 0, 1)
    if hm < 10:
        s *= 0.25
    s *= (1 - low / 100) ** 1.6
    if total > 95:
        s *= 0.4
    return round(s * 100)


def horizon_fn(points: list[tuple[float, float]]) -> Callable[[float], float] | None:
    pts = sorted((norm360(a), h) for a, h in points)
    if len(pts) < 2:
        return None

    def fn(az: float) -> float:
        az = norm360(az)
        idx = next((i for i, p in enumerate(pts) if p[0] > az), -1)
        p1 = pts[-1] if idx <= 0 else pts[idx - 1]
        p2 = pts[0] if idx < 0 else pts[idx]
        span = norm360(p2[0] - p1[0]) or 360.0
        f = norm360(az - p1[0]) / span
        return p1[1] + (p2[1] - p1[1]) * f

    return fn
