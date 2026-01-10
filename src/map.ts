// Map generation module - geocoding and Leaflet visualization

import { Schedule, GeoLocation, isSome } from './model.js';

/** A travel segment between two places */
export interface TravelSegment {
  from: string;
  to: string;
  index: number;  // Order in the trip (0-based)
}

/** Extract all unique place names from the schedule (from night values and travel from/to) */
export function extractUniquePlaces(schedule: Schedule): string[] {
  const places = new Set<string>();

  for (const row of schedule.rows) {
    // Add night location
    if (isSome(row.night) && row.night.value.trim()) {
      places.add(row.night.value.trim());
    }

    // Add travel from/to
    if (isSome(row.daytime) && row.daytime.value.kind === 'travel') {
      const travel = row.daytime.value;
      if (travel.from.trim()) places.add(travel.from.trim());
      if (travel.to.trim()) places.add(travel.to.trim());
    }
  }

  return Array.from(places).sort();
}

/** Extract travel segments in chronological order */
export function extractTravelSegments(schedule: Schedule): TravelSegment[] {
  const segments: TravelSegment[] = [];
  let segmentIndex = 0;

  for (let i = 0; i < schedule.rows.length; i++) {
    const row = schedule.rows[i];

    // Explicit travel in daytime
    if (isSome(row.daytime) && row.daytime.value.kind === 'travel') {
      const travel = row.daytime.value;
      if (travel.from.trim() && travel.to.trim()) {
        segments.push({
          from: travel.from.trim(),
          to: travel.to.trim(),
          index: segmentIndex++
        });
      }
    } else if (i > 0) {
      // Implicit travel: night location changed from previous day
      const prevRow = schedule.rows[i - 1];
      const prevNight = isSome(prevRow.night) ? prevRow.night.value.trim() : '';
      const currNight = isSome(row.night) ? row.night.value.trim() : '';

      if (prevNight && currNight && prevNight !== currNight) {
        segments.push({
          from: prevNight,
          to: currNight,
          index: segmentIndex++
        });
      }
    }
  }

  return segments;
}

/** Build a query string for geocoding, combining place name with disambiguation hint */
export function buildGeocodingQuery(place: string, disambiguation: string | undefined): string {
  if (disambiguation && disambiguation.trim()) {
    return `${place}, ${disambiguation.trim()}`;
  }
  return place;
}

/** Geocode a place using OpenStreetMap Nominatim API */
export async function geocodePlace(query: string): Promise<Omit<GeoLocation, 'query'> | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'TripPlanner/1.0'  // Required by Nominatim
      }
    });

    if (!response.ok) {
      console.error(`Geocoding failed for "${query}": ${response.status}`);
      return null;
    }

    const results = await response.json() as Array<{
      lat: string;
      lon: string;
      display_name: string;
    }>;

    if (results.length === 0) {
      console.warn(`No geocoding results for "${query}"`);
      return null;
    }

    return {
      lat: parseFloat(results[0].lat),
      lng: parseFloat(results[0].lon),
      displayName: results[0].display_name
    };
  } catch (error) {
    console.error(`Geocoding error for "${query}":`, error);
    return null;
  }
}

/** Geocode all places, re-geocoding if disambiguation changed */
export async function geocodeAllPlaces(
  places: string[],
  disambiguations: Record<string, string>,
  existingGeocode: Record<string, GeoLocation>,
  onProgress?: (completed: number, total: number) => void
): Promise<Record<string, GeoLocation>> {
  const result: Record<string, GeoLocation> = { ...existingGeocode };
  let completed = 0;
  let needsDelay = false;

  for (const place of places) {
    const query = buildGeocodingQuery(place, disambiguations[place]);
    const existing = result[place];

    // Skip if already geocoded with the same query
    if (existing && existing.query === query) {
      completed++;
      onProgress?.(completed, places.length);
      continue;
    }

    // Rate limiting: Nominatim requires max 1 request per second
    if (needsDelay) {
      await new Promise(resolve => setTimeout(resolve, 1100));
    }

    const location = await geocodePlace(query);

    if (location) {
      result[place] = { ...location, query };
    }

    completed++;
    onProgress?.(completed, places.length);
    needsDelay = true;
  }

  return result;
}

/** Interpolate HSV color, returning CSS hex string. hue in [0, 360], s/v in [0, 1] */
function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;

  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Get color for a segment, using blue→red temperature gradient */
export function getSegmentColor(segmentIndex: number, totalSegments: number): string {
  if (totalSegments <= 1) {
    return hsvToHex(200, 0.8, 0.85);  // Blue for single segment
  }

  // Use blue (240°) → red (0°) temperature gradient
  // This is intuitive: cool/early → warm/late in the journey
  const t = segmentIndex / (totalSegments - 1);
  const hue = 240 - t * 240;  // 240 -> 0 (blue to red)
  return hsvToHex(hue, 0.85, 0.75);
}

/** Calculate bearing (angle in degrees) from one point to another */
export function calculateBearing(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): number {
  const dx = toLng - fromLng;
  const dy = toLat - fromLat;

  // atan2 gives angle from positive X axis (east), but we want from north
  // Also need to convert from radians to degrees
  const angleRad = Math.atan2(dx, dy);
  const angleDeg = angleRad * 180 / Math.PI;

  // Normalize to 0-360
  return (angleDeg + 360) % 360;
}

/** Calculate bounds that fit all geocoded locations */
export function calculateBounds(
  locations: GeoLocation[]
): { minLat: number; maxLat: number; minLng: number; maxLng: number } | null {
  if (locations.length === 0) return null;

  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;

  for (const loc of locations) {
    minLat = Math.min(minLat, loc.lat);
    maxLat = Math.max(maxLat, loc.lat);
    minLng = Math.min(minLng, loc.lng);
    maxLng = Math.max(maxLng, loc.lng);
  }

  return { minLat, maxLat, minLng, maxLng };
}

/** Update schedule with new disambiguations, geocoded places, and hidden places */
export function updateScheduleWithGeodata(
  schedule: Schedule,
  disambiguations: Record<string, string>,
  geocodedPlaces: Record<string, GeoLocation>,
  hiddenPlaces: Record<string, boolean>
): Schedule {
  return {
    ...schedule,
    placeDisambiguations: disambiguations,
    geocodedPlaces,
    hiddenPlaces
  };
}
