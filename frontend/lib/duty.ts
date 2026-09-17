import type { DutyStatus, Stop } from "./types";

export const DUTY_ROWS: { status: DutyStatus; label: string }[] = [
  { status: "off_duty", label: "1. Off Duty" },
  { status: "sleeper_berth", label: "2. Sleeper Berth" },
  { status: "driving", label: "3. Driving" },
  { status: "on_duty", label: "4. On Duty (not driving)" },
];

export const DUTY_COLORS: Record<DutyStatus, string> = {
  off_duty: "#94a3b8",
  sleeper_berth: "#6366f1",
  driving: "#0ea5e9",
  on_duty: "#f59e0b",
};

export const STOP_STYLES: Record<Stop["kind"], { color: string; label: string }> = {
  waypoint: { color: "#0f766e", label: "Pickup / Dropoff" },
  break: { color: "#f59e0b", label: "30-min break" },
  rest: { color: "#6366f1", label: "10-hr reset" },
  fuel: { color: "#dc2626", label: "Fuel stop" },
  restart: { color: "#7c3aed", label: "34-hr restart" },
};

export function formatHours(value: number): string {
  const hours = Math.floor(value);
  const minutes = Math.round((value - hours) * 60);
  if (minutes === 60) return `${hours + 1}h 00m`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
