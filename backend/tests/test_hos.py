from datetime import datetime, timedelta

import pytest

from trips.hos import (
    CYCLE_LIMIT_HOURS,
    MAX_DRIVING_HOURS,
    MAX_DUTY_WINDOW_HOURS,
    Activity,
    DutyStatus,
    HosPlanner,
    RouteLeg,
    plan_trip,
    split_into_days,
)

START = datetime(2026, 9, 17, 6, 0)


def leg(miles, hours, end="Dropoff"):
    return RouteLeg(distance_miles=miles, duration_hours=hours, start_label="Start", end_label=end)


def statuses(planner):
    return [e.status for e in planner.entries]


def total_driving(planner):
    return sum(e.hours for e in planner.entries if e.status is DutyStatus.DRIVING)


def test_short_trip_needs_no_rest():
    planner = HosPlanner(start_time=START)
    planner.drive(leg(240, 4))

    assert statuses(planner) == [DutyStatus.DRIVING]
    assert total_driving(planner) == pytest.approx(4)


def test_break_inserted_after_eight_driving_hours():
    planner = HosPlanner(start_time=START)
    planner.drive(leg(540, 9))

    off_duty = [e for e in planner.entries if e.status is DutyStatus.OFF_DUTY]
    assert len(off_duty) == 1
    assert off_duty[0].hours == pytest.approx(0.5)
    assert off_duty[0].start == START + timedelta(hours=8)
    assert total_driving(planner) == pytest.approx(9)


def test_eleven_hour_limit_forces_ten_hour_reset():
    planner = HosPlanner(start_time=START)
    planner.drive(leg(780, 13))

    sleeper = [e for e in planner.entries if e.status is DutyStatus.SLEEPER_BERTH]
    assert len(sleeper) == 1
    assert sleeper[0].hours == pytest.approx(10)

    # The reset lands once 11 driving hours are used, not before.
    driving_before_reset = sum(
        e.hours
        for e in planner.entries
        if e.status is DutyStatus.DRIVING and e.end <= sleeper[0].start
    )
    assert driving_before_reset == pytest.approx(MAX_DRIVING_HOURS)
    assert total_driving(planner) == pytest.approx(13)


def test_fourteen_hour_window_can_expire_before_eleven_driving_hours():
    planner = HosPlanner(start_time=START)
    planner.perform(Activity(hours=4, label="Loading"))  # burns window, not driving hours
    planner.drive(leg(600, 10))

    sleeper = [e for e in planner.entries if e.status is DutyStatus.SLEEPER_BERTH]
    assert len(sleeper) == 1

    driving_before_reset = sum(
        e.hours
        for e in planner.entries
        if e.status is DutyStatus.DRIVING and e.end <= sleeper[0].start
    )
    assert driving_before_reset < MAX_DRIVING_HOURS
    # 4h on duty + 8h driving + 0.5h break + 1.5h driving == the 14h window.
    assert driving_before_reset == pytest.approx(9.5)
    assert sleeper[0].start - START == timedelta(hours=MAX_DUTY_WINDOW_HOURS)


def test_fuel_stop_every_thousand_miles():
    planner = HosPlanner(start_time=START)
    planner.drive(leg(1200, 20))

    fuel = [e for e in planner.entries if e.status is DutyStatus.ON_DUTY and e.remark == "Fuel stop"]
    assert len(fuel) == 1
    assert fuel[0].hours == pytest.approx(0.5)

    miles_before_fuel = sum(
        e.miles for e in planner.entries if e.status is DutyStatus.DRIVING and e.end <= fuel[0].start
    )
    assert miles_before_fuel == pytest.approx(1000)


def test_cycle_exhaustion_triggers_34_hour_restart():
    planner = HosPlanner(start_time=START, cycle_used_hours=68)
    planner.drive(leg(300, 5))

    restart = [e for e in planner.entries if "34 hour restart" in e.remark]
    assert len(restart) == 1
    assert restart[0].hours == pytest.approx(34)

    driving_before_restart = sum(
        e.hours
        for e in planner.entries
        if e.status is DutyStatus.DRIVING and e.end <= restart[0].start
    )
    assert driving_before_restart == pytest.approx(CYCLE_LIMIT_HOURS - 68)
    assert total_driving(planner) == pytest.approx(5)


def test_pickup_and_dropoff_are_on_duty_not_driving():
    planner = plan_trip(
        legs=[leg(120, 2, end="Pickup"), leg(180, 3, end="Dropoff")],
        activities={0: Activity(1, "Pickup"), 1: Activity(1, "Dropoff")},
        start_time=START,
    )
    on_duty = [e for e in planner.entries if e.status is DutyStatus.ON_DUTY]
    assert [e.remark for e in on_duty] == ["Pickup", "Dropoff"]
    assert sum(e.hours for e in on_duty) == pytest.approx(2)


def test_timeline_is_contiguous_and_ordered():
    planner = plan_trip(
        legs=[leg(600, 10, end="Pickup"), leg(900, 15, end="Dropoff")],
        activities={0: Activity(1, "Pickup"), 1: Activity(1, "Dropoff")},
        start_time=START,
        cycle_used_hours=10,
    )
    for previous, current in zip(planner.entries, planner.entries[1:]):
        assert previous.end == current.start
        assert previous.status is not current.status


def test_days_split_at_midnight_and_total_24_hours():
    planner = plan_trip(
        legs=[leg(600, 10, end="Pickup"), leg(900, 15, end="Dropoff")],
        activities={0: Activity(1, "Pickup"), 1: Activity(1, "Dropoff")},
        start_time=START,
    )
    days = split_into_days(planner.entries)
    assert len(days) > 1

    # Every day except the first runs a full midnight-to-midnight 24 hours.
    for day in days[1:]:
        assert sum(day.totals.values()) == pytest.approx(24, abs=0.01)
    for day in days:
        for entry in day.entries:
            assert entry.start.date() == day.date.date()


def test_total_miles_preserved_across_day_split():
    planner = plan_trip(
        legs=[leg(600, 10, end="Pickup"), leg(900, 15, end="Dropoff")],
        activities={0: Activity(1, "Pickup"), 1: Activity(1, "Dropoff")},
        start_time=START,
    )
    days = split_into_days(planner.entries)
    assert sum(d.miles for d in days) == pytest.approx(1500, abs=0.5)
