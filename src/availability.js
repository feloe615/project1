// Reine Verfügbarkeitslogik ohne Datenbankzugriff – dadurch leicht testbar.
import { daysBetween, toHHMM, toMin, weekdayOf } from './time.js';

const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

/**
 * Kleinster freier Tisch, der zur Gruppengröße passt, oder null.
 * `reservations` enthält nur aktive Reservierungen des Tages.
 */
export function findTable(tables, reservations, partySize, start, end) {
  const busy = new Set(
    reservations.filter((r) => overlaps(start, end, r.start_min, r.end_min)).map((r) => r.table_id),
  );
  return (
    tables
      .filter((t) => t.active && t.min_capacity <= partySize && partySize <= t.max_capacity && !busy.has(t.id))
      .sort((a, b) => a.max_capacity - b.max_capacity || a.id - b.id)[0] ?? null
  );
}

/**
 * Liefert alle Zeitfenster eines Tages als [{ time: 'HH:MM', available: boolean }].
 * Leeres Array = an diesem Tag keine Buchung möglich (geschlossen, Vergangenheit, zu weit in der Zukunft).
 */
export function computeSlots({ restaurant, hours, tables, reservations, closed, date, partySize, now }) {
  if (closed) return [];
  if (partySize < 1 || partySize > restaurant.max_party_size) return [];

  const dayOffset = daysBetween(now.date, date);
  if (dayOffset < 0 || dayOffset > restaurant.booking_horizon_days) return [];
  // Früheste buchbare Minute an `date` (kann negativ sein = keine Einschränkung).
  const earliest = now.minutes + restaurant.min_notice_min - dayOffset * 1440;

  const weekday = weekdayOf(date);
  const { duration_min: duration, slot_interval_min: step } = restaurant;
  const slots = new Map();

  for (const period of hours.filter((h) => h.weekday === weekday)) {
    const first = toMin(period.first_seating);
    const last = toMin(period.last_seating);
    for (let t = first; t <= last; t += step) {
      if (t < earliest || slots.has(t)) continue;
      const table = findTable(tables, reservations, partySize, t, t + duration);
      slots.set(t, table !== null);
    }
  }

  return [...slots.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, available]) => ({ time: toHHMM(t), available }));
}
