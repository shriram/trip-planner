import { describe, it, expect } from 'vitest';
import {
  getDayOfWeek,
  isWeekend,
  isValidYear,
  addDays,
  nextMonday,
  formatDate,
  parseDate,
  parseDaytime,
  formatDaytime,
  createRow,
  addRowToSchedule,
  removeRowFromSchedule,
  updateRowInSchedule,
  createEmptySchedule,
  serializeSchedule,
  deserializeSchedule,
  autoPopulateDates,
  recalculateDates,
  printToHtml,
  printToMarkdown,
  some,
  none,
  isSome,
  isNone,
  getOrDefault
} from '../src/model.js';

describe('Option type utilities', () => {
  it('some creates a set option', () => {
    const opt = some('hello');
    expect(isSome(opt)).toBe(true);
    expect(isNone(opt)).toBe(false);
    if (isSome(opt)) {
      expect(opt.value).toBe('hello');
    }
  });

  it('none creates an unset option', () => {
    const opt = none<string>();
    expect(isNone(opt)).toBe(true);
    expect(isSome(opt)).toBe(false);
  });

  it('getOrDefault returns value or default', () => {
    expect(getOrDefault(some('hello'), 'default')).toBe('hello');
    expect(getOrDefault(none(), 'default')).toBe('default');
  });
});

describe('Date utilities', () => {
  it('getDayOfWeek returns correct day', () => {
    // January 1, 2024 was a Monday
    expect(getDayOfWeek(new Date(2024, 0, 1))).toBe('Mon');
    expect(getDayOfWeek(new Date(2024, 0, 2))).toBe('Tue');
    expect(getDayOfWeek(new Date(2024, 0, 6))).toBe('Sat');
    expect(getDayOfWeek(new Date(2024, 0, 7))).toBe('Sun');
  });

  it('isWeekend detects weekends', () => {
    expect(isWeekend(new Date(2024, 0, 1))).toBe(false); // Monday
    expect(isWeekend(new Date(2024, 0, 5))).toBe(false); // Friday
    expect(isWeekend(new Date(2024, 0, 6))).toBe(true);  // Saturday
    expect(isWeekend(new Date(2024, 0, 7))).toBe(true);  // Sunday
  });

  it('isValidYear validates year range', () => {
    expect(isValidYear(new Date(1899, 0, 1))).toBe(false);
    expect(isValidYear(new Date(1900, 0, 1))).toBe(true);
    expect(isValidYear(new Date(1969, 6, 20))).toBe(true); // Apollo 11 moon landing
    expect(isValidYear(new Date(2024, 0, 1))).toBe(true);
    expect(isValidYear(new Date(2099, 0, 1))).toBe(true);
    expect(isValidYear(new Date(2100, 0, 1))).toBe(false);
  });

  it('addDays adds days correctly', () => {
    const date = new Date(2024, 0, 15);
    expect(formatDate(addDays(date, 1))).toBe('2024-01-16');
    expect(formatDate(addDays(date, 7))).toBe('2024-01-22');
    expect(formatDate(addDays(date, -5))).toBe('2024-01-10');
  });

  it('addDays handles month boundaries', () => {
    expect(formatDate(addDays(new Date(2024, 0, 31), 1))).toBe('2024-02-01');
    expect(formatDate(addDays(new Date(2024, 1, 29), 1))).toBe('2024-03-01'); // Leap year
  });

  it('nextMonday finds next Monday', () => {
    // From a Wednesday
    expect(getDayOfWeek(nextMonday(new Date(2024, 0, 3)))).toBe('Mon');
    expect(formatDate(nextMonday(new Date(2024, 0, 3)))).toBe('2024-01-08');

    // From a Saturday
    expect(formatDate(nextMonday(new Date(2024, 0, 6)))).toBe('2024-01-08');

    // From a Sunday
    expect(formatDate(nextMonday(new Date(2024, 0, 7)))).toBe('2024-01-08');
  });

  it('formatDate produces ISO format', () => {
    expect(formatDate(new Date(2024, 0, 1))).toBe('2024-01-01');
    expect(formatDate(new Date(2024, 11, 31))).toBe('2024-12-31');
  });

  it('parseDate parses ISO format', () => {
    const date = parseDate('2024-03-15');
    expect(date).not.toBeNull();
    expect(formatDate(date!)).toBe('2024-03-15');
  });

  it('parseDate rejects invalid dates', () => {
    expect(parseDate('invalid')).toBeNull();
    expect(parseDate('2024/03/15')).toBeNull();
    expect(parseDate('1899-01-01')).toBeNull(); // Before 1900
    expect(parseDate('2100-01-01')).toBeNull(); // After 2099
  });

  it('parseDate accepts historical dates', () => {
    const apolloDate = parseDate('1969-07-20');
    expect(apolloDate).not.toBeNull();
    expect(formatDate(apolloDate!)).toBe('1969-07-20');
    expect(getDayOfWeek(apolloDate!)).toBe('Sun'); // Apollo 11 landed on a Sunday
  });

  it('handles leap years correctly for historical dates', () => {
    // 1900 was NOT a leap year (divisible by 100 but not 400)
    expect(formatDate(addDays(new Date(1900, 1, 28), 1))).toBe('1900-03-01');
    // 2000 WAS a leap year (divisible by 400)
    expect(formatDate(addDays(new Date(2000, 1, 28), 1))).toBe('2000-02-29');
    // 1904 was a leap year (divisible by 4)
    expect(formatDate(addDays(new Date(1904, 1, 28), 1))).toBe('1904-02-29');
  });
});

describe('Daytime parsing', () => {
  it('parses empty string', () => {
    expect(parseDaytime('')).toEqual({ kind: 'empty' });
    expect(parseDaytime('   ')).toEqual({ kind: 'empty' });
  });

  it('parses personal', () => {
    expect(parseDaytime('personal')).toEqual({ kind: 'personal' });
    expect(parseDaytime('Personal')).toEqual({ kind: 'personal' });
    expect(parseDaytime('PERSONAL')).toEqual({ kind: 'personal' });
  });

  it('parses travel with various arrows', () => {
    expect(parseDaytime('Boston --> NYC')).toEqual({ kind: 'travel', from: 'Boston', to: 'NYC' });
    expect(parseDaytime('Boston -> NYC')).toEqual({ kind: 'travel', from: 'Boston', to: 'NYC' });
    expect(parseDaytime('Boston ⭢ NYC')).toEqual({ kind: 'travel', from: 'Boston', to: 'NYC' });
    expect(parseDaytime('Boston → NYC')).toEqual({ kind: 'travel', from: 'Boston', to: 'NYC' });
  });

  it('parses organization names', () => {
    expect(parseDaytime('MIT')).toEqual({ kind: 'organization', name: 'MIT' });
    expect(parseDaytime('Google HQ')).toEqual({ kind: 'organization', name: 'Google HQ' });
  });

  it('formatDaytime formats correctly', () => {
    expect(formatDaytime({ kind: 'empty' })).toBe('');
    expect(formatDaytime({ kind: 'personal' })).toBe('personal');
    expect(formatDaytime({ kind: 'travel', from: 'A', to: 'B' })).toBe('A → B');
    expect(formatDaytime({ kind: 'organization', name: 'MIT' })).toBe('MIT');
  });
});

describe('Schedule operations', () => {
  it('creates empty schedule', () => {
    const schedule = createEmptySchedule();
    expect(schedule.rows).toEqual([]);
  });

  it('creates row with defaults', () => {
    const date = new Date(2024, 0, 15);
    const row = createRow(date);
    expect(row.date).toEqual(date);
    expect(isNone(row.daytime)).toBe(true);
    expect(isNone(row.night)).toBe(true);
    expect(row.attend).toBe(false);
  });

  it('creates row with overrides', () => {
    const date = new Date(2024, 0, 15);
    const row = createRow(date, { night: some('Boston'), attend: true });
    expect(isSome(row.night)).toBe(true);
    if (isSome(row.night)) {
      expect(row.night.value).toBe('Boston');
    }
    expect(row.attend).toBe(true);
  });

  it('adds row to schedule', () => {
    let schedule = createEmptySchedule();
    const row = createRow(new Date(2024, 0, 15));
    schedule = addRowToSchedule(schedule, row);
    expect(schedule.rows.length).toBe(1);
    expect(schedule.rows[0]).toEqual(row);
  });

  it('removes row from schedule', () => {
    let schedule = createEmptySchedule();
    const row1 = createRow(new Date(2024, 0, 15));
    const row2 = createRow(new Date(2024, 0, 16));
    schedule = addRowToSchedule(schedule, row1);
    schedule = addRowToSchedule(schedule, row2);
    schedule = removeRowFromSchedule(schedule, row1.id);
    expect(schedule.rows.length).toBe(1);
    expect(schedule.rows[0].id).toBe(row2.id);
  });

  it('updates row in schedule', () => {
    let schedule = createEmptySchedule();
    const row = createRow(new Date(2024, 0, 15));
    schedule = addRowToSchedule(schedule, row);
    schedule = updateRowInSchedule(schedule, row.id, { night: some('NYC') });
    expect(isSome(schedule.rows[0].night)).toBe(true);
    if (isSome(schedule.rows[0].night)) {
      expect(schedule.rows[0].night.value).toBe('NYC');
    }
  });

  it('auto-populates dates', () => {
    const baseDate = new Date(2024, 0, 15);
    let schedule = createEmptySchedule();
    schedule = addRowToSchedule(schedule, createRow(baseDate));
    schedule = addRowToSchedule(schedule, createRow(baseDate)); // Same date initially
    schedule = addRowToSchedule(schedule, createRow(baseDate));
    schedule = autoPopulateDates(schedule);

    expect(formatDate(schedule.rows[0].date)).toBe('2024-01-15');
    expect(formatDate(schedule.rows[1].date)).toBe('2024-01-16');
    expect(formatDate(schedule.rows[2].date)).toBe('2024-01-17');
  });
});

describe('Date recalculation with pinned columns', () => {
  it('keeps pinned data attached to original date when shifting forward', () => {
    // Start with schedule: Jan 15, 16, 17
    // Other event on Jan 17
    // Change first date to Jan 16 -> schedule becomes Jan 16, 17, 18
    // Other event should stay on Jan 17 (now row index 1)
    let schedule = createEmptySchedule();
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 15)));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 16)));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 17), {
      otherEvent: some({ kind: 'personal' }),
      otherLocation: some('Conference Center')
    }));

    // Simulate changing first date to Jan 16
    schedule.rows[0] = { ...schedule.rows[0], date: new Date(2024, 0, 16) };
    schedule = recalculateDates(schedule);

    // Dates should be Jan 16, 17, 18
    expect(formatDate(schedule.rows[0].date)).toBe('2024-01-16');
    expect(formatDate(schedule.rows[1].date)).toBe('2024-01-17');
    expect(formatDate(schedule.rows[2].date)).toBe('2024-01-18');

    // Other event should now be on row 1 (Jan 17), not row 2
    expect(isNone(schedule.rows[0].otherEvent)).toBe(true);
    expect(isSome(schedule.rows[1].otherEvent)).toBe(true);
    expect(isSome(schedule.rows[1].otherLocation)).toBe(true);
    if (isSome(schedule.rows[1].otherLocation)) {
      expect(schedule.rows[1].otherLocation.value).toBe('Conference Center');
    }
    expect(isNone(schedule.rows[2].otherEvent)).toBe(true);
  });

  it('keeps pinned data attached when shifting backward', () => {
    // Start with schedule: Jan 15, 16, 17
    // Other event on Jan 16 (row 1)
    // Change first date to Jan 14 -> schedule becomes Jan 14, 15, 16
    // Other event should stay on Jan 16 (now row index 2)
    let schedule = createEmptySchedule();
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 15)));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 16), {
      otherEvent: some({ kind: 'organization', name: 'Meeting' }),
      otherLocation: some('Office')
    }));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 17)));

    // Simulate changing first date to Jan 14
    schedule.rows[0] = { ...schedule.rows[0], date: new Date(2024, 0, 14) };
    schedule = recalculateDates(schedule);

    // Dates should be Jan 14, 15, 16
    expect(formatDate(schedule.rows[0].date)).toBe('2024-01-14');
    expect(formatDate(schedule.rows[1].date)).toBe('2024-01-15');
    expect(formatDate(schedule.rows[2].date)).toBe('2024-01-16');

    // Other event should now be on row 2 (Jan 16)
    expect(isNone(schedule.rows[0].otherEvent)).toBe(true);
    expect(isNone(schedule.rows[1].otherEvent)).toBe(true);
    expect(isSome(schedule.rows[2].otherEvent)).toBe(true);
    if (isSome(schedule.rows[2].otherEvent)) {
      expect(schedule.rows[2].otherEvent.value).toEqual({ kind: 'organization', name: 'Meeting' });
    }
  });

  it('drops pinned data when date falls outside schedule range', () => {
    // Start with schedule: Jan 15, 16, 17
    // Other event on Jan 16 (row 1)
    // Change first date to Jan 20 -> schedule becomes Jan 20, 21, 22
    // Other event on Jan 16 should be lost (no matching row)
    let schedule = createEmptySchedule();
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 15)));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 16), {
      otherEvent: some({ kind: 'personal' }),
      otherLocation: some('Home')
    }));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 17)));

    // Simulate changing first date to Jan 20
    schedule.rows[0] = { ...schedule.rows[0], date: new Date(2024, 0, 20) };
    schedule = recalculateDates(schedule);

    // All rows should have no Other data (Jan 16 is outside Jan 20-22 range)
    expect(isNone(schedule.rows[0].otherEvent)).toBe(true);
    expect(isNone(schedule.rows[1].otherEvent)).toBe(true);
    expect(isNone(schedule.rows[2].otherEvent)).toBe(true);
  });

  it('handles multiple pinned events on different dates', () => {
    let schedule = createEmptySchedule();
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 15)));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 16), {
      otherEvent: some({ kind: 'organization', name: 'Event A' })
    }));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 17), {
      otherEvent: some({ kind: 'organization', name: 'Event B' })
    }));

    // Shift forward by one day: Jan 16, 17, 18
    // Event A (Jan 16) should stay on row 0, Event B (Jan 17) should be on row 1
    schedule.rows[0] = { ...schedule.rows[0], date: new Date(2024, 0, 16) };
    schedule = recalculateDates(schedule);

    expect(isSome(schedule.rows[0].otherEvent)).toBe(true);
    if (isSome(schedule.rows[0].otherEvent)) {
      expect(schedule.rows[0].otherEvent.value).toEqual({ kind: 'organization', name: 'Event A' });
    }
    expect(isSome(schedule.rows[1].otherEvent)).toBe(true);
    if (isSome(schedule.rows[1].otherEvent)) {
      expect(schedule.rows[1].otherEvent.value).toEqual({ kind: 'organization', name: 'Event B' });
    }
    expect(isNone(schedule.rows[2].otherEvent)).toBe(true);
  });

  it('preserves attend checkbox when recalculating', () => {
    let schedule = createEmptySchedule();
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 15)));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 16), {
      attend: true
    }));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 17)));

    // Shift forward by one day
    schedule.rows[0] = { ...schedule.rows[0], date: new Date(2024, 0, 16) };
    schedule = recalculateDates(schedule);

    // Attend should now be on row 0 (Jan 16)
    expect(schedule.rows[0].attend).toBe(true);
    expect(schedule.rows[1].attend).toBe(false);
    expect(schedule.rows[2].attend).toBe(false);
  });

  it('returns empty schedule unchanged', () => {
    const schedule = createEmptySchedule();
    const result = recalculateDates(schedule);
    expect(result.rows.length).toBe(0);
  });
});

describe('Serialization', () => {
  it('round-trips schedule through JSON', () => {
    let schedule = createEmptySchedule();
    const row1 = createRow(new Date(2024, 0, 15), {
      daytime: some({ kind: 'organization', name: 'MIT' }),
      night: some('Boston'),
      otherEvent: some({ kind: 'personal' }),
      otherLocation: some('Cambridge'),
      attend: true
    });
    const row2 = createRow(new Date(2024, 0, 16), {
      daytime: some({ kind: 'travel', from: 'Boston', to: 'NYC' }),
      night: some('NYC')
    });
    schedule = addRowToSchedule(schedule, row1);
    schedule = addRowToSchedule(schedule, row2);

    const json = serializeSchedule(schedule);
    const restored = deserializeSchedule(json);

    expect(restored).not.toBeNull();
    expect(restored!.rows.length).toBe(2);
    expect(formatDate(restored!.rows[0].date)).toBe('2024-01-15');

    const restoredRow0 = restored!.rows[0];
    expect(isSome(restoredRow0.daytime)).toBe(true);
    if (isSome(restoredRow0.daytime)) {
      expect(restoredRow0.daytime.value).toEqual({ kind: 'organization', name: 'MIT' });
    }
    expect(isSome(restoredRow0.night)).toBe(true);
    if (isSome(restoredRow0.night)) {
      expect(restoredRow0.night.value).toBe('Boston');
    }
    expect(restoredRow0.attend).toBe(true);

    const restoredRow1 = restored!.rows[1];
    expect(isSome(restoredRow1.daytime)).toBe(true);
    if (isSome(restoredRow1.daytime)) {
      expect(restoredRow1.daytime.value).toEqual({ kind: 'travel', from: 'Boston', to: 'NYC' });
    }
  });

  it('handles unset options in serialization', () => {
    let schedule = createEmptySchedule();
    const row = createRow(new Date(2024, 0, 15)); // All options unset
    schedule = addRowToSchedule(schedule, row);

    const json = serializeSchedule(schedule);
    const restored = deserializeSchedule(json);

    expect(restored).not.toBeNull();
    const restoredRow = restored!.rows[0];
    expect(isNone(restoredRow.daytime)).toBe(true);
    expect(isNone(restoredRow.night)).toBe(true);
    expect(isNone(restoredRow.otherEvent)).toBe(true);
    expect(isNone(restoredRow.otherLocation)).toBe(true);
  });

  it('rejects invalid JSON', () => {
    expect(deserializeSchedule('not json')).toBeNull();
    expect(deserializeSchedule('{"version": 99}')).toBeNull();
  });

  it('handles version 1 data (backwards compatible)', () => {
    const v1Json = JSON.stringify({
      version: 1,
      rows: [{
        date: '2024-01-15',
        daytime: { set: true, value: { kind: 'personal' } },
        night: { set: true, value: 'Boston' },
        otherEvent: { set: false },
        otherLocation: { set: false },
        attend: false
      }]
    });

    const restored = deserializeSchedule(v1Json);
    expect(restored).not.toBeNull();
    expect(restored!.rows.length).toBe(1);
    // v1 data should get empty disambiguations and geocodedPlaces
    expect(restored!.placeDisambiguations).toEqual({});
    expect(restored!.geocodedPlaces).toEqual({});
  });

  it('serializes and deserializes place disambiguations and geocoded places', () => {
    let schedule = createEmptySchedule();
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 15), { night: some('Edinburgh') }));
    schedule.placeDisambiguations = { 'Edinburgh': 'Scotland' };
    schedule.geocodedPlaces = {
      'Edinburgh': { lat: 55.95, lng: -3.19, displayName: 'Edinburgh, Scotland, UK', query: 'Edinburgh, Scotland' }
    };

    const json = serializeSchedule(schedule);
    const restored = deserializeSchedule(json);

    expect(restored).not.toBeNull();
    expect(restored!.placeDisambiguations).toEqual({ 'Edinburgh': 'Scotland' });
    expect(restored!.geocodedPlaces).toEqual({
      'Edinburgh': { lat: 55.95, lng: -3.19, displayName: 'Edinburgh, Scotland, UK', query: 'Edinburgh, Scotland' }
    });
  });

  it('handles old geocoded data without query field', () => {
    // Simulate old v2 data without query field
    const oldJson = JSON.stringify({
      version: 2,
      rows: [],
      placeDisambiguations: {},
      geocodedPlaces: {
        'Boston': { lat: 42.36, lng: -71.06, displayName: 'Boston, MA, USA' }
      },
      hiddenPlaces: {}
    });

    const restored = deserializeSchedule(oldJson);
    expect(restored).not.toBeNull();
    // Should have empty query, which will trigger re-geocode if disambiguation changes
    expect(restored!.geocodedPlaces['Boston'].query).toBe('');
  });
});

describe('Print options', () => {
  it('printToHtml includes all rows by default', () => {
    let schedule = createEmptySchedule();
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 15), {
      daytime: some({ kind: 'organization', name: 'MIT' }),
      night: some('Boston')
    }));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 16), {
      daytime: some({ kind: 'travel', from: 'Boston', to: 'NYC' }),
      night: some('NYC')
    }));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 17), {
      daytime: some({ kind: 'personal' }),
      night: some('NYC')
    }));

    const html = printToHtml(schedule);
    expect(html).toContain('MIT');
    expect(html).toContain('Boston → NYC');
    expect(html).toContain('personal');
  });

  it('printToHtml filters to events only when option set', () => {
    let schedule = createEmptySchedule();
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 15), {
      daytime: some({ kind: 'organization', name: 'MIT' }),
      night: some('Boston')
    }));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 16), {
      daytime: some({ kind: 'travel', from: 'Boston', to: 'NYC' }),
      night: some('NYC')
    }));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 17), {
      daytime: some({ kind: 'personal' }),
      night: some('NYC')
    }));

    const html = printToHtml(schedule, { eventsOnly: true, showPinned: false });
    expect(html).toContain('MIT');
    expect(html).not.toContain('Boston → NYC');
    expect(html).not.toContain('personal');
  });

  it('printToHtml includes pinned columns when option set', () => {
    let schedule = createEmptySchedule();
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 15), {
      daytime: some({ kind: 'organization', name: 'MIT' }),
      night: some('Boston'),
      otherEvent: some({ kind: 'organization', name: 'Conference' }),
      otherLocation: some('Cambridge'),
      attend: true
    }));

    const htmlWithoutPinned = printToHtml(schedule, { eventsOnly: false, showPinned: false });
    expect(htmlWithoutPinned).not.toContain('Conference');
    expect(htmlWithoutPinned).not.toContain('Cambridge');

    const htmlWithPinned = printToHtml(schedule, { eventsOnly: false, showPinned: true });
    expect(htmlWithPinned).toContain('Conference');
    expect(htmlWithPinned).toContain('Cambridge');
    expect(htmlWithPinned).toContain('✓');
  });

  it('printToMarkdown filters to events only when option set', () => {
    let schedule = createEmptySchedule();
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 15), {
      daytime: some({ kind: 'organization', name: 'MIT' }),
      night: some('Boston')
    }));
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 16), {
      daytime: some({ kind: 'travel', from: 'Boston', to: 'NYC' }),
      night: some('NYC')
    }));

    const md = printToMarkdown(schedule, { eventsOnly: true, showPinned: false });
    expect(md).toContain('MIT');
    expect(md).not.toContain('Boston → NYC');
  });

  it('printToMarkdown includes pinned columns when option set', () => {
    let schedule = createEmptySchedule();
    schedule = addRowToSchedule(schedule, createRow(new Date(2024, 0, 15), {
      daytime: some({ kind: 'organization', name: 'MIT' }),
      night: some('Boston'),
      otherEvent: some({ kind: 'organization', name: 'Conference' }),
      otherLocation: some('Cambridge'),
      attend: true
    }));

    const mdWithPinned = printToMarkdown(schedule, { eventsOnly: false, showPinned: true });
    expect(mdWithPinned).toContain('Pinned Event');
    expect(mdWithPinned).toContain('Conference');
    expect(mdWithPinned).toContain('Cambridge');
  });
});
