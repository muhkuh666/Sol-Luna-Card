"""Datenkoordinator für Sol & Luna: Astronomie lokal, Polarlicht/Wolken/Gelände aus dem Internet."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import logging
import time
from typing import Any

import aiohttp

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.util import dt as dt_util

from . import astro as A
from .building import NRW_URL, parse_building
from .const import (
    AURORA_INTERVAL_S,
    BUILDING_INTERVAL_S,
    CLOUD_INTERVAL_S,
    CONF_AURORA,
    CONF_AURORA_THRESHOLD,
    CONF_BUILDING,
    CONF_CLOUDS,
    CONF_HORIZON,
    DEFAULT_AURORA_THRESHOLD,
    DOMAIN,
    HORIZON_INTERVAL_S,
    URL_KP,
    URL_METEO,
    URL_OVATION,
    URL_PVGIS,
)

_LOGGER = logging.getLogger(__name__)

DAY_MS, HOUR_MS, MIN_MS = A.DAY_MS, A.HOUR_MS, A.MIN_MS


def _ts(ms: float | None) -> datetime | None:
    return None if ms is None else datetime.fromtimestamp(ms / 1000, tz=timezone.utc)


def parse_kp(data: Any) -> list[tuple[float, float, str]]:
    """Kp-Vorhersage in altem (Kopfzeile + Arrays) und neuem (Objekte) NOAA-Format lesen."""
    if not isinstance(data, list) or not data:
        return []
    rows = data
    if isinstance(data[0], list):
        head = [str(h).lower() for h in data[0]]
        rows = [dict(zip(head, r)) for r in data[1:]]
    out = []
    for r in rows:
        o = {str(k).lower(): v for k, v in r.items()}
        kp = next((o[k] for k in ("kp", "kp_index", "estimated_kp", "kp_value") if o.get(k) is not None), None)
        tt = str(o.get("time_tag") or o.get("time") or "").strip().replace(" ", "T")
        if tt and not (tt.endswith("Z") or "+" in tt[10:]):
            tt += "+00:00"
        try:
            t = datetime.fromisoformat(tt.replace("Z", "+00:00")).timestamp() * 1000
            out.append((t, float(kp), str(o.get("observed") or o.get("type") or "").lower()))
        except (TypeError, ValueError):
            continue
    return sorted(out)


@dataclass
class WebCache:
    kp: list[tuple[float, float, str]] = field(default_factory=list)
    kp_ts: float = 0
    ovation: dict[tuple[int, int], float] = field(default_factory=dict)
    ovation_ts: float = 0
    clouds: list[dict[str, float]] = field(default_factory=list)
    clouds_ts: float = 0
    horizon: list[tuple[float, float]] = field(default_factory=list)
    horizon_ts: float = 0
    building: dict[str, Any] | None = None
    building_ts: float = 0


class SolLunaCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Berechnet alle Werte einmal pro Minute."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        super().__init__(hass, _LOGGER, name=DOMAIN, update_interval=timedelta(minutes=1), config_entry=entry)
        self.entry = entry
        self.web = WebCache()
        self._cache: dict[str, Any] = {}

    # ---------------------------------------------------------------- Optionen
    @property
    def lat(self) -> float:
        return float(self.entry.data.get("latitude", self.hass.config.latitude))

    @property
    def lon(self) -> float:
        return float(self.entry.data.get("longitude", self.hass.config.longitude))

    def opt(self, key: str, default: Any) -> Any:
        return self.entry.options.get(key, self.entry.data.get(key, default))

    # ---------------------------------------------------------------- Internet
    async def _get_json(self, url: str) -> Any:
        session = async_get_clientsession(self.hass)
        async with asyncio.timeout(30):
            resp = await session.get(url)
            resp.raise_for_status()
            return await resp.json(content_type=None)

    async def _get_text(self, url: str) -> str:
        session = async_get_clientsession(self.hass)
        async with asyncio.timeout(60):
            resp = await session.get(url)
            resp.raise_for_status()
            return await resp.text()

    async def _refresh_web(self) -> None:
        now = time.time()
        if self.opt(CONF_BUILDING, False) and now - self.web.building_ts > BUILDING_INTERVAL_S:
            d_lat, d_lon = 0.0004, 0.0006
            url = NRW_URL.format(w=self.lon - d_lon, s=self.lat - d_lat, e=self.lon + d_lon, n=self.lat + d_lat)
            try:
                raw = await self._get_text(url)
                self.web.building = await self.hass.async_add_executor_job(parse_building, raw, self.lat, self.lon)
                self.web.building_ts = now
            except (aiohttp.ClientError, TimeoutError, ValueError, KeyError, TypeError, IndexError) as err:
                _LOGGER.warning("3D-Gebäudemodell konnte nicht geladen werden: %s", err)
                self.web.building_ts = now - BUILDING_INTERVAL_S + 6 * 3600
        if self.opt(CONF_AURORA, True):
            if now - self.web.kp_ts > AURORA_INTERVAL_S:
                try:
                    self.web.kp = parse_kp(await self._get_json(URL_KP))
                    self.web.kp_ts = now
                except (aiohttp.ClientError, TimeoutError, ValueError) as err:
                    _LOGGER.debug("Kp-Abruf fehlgeschlagen: %s", err)
                    self.web.kp_ts = now - AURORA_INTERVAL_S + 120
            if now - self.web.ovation_ts > AURORA_INTERVAL_S:
                try:
                    j = await self._get_json(URL_OVATION)
                    self.web.ovation = {(round(c[0]) % 360, round(c[1])): float(c[2]) for c in j.get("coordinates", [])}
                    self.web.ovation_ts = now
                except (aiohttp.ClientError, TimeoutError, ValueError, KeyError, TypeError) as err:
                    _LOGGER.debug("OVATION-Abruf fehlgeschlagen: %s", err)
                    self.web.ovation_ts = now - AURORA_INTERVAL_S + 120
        if self.opt(CONF_CLOUDS, True) and now - self.web.clouds_ts > CLOUD_INTERVAL_S:
            try:
                j = await self._get_json(URL_METEO.format(lat=self.lat, lon=self.lon))
                h = j.get("hourly", {})
                self.web.clouds = [
                    {"t": t * 1000, "total": h["cloud_cover"][i], "low": h["cloud_cover_low"][i],
                     "mid": h["cloud_cover_mid"][i], "high": h["cloud_cover_high"][i]}
                    for i, t in enumerate(h.get("time", [])) if h["cloud_cover"][i] is not None
                ]
                self.web.clouds_ts = now
            except (aiohttp.ClientError, TimeoutError, ValueError, KeyError, TypeError) as err:
                _LOGGER.debug("Open-Meteo-Abruf fehlgeschlagen: %s", err)
                self.web.clouds_ts = now - CLOUD_INTERVAL_S + 120
        if self.opt(CONF_HORIZON, True) and now - self.web.horizon_ts > HORIZON_INTERVAL_S:
            for url in URL_PVGIS:
                try:
                    j = await self._get_json(url.format(lat=self.lat, lon=self.lon))
                    prof = j["outputs"]["horizon_profile"]
                    self.web.horizon = [(A.norm360(float(p["A"]) + 180), float(p["H_hor"])) for p in prof]
                    self.web.horizon_ts = now
                    self._cache.clear()
                    break
                except (aiohttp.ClientError, TimeoutError, ValueError, KeyError, TypeError) as err:
                    _LOGGER.debug("PVGIS-Abruf fehlgeschlagen (%s): %s", url, err)
            else:
                self.web.horizon_ts = now - HORIZON_INTERVAL_S + 3600

    # ---------------------------------------------------------------- Berechnung
    async def _async_update_data(self) -> dict[str, Any]:
        await self._refresh_web()
        return await self.hass.async_add_executor_job(self._compute)

    def _day(self, start_ms: float) -> dict[str, Any]:
        key = f"day|{start_ms}|{len(self.web.horizon)}"
        if key in self._cache:
            return self._cache[key]
        lat, lon = self.lat, self.lon
        hfn = A.horizon_fn(self.web.horizon) if self.web.horizon else None
        times, alts, real = [], [], []
        t = start_ms
        while t <= start_ms + 48 * HOUR_MS:
            s = A.sun_position(t, lat, lon)
            times.append(t)
            alts.append(s.alt)
            real.append(s.alt - hfn(s.az) if hfn else s.alt)
            t += 2 * MIN_MS
        res = {
            "times": times, "alts": alts,
            "c083": A.crossings(times, alts, -0.833), "c6": A.crossings(times, alts, 6),
            "c4": A.crossings(times, alts, -4), "c6n": A.crossings(times, alts, -6),
            "real": A.crossings(times, real, -0.833) if hfn else [],
        }
        if len(self._cache) > 20:
            self._cache.clear()
        self._cache[key] = res
        return res

    def _night(self, base_ms: float) -> dict[str, Any]:
        key = f"night|{base_ms}"
        if key in self._cache:
            return self._cache[key]
        lat, lon = self.lat, self.lon
        smp = []
        t = base_ms
        while t <= base_ms + 24 * HOUR_MS:
            smp.append((t, A.sun_position(t, lat, lon).alt, A.moon_position(t, lat, lon).alt_topo))
            t += 5 * MIN_MS
        astro = A.segments([(t, s < -18) for t, s, _ in smp])
        moonfree = A.segments([(t, s < -18 and m < 0) for t, s, m in smp])
        dark = A.segments([(t, s < -6) for t, s, _ in smp])
        longest = lambda arr: max(arr, key=lambda x: x[1] - x[0]) if arr else None  # noqa: E731
        res = {
            "astro": longest(astro), "moonfree_total": sum(b - a for a, b in moonfree),
            "dark": longest(dark),
        }
        self._cache[key] = res
        return res

    def _phases(self, now_ms: float) -> dict[str, float | None]:
        key = f"ph|{int(now_ms // HOUR_MS)}"
        if key not in self._cache:
            self._cache[key] = {
                "full": A.find_cross(A.elongation, 180, now_ms, 6 * HOUR_MS, 140),
                "new": A.find_cross(A.elongation, 0, now_ms, 6 * HOUR_MS, 140),
            }
        return self._cache[key]

    def _compute(self) -> dict[str, Any]:
        lat, lon = self.lat, self.lon
        now = dt_util.utcnow().timestamp() * 1000
        start = dt_util.start_of_local_day().timestamp() * 1000
        day = self._day(start)
        sun = A.sun_position(now, lat, lon)
        moon = A.moon_position(now, lat, lon)
        b = A.band(sun.alt)

        def next_after(cr: list[tuple[float, bool]], rising: bool | None) -> float | None:
            return next((t for t, r in cr if t > now and (rising is None or r == rising)), None)

        def first_today(cr: list[tuple[float, bool]], rising: bool) -> float | None:
            return next((t for t, r in cr if start <= t < start + DAY_MS and r == rising), None)

        # nächste goldene/blaue Stunde (Beginn)
        golden = [x for x in (next_after(day["c4"], True), next_after(day["c6"], False)) if x]
        blue = [x for x in (next_after(day["c6n"], True), next_after(day["c4"], False)) if x]
        sunrise, sunset = first_today(day["c083"], True), first_today(day["c083"], False)
        day_len = (sunset - sunrise) if sunrise and sunset else None
        real_rise = first_today(day["real"], True) if day["real"] else None
        real_set = first_today(day["real"], False) if day["real"] else None

        # Nacht (Mittag bis Mittag)
        base = start - 12 * HOUR_MS if now < start + 12 * HOUR_MS else start + 12 * HOUR_MS
        night = self._night(base)
        astro = night["astro"]
        moon_free_now = sun.alt < -18 and moon.alt_topo < 0

        # Mondphasen
        ph = self._phases(now)

        # Wolken
        clouds = self.web.clouds
        def cloud_at(t: float | None) -> dict[str, float] | None:
            if t is None or not clouds:
                return None
            best = min(clouds, key=lambda h: abs(h["t"] - t))
            return best if abs(best["t"] - t) <= 2 * HOUR_MS else None
        tonight = None
        dk = night["dark"]
        if clouds and dk:
            a = max(dk[0], now) if dk[0] < now < dk[1] else dk[0]
            hs = [h["total"] for h in clouds if a - 30 * MIN_MS <= h["t"] <= dk[1] + 30 * MIN_MS]
            tonight = sum(hs) / len(hs) if hs else None
        nsunset = next_after(day["c083"], False)
        nsunrise = next_after(day["c083"], True)
        g_set = cloud_at(nsunset)
        g_rise = cloud_at(nsunrise)
        glow_set = A.glow_chance(*(g_set[k] for k in ("total", "low", "mid", "high"))) if g_set else None
        glow_rise = A.glow_chance(*(g_rise[k] for k in ("total", "low", "mid", "high"))) if g_rise else None

        # Polarlicht
        kp_now = None
        past = [r for r in self.web.kp if r[0] <= now and r[2] != "predicted"] or [r for r in self.web.kp if r[0] <= now]
        if past:
            kp_now = past[-1][1]
        vis = None
        if self.web.ovation:
            vis = self.web.ovation.get((round(lon) % 360, round(lat)), 0.0)
        need = A.kp_needed(lat)
        threshold = float(self.opt(CONF_AURORA_THRESHOLD, DEFAULT_AURORA_THRESHOLD))
        chance = None
        if kp_now is not None or vis is not None:
            k, v = kp_now or 0, vis or 0
            chance = "likely" if (k >= need or v >= threshold) else "possible" if (k >= need - 1.5 or v >= 10) else "unlikely"
        kp_max_24h = max((r[1] for r in self.web.kp if now <= r[0] <= now + DAY_MS), default=None)
        cloud_now = cloud_at(now)
        aurora_alert = (
            chance == "likely" and sun.alt < -6 and (cloud_now is None or cloud_now["total"] < 70)
        )

        hfn_points = self.web.horizon
        return {
            "sky_phase": A.SKY_PHASES[b],
            "sun_elevation": round(sun.alt, 2), "sun_azimuth": round(sun.az, 2),
            "next_golden_hour": _ts(min(golden) if golden else None),
            "next_blue_hour": _ts(min(blue) if blue else None),
            "golden_hour": b == 3, "blue_hour": b == 2,
            "sunrise": _ts(sunrise), "sunset": _ts(sunset),
            "day_length": round(day_len / MIN_MS, 1) if day_len else None,
            "sunrise_over_terrain": _ts(real_rise), "sunset_over_terrain": _ts(real_set),
            "moon_phase": A.phase_key(moon.phase), "moon_illumination": round(moon.illumination * 100, 1),
            "moon_elevation": round(moon.alt_topo, 2), "moon_distance": round(moon.dist),
            "next_full_moon": _ts(ph["full"]), "next_new_moon": _ts(ph["new"]),
            "astronomical_dusk": _ts(astro[0] if astro else None), "astronomical_dawn": _ts(astro[1] if astro else None),
            "moon_free_darkness": round(night["moonfree_total"] / MIN_MS) if night else None,
            "astronomical_darkness": sun.alt < -18, "moon_free_dark": moon_free_now,
            "cloud_cover_now": cloud_now["total"] if cloud_now else None,
            "cloud_cover_tonight": round(tonight) if tonight is not None else None,
            "clear_sky_tonight": tonight is not None and tonight < 25,
            "sunset_glow_chance": glow_set, "sunrise_glow_chance": glow_rise,
            "kp_index": kp_now, "kp_max_24h": kp_max_24h, "kp_needed": need,
            "aurora_visibility": vis, "aurora_chance": chance, "aurora_alert": aurora_alert,
            "horizon": [[round(a, 1), round(h, 2)] for a, h in hfn_points],
            "building": self.web.building,
            "horizon_max": round(max((h for _, h in hfn_points), default=0), 2) if hfn_points else None,
        }
