"use client";

import { useMemo, useSyncExternalStore } from "react";

const STORAGE_KEY = "shiap.favorite-trip-slugs.v1";
const CHANGE_EVENT = "shiap:favorites-updated";

function readFavorites(): string {
  if (typeof window === "undefined") return "[]";
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) return "[]";
    const parsed: unknown = JSON.parse(value);
    return JSON.stringify(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return "[]";
  }
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

export function useFavoriteTripSlugs() {
  const snapshot = useSyncExternalStore(subscribe, readFavorites, () => "[]");
  return useMemo(() => JSON.parse(snapshot) as string[], [snapshot]);
}

export function toggleFavoriteTrip(slug: string) {
  if (typeof window === "undefined") return;
  const current = JSON.parse(readFavorites()) as string[];
  const next = current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug];
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Favorites remain optional when browser storage is unavailable.
  }
}
