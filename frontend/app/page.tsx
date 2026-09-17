"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import LogSheet from "@/components/LogSheet";
import TripForm from "@/components/TripForm";
import TripSummary from "@/components/TripSummary";
import { planTrip } from "@/lib/api";
import { DUTY_COLORS, DUTY_ROWS } from "@/lib/duty";
import type { TripPlan, TripPlanRequest } from "@/lib/types";

// Leaflet touches window on import, so it must never render on the server.
const RouteMap = dynamic(() => import("@/components/RouteMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-slate-100 text-sm text-slate-500">
      Loading map…
    </div>
  ),
});

export default function Home() {
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(payload: TripPlanRequest) {
    setLoading(true);
    setError(null);
    try {
      setPlan(await planTrip(payload));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">Spotter ELD Trip Planner</h1>
            <p className="text-xs text-slate-500">
              Property-carrying driver · 70 hrs / 8 days · FMCSA hours of service
            </p>
          </div>
          <div className="hidden gap-4 sm:flex">
            {DUTY_ROWS.map((row) => (
              <span key={row.status} className="flex items-center gap-1.5 text-xs text-slate-600">
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: DUTY_COLORS[row.status] }}
                  aria-hidden
                />
                {row.label.replace(/^\d\.\s/, "")}
              </span>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-slate-800">Trip details</h2>
              <TripForm onSubmit={handleSubmit} loading={loading} />
              {error && (
                <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </p>
              )}
            </div>
          </aside>

          <section className="space-y-6">
            {!plan && !loading && (
              <div className="flex h-[420px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 text-center">
                <p className="text-sm font-medium text-slate-700">No trip planned yet</p>
                <p className="mt-1 max-w-sm text-xs text-slate-500">
                  Enter your current location, pickup, dropoff and current cycle hours. The route,
                  required rest stops and daily log sheets are generated automatically.
                </p>
              </div>
            )}

            {loading && (
              <div className="flex h-[420px] items-center justify-center rounded-xl border border-slate-200 bg-white">
                <p className="animate-pulse text-sm text-slate-500">
                  Calculating route and hours of service…
                </p>
              </div>
            )}

            {plan && !loading && (
              <>
                <div className="h-[420px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <RouteMap plan={plan} />
                </div>

                <TripSummary plan={plan} />

                <div className="space-y-5">
                  <h2 className="text-sm font-semibold text-slate-800">
                    Daily log sheets ({plan.days.length})
                  </h2>
                  {plan.days.map((day, index) => (
                    <LogSheet
                      key={day.date}
                      day={day}
                      dayNumber={index + 1}
                      totalDays={plan.days.length}
                      stops={plan.stops}
                      trip={plan.trip}
                    />
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
