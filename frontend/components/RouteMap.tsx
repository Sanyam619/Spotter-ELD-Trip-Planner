"use client";

import "leaflet/dist/leaflet.css";

import { useEffect } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";

import { STOP_STYLES, formatClock, formatHours } from "@/lib/duty";
import type { TripPlan } from "@/lib/types";

type LatLng = [number, number];

// API geometry is [lon, lat]; Leaflet expects [lat, lon].
const toLatLng = (coords: [number, number]): LatLng => [coords[1], coords[0]];

function FitBounds({ positions }: { positions: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 1) {
      map.fitBounds(positions, { padding: [40, 40] });
    }
  }, [map, positions]);
  return null;
}

export default function RouteMap({ plan }: { plan: TripPlan }) {
  const line = plan.route.geometry.map(toLatLng);
  const waypoints = [
    { label: `Start — ${plan.trip.current.label}`, coords: plan.trip.current.coordinates },
    { label: `Pickup — ${plan.trip.pickup.label}`, coords: plan.trip.pickup.coordinates },
    { label: `Dropoff — ${plan.trip.dropoff.label}`, coords: plan.trip.dropoff.coordinates },
  ];

  return (
    <MapContainer
      center={line[0] ?? [39.5, -98.35]}
      zoom={5}
      scrollWheelZoom
      className="h-full w-full"
      style={{ background: "#e2e8f0" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Polyline positions={line} pathOptions={{ color: "#0369a1", weight: 5, opacity: 0.85 }} />
      <FitBounds positions={line} />

      {plan.stops.map((stop, index) => {
        const style = STOP_STYLES[stop.kind];
        return (
          <CircleMarker
            key={`stop-${index}`}
            center={toLatLng(stop.coordinates)}
            radius={7}
            pathOptions={{ color: "#ffffff", weight: 2, fillColor: style.color, fillOpacity: 1 }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              <span className="text-xs">
                <strong>{style.label}</strong>
                <br />
                {stop.label}
                <br />
                {formatClock(stop.arrival)} · {formatHours(stop.hours)} · mi{" "}
                {stop.miles_from_start.toLocaleString()}
              </span>
            </Tooltip>
          </CircleMarker>
        );
      })}

      {waypoints.map((point, index) => (
        <CircleMarker
          key={`wp-${index}`}
          center={toLatLng(point.coords)}
          radius={9}
          pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#0f172a", fillOpacity: 1 }}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            <span className="text-xs font-semibold">{point.label}</span>
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
