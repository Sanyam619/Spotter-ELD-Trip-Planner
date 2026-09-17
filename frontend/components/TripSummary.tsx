"use client";

import { STOP_STYLES, formatClock, formatHours } from "@/lib/duty";
import type { TripPlan } from "@/lib/types";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

export default function TripSummary({ plan }: { plan: TripPlan }) {
  const { trip, stops } = plan;
  const cycleRemaining = 70 - trip.cycle_used_after;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total distance" value={`${trip.total_miles.toLocaleString()} mi`} hint={`@ ${trip.average_speed_mph} mph avg`} />
        <Stat label="Driving time" value={formatHours(trip.total_driving_hours)} hint={`+ ${formatHours(trip.total_on_duty_hours)} on duty`} />
        <Stat label="Log sheets" value={String(trip.days_required)} hint={trip.restarts_required > 0 ? `${trip.restarts_required} × 34-hr restart` : "No restart needed"} />
        <Stat
          label="Cycle after trip"
          value={`${trip.cycle_used_after.toFixed(1)} / 70`}
          hint={`${cycleRemaining.toFixed(1)} hrs remaining`}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <h3 className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-800">
          Planned stops
        </h3>
        <ul className="divide-y divide-slate-100">
          {stops.map((stop, index) => {
            const style = STOP_STYLES[stop.kind];
            return (
              <li key={index} className="flex items-center gap-3 px-4 py-2.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: style.color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{stop.label}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(stop.arrival).toLocaleDateString("en-US", { month: "short", day: "numeric" })} ·{" "}
                    {formatClock(stop.arrival)} → {formatClock(stop.departure)} · mile{" "}
                    {stop.miles_from_start.toLocaleString()}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                  {formatHours(stop.hours)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
