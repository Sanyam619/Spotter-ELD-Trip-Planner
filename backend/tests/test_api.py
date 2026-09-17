from unittest.mock import patch

import pytest

from trips.routing import Place, RouteResult, RoutingError

ENDPOINT = "/api/trips/plan"

PLACES = {
    "Dallas, TX": Place("Dallas, TX, USA", -96.784359, 32.736212),
    "Oklahoma City, OK": Place("Oklahoma City, OK, USA", -97.602513, 35.393761),
    "Denver, CO": Place("Denver, CO, USA", -104.985798, 39.740959),
}

FAKE_ROUTE = RouteResult(
    leg_distances_miles=[211.7, 643.8],
    leg_durations_hours=[211.7 / 55.0, 643.8 / 55.0],
    ors_durations_hours=[5.96, 15.8],
    geometry=[[-96.784359, 32.736212], [-97.602513, 35.393761], [-104.985798, 39.740959]],
)

PAYLOAD = {
    "current_location": "Dallas, TX",
    "pickup_location": "Oklahoma City, OK",
    "dropoff_location": "Denver, CO",
    "current_cycle_used": 12,
    "start_time": "2026-09-18T06:00:00",
}


@pytest.fixture
def allow_testserver(settings):
    settings.ALLOWED_HOSTS = ["testserver", "localhost"]


@pytest.fixture
def stub_routing():
    with patch("trips.services.geocode", side_effect=lambda q: PLACES[q]) as geo, patch(
        "trips.services.route", return_value=FAKE_ROUTE
    ) as rte:
        yield geo, rte


def post(client, **overrides):
    return client.post(
        ENDPOINT, data={**PAYLOAD, **overrides}, content_type="application/json"
    )


def test_plan_returns_expected_shape(client, allow_testserver, stub_routing):
    response = post(client)
    assert response.status_code == 200

    body = response.json()
    assert set(body) == {"trip", "route", "stops", "days"}
    assert body["trip"]["total_miles"] == pytest.approx(855.5, abs=0.2)
    assert body["trip"]["days_required"] == len(body["days"])
    assert body["route"]["legs"][0]["to"] == "Oklahoma City, OK, USA"


def test_plan_matches_hand_checked_schedule(client, allow_testserver, stub_routing):
    body = post(client).json()

    assert body["trip"]["total_driving_hours"] == pytest.approx(15.55, abs=0.02)
    assert body["trip"]["restarts_required"] == 0
    assert body["trip"]["cycle_used_after"] == pytest.approx(29.55, abs=0.02)

    day_one, day_two = body["days"]
    assert day_one["totals"]["driving"] == pytest.approx(11.0, abs=0.02)
    assert day_one["totals"]["on_duty"] == pytest.approx(1.0)
    assert day_one["totals"]["off_duty"] == pytest.approx(0.5)
    assert sum(day_two["totals"].values()) == pytest.approx(24.0, abs=0.02)


def test_log_entries_carry_grid_coordinates(client, allow_testserver, stub_routing):
    body = post(client).json()

    for day in body["days"]:
        for entry in day["entries"]:
            assert 0.0 <= entry["start_hour"] < entry["end_hour"] <= 24.0
        # Entries must tile the grid with no gaps.
        for previous, current in zip(day["entries"], day["entries"][1:]):
            assert previous["end_hour"] == pytest.approx(current["start_hour"])


def test_stops_include_map_coordinates(client, allow_testserver, stub_routing):
    body = post(client).json()

    kinds = {stop["kind"] for stop in body["stops"]}
    assert {"waypoint", "break", "rest"} <= kinds
    for stop in body["stops"]:
        assert len(stop["coordinates"]) == 2


def test_cycle_hours_over_limit_rejected(client, allow_testserver, stub_routing):
    assert post(client, current_cycle_used=71).status_code == 400


def test_missing_field_rejected(client, allow_testserver, stub_routing):
    response = client.post(
        ENDPOINT,
        data={"current_location": "Dallas, TX"},
        content_type="application/json",
    )
    assert response.status_code == 400


def test_routing_failure_returns_400_not_500(client, allow_testserver):
    with patch("trips.services.geocode", side_effect=RoutingError("No location found")):
        response = post(client)
    assert response.status_code == 400
    assert "No location found" in response.json()["detail"]
