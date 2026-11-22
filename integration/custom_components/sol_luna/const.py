"""Konstanten für Sol & Luna."""
from __future__ import annotations

DOMAIN = "sol_luna"
NAME = "Sol & Luna"

CONF_AURORA = "aurora"
CONF_CLOUDS = "clouds"
CONF_HORIZON = "horizon"
CONF_AURORA_THRESHOLD = "aurora_threshold"
CONF_BUILDING = "building"

DEFAULT_AURORA_THRESHOLD = 50

URL_KP = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json"
URL_OVATION = "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json"
URL_METEO = (
    "https://api.open-meteo.com/v1/forecast?latitude={lat:.3f}&longitude={lon:.3f}"
    "&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high"
    "&timeformat=unixtime&timezone=auto&forecast_days=3"
)
URL_PVGIS = [
    "https://re.jrc.ec.europa.eu/api/v5_3/printhorizon?lat={lat:.4f}&lon={lon:.4f}&outputformat=json",
    "https://re.jrc.ec.europa.eu/api/v5_2/printhorizon?lat={lat:.4f}&lon={lon:.4f}&outputformat=json",
]

AURORA_INTERVAL_S = 15 * 60
CLOUD_INTERVAL_S = 30 * 60
HORIZON_INTERVAL_S = 7 * 24 * 3600
BUILDING_INTERVAL_S = 30 * 24 * 3600

AURORA_CHANCES = ["unlikely", "possible", "likely"]
