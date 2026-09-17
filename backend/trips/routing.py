"""OpenRouteService client: address -> coordinates, coordinates -> driving route."""

from __future__ import annotations

from dataclasses import dataclass

import requests
from django.conf import settings

GEOCODE_URL = "https://api.openrouteservice.org/geocode/search"
DIRECTIONS_URL = "https://api.openrouteservice.org/v2/directions/driving-hgv/geojson"

TIMEOUT_SECONDS = 20

# Geocoded city centroids often sit well off the road network; ORS defaults to a
# 350m snap radius and 404s (error 2010) without this.
SNAP_RADIUS_METERS = 10000

# ORS's driving-hgv profile returns ~35mph averages on interstate runs, which is far
# below real long-haul pace and inflates the day count. Distances are trusted; the
# clock is driven by this documented average instead.
AVERAGE_TRUCK_SPEED_MPH = 55.0


class RoutingError(Exception):
    pass


@dataclass
class Place:
    label: str
    longitude: float
    latitude: float

    @property
    def coordinates(self) -> list[float]:
        return [self.longitude, self.latitude]


def _headers() -> dict[str, str]:
    if not settings.ORS_API_KEY:
        raise RoutingError("ORS_API_KEY is not configured")
    return {"Authorization": settings.ORS_API_KEY, "Accept": "application/json"}


def _error_detail(exc: requests.RequestException) -> str:
    response = getattr(exc, "response", None)
    if response is not None:
        try:
            message = response.json().get("error", {}).get("message")
            if message:
                return f"Routing failed: {message}"
        except ValueError:
            pass
    return "Could not calculate a driving route between those locations"


def geocode(query: str) -> Place:
    try:
        response = requests.get(
            GEOCODE_URL,
            headers=_headers(),
            params={"text": query, "size": 1},
            timeout=TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        features = response.json().get("features", [])
    except requests.RequestException as exc:
        raise RoutingError(f"Geocoding failed for {query!r}") from exc

    if not features:
        raise RoutingError(f"No location found for {query!r}")

    feature = features[0]
    longitude, latitude = feature["geometry"]["coordinates"]
    return Place(
        label=feature["properties"].get("label", query),
        longitude=longitude,
        latitude=latitude,
    )


def autocomplete(query: str, limit: int = 5) -> list[Place]:
    try:
        response = requests.get(
            GEOCODE_URL,
            headers=_headers(),
            params={"text": query, "size": limit},
            timeout=TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        features = response.json().get("features", [])
    except requests.RequestException as exc:
        raise RoutingError("Address lookup failed") from exc

    places = []
    for feature in features:
        longitude, latitude = feature["geometry"]["coordinates"]
        places.append(
            Place(
                label=feature["properties"].get("label", query),
                longitude=longitude,
                latitude=latitude,
            )
        )
    return places


@dataclass
class RouteResult:
    """Per-leg distances plus the full geometry for drawing the polyline."""

    leg_distances_miles: list[float]
    leg_durations_hours: list[float]
    ors_durations_hours: list[float]
    geometry: list[list[float]]

    @property
    def total_miles(self) -> float:
        return sum(self.leg_distances_miles)

    @property
    def total_hours(self) -> float:
        return sum(self.leg_durations_hours)


def route(places: list[Place]) -> RouteResult:
    """Route through the waypoints in order, using a heavy-goods-vehicle profile."""
    try:
        response = requests.post(
            DIRECTIONS_URL,
            headers={
                **_headers(),
                # The GeoJSON endpoint rejects a plain application/json Accept with a 406.
                "Accept": "application/geo+json",
                "Content-Type": "application/json",
            },
            json={
                "coordinates": [place.coordinates for place in places],
                "units": "mi",
                "radiuses": [SNAP_RADIUS_METERS] * len(places),
                # Must stay on: disabling it strips the per-leg "segments" array.
                "instructions": True,
            },
            timeout=TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        raise RoutingError(_error_detail(exc)) from exc

    features = payload.get("features") or []
    if not features:
        raise RoutingError("No drivable route exists between those locations")

    feature = features[0]
    segments = feature["properties"]["segments"]
    distances = [segment["distance"] for segment in segments]

    return RouteResult(
        leg_distances_miles=distances,
        leg_durations_hours=[miles / AVERAGE_TRUCK_SPEED_MPH for miles in distances],
        ors_durations_hours=[segment["duration"] / 3600.0 for segment in segments],
        geometry=feature["geometry"]["coordinates"],
    )
