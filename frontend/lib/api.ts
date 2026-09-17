import type { PlaceRef, TripPlan, TripPlanRequest } from "./types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:8000/api";

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") return body.detail;
    const firstField = Object.entries(body)[0];
    if (firstField) {
      const [field, messages] = firstField;
      const text = Array.isArray(messages) ? messages[0] : String(messages);
      return `${field.replace(/_/g, " ")}: ${text}`;
    }
  } catch {
    /* fall through to the generic message */
  }
  return `Request failed (${response.status})`;
}

export async function planTrip(payload: TripPlanRequest): Promise<TripPlan> {
  const response = await fetch(`${API_BASE}/trips/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function searchLocations(query: string, signal?: AbortSignal): Promise<PlaceRef[]> {
  const response = await fetch(`${API_BASE}/locations/search?q=${encodeURIComponent(query)}`, {
    signal,
  });
  if (!response.ok) return [];
  const body = await response.json();
  return body.results ?? [];
}
