# Spotter ELD Trip Planner

Full-stack trip planner for property-carrying commercial drivers. Enter a trip and it returns
the route, the rest/fuel stops required by the FMCSA hours-of-service rules, and fully drawn
daily log sheets.

**Live app:** <https://spotter-eld-trip-planner-rho.vercel.app>
**API:** <https://spotter-eld-api-btrl.onrender.com/api/health>

> The API is on Render's free tier and sleeps after 15 minutes of inactivity. The first request
> after a cold start can take around 50 seconds; subsequent requests are fast.

**Stack:** Django 5.1 + Django REST Framework · Next.js 16 + React 19 + Tailwind 4 · Leaflet ·
OpenRouteService

---

## Features

- Address autocomplete for current / pickup / dropoff locations
- Truck-profile routing with the full polyline drawn on an interactive map
- Rest breaks, 10-hour resets, fuel stops and pickup/dropoff plotted at their real position
  along the route
- One SVG log sheet per day: 24-hour grid, quarter-hour ticks, continuous duty-status trace,
  remarks annotations and per-row totals
- Multi-day trips produce multiple log sheets automatically

## Inputs and outputs

| Input | |
|---|---|
| Current location | Free text, autocompleted |
| Pickup location | Free text, autocompleted |
| Dropoff location | Free text, autocompleted |
| Current cycle used (hrs) | 0–70 |
| Start time | Optional, defaults to the next hour |

Outputs: route map with stops and rest information, plus filled-out daily log sheets.

---

## Hours-of-service rules implemented

Encoded in [`backend/trips/hos.py`](backend/trips/hos.py):

| Rule | Behaviour |
|---|---|
| 11-hour driving limit | 10 consecutive hours off duty required after 11 hours driving |
| 14-hour driving window | Driving prohibited once 14 hours elapse from coming on duty, even if under 11 driving hours |
| 30-minute rest break | Required after 8 cumulative driving hours |
| 70 hours / 8 days | Cycle seeded with the driver's current used hours |
| 34-hour restart | Inserted automatically when the cycle is exhausted mid-trip |

The 14-hour window is tracked independently of the 11-hour limit, so a driver who spends time
on duty but not driving can run out of window before running out of driving hours. This case is
covered by `test_fourteen_hour_window_can_expire_before_eleven_driving_hours`.

## Assumptions

Per the assessment brief:

- Property-carrying driver, 70 hrs / 8 days, no adverse driving conditions
- Fueling at least once every 1,000 miles (30 minutes, on duty not driving)
- 1 hour on duty for pickup and 1 hour for dropoff

Additional documented decision:

- **Average speed of 55 mph.** OpenRouteService's `driving-hgv` profile returns roughly 35 mph
  averages on interstate runs, which is well below real long-haul pace and inflates the number
  of log sheets. Distances and geometry come from the routing API; the clock is driven by
  `AVERAGE_TRUCK_SPEED_MPH` in [`backend/trips/routing.py`](backend/trips/routing.py). The raw
  API durations are still returned as `ors_durations_hours`.

> **Note on reading the logs:** a single calendar day can legally show more than 11 driving
> hours when it spans two duty periods separated by a 10-hour reset. Each individual duty
> period is still capped at 11.

---

## Running locally

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # or use conda
pip install -r requirements.txt
cp .env.example .env                                # then add your ORS_API_KEY
python manage.py migrate
python manage.py runserver 8000
```

Get a free OpenRouteService key at <https://openrouteservice.org/dev>.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local                          # point at your backend URL
npm run dev
```

Open <http://localhost:3000>.

### Tests

```bash
pytest
```

17 tests covering the HOS engine and the API. The routing layer is stubbed, so the suite needs
no network access and consumes no API quota.

---

## API

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/trips/plan` | Plan a trip and generate log sheets |
| `GET` | `/api/locations/search?q=` | Address autocomplete |
| `GET` | `/api/health` | Health check |

<details>
<summary>Example request and response</summary>

```bash
curl -X POST http://localhost:8000/api/trips/plan \
  -H 'Content-Type: application/json' \
  -d '{
    "current_location": "Dallas, TX",
    "pickup_location": "Oklahoma City, OK",
    "dropoff_location": "Denver, CO",
    "current_cycle_used": 12,
    "start_time": "2026-09-17T23:00:00"
  }'
```

```jsonc
{
  "trip": {
    "total_miles": 855.6,
    "total_driving_hours": 15.56,
    "days_required": 3,
    "cycle_used_after": 29.56,
    "restarts_required": 0
    // ... locations, times, averages
  },
  "route": { "geometry": [[-96.78, 32.73], "..."], "legs": ["..."] },
  "stops": [
    {
      "kind": "break",
      "label": "30 minute rest break",
      "arrival": "2026-09-18T08:00:00",
      "miles_from_start": 440.0,
      "coordinates": [-100.001, 37.361]
    }
  ],
  "days": [
    {
      "date": "2026-09-18",
      "miles": 687.5,
      "totals": { "off_duty": 0.5, "sleeper_berth": 10.0, "driving": 12.5, "on_duty": 1.0 },
      "entries": [
        { "status": "driving", "start_hour": 0.0, "end_hour": 2.85, "remark": "..." }
      ]
    }
  ]
}
```

</details>

Log entries carry `start_hour` / `end_hour` as 0–24 floats so the grid renders without any
date arithmetic in the browser. Stop coordinates are interpolated along the route polyline, so
a rest at mile 440 is drawn at its actual geographic position.

---

## Project structure

```
backend/
  trips/hos.py         HOS simulator — pure Python, no Django imports
  trips/routing.py     OpenRouteService geocoding + routing
  trips/services.py    Joins routing to the HOS timeline, shapes the response
  trips/views.py       DRF endpoints
  tests/               17 tests
frontend/
  app/page.tsx         Main page
  components/          TripForm, LocationInput, RouteMap, LogSheet, TripSummary
  lib/                 API client, types, shared duty-status helpers
```

The HOS engine has no Django dependency, which keeps it independently testable and portable.

---

## Deployment

- **Frontend:** Vercel. Set `NEXT_PUBLIC_API_BASE_URL` to the deployed backend's `/api` URL.
- **Backend:** Render or Railway. Vercel's serverless runtime is not a good fit for Django here.
  Set `ORS_API_KEY`, `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=False`, `ALLOWED_HOSTS` and
  `CORS_ALLOWED_ORIGINS`.

Secrets are read from the environment; `.env` files are gitignored.
