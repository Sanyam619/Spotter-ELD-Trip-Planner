"use client";

import { DUTY_COLORS, DUTY_ROWS, formatDate, formatHours } from "@/lib/duty";
import type { DailyLog, Stop, TripSummary } from "@/lib/types";

const WIDTH = 1000;
const LABEL_W = 176;
const TOTALS_W = 64;
const GRID_L = LABEL_W;
const GRID_R = WIDTH - TOTALS_W;
const GRID_W = GRID_R - GRID_L;
const HEAD_H = 26;
const ROW_H = 36;
const GRID_H = ROW_H * DUTY_ROWS.length;
const REMARK_H = 128;
const HEIGHT = HEAD_H + GRID_H + REMARK_H;

const x = (hour: number) => GRID_L + (hour / 24) * GRID_W;
const rowCenter = (index: number) => HEAD_H + index * ROW_H + ROW_H / 2;

function hourLabel(hour: number): string {
  if (hour === 0 || hour === 24) return "Mid-\nnight";
  if (hour === 12) return "Noon";
  return String(hour % 12);
}

/** Stop time expressed as a 0-24 offset within this log day, or null if it falls outside. */
function stopHour(stop: Stop, date: string): number | null {
  const midnight = new Date(`${date}T00:00:00`).getTime();
  const hours = (new Date(stop.arrival).getTime() - midnight) / 3_600_000;
  return hours >= 0 && hours <= 24 ? hours : null;
}

interface Props {
  day: DailyLog;
  dayNumber: number;
  totalDays: number;
  stops: Stop[];
  trip: TripSummary;
}

export default function LogSheet({ day, dayNumber, totalDays, stops, trip }: Props) {
  const points = day.entries
    .flatMap((entry) => {
      const index = DUTY_ROWS.findIndex((row) => row.status === entry.status);
      const y = rowCenter(index);
      return [
        [x(entry.start_hour), y],
        [x(entry.end_hour), y],
      ];
    })
    .map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`)
    .join(" ");

  const dayStops = stops
    .map((stop) => ({ stop, hour: stopHour(stop, day.date) }))
    .filter((item): item is { stop: Stop; hour: number } => item.hour !== null);

  const onDutyTotal = day.totals.driving + day.totals.on_duty;

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div>
          <h3 className="text-base font-bold tracking-tight text-slate-900">
            Driver&apos;s Daily Log
            <span className="ml-2 text-xs font-medium text-slate-500">(24 hours)</span>
          </h3>
          <p className="mt-0.5 text-sm text-slate-600">{formatDate(day.date)}</p>
        </div>
        <dl className="flex flex-wrap gap-5 text-xs">
          <div>
            <dt className="text-slate-500">Sheet</dt>
            <dd className="font-semibold text-slate-900">
              {dayNumber} of {totalDays}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Total miles driving today</dt>
            <dd className="font-semibold text-slate-900">{day.miles.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-slate-500">From</dt>
            <dd className="max-w-[160px] truncate font-semibold text-slate-900">
              {trip.current.label}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">To</dt>
            <dd className="max-w-[160px] truncate font-semibold text-slate-900">
              {trip.dropoff.label}
            </dd>
          </div>
        </dl>
      </header>

      <div className="overflow-x-auto p-4">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full min-w-[760px]" role="img"
          aria-label={`Duty status grid for ${day.date}`}>
          {/* hour headings */}
          {Array.from({ length: 25 }, (_, hour) => (
            <text
              key={`h-${hour}`}
              x={x(hour)}
              y={hour === 0 || hour === 24 ? 9 : 17}
              textAnchor="middle"
              className="fill-slate-600"
              fontSize="8.5"
            >
              {hourLabel(hour)
                .split("\n")
                .map((line, i) => (
                  <tspan key={i} x={x(hour)} dy={i === 0 ? 0 : 8.5}>
                    {line}
                  </tspan>
                ))}
            </text>
          ))}

          {/* row bands */}
          {DUTY_ROWS.map((row, index) => (
            <rect
              key={row.status}
              x={GRID_L}
              y={HEAD_H + index * ROW_H}
              width={GRID_W}
              height={ROW_H}
              fill={index % 2 === 0 ? "#ffffff" : "#f8fafc"}
            />
          ))}

          {/* quarter-hour ticks */}
          {DUTY_ROWS.map((row, index) =>
            Array.from({ length: 24 }, (_, hour) =>
              [0.25, 0.5, 0.75].map((fraction) => {
                const tickX = x(hour + fraction);
                const top = HEAD_H + index * ROW_H;
                const length = fraction === 0.5 ? 11 : 6;
                return (
                  <g key={`t-${row.status}-${hour}-${fraction}`}>
                    <line x1={tickX} y1={top} x2={tickX} y2={top + length} stroke="#cbd5e1" strokeWidth="0.5" />
                    <line
                      x1={tickX}
                      y1={top + ROW_H}
                      x2={tickX}
                      y2={top + ROW_H - length}
                      stroke="#cbd5e1"
                      strokeWidth="0.5"
                    />
                  </g>
                );
              })
            )
          )}

          {/* hour gridlines */}
          {Array.from({ length: 25 }, (_, hour) => (
            <line
              key={`v-${hour}`}
              x1={x(hour)}
              y1={HEAD_H}
              x2={x(hour)}
              y2={HEAD_H + GRID_H}
              stroke={hour % 6 === 0 ? "#64748b" : "#cbd5e1"}
              strokeWidth={hour % 6 === 0 ? 1 : 0.6}
            />
          ))}

          {/* row separators + labels + totals */}
          {DUTY_ROWS.map((row, index) => {
            const top = HEAD_H + index * ROW_H;
            return (
              <g key={`r-${row.status}`}>
                <line x1={GRID_L} y1={top} x2={GRID_R} y2={top} stroke="#334155" strokeWidth="0.9" />
                <rect x={GRID_L - 8} y={rowCenter(index) - 4} width={4} height={8} fill={DUTY_COLORS[row.status]} />
                <text x={GRID_L - 16} y={rowCenter(index) + 3} textAnchor="end" fontSize="10" className="fill-slate-700">
                  {row.label}
                </text>
                <text
                  x={GRID_R + TOTALS_W / 2}
                  y={rowCenter(index) + 3}
                  textAnchor="middle"
                  fontSize="10"
                  className="fill-slate-900"
                  fontWeight="600"
                >
                  {day.totals[row.status].toFixed(2)}
                </text>
              </g>
            );
          })}
          <line x1={GRID_L} y1={HEAD_H + GRID_H} x2={GRID_R} y2={HEAD_H + GRID_H} stroke="#334155" strokeWidth="0.9" />
          <text x={GRID_R + TOTALS_W / 2} y={HEAD_H - 6} textAnchor="middle" fontSize="8" className="fill-slate-500">
            Total Hours
          </text>

          {/* duty status trace: colored band for legibility, pen line on top */}
          {day.entries.map((entry, index) => {
            const rowIndex = DUTY_ROWS.findIndex((row) => row.status === entry.status);
            return (
              <line
                key={`band-${index}`}
                x1={x(entry.start_hour)}
                y1={rowCenter(rowIndex)}
                x2={x(entry.end_hour)}
                y2={rowCenter(rowIndex)}
                stroke={DUTY_COLORS[entry.status]}
                strokeWidth="9"
                strokeOpacity="0.32"
                strokeLinecap="butt"
              />
            );
          })}
          <polyline
            points={points}
            fill="none"
            stroke="#0f172a"
            strokeWidth="2"
            strokeLinejoin="miter"
            strokeLinecap="square"
          />

          {/* remarks */}
          <g>
            <rect
              x={GRID_L}
              y={HEAD_H + GRID_H + 6}
              width={GRID_W}
              height={REMARK_H - 18}
              fill="#ffffff"
              stroke="#334155"
              strokeWidth="0.9"
            />
            <text x={GRID_L - 16} y={HEAD_H + GRID_H + 24} textAnchor="end" fontSize="10" className="fill-slate-700">
              Remarks
            </text>
            {dayStops.map(({ stop, hour }, index) => (
              <g key={`stop-${index}`}>
                <line
                  x1={x(hour)}
                  y1={HEAD_H + GRID_H + 6}
                  x2={x(hour)}
                  y2={HEAD_H + GRID_H + 24}
                  stroke="#0f172a"
                  strokeWidth="1"
                />
                <text
                  x={x(hour)}
                  y={HEAD_H + GRID_H + 28}
                  fontSize="7.5"
                  className="fill-slate-700"
                  transform={`rotate(58 ${x(hour)} ${HEAD_H + GRID_H + 28})`}
                >
                  {stop.label.length > 34 ? `${stop.label.slice(0, 33)}…` : stop.label}
                </text>
              </g>
            ))}
          </g>
        </svg>
      </div>

      <footer className="grid gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 text-xs sm:grid-cols-4">
        <div>
          <p className="text-slate-500">On duty hours today (3 + 4)</p>
          <p className="text-sm font-semibold text-slate-900">{formatHours(onDutyTotal)}</p>
        </div>
        <div>
          <p className="text-slate-500">Driving</p>
          <p className="text-sm font-semibold text-slate-900">{formatHours(day.totals.driving)}</p>
        </div>
        <div>
          <p className="text-slate-500">Off duty + sleeper</p>
          <p className="text-sm font-semibold text-slate-900">
            {formatHours(day.totals.off_duty + day.totals.sleeper_berth)}
          </p>
        </div>
        <div>
          <p className="text-slate-500">Miles driven</p>
          <p className="text-sm font-semibold text-slate-900">{day.miles.toLocaleString()}</p>
        </div>
      </footer>
    </article>
  );
}
