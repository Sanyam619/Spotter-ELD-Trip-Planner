"use client";

import { useState } from "react";

import LocationInput from "./LocationInput";
import type { TripPlanRequest } from "@/lib/types";

interface Props {
  onSubmit: (payload: TripPlanRequest) => void;
  loading: boolean;
}

function defaultStartTime(): string {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export default function TripForm({ onSubmit, loading }: Props) {
  const [current, setCurrent] = useState("");
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [cycleUsed, setCycleUsed] = useState("0");
  const [startTime, setStartTime] = useState(defaultStartTime);

  const cycleValue = Number(cycleUsed);
  const cycleInvalid = cycleUsed !== "" && (Number.isNaN(cycleValue) || cycleValue < 0 || cycleValue > 70);
  const ready = current.trim() && pickup.trim() && dropoff.trim() && !cycleInvalid && !loading;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    onSubmit({
      current_location: current.trim(),
      pickup_location: pickup.trim(),
      dropoff_location: dropoff.trim(),
      current_cycle_used: cycleValue || 0,
      start_time: startTime ? `${startTime}:00` : undefined,
    });
  }

  function loadExample() {
    setCurrent("Dallas, TX, USA");
    setPickup("Oklahoma City, OK, USA");
    setDropoff("Denver, CO, USA");
    setCycleUsed("12");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <LocationInput
        id="current"
        label="Current location"
        placeholder="e.g. Dallas, TX"
        value={current}
        onChange={setCurrent}
      />
      <LocationInput
        id="pickup"
        label="Pickup location"
        placeholder="e.g. Oklahoma City, OK"
        value={pickup}
        onChange={setPickup}
      />
      <LocationInput
        id="dropoff"
        label="Dropoff location"
        placeholder="e.g. Denver, CO"
        value={dropoff}
        onChange={setDropoff}
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="cycle" className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-600 uppercase">
            Cycle used (hrs)
          </label>
          <input
            id="cycle"
            type="number"
            min={0}
            max={70}
            step={0.5}
            value={cycleUsed}
            onChange={(event) => setCycleUsed(event.target.value)}
            className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:ring-2 ${
              cycleInvalid
                ? "border-red-400 focus:border-red-500 focus:ring-red-500/30"
                : "border-slate-300 focus:border-sky-500 focus:ring-sky-500/30"
            }`}
          />
        </div>
        <div>
          <label htmlFor="start" className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-600 uppercase">
            Start time
          </label>
          <input
            id="start"
            type="datetime-local"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
          />
        </div>
      </div>

      {cycleInvalid && <p className="text-xs text-red-600">Cycle hours must be between 0 and 70.</p>}

      <button
        type="submit"
        disabled={!ready}
        className="w-full rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {loading ? "Planning route…" : "Plan trip & generate logs"}
      </button>

      <button
        type="button"
        onClick={loadExample}
        className="w-full rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
      >
        Load example trip
      </button>
    </form>
  );
}
