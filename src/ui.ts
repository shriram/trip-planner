// UI layer - DOM manipulation and event handling

import {
  Schedule,
  ScheduleRow,
  DaytimeType,
  Option,
  createRow,
  addRowToSchedule,
  removeRowFromSchedule,
  updateRowInSchedule,
  insertRowAtIndex,
  getRowIndex,
  getDayOfWeek,
  isWeekend,
  formatDate,
  parseDate,
  parseDaytime,
  formatDaytime,
  addDays,
  serializeSchedule,
  deserializeSchedule,
  prettyPrintSchedule,
  isPersonal,
  isTravel,
  getDaytimeValue,
  getOrDefault,
  isSome,
  isNone,
  some,
  none
} from './model.js';

import {
  checkConstraints,
  rowHasViolation,
  Violation
} from './constraints.js';

type ScheduleUpdateHandler = (schedule: Schedule) => void;

export interface UIState {
  schedule: Schedule;
  violations: Violation[];
  onUpdate: ScheduleUpdateHandler;
  focusRowId: string | null;
}

// Create the UI controller
export function createUI(
  tableBody: HTMLTableSectionElement,
  constraintPanel: HTMLElement,
  violationList: HTMLUListElement
): UIState {
  const state: UIState = {
    schedule: { rows: [] },
    violations: [],
    onUpdate: () => {},
    focusRowId: null
  };

  return state;
}

// Render the entire table
export function renderTable(
  state: UIState,
  tableBody: HTMLTableSectionElement,
  constraintPanel: HTMLElement,
  violationList: HTMLUListElement
): void {
  tableBody.innerHTML = '';

  for (const row of state.schedule.rows) {
    const tr = createRowElement(row, state);
    tableBody.appendChild(tr);
  }

  renderViolations(state, constraintPanel, violationList);

  // Focus the daytime input for the newly added row
  if (state.focusRowId) {
    const rowToFocus = tableBody.querySelector(`tr[data-row-id="${state.focusRowId}"]`);
    if (rowToFocus) {
      const daytimeInput = rowToFocus.querySelector('.daytime-cell input') as HTMLInputElement | null;
      if (daytimeInput) {
        daytimeInput.focus();
      }
    }
    state.focusRowId = null;
  }
}

// Get the previous row's night value
function getPrevNight(state: UIState, rowId: string): string | null {
  const index = getRowIndex(state.schedule, rowId);
  if (index <= 0) return null;
  const prevRow = state.schedule.rows[index - 1];
  return isSome(prevRow.night) ? prevRow.night.value : null;
}

// Get the next row's night value
function getNextNight(state: UIState, rowId: string): string | null {
  const index = getRowIndex(state.schedule, rowId);
  if (index < 0 || index >= state.schedule.rows.length - 1) return null;
  const nextRow = state.schedule.rows[index + 1];
  return isSome(nextRow.night) ? nextRow.night.value : null;
}

// Handle daytime change with smart behaviors
function handleDaytimeChange(
  state: UIState,
  row: ScheduleRow,
  newDaytimeValue: DaytimeType
): void {
  const index = getRowIndex(state.schedule, row.id);
  const newDaytime: Option<DaytimeType> = some(newDaytimeValue);
  let updates: Partial<ScheduleRow> = { daytime: newDaytime };

  // Rule 1: Travel "x → y" auto-populates Night with y if not set
  if (newDaytimeValue.kind === 'travel') {
    const destination = newDaytimeValue.to;
    if (isNone(row.night)) {
      // Night not set - auto-populate
      updates.night = some(destination);
    } else if (row.night.value !== destination) {
      // Night already set to something different - ask user
      if (confirm(`Night is "${row.night.value}". Change to "${destination}"?`)) {
        updates.night = some(destination);
      }
      // If user says no, we still update daytime but leave night as-is
      // The constraint checker will flag this if needed
    }
  }

  // Rule 2: Non-travel daytime inherits previous Night if not set
  if (newDaytimeValue.kind !== 'travel') {
    if (isNone(row.night)) {
      const prevNight = getPrevNight(state, row.id);
      if (prevNight) {
        updates.night = some(prevNight);
      }
    }
  }

  state.schedule = updateRowInSchedule(state.schedule, row.id, updates);

  // Rule 3: Check if this creates a "personal between different locations" situation
  // and offer to convert to travel
  checkPersonalBetweenLocations(state, row.id);

  state.onUpdate(state.schedule);
}

// Check if a personal day is sandwiched between different locations
function checkPersonalBetweenLocations(state: UIState, rowId: string): void {
  const index = getRowIndex(state.schedule, rowId);
  const row = state.schedule.rows[index];

  if (!isPersonal(row.daytime)) return;

  const prevNight = getPrevNight(state, rowId);
  const currNight = isSome(row.night) ? row.night.value : null;

  // If current night differs from prev night, suggest travel
  if (prevNight && currNight && prevNight !== currNight) {
    if (confirm(`Previous night is "${prevNight}", current night is "${currNight}". Change to travel "${prevNight} → ${currNight}"?`)) {
      state.schedule = updateRowInSchedule(state.schedule, rowId, {
        daytime: some({ kind: 'travel', from: prevNight, to: currNight })
      });
    }
  }
}

// Create a table row element
function createRowElement(row: ScheduleRow, state: UIState): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.dataset.rowId = row.id;

  const daytimeValue = getDaytimeValue(row.daytime);

  // Apply row styling
  if (isWeekend(row.date)) {
    tr.classList.add('weekend');
  }
  if (isPersonal(row.daytime)) {
    tr.classList.add('personal');
  }
  if (isTravel(row.daytime)) {
    tr.classList.add('travel');
  }
  if (rowHasViolation(state.violations, row.id)) {
    tr.classList.add('violation');
  }

  // Actions column
  const actionsCell = document.createElement('td');
  actionsCell.className = 'row-actions';

  const insertAboveBtn = document.createElement('button');
  insertAboveBtn.textContent = '↑+';
  insertAboveBtn.title = 'Insert row above';
  insertAboveBtn.addEventListener('click', () => {
    const index = getRowIndex(state.schedule, row.id);
    const prevRow = state.schedule.rows[index - 1];
    const newDate = prevRow ? addDays(prevRow.date, 1) : addDays(row.date, -1);
    const newRow = createRow(newDate);
    state.schedule = insertRowAtIndex(state.schedule, index, newRow);
    recalculateDates(state);
    state.focusRowId = newRow.id;
    state.onUpdate(state.schedule);
  });

  const insertBelowBtn = document.createElement('button');
  insertBelowBtn.textContent = '↓+';
  insertBelowBtn.title = 'Insert row below';
  insertBelowBtn.addEventListener('click', () => {
    const index = getRowIndex(state.schedule, row.id);
    const newDate = addDays(row.date, 1);
    const newRow = createRow(newDate);
    state.schedule = insertRowAtIndex(state.schedule, index + 1, newRow);
    recalculateDates(state);
    state.focusRowId = newRow.id;
    state.onUpdate(state.schedule);
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = '×';
  deleteBtn.title = 'Delete row';
  deleteBtn.className = 'delete';
  deleteBtn.addEventListener('click', () => {
    if (isPersonal(row.daytime)) {
      if (!confirm('Delete this personal day?')) return;
    }
    state.schedule = removeRowFromSchedule(state.schedule, row.id);
    recalculateDates(state);
    state.onUpdate(state.schedule);
  });

  actionsCell.appendChild(insertAboveBtn);
  actionsCell.appendChild(insertBelowBtn);
  actionsCell.appendChild(deleteBtn);
  tr.appendChild(actionsCell);

  // Date column
  const dateCell = document.createElement('td');
  dateCell.className = 'date-cell';
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.value = formatDate(row.date);
  dateInput.addEventListener('change', () => {
    const newDate = parseDate(dateInput.value);
    if (newDate) {
      const index = getRowIndex(state.schedule, row.id);
      if (index === 0) {
        state.schedule = updateRowInSchedule(state.schedule, row.id, { date: newDate });
        recalculateDates(state);
        state.onUpdate(state.schedule);
      }
    }
  });
  // Only first row's date is editable
  const index = getRowIndex(state.schedule, row.id);
  if (index > 0) {
    dateInput.disabled = true;
    dateInput.title = 'Only the first row date is editable';
  }
  dateCell.appendChild(dateInput);
  tr.appendChild(dateCell);

  // Day of week column
  const dayCell = document.createElement('td');
  dayCell.className = 'day-cell';
  dayCell.textContent = getDayOfWeek(row.date);
  tr.appendChild(dayCell);

  // Daytime column
  const daytimeCell = document.createElement('td');
  daytimeCell.className = 'daytime-cell';
  const daytimeInput = document.createElement('input');
  daytimeInput.type = 'text';
  daytimeInput.value = formatDaytime(daytimeValue);
  daytimeInput.placeholder = 'org, city→city, or personal';
  daytimeInput.addEventListener('change', () => {
    const newDaytime = parseDaytime(daytimeInput.value);
    handleDaytimeChange(state, row, newDaytime);
  });
  daytimeCell.appendChild(daytimeInput);
  tr.appendChild(daytimeCell);

  // Night column
  const nightCell = document.createElement('td');
  const nightInput = document.createElement('input');
  nightInput.type = 'text';
  nightInput.value = getOrDefault(row.night, '');
  nightInput.placeholder = 'City';
  nightInput.addEventListener('change', () => {
    const newNight = nightInput.value.trim();
    state.schedule = updateRowInSchedule(state.schedule, row.id, {
      night: newNight ? some(newNight) : none()
    });
    // After changing night, check if personal day needs to become travel
    checkPersonalBetweenLocations(state, row.id);
    state.onUpdate(state.schedule);
  });
  nightCell.appendChild(nightInput);
  tr.appendChild(nightCell);

  // Other Event column
  const otherEventCell = document.createElement('td');
  const otherEventInput = document.createElement('input');
  otherEventInput.type = 'text';
  otherEventInput.value = formatDaytime(getDaytimeValue(row.otherEvent));
  otherEventInput.placeholder = 'Event';
  otherEventInput.addEventListener('change', () => {
    const newOtherEvent = parseDaytime(otherEventInput.value);
    state.schedule = updateRowInSchedule(state.schedule, row.id, {
      otherEvent: some(newOtherEvent)
    });
    state.onUpdate(state.schedule);
  });
  otherEventCell.appendChild(otherEventInput);
  tr.appendChild(otherEventCell);

  // Other Location column
  const otherLocationCell = document.createElement('td');
  const otherLocationInput = document.createElement('input');
  otherLocationInput.type = 'text';
  otherLocationInput.value = getOrDefault(row.otherLocation, '');
  otherLocationInput.placeholder = 'Location';
  otherLocationInput.addEventListener('change', () => {
    const value = otherLocationInput.value.trim();
    state.schedule = updateRowInSchedule(state.schedule, row.id, {
      otherLocation: value ? some(value) : none()
    });
    state.onUpdate(state.schedule);
  });
  otherLocationCell.appendChild(otherLocationInput);
  tr.appendChild(otherLocationCell);

  // Attend column
  const attendCell = document.createElement('td');
  attendCell.style.textAlign = 'center';
  const attendInput = document.createElement('input');
  attendInput.type = 'checkbox';
  attendInput.checked = row.attend;
  attendInput.addEventListener('change', () => {
    state.schedule = updateRowInSchedule(state.schedule, row.id, { attend: attendInput.checked });
    state.onUpdate(state.schedule);
  });
  attendCell.appendChild(attendInput);
  tr.appendChild(attendCell);

  return tr;
}

// Recalculate dates based on first row
function recalculateDates(state: UIState): void {
  if (state.schedule.rows.length === 0) return;

  const firstDate = state.schedule.rows[0].date;
  state.schedule = {
    rows: state.schedule.rows.map((row, index) => ({
      ...row,
      date: addDays(firstDate, index)
    }))
  };
}

// Render constraint violations
function renderViolations(
  state: UIState,
  constraintPanel: HTMLElement,
  violationList: HTMLUListElement
): void {
  if (state.violations.length === 0) {
    constraintPanel.classList.add('hidden');
    return;
  }

  constraintPanel.classList.remove('hidden');
  violationList.innerHTML = '';

  for (const violation of state.violations) {
    const li = document.createElement('li');
    li.textContent = violation.message;
    violationList.appendChild(li);
  }
}

// Update state and re-render
export function updateState(
  state: UIState,
  schedule: Schedule,
  tableBody: HTMLTableSectionElement,
  constraintPanel: HTMLElement,
  violationList: HTMLUListElement
): void {
  state.schedule = schedule;
  state.violations = checkConstraints(schedule);
  renderTable(state, tableBody, constraintPanel, violationList);
}

// Add a new row at the end
export function addRow(state: UIState): void {
  const lastRow = state.schedule.rows[state.schedule.rows.length - 1];
  const newDate = lastRow ? addDays(lastRow.date, 1) : new Date();
  const newRow = createRow(newDate);
  state.schedule = addRowToSchedule(state.schedule, newRow);
  state.focusRowId = newRow.id;
  state.onUpdate(state.schedule);
}

// Copy schedule to clipboard as JSON
export async function copyToClipboard(schedule: Schedule): Promise<boolean> {
  const json = serializeSchedule(schedule);
  try {
    await navigator.clipboard.writeText(json);
    return true;
  } catch {
    return false;
  }
}

// Paste schedule from clipboard
export async function pasteFromClipboard(): Promise<Schedule | null> {
  try {
    const text = await navigator.clipboard.readText();
    return deserializeSchedule(text);
  } catch {
    return null;
  }
}

// Copy pretty-printed HTML to clipboard
export async function copyPrettyPrint(schedule: Schedule): Promise<boolean> {
  const html = prettyPrintSchedule(schedule);
  try {
    const blob = new Blob([html], { type: 'text/html' });
    const item = new ClipboardItem({ 'text/html': blob });
    await navigator.clipboard.write([item]);
    return true;
  } catch {
    // Fallback: copy as plain text
    try {
      await navigator.clipboard.writeText(html);
      return true;
    } catch {
      return false;
    }
  }
}
