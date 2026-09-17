export type DutyStatus = "off_duty" | "sleeper_berth" | "driving" | "on_duty";

export interface PlaceRef {
  label: string;
  coordinates: [number, number];
}

export interface TripSummary {
  current: PlaceRef;
  pickup: PlaceRef;
  dropoff: PlaceRef;
  start_time: string;
  end_time: string | null;
  total_miles: number;
  total_driving_hours: number;
  total_on_duty_hours: number;
  cycle_used_before: number;
  cycle_used_after: number;
  restarts_required: number;
  average_speed_mph: number;
  days_required: number;
}

export interface RouteLeg {
  from: string;
  to: string;
  miles: number;
  hours: number;
}

export interface Stop {
  kind: "waypoint" | "break" | "rest" | "fuel" | "restart";
  label: string;
  arrival: string;
  departure: string;
  hours: number;
  miles_from_start: number;
  coordinates: [number, number];
}

export interface LogEntry {
  status: DutyStatus;
  start: string;
  end: string;
  remark: string;
  start_hour: number;
  end_hour: number;
}

export interface DailyLog {
  date: string;
  miles: number;
  totals: Record<DutyStatus, number>;
  entries: LogEntry[];
}

export interface TripPlan {
  trip: TripSummary;
  route: { geometry: [number, number][]; legs: RouteLeg[] };
  stops: Stop[];
  days: DailyLog[];
}

export interface TripPlanRequest {
  current_location: string;
  pickup_location: string;
  dropoff_location: string;
  current_cycle_used: number;
  start_time?: string;
}
