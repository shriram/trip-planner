// Constraint checking and repair suggestions

import {
  Schedule,
  DaytimeType,
  Option,
  isWeekend,
  isOrganization,
  isTravel,
  getDayOfWeek,
  formatDate,
  formatDaytime,
  getDaytimeValue,
  isSome,
  some,
  getOrDefault
} from './model.js';

export type ViolationType =
  | 'org-on-weekend'
  | 'location-discontinuity'
  | 'pinned-event-location-mismatch';

export interface Violation {
  type: ViolationType;
  rowIndex: number;
  rowId: string;
  message: string;
}

export interface RepairSuggestion {
  violation: Violation;
  description: string;
  apply: (schedule: Schedule) => Schedule;
}

// Check all constraints and return violations
export function checkConstraints(schedule: Schedule): Violation[] {
  const violations: Violation[] = [];

  for (let i = 0; i < schedule.rows.length; i++) {
    const row = schedule.rows[i];
    const daytimeValue = getDaytimeValue(row.daytime);

    // Constraint: Organization visits cannot be on weekends
    if (isOrganization(row.daytime) && isWeekend(row.date)) {
      violations.push({
        type: 'org-on-weekend',
        rowIndex: i,
        rowId: row.id,
        message: `Organization visit "${formatDaytime(daytimeValue)}" scheduled on ${getDayOfWeek(row.date)} (${formatDate(row.date)})`
      });
    }

    // Constraint: Location continuity
    if (i > 0) {
      const prevRow = schedule.rows[i - 1];
      const prevNight = isSome(prevRow.night) ? prevRow.night.value.trim() : '';
      const currNight = isSome(row.night) ? row.night.value.trim() : '';

      if (prevNight !== '' && currNight !== '' && prevNight !== currNight) {
        // Locations differ - need travel or a travel daytime
        if (!isTravel(row.daytime)) {
          violations.push({
            type: 'location-discontinuity',
            rowIndex: i,
            rowId: row.id,
            message: `Location changes from "${prevNight}" to "${currNight}" without travel on ${formatDate(row.date)}`
          });
        } else {
          // There is travel - check if it connects properly
          const travel = daytimeValue as { kind: 'travel'; from: string; to: string };
          if (travel.from !== prevNight || travel.to !== currNight) {
            violations.push({
              type: 'location-discontinuity',
              rowIndex: i,
              rowId: row.id,
              message: `Travel "${travel.from} → ${travel.to}" doesn't connect "${prevNight}" to "${currNight}"`
            });
          }
        }
      }
    }

    // Constraint: Attending a pinned event requires being in that location
    if (row.attend) {
      const pinnedLocation = getOrDefault(row.otherLocation, '').trim();
      const nightLocation = isSome(row.night) ? row.night.value.trim() : '';

      // Only check if pinned location is specified
      if (pinnedLocation !== '') {
        if (nightLocation === '') {
          violations.push({
            type: 'pinned-event-location-mismatch',
            rowIndex: i,
            rowId: row.id,
            message: `Attending event in "${pinnedLocation}" but no night location set on ${formatDate(row.date)}`
          });
        } else if (nightLocation !== pinnedLocation) {
          violations.push({
            type: 'pinned-event-location-mismatch',
            rowIndex: i,
            rowId: row.id,
            message: `Attending event in "${pinnedLocation}" but staying in "${nightLocation}" on ${formatDate(row.date)}`
          });
        }
      }
    }
  }

  return violations;
}

// Generate repair suggestions for violations
export function suggestRepairs(schedule: Schedule, violations: Violation[]): RepairSuggestion[] {
  const suggestions: RepairSuggestion[] = [];

  for (const violation of violations) {
    switch (violation.type) {
      case 'org-on-weekend': {
        const row = schedule.rows[violation.rowIndex];
        const daytimeValue = getDaytimeValue(row.daytime);
        suggestions.push({
          violation,
          description: `Change "${formatDaytime(daytimeValue)}" to "personal" on ${getDayOfWeek(row.date)}`,
          apply: (s) => ({
            ...s,
            rows: s.rows.map((r, i) =>
              i === violation.rowIndex
                ? { ...r, daytime: some({ kind: 'personal' } as DaytimeType) }
                : r
            )
          })
        });
        break;
      }

      case 'location-discontinuity': {
        const row = schedule.rows[violation.rowIndex];
        const prevRow = schedule.rows[violation.rowIndex - 1];
        if (prevRow) {
          const from = getOrDefault(prevRow.night, '').trim();
          const to = getOrDefault(row.night, '').trim();
          if (from && to) {
            suggestions.push({
              violation,
              description: `Set daytime to travel: "${from} → ${to}"`,
              apply: (s) => ({
                ...s,
                rows: s.rows.map((r, i) =>
                  i === violation.rowIndex
                    ? { ...r, daytime: some({ kind: 'travel', from, to } as DaytimeType) }
                    : r
                )
              })
            });
          }
        }
        break;
      }
    }
  }

  return suggestions;
}

// Apply a repair and re-check constraints
export function applyRepairAndRecheck(
  schedule: Schedule,
  repair: RepairSuggestion
): { schedule: Schedule; violations: Violation[] } {
  const newSchedule = repair.apply(schedule);
  const violations = checkConstraints(newSchedule);
  return { schedule: newSchedule, violations };
}

// Check if a row has any violations
export function rowHasViolation(violations: Violation[], rowId: string): boolean {
  return violations.some(v => v.rowId === rowId);
}

// Get violations for a specific row
export function getViolationsForRow(violations: Violation[], rowId: string): Violation[] {
  return violations.filter(v => v.rowId === rowId);
}
