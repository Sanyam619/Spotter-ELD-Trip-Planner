"use client";

import { useEffect, useRef, useState } from "react";

import { searchLocations } from "@/lib/api";
import type { PlaceRef } from "@/lib/types";

interface Props {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}

export default function LocationInput({ id, label, value, placeholder, onChange }: Props) {
  const [suggestions, setSuggestions] = useState<PlaceRef[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  // Suppresses the lookup that would otherwise fire right after picking a suggestion.
  const skipNextLookup = useRef(false);

  useEffect(() => {
    if (skipNextLookup.current) {
      skipNextLookup.current = false;
      return;
    }
    if (value.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const results = await searchLocations(value, controller.signal);
        setSuggestions(results);
        setHighlight(-1);
      } catch {
        /* aborted or offline — leave the previous suggestions alone */
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function select(place: PlaceRef) {
    skipNextLookup.current = true;
    onChange(place.label);
    setOpen(false);
    setSuggestions([]);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" && highlight >= 0) {
      event.preventDefault();
      select(suggestions[highlight]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-600 uppercase">
        {label}
      </label>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-[1000] mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {suggestions.map((place, index) => (
            <li key={`${place.label}-${index}`}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(index)}
                onClick={() => select(place)}
                className={`block w-full px-3 py-2 text-left text-sm transition ${
                  index === highlight ? "bg-sky-50 text-sky-900" : "text-slate-700"
                }`}
              >
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
