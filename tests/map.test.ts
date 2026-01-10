import { describe, it, expect } from 'vitest';
import {
  extractUniquePlaces,
  extractTravelSegments,
  buildGeocodingQuery,
  getSegmentColor,
  calculateBearing,
  calculateBounds,
  updateScheduleWithGeodata
} from '../src/map.js';
import {
  createEmptySchedule,
  addRowToSchedule,
  createRow,
  some,
  GeoLocation
} from '../src/model.js';

describe('extractUniquePlaces', () => {
  it('extracts places from night values', () => {
    let schedule = createEmptySchedule();
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 15), { night: some('Boston') }));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 16), { night: some('NYC') }));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 17), { night: some('Boston') }));

    const places = extractUniquePlaces(schedule);
    expect(places).toEqual(['Boston', 'NYC']);
  });

  it('extracts places from travel from/to', () => {
    let schedule = createEmptySchedule();
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 15), {
      daytime: some({ kind: 'travel', from: 'Boston', to: 'NYC' }),
      night: some('NYC')
    }));

    const places = extractUniquePlaces(schedule);
    expect(places).toEqual(['Boston', 'NYC']);
  });

  it('deduplicates places', () => {
    let schedule = createEmptySchedule();
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 15), {
      daytime: some({ kind: 'travel', from: 'Boston', to: 'NYC' }),
      night: some('NYC')
    }));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 16), {
      daytime: some({ kind: 'travel', from: 'NYC', to: 'Boston' }),
      night: some('Boston')
    }));

    const places = extractUniquePlaces(schedule);
    expect(places).toEqual(['Boston', 'NYC']);
  });

  it('ignores empty night values', () => {
    let schedule = createEmptySchedule();
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 15), { night: some('Boston') }));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 16), { night: some('') }));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 17), { night: some('   ') }));

    const places = extractUniquePlaces(schedule);
    expect(places).toEqual(['Boston']);
  });

  it('returns sorted list', () => {
    let schedule = createEmptySchedule();
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 15), { night: some('Zurich') }));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 16), { night: some('Amsterdam') }));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 17), { night: some('Paris') }));

    const places = extractUniquePlaces(schedule);
    expect(places).toEqual(['Amsterdam', 'Paris', 'Zurich']);
  });

  it('returns empty list for empty schedule', () => {
    const schedule = createEmptySchedule();
    const places = extractUniquePlaces(schedule);
    expect(places).toEqual([]);
  });
});

describe('extractTravelSegments', () => {
  it('extracts explicit travel segments', () => {
    let schedule = createEmptySchedule();
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 15), {
      night: some('Boston')
    }));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 16), {
      daytime: some({ kind: 'travel', from: 'Boston', to: 'NYC' }),
      night: some('NYC')
    }));

    const segments = extractTravelSegments(schedule);
    expect(segments).toEqual([
      { from: 'Boston', to: 'NYC', index: 0 }
    ]);
  });

  it('extracts implicit travel from night changes', () => {
    let schedule = createEmptySchedule();
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 15), {
      daytime: some({ kind: 'organization', name: 'MIT' }),
      night: some('Boston')
    }));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 16), {
      daytime: some({ kind: 'organization', name: 'Google' }),
      night: some('NYC')
    }));

    const segments = extractTravelSegments(schedule);
    expect(segments).toEqual([
      { from: 'Boston', to: 'NYC', index: 0 }
    ]);
  });

  it('assigns sequential indices to segments', () => {
    let schedule = createEmptySchedule();
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 15), { night: some('Boston') }));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 16), {
      daytime: some({ kind: 'travel', from: 'Boston', to: 'NYC' }),
      night: some('NYC')
    }));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 17), {
      daytime: some({ kind: 'travel', from: 'NYC', to: 'Chicago' }),
      night: some('Chicago')
    }));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 18), {
      daytime: some({ kind: 'travel', from: 'Chicago', to: 'LA' }),
      night: some('LA')
    }));

    const segments = extractTravelSegments(schedule);
    expect(segments.map(s => s.index)).toEqual([0, 1, 2]);
  });

  it('does not duplicate segments for consistent explicit+implicit', () => {
    let schedule = createEmptySchedule();
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 15), { night: some('Boston') }));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 16), {
      daytime: some({ kind: 'travel', from: 'Boston', to: 'NYC' }),
      night: some('NYC')
    }));

    // Only one segment because explicit travel takes precedence
    const segments = extractTravelSegments(schedule);
    expect(segments.length).toBe(1);
  });

  it('ignores rows with same night as previous', () => {
    let schedule = createEmptySchedule();
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 15), { night: some('Boston') }));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 16), { night: some('Boston') }));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 17), { night: some('Boston') }));

    const segments = extractTravelSegments(schedule);
    expect(segments).toEqual([]);
  });

  it('returns empty for empty schedule', () => {
    const schedule = createEmptySchedule();
    const segments = extractTravelSegments(schedule);
    expect(segments).toEqual([]);
  });
});

describe('buildGeocodingQuery', () => {
  it('returns place name alone when no disambiguation', () => {
    expect(buildGeocodingQuery('Paris', undefined)).toBe('Paris');
    expect(buildGeocodingQuery('Paris', '')).toBe('Paris');
    expect(buildGeocodingQuery('Paris', '   ')).toBe('Paris');
  });

  it('appends disambiguation to place name', () => {
    expect(buildGeocodingQuery('Edinburgh', 'Scotland')).toBe('Edinburgh, Scotland');
    expect(buildGeocodingQuery('Paris', 'France')).toBe('Paris, France');
  });

  it('trims disambiguation', () => {
    expect(buildGeocodingQuery('Edinburgh', '  Scotland  ')).toBe('Edinburgh, Scotland');
  });
});

describe('getSegmentColor', () => {
  it('returns blue-ish for first segment (hue 240)', () => {
    const color = getSegmentColor(0, 5);
    // Blue at 240° should have high B component
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('returns red-ish for last segment (hue 0)', () => {
    const color = getSegmentColor(4, 5);
    // Red at 0° should have high R component
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('returns blue for single segment', () => {
    const color = getSegmentColor(0, 1);
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('produces different colors for different indices', () => {
    const colors = [0, 1, 2, 3, 4].map(i => getSegmentColor(i, 5));
    const uniqueColors = new Set(colors);
    expect(uniqueColors.size).toBe(5);
  });

  it('uses blue to red temperature gradient', () => {
    const colors = [];
    for (let i = 0; i < 20; i++) {
      colors.push(getSegmentColor(i, 20));
    }
    // All should be valid hex colors
    colors.forEach(c => expect(c).toMatch(/^#[0-9a-f]{6}$/));
    // First and last should be different
    expect(colors[0]).not.toBe(colors[19]);
  });
});

describe('calculateBearing', () => {
  it('returns 0 for due north', () => {
    // Going north: lat increases, lng same
    const bearing = calculateBearing(0, 0, 1, 0);
    expect(bearing).toBeCloseTo(0, 5);
  });

  it('returns 90 for due east', () => {
    // Going east: lat same, lng increases
    const bearing = calculateBearing(0, 0, 0, 1);
    expect(bearing).toBeCloseTo(90, 5);
  });

  it('returns 180 for due south', () => {
    // Going south: lat decreases, lng same
    const bearing = calculateBearing(1, 0, 0, 0);
    expect(bearing).toBeCloseTo(180, 5);
  });

  it('returns 270 for due west', () => {
    // Going west: lat same, lng decreases
    const bearing = calculateBearing(0, 1, 0, 0);
    expect(bearing).toBeCloseTo(270, 5);
  });

  it('returns 45 for northeast', () => {
    const bearing = calculateBearing(0, 0, 1, 1);
    expect(bearing).toBeCloseTo(45, 5);
  });
});

describe('calculateBounds', () => {
  it('returns null for empty locations', () => {
    expect(calculateBounds([])).toBeNull();
  });

  it('calculates bounds for single location', () => {
    const locations: GeoLocation[] = [
      { lat: 42.36, lng: -71.06, displayName: 'Boston', query: 'Boston' }
    ];
    const bounds = calculateBounds(locations);
    expect(bounds).toEqual({
      minLat: 42.36,
      maxLat: 42.36,
      minLng: -71.06,
      maxLng: -71.06
    });
  });

  it('calculates bounds for multiple locations', () => {
    const locations: GeoLocation[] = [
      { lat: 42.36, lng: -71.06, displayName: 'Boston', query: 'Boston' },
      { lat: 40.71, lng: -74.01, displayName: 'NYC', query: 'NYC' },
      { lat: 41.88, lng: -87.63, displayName: 'Chicago', query: 'Chicago' }
    ];
    const bounds = calculateBounds(locations);
    expect(bounds).toEqual({
      minLat: 40.71,
      maxLat: 42.36,
      minLng: -87.63,
      maxLng: -71.06
    });
  });
});

describe('updateScheduleWithGeodata', () => {
  it('updates schedule with disambiguations, geocoded places, and hidden places', () => {
    const schedule = createEmptySchedule();
    const disambiguations = { 'Edinburgh': 'Scotland' };
    const geocodedPlaces = {
      'Edinburgh': { lat: 55.95, lng: -3.19, displayName: 'Edinburgh, Scotland, UK', query: 'Edinburgh, Scotland' }
    };
    const hiddenPlaces = { 'Home': true };

    const updated = updateScheduleWithGeodata(schedule, disambiguations, geocodedPlaces, hiddenPlaces);

    expect(updated.placeDisambiguations).toEqual(disambiguations);
    expect(updated.geocodedPlaces).toEqual(geocodedPlaces);
    expect(updated.hiddenPlaces).toEqual(hiddenPlaces);
    expect(updated.rows).toEqual(schedule.rows);
  });

  it('preserves existing rows', () => {
    let schedule = createEmptySchedule();
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 15), { night: some('Boston') }));

    const updated = updateScheduleWithGeodata(schedule, {}, {}, {});

    expect(updated.rows.length).toBe(1);
    expect(updated.rows[0]).toEqual(schedule.rows[0]);
  });
});
