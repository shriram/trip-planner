import { describe, it, expect } from 'vitest';
import {
  createRow,
  createEmptySchedule,
  addRowToSchedule,
  some,
  isSome
} from '../src/model.js';
import {
  checkConstraints,
  suggestRepairs,
  applyRepairAndRecheck,
  rowHasViolation,
  getViolationsForRow
} from '../src/constraints.js';

describe('Constraint checking', () => {
  describe('Organization on weekend constraint', () => {
    it('flags organization visit on Saturday', () => {
      // January 6, 2024 is a Saturday
      let schedule = createEmptySchedule();
      const row = createRow(new Date(2024, 0, 6), {
        daytime: some({ kind: 'organization', name: 'MIT' })
      });
      schedule = addRowToSchedule(schedule, row);

      const violations = checkConstraints(schedule);
      expect(violations.length).toBe(1);
      expect(violations[0].type).toBe('org-on-weekend');
      expect(violations[0].rowId).toBe(row.id);
    });

    it('flags organization visit on Sunday', () => {
      // January 7, 2024 is a Sunday
      let schedule = createEmptySchedule();
      const row = createRow(new Date(2024, 0, 7), {
        daytime: some({ kind: 'organization', name: 'Google' })
      });
      schedule = addRowToSchedule(schedule, row);

      const violations = checkConstraints(schedule);
      expect(violations.length).toBe(1);
      expect(violations[0].type).toBe('org-on-weekend');
    });

    it('allows organization visit on weekday', () => {
      // January 8, 2024 is a Monday
      let schedule = createEmptySchedule();
      const row = createRow(new Date(2024, 0, 8), {
        daytime: some({ kind: 'organization', name: 'MIT' })
      });
      schedule = addRowToSchedule(schedule, row);

      const violations = checkConstraints(schedule);
      expect(violations.length).toBe(0);
    });

    it('allows personal day on weekend', () => {
      let schedule = createEmptySchedule();
      const row = createRow(new Date(2024, 0, 6), {
        daytime: some({ kind: 'personal' })
      });
      schedule = addRowToSchedule(schedule, row);

      const violations = checkConstraints(schedule);
      expect(violations.length).toBe(0);
    });

    it('allows travel on weekend', () => {
      let schedule = createEmptySchedule();
      const row = createRow(new Date(2024, 0, 6), {
        daytime: some({ kind: 'travel', from: 'Boston', to: 'NYC' })
      });
      schedule = addRowToSchedule(schedule, row);

      const violations = checkConstraints(schedule);
      expect(violations.length).toBe(0);
    });

    it('allows unset daytime on weekend', () => {
      let schedule = createEmptySchedule();
      const row = createRow(new Date(2024, 0, 6)); // daytime is none()
      schedule = addRowToSchedule(schedule, row);

      const violations = checkConstraints(schedule);
      expect(violations.length).toBe(0);
    });
  });

  describe('Location continuity constraint', () => {
    it('flags location change without travel', () => {
      let schedule = createEmptySchedule();
      const row1 = createRow(new Date(2024, 0, 8), {
        night: some('Boston'),
        daytime: some({ kind: 'organization', name: 'MIT' })
      });
      const row2 = createRow(new Date(2024, 0, 9), {
        night: some('NYC'),
        daytime: some({ kind: 'organization', name: 'Columbia' })
      });
      schedule = addRowToSchedule(schedule, row1);
      schedule = addRowToSchedule(schedule, row2);

      const violations = checkConstraints(schedule);
      expect(violations.length).toBe(1);
      expect(violations[0].type).toBe('location-discontinuity');
      expect(violations[0].rowIndex).toBe(1);
    });

    it('allows location change with correct travel', () => {
      let schedule = createEmptySchedule();
      const row1 = createRow(new Date(2024, 0, 8), {
        night: some('Boston'),
        daytime: some({ kind: 'organization', name: 'MIT' })
      });
      const row2 = createRow(new Date(2024, 0, 9), {
        night: some('NYC'),
        daytime: some({ kind: 'travel', from: 'Boston', to: 'NYC' })
      });
      schedule = addRowToSchedule(schedule, row1);
      schedule = addRowToSchedule(schedule, row2);

      const violations = checkConstraints(schedule);
      expect(violations.length).toBe(0);
    });

    it('flags travel with wrong destinations', () => {
      let schedule = createEmptySchedule();
      const row1 = createRow(new Date(2024, 0, 8), {
        night: some('Boston'),
        daytime: some({ kind: 'organization', name: 'MIT' })
      });
      const row2 = createRow(new Date(2024, 0, 9), {
        night: some('NYC'),
        daytime: some({ kind: 'travel', from: 'Chicago', to: 'LA' })
      });
      schedule = addRowToSchedule(schedule, row1);
      schedule = addRowToSchedule(schedule, row2);

      const violations = checkConstraints(schedule);
      expect(violations.length).toBe(1);
      expect(violations[0].type).toBe('location-discontinuity');
    });

    it('allows same location without travel', () => {
      let schedule = createEmptySchedule();
      const row1 = createRow(new Date(2024, 0, 8), {
        night: some('Boston'),
        daytime: some({ kind: 'organization', name: 'MIT' })
      });
      const row2 = createRow(new Date(2024, 0, 9), {
        night: some('Boston'),
        daytime: some({ kind: 'organization', name: 'Harvard' })
      });
      schedule = addRowToSchedule(schedule, row1);
      schedule = addRowToSchedule(schedule, row2);

      const violations = checkConstraints(schedule);
      expect(violations.length).toBe(0);
    });

    it('ignores unset locations', () => {
      let schedule = createEmptySchedule();
      const row1 = createRow(new Date(2024, 0, 8), {
        // night is none()
        daytime: some({ kind: 'organization', name: 'MIT' })
      });
      const row2 = createRow(new Date(2024, 0, 9), {
        night: some('Boston'),
        daytime: some({ kind: 'organization', name: 'Harvard' })
      });
      schedule = addRowToSchedule(schedule, row1);
      schedule = addRowToSchedule(schedule, row2);

      const violations = checkConstraints(schedule);
      expect(violations.length).toBe(0);
    });
  });

  describe('Multiple violations', () => {
    it('detects multiple violations', () => {
      let schedule = createEmptySchedule();
      // Saturday with org visit
      const row1 = createRow(new Date(2024, 0, 6), {
        night: some('Boston'),
        daytime: some({ kind: 'organization', name: 'MIT' })
      });
      // Sunday with org visit and location change
      const row2 = createRow(new Date(2024, 0, 7), {
        night: some('NYC'),
        daytime: some({ kind: 'organization', name: 'Columbia' })
      });
      schedule = addRowToSchedule(schedule, row1);
      schedule = addRowToSchedule(schedule, row2);

      const violations = checkConstraints(schedule);
      expect(violations.length).toBe(3);
      // Row 1: org on weekend
      // Row 2: org on weekend + location discontinuity
    });
  });
});

describe('Repair suggestions', () => {
  it('suggests changing org to personal for weekend violation', () => {
    let schedule = createEmptySchedule();
    const row = createRow(new Date(2024, 0, 6), {
      daytime: some({ kind: 'organization', name: 'MIT' })
    });
    schedule = addRowToSchedule(schedule, row);

    const violations = checkConstraints(schedule);
    const repairs = suggestRepairs(schedule, violations);

    expect(repairs.length).toBe(1);
    expect(repairs[0].description).toContain('personal');
  });

  it('suggests adding travel for location discontinuity', () => {
    let schedule = createEmptySchedule();
    const row1 = createRow(new Date(2024, 0, 8), {
      night: some('Boston'),
      daytime: some({ kind: 'organization', name: 'MIT' })
    });
    const row2 = createRow(new Date(2024, 0, 9), {
      night: some('NYC'),
      daytime: some({ kind: 'organization', name: 'Columbia' })
    });
    schedule = addRowToSchedule(schedule, row1);
    schedule = addRowToSchedule(schedule, row2);

    const violations = checkConstraints(schedule);
    const repairs = suggestRepairs(schedule, violations);

    expect(repairs.length).toBe(1);
    expect(repairs[0].description).toContain('Boston → NYC');
  });

  it('applying repair fixes violation', () => {
    let schedule = createEmptySchedule();
    const row = createRow(new Date(2024, 0, 6), {
      daytime: some({ kind: 'organization', name: 'MIT' })
    });
    schedule = addRowToSchedule(schedule, row);

    const violations = checkConstraints(schedule);
    const repairs = suggestRepairs(schedule, violations);
    const result = applyRepairAndRecheck(schedule, repairs[0]);

    expect(result.violations.length).toBe(0);
    expect(isSome(result.schedule.rows[0].daytime)).toBe(true);
    if (isSome(result.schedule.rows[0].daytime)) {
      expect(result.schedule.rows[0].daytime.value).toEqual({ kind: 'personal' });
    }
  });
});

describe('Violation helpers', () => {
  it('rowHasViolation checks correctly', () => {
    let schedule = createEmptySchedule();
    const row1 = createRow(new Date(2024, 0, 6), {
      daytime: some({ kind: 'organization', name: 'MIT' })
    });
    const row2 = createRow(new Date(2024, 0, 8), {
      daytime: some({ kind: 'organization', name: 'Harvard' })
    });
    schedule = addRowToSchedule(schedule, row1);
    schedule = addRowToSchedule(schedule, row2);

    const violations = checkConstraints(schedule);
    expect(rowHasViolation(violations, row1.id)).toBe(true);
    expect(rowHasViolation(violations, row2.id)).toBe(false);
  });

  it('getViolationsForRow returns correct violations', () => {
    let schedule = createEmptySchedule();
    const row = createRow(new Date(2024, 0, 6), {
      daytime: some({ kind: 'organization', name: 'MIT' })
    });
    schedule = addRowToSchedule(schedule, row);

    const violations = checkConstraints(schedule);
    const rowViolations = getViolationsForRow(violations, row.id);
    expect(rowViolations.length).toBe(1);
    expect(rowViolations[0].type).toBe('org-on-weekend');
  });
});
