// Reine Hilfsfunktionen für die Suche über mehrere Restaurants.
import { addDays, toHHMM, toMin } from './time.js';

/** Entfernung zweier Koordinaten in Kilometern (Haversine-Formel). */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Wählt aus den Zeitfenstern eines Tages die freien Zeiten rund um die Wunschzeit:
 * höchstens `limit` Stück, höchstens `windowMin` Minuten entfernt, die nächstgelegenen zuerst
 * gewählt und dann chronologisch sortiert. `exact` markiert die Wunschzeit selbst.
 */
export function pickSlots(slots, time, { windowMin = 90, limit = 5 } = {}) {
  const wanted = toMin(time);
  return slots
    .filter((s) => s.available)
    .map((s) => ({ time: s.time, diff: Math.abs(toMin(s.time) - wanted) }))
    .filter((s) => s.diff <= windowMin)
    .sort((a, b) => a.diff - b.diff || a.time.localeCompare(b.time))
    .slice(0, limit)
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((s) => ({ time: s.time, exact: s.diff === 0 }));
}

/**
 * Sinnvolle Vorgabe für das Suchformular: heute 19:00 Uhr; am Abend die nächste halbe Stunde
 * mit gut einer Stunde Vorlauf; spätabends morgen 19:00 Uhr.
 */
export function suggestDateTime(now) {
  if (now.minutes <= 17 * 60 + 30) return { date: now.date, time: '19:00' };
  const next = Math.ceil((now.minutes + 75) / 30) * 30;
  if (next <= 21 * 60) return { date: now.date, time: toHHMM(next) };
  return { date: addDays(now.date, 1), time: '19:00' };
}

/** Gruppiert Zeilen nach restaurant_id. */
export function groupByRestaurant(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.restaurant_id)) map.set(row.restaurant_id, []);
    map.get(row.restaurant_id).push(row);
  }
  return map;
}
