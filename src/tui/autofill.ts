// Pure port of the web UI's smart night-fill behaviors.
//
// In the browser these live in ui.ts's `handleDaytimeChange` /
// `checkPersonalBetweenLocations` and use blocking `confirm()` calls. Here we
// keep the logic pure: we apply the non-conflicting updates eagerly and return
// an optional `ConfirmRequest` describing the change that requires the user's
// yes/no. The terminal shell renders that as a confirm prompt.

import {
  Schedule,
  DaytimeType,
  Option,
  getRowIndex,
  updateRowInSchedule,
  isNone,
  isSome,
  some
} from '../model.js';

import { ConfirmRequest } from './state.js';

export interface DaytimeChangeResult {
  schedule: Schedule;
  confirm: ConfirmRequest | null;
}

function prevNightOf(schedule: Schedule, rowId: string): string | null {
  const index = getRowIndex(schedule, rowId);
  if (index <= 0) return null;
  const prev = schedule.rows[index - 1];
  return isSome(prev.night) ? prev.night.value : null;
}

// Apply a new daytime value to a row, mirroring the web's auto-fill rules:
//   1. Travel "x → y" sets Night to y when Night is empty; if Night is set to
//      something else, offer (confirm) to change it.
//   2. A non-travel daytime inherits the previous row's Night when Night empty.
//   3. A personal day sandwiched between differing locations offers (confirm)
//      to match the previous night.
// At most one confirmation is produced (rules 1 and 3 are mutually exclusive,
// since a personal day is never travel).
export function applyDaytimeChange(
  schedule: Schedule,
  rowId: string,
  newDaytimeValue: DaytimeType
): DaytimeChangeResult {
  const index = getRowIndex(schedule, rowId);
  const currentRow = schedule.rows[index];
  const updates: { daytime: Option<DaytimeType>; night?: Option<string> } = {
    daytime: some(newDaytimeValue)
  };
  let confirm: ConfirmRequest | null = null;

  if (newDaytimeValue.kind === 'travel') {
    const destination = newDaytimeValue.to;
    if (isNone(currentRow.night)) {
      updates.night = some(destination);
    } else if (currentRow.night.value !== destination) {
      confirm = {
        question: `Night is "${currentRow.night.value}". Change to "${destination}"?`,
        apply: (s) => updateRowInSchedule(s, rowId, { night: some(destination) })
      };
    }
  } else {
    if (isNone(currentRow.night)) {
      const prevNight = prevNightOf(schedule, rowId);
      if (prevNight) {
        updates.night = some(prevNight);
      }
    }
  }

  const next = updateRowInSchedule(schedule, rowId, updates);

  // Rule 3 only applies to personal days that still differ from the prev night.
  if (confirm === null && newDaytimeValue.kind === 'personal') {
    const prevNight = prevNightOf(next, rowId);
    const updatedRow = next.rows[index];
    const currNight = isSome(updatedRow.night) ? updatedRow.night.value : null;
    if (prevNight && currNight && prevNight !== currNight) {
      confirm = {
        question: `Previous night was "${prevNight}", but current night is "${currNight}". Change night to "${prevNight}"?`,
        apply: (s) => updateRowInSchedule(s, rowId, { night: some(prevNight) })
      };
    }
  }

  return { schedule: next, confirm };
}
