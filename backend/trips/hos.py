"""Hours-of-Service simulator for a property-carrying CMV driver (70hr/8day)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum

MAX_DRIVING_HOURS = 11.0
MAX_DUTY_WINDOW_HOURS = 14.0
DRIVING_HOURS_BEFORE_BREAK = 8.0
REQUIRED_BREAK_HOURS = 0.5
REQUIRED_OFF_DUTY_HOURS = 10.0
CYCLE_LIMIT_HOURS = 70.0
CYCLE_RESTART_HOURS = 34.0
FUEL_INTERVAL_MILES = 1000.0
FUEL_STOP_HOURS = 0.5
PICKUP_HOURS = 1.0
DROPOFF_HOURS = 1.0

# Guards against float drift re-triggering a limit that was just reset.
EPSILON = 1e-6


class DutyStatus(str, Enum):
    OFF_DUTY = "off_duty"
    SLEEPER_BERTH = "sleeper_berth"
    DRIVING = "driving"
    ON_DUTY = "on_duty"


class TripNotFeasible(Exception):
    pass


@dataclass
class RouteLeg:
    """A driving segment between two waypoints, as returned by the routing API."""

    distance_miles: float
    duration_hours: float
    start_label: str
    end_label: str


@dataclass
class Activity:
    """Non-driving on-duty work performed at a waypoint."""

    hours: float
    label: str


@dataclass
class LogEntry:
    status: DutyStatus
    start: datetime
    end: datetime
    remark: str
    miles: float = 0.0

    @property
    def hours(self) -> float:
        return (self.end - self.start).total_seconds() / 3600.0


@dataclass
class Stop:
    """A point of interest to render on the map."""

    kind: str
    label: str
    arrival: datetime
    departure: datetime
    miles_from_start: float


@dataclass
class HosPlanner:
    start_time: datetime
    cycle_used_hours: float = 0.0

    entries: list[LogEntry] = field(default_factory=list)
    stops: list[Stop] = field(default_factory=list)

    driving_today: float = 0.0
    driving_since_break: float = 0.0
    miles_since_fuel: float = 0.0
    miles_travelled: float = 0.0
    window_start: datetime | None = None
    restarts: int = 0

    def __post_init__(self) -> None:
        self.clock = self.start_time
        self.cycle_used = self.cycle_used_hours

    # -- timeline construction -------------------------------------------------

    def _advance(self, status: DutyStatus, hours: float, remark: str, miles: float = 0.0) -> None:
        if hours <= EPSILON:
            return
        end = self.clock + timedelta(hours=hours)

        if self.entries and self.entries[-1].status is status and self.entries[-1].end == self.clock:
            self.entries[-1].end = end
            self.entries[-1].miles += miles
        else:
            self.entries.append(LogEntry(status, self.clock, end, remark, miles))

        if status in (DutyStatus.DRIVING, DutyStatus.ON_DUTY):
            if self.window_start is None:
                self.window_start = self.clock
            self.cycle_used += hours
        if status is DutyStatus.DRIVING:
            self.driving_today += hours
            self.driving_since_break += hours
            self.miles_since_fuel += miles
            self.miles_travelled += miles

        self.clock = end

    def _window_elapsed(self) -> float:
        if self.window_start is None:
            return 0.0
        return (self.clock - self.window_start).total_seconds() / 3600.0

    def _record_stop(self, kind: str, label: str, start: datetime) -> None:
        self.stops.append(Stop(kind, label, start, self.clock, round(self.miles_travelled, 1)))

    # -- resets ----------------------------------------------------------------

    def _take_off_duty_reset(self, remark: str = "10 hour off duty — sleeper berth") -> None:
        start = self.clock
        self._advance(DutyStatus.SLEEPER_BERTH, REQUIRED_OFF_DUTY_HOURS, remark)
        self.driving_today = 0.0
        self.driving_since_break = 0.0
        self.window_start = None
        self._record_stop("rest", remark, start)

    def _take_34_hour_restart(self) -> None:
        start = self.clock
        remark = "34 hour restart — 70hr/8day cycle exhausted"
        self._advance(DutyStatus.OFF_DUTY, CYCLE_RESTART_HOURS, remark)
        self.cycle_used = 0.0
        self.driving_today = 0.0
        self.driving_since_break = 0.0
        self.window_start = None
        self.restarts += 1
        self._record_stop("restart", remark, start)

    def _take_30_minute_break(self) -> None:
        start = self.clock
        remark = "30 minute rest break"
        self._advance(DutyStatus.OFF_DUTY, REQUIRED_BREAK_HOURS, remark)
        self.driving_since_break = 0.0
        self._record_stop("break", remark, start)

    def _take_fuel_stop(self) -> None:
        start = self.clock
        remark = "Fuel stop"
        self._advance(DutyStatus.ON_DUTY, FUEL_STOP_HOURS, remark)
        self.miles_since_fuel = 0.0
        self._record_stop("fuel", remark, start)

    # -- driving ---------------------------------------------------------------

    def _clear_blockers_before_driving(self) -> None:
        """Insert whatever rest or fuel stop is required before the wheels can turn."""
        if self.cycle_used >= CYCLE_LIMIT_HOURS - EPSILON:
            self._take_34_hour_restart()

        window_exhausted = self._window_elapsed() >= MAX_DUTY_WINDOW_HOURS - EPSILON
        drive_exhausted = self.driving_today >= MAX_DRIVING_HOURS - EPSILON
        if window_exhausted or drive_exhausted:
            self._take_off_duty_reset()

        if self.driving_since_break >= DRIVING_HOURS_BEFORE_BREAK - EPSILON:
            self._take_30_minute_break()

        if self.miles_since_fuel >= FUEL_INTERVAL_MILES - EPSILON:
            self._take_fuel_stop()

    def drive(self, leg: RouteLeg) -> None:
        remaining_hours = leg.duration_hours
        remaining_miles = leg.distance_miles
        speed = leg.distance_miles / leg.duration_hours if leg.duration_hours > 0 else 0.0

        while remaining_hours > EPSILON:
            self._clear_blockers_before_driving()

            limits = [
                remaining_hours,
                MAX_DRIVING_HOURS - self.driving_today,
                DRIVING_HOURS_BEFORE_BREAK - self.driving_since_break,
                MAX_DUTY_WINDOW_HOURS - self._window_elapsed(),
                CYCLE_LIMIT_HOURS - self.cycle_used,
            ]
            if speed > 0:
                limits.append((FUEL_INTERVAL_MILES - self.miles_since_fuel) / speed)

            chunk = min(limits)
            if chunk <= EPSILON:
                raise TripNotFeasible("HOS simulation stalled — no legal driving time available")

            miles = chunk * speed
            self._advance(
                DutyStatus.DRIVING,
                chunk,
                f"Driving toward {leg.end_label}",
                miles=miles,
            )
            remaining_hours -= chunk
            remaining_miles -= miles

    # -- on-duty work ----------------------------------------------------------

    def perform(self, activity: Activity) -> None:
        """On-duty non-driving work. Legal past the 14hr window, but still burns cycle."""
        if self.cycle_used >= CYCLE_LIMIT_HOURS - EPSILON:
            self._take_34_hour_restart()
        start = self.clock
        self._advance(DutyStatus.ON_DUTY, activity.hours, activity.label)
        self._record_stop("waypoint", activity.label, start)

    def finish(self) -> None:
        """Pad the final partial day with off-duty time so the last log sheet is complete."""
        end_of_day = (self.clock + timedelta(days=1)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        self._advance(DutyStatus.OFF_DUTY, (end_of_day - self.clock).total_seconds() / 3600.0, "Off duty")


def plan_trip(
    legs: list[RouteLeg],
    activities: dict[int, Activity],
    start_time: datetime,
    cycle_used_hours: float = 0.0,
) -> HosPlanner:
    """Run the simulation. `activities` maps a leg index to work done on arrival."""
    planner = HosPlanner(start_time=start_time, cycle_used_hours=cycle_used_hours)
    for index, leg in enumerate(legs):
        planner.drive(leg)
        if index in activities:
            planner.perform(activities[index])
    planner.finish()
    return planner


@dataclass
class DailyLog:
    date: datetime
    entries: list[LogEntry]
    totals: dict[str, float]
    miles: float


def split_into_days(entries: list[LogEntry]) -> list[DailyLog]:
    """Clip the timeline at midnight so each day renders onto its own log sheet."""
    if not entries:
        return []

    by_day: dict[datetime, list[LogEntry]] = {}
    for entry in entries:
        cursor = entry.start
        while cursor < entry.end:
            midnight = (cursor + timedelta(days=1)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            slice_end = min(midnight, entry.end)
            share = (slice_end - cursor).total_seconds() / 3600.0
            full = entry.hours
            day = cursor.replace(hour=0, minute=0, second=0, microsecond=0)
            by_day.setdefault(day, []).append(
                LogEntry(
                    entry.status,
                    cursor,
                    slice_end,
                    entry.remark,
                    miles=entry.miles * (share / full) if full else 0.0,
                )
            )
            cursor = slice_end

    days = []
    for day in sorted(by_day):
        day_entries = by_day[day]
        totals = {status.value: 0.0 for status in DutyStatus}
        for entry in day_entries:
            totals[entry.status.value] += entry.hours
        days.append(
            DailyLog(
                date=day,
                entries=day_entries,
                totals={k: round(v, 2) for k, v in totals.items()},
                miles=round(sum(e.miles for e in day_entries), 1),
            )
        )
    return days
