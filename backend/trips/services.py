"""Glue between the routing API and the HOS engine, plus response shaping."""

from __future__ import annotations

import math
from datetime import datetime

from .hos import (
    DROPOFF_HOURS,
    PICKUP_HOURS,
    Activity,
    RouteLeg,
    plan_trip,
    split_into_days,
)
from .routing import AVERAGE_TRUCK_SPEED_MPH, Place, geocode, route

EARTH_RADIUS_MILES = 3958.7613


def _haversine_miles(a: list[float], b: list[float]) -> float:
    lon1, lat1 = math.radians(a[0]), math.radians(a[1])
    lon2, lat2 = math.radians(b[0]), math.radians(b[1])
    dlon, dlat = lon2 - lon1, lat2 - lat1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_MILES * math.asin(math.sqrt(h))


def _cumulative_miles(geometry: list[list[float]]) -> list[float]:
    totals = [0.0]
    for previous, current in zip(geometry, geometry[1:]):
        totals.append(totals[-1] + _haversine_miles(previous, current))
    return totals


def _point_at_mile(geometry: list[list[float]], totals: list[float], target: float) -> list[float]:
    """Interpolate a [lon, lat] position a given distance along the polyline."""
    if not geometry:
        return []
    if target <= 0:
        return geometry[0]
    if target >= totals[-1]:
        return geometry[-1]

    low, high = 0, len(totals) - 1
    while low < high:
        mid = (low + high) // 2
        if totals[mid] < target:
            low = mid + 1
        else:
            high = mid

    index = max(1, low)
    span = totals[index] - totals[index - 1]
    ratio = (target - totals[index - 1]) / span if span else 0.0
    start, end = geometry[index - 1], geometry[index]
    return [
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio,
    ]


def _hours_into_day(moment: datetime) -> float:
    return moment.hour + moment.minute / 60 + moment.second / 3600


def build_trip_plan(
    current_location: str,
    pickup_location: str,
    dropoff_location: str,
    current_cycle_used: float,
    start_time: datetime | None = None,
) -> dict:
    start_time = (start_time or datetime.now()).replace(second=0, microsecond=0)

    places: list[Place] = [
        geocode(current_location),
        geocode(pickup_location),
        geocode(dropoff_location),
    ]
    result = route(places)

    legs = [
        RouteLeg(
            distance_miles=result.leg_distances_miles[0],
            duration_hours=result.leg_durations_hours[0],
            start_label=places[0].label,
            end_label=places[1].label,
        ),
        RouteLeg(
            distance_miles=result.leg_distances_miles[1],
            duration_hours=result.leg_durations_hours[1],
            start_label=places[1].label,
            end_label=places[2].label,
        ),
    ]
    activities = {
        0: Activity(PICKUP_HOURS, f"Pickup — {places[1].label}"),
        1: Activity(DROPOFF_HOURS, f"Dropoff — {places[2].label}"),
    }

    planner = plan_trip(legs, activities, start_time, current_cycle_used)
    days = split_into_days(planner.entries)

    totals = _cumulative_miles(result.geometry)
    stops = [
        {
            "kind": stop.kind,
            "label": stop.label,
            "arrival": stop.arrival.isoformat(),
            "departure": stop.departure.isoformat(),
            "hours": round((stop.departure - stop.arrival).total_seconds() / 3600, 2),
            "miles_from_start": stop.miles_from_start,
            "coordinates": _point_at_mile(result.geometry, totals, stop.miles_from_start),
        }
        for stop in planner.stops
    ]

    driving_hours = sum(e.hours for e in planner.entries if e.status.value == "driving")
    on_duty_hours = sum(e.hours for e in planner.entries if e.status.value == "on_duty")

    return {
        "trip": {
            "current": {"label": places[0].label, "coordinates": places[0].coordinates},
            "pickup": {"label": places[1].label, "coordinates": places[1].coordinates},
            "dropoff": {"label": places[2].label, "coordinates": places[2].coordinates},
            "start_time": start_time.isoformat(),
            "end_time": planner.entries[-1].end.isoformat() if planner.entries else None,
            "total_miles": round(result.total_miles, 1),
            "total_driving_hours": round(driving_hours, 2),
            "total_on_duty_hours": round(on_duty_hours, 2),
            "cycle_used_before": round(current_cycle_used, 2),
            "cycle_used_after": round(planner.cycle_used, 2),
            "restarts_required": planner.restarts,
            "average_speed_mph": AVERAGE_TRUCK_SPEED_MPH,
            "days_required": len(days),
        },
        "route": {
            "geometry": result.geometry,
            "legs": [
                {
                    "from": leg.start_label,
                    "to": leg.end_label,
                    "miles": round(leg.distance_miles, 1),
                    "hours": round(leg.duration_hours, 2),
                }
                for leg in legs
            ],
        },
        "stops": stops,
        "days": [
            {
                "date": day.date.date().isoformat(),
                "miles": day.miles,
                "totals": day.totals,
                "entries": [
                    {
                        "status": entry.status.value,
                        "start": entry.start.isoformat(),
                        "end": entry.end.isoformat(),
                        "remark": entry.remark,
                        # Grid coordinates: hours 0-24 across the log sheet.
                        "start_hour": round(_hours_into_day(entry.start), 4),
                        "end_hour": round(
                            24.0
                            if entry.end.date() != day.date.date()
                            else _hours_into_day(entry.end),
                            4,
                        ),
                    }
                    for entry in day.entries
                ],
            }
            for day in days
        ],
    }
