// UI layer - DOM manipulation and event handling

import {
  Schedule,
  ScheduleRow,
  DaytimeType,
  Option,
  createRow,
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
  printToHtml,
  printToMarkdown,
  isPersonal,
  isTravel,
  getDaytimeValue,
  getOrDefault,
  isSome,
  isNone,
  some,
  none,
  recalculateDates
} from './model.js';

import {
  checkConstraints,
  rowHasViolation,
  Violation
} from './constraints.js';

type ScheduleUpdateHandler = (schedule: Schedule) => void;

// Helper: navigate to same column in adjacent row
// Sets pendingFocus on state so the next render will focus the target
function navigateVertical(
  state: UIState,
  currentInput: HTMLInputElement,
  direction: 'up' | 'down',
  columnSelector: string
): void {
  const currentTr = currentInput.closest('tr');
  if (!currentTr) return;

  const tbody = currentTr.parentElement;
  if (!tbody) return;

  // Get current row index in the table body
  const rows = Array.from(tbody.children) as HTMLTableRowElement[];
  const currentIndex = rows.indexOf(currentTr as HTMLTableRowElement);
  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

  // Check bounds
  if (targetIndex < 0 || targetIndex >= rows.length) return;

  // Set pending focus for after re-render
  state.pendingFocus = {
    rowIndex: targetIndex,
    columnSelector,
    selectAll: true
  };

  // If there's no re-render pending, we need to apply focus now
  // Use setTimeout to allow any change events to fire first
  setTimeout(() => {
    // If pendingFocus is still set, the render didn't happen, so focus directly
    if (state.pendingFocus) {
      const freshTbody = document.getElementById('schedule-body');
      if (!freshTbody) return;

      const freshRows = freshTbody.children;
      if (targetIndex >= freshRows.length) return;

      const freshTr = freshRows[targetIndex];
      const freshInput = freshTr?.querySelector(columnSelector) as HTMLInputElement | null;

      if (freshInput) {
        freshInput.focus();
        freshInput.setSelectionRange(0, freshInput.value.length);
      }
      state.pendingFocus = null;
    }
  }, 0);
}

// Add vertical arrow key navigation to a text input
// Always navigate on up/down since these are single-line inputs
function addArrowKeyNavigation(
  state: UIState,
  input: HTMLInputElement,
  columnSelector: string
): void {
  input.addEventListener('keydown', (e) => {
    // Only handle if this input is actually focused
    if (document.activeElement !== input) return;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigateVertical(state, input, 'up', columnSelector);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      navigateVertical(state, input, 'down', columnSelector);
    }
  });
}

// Pending focus info for arrow key navigation
interface PendingFocus {
  rowIndex: number;
  columnSelector: string;
  selectAll: boolean;
}

export interface UIState {
  schedule: Schedule;
  violations: Violation[];
  onUpdate: ScheduleUpdateHandler;
  focusRowId: string | null;
  pendingFocus: PendingFocus | null;
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
    focusRowId: null,
    pendingFocus: null
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

  // Handle pending focus from arrow key navigation
  if (state.pendingFocus) {
    const { rowIndex, columnSelector, selectAll } = state.pendingFocus;
    state.pendingFocus = null;

    const rows = tableBody.children;
    if (rowIndex >= 0 && rowIndex < rows.length) {
      const targetRow = rows[rowIndex];
      const targetInput = targetRow?.querySelector(columnSelector) as HTMLInputElement | null;
      if (targetInput) {
        targetInput.focus();
        if (selectAll) {
          targetInput.setSelectionRange(0, targetInput.value.length);
        }
      }
    }
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
    recalculateDatesInState(state);
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
    recalculateDatesInState(state);
    state.focusRowId = newRow.id;
    state.onUpdate(state.schedule);
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = '×';
  deleteBtn.title = 'Delete row';
  deleteBtn.className = 'delete';
  deleteBtn.addEventListener('click', () => {
    state.schedule = removeRowFromSchedule(state.schedule, row.id);
    if (state.schedule.rows.length > 0) {
      state.schedule = recalculateDates(state.schedule);
    }
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
        recalculateDatesInState(state);
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
  daytimeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const rowId = row.id;
      daytimeInput.blur(); // Trigger change event
      // Focus night input after render (row may be re-created)
      setTimeout(() => {
        const newTr = document.querySelector(`tr[data-row-id="${rowId}"]`);
        const nightInput = newTr?.querySelector('td:nth-child(5) input') as HTMLInputElement | null;
        if (nightInput) nightInput.focus();
      }, 0);
    }
  });
  addArrowKeyNavigation(state, daytimeInput, '.daytime-cell input');
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
  nightInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const rowId = row.id;
      nightInput.blur();
      setTimeout(() => {
        const newTr = document.querySelector(`tr[data-row-id="${rowId}"]`);
        const otherEventInput = newTr?.querySelector('td:nth-child(6) input') as HTMLInputElement | null;
        if (otherEventInput) otherEventInput.focus();
      }, 0);
    }
  });
  addArrowKeyNavigation(state, nightInput, 'td:nth-child(5) input');
  nightCell.appendChild(nightInput);
  tr.appendChild(nightCell);

  // Pinned Event column
  const otherEventCell = document.createElement('td');
  const otherEventInput = document.createElement('input');
  otherEventInput.type = 'text';
  otherEventInput.value = formatDaytime(getDaytimeValue(row.otherEvent));
  otherEventInput.placeholder = 'Pinned event';
  otherEventInput.addEventListener('change', () => {
    const newOtherEvent = parseDaytime(otherEventInput.value);
    state.schedule = updateRowInSchedule(state.schedule, row.id, {
      otherEvent: some(newOtherEvent)
    });
    state.onUpdate(state.schedule);
  });
  otherEventInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const rowId = row.id;
      otherEventInput.blur();
      setTimeout(() => {
        const newTr = document.querySelector(`tr[data-row-id="${rowId}"]`);
        const otherLocationInput = newTr?.querySelector('td:nth-child(7) input') as HTMLInputElement | null;
        if (otherLocationInput) otherLocationInput.focus();
      }, 0);
    }
  });
  addArrowKeyNavigation(state, otherEventInput, 'td:nth-child(6) input');
  otherEventCell.appendChild(otherEventInput);
  tr.appendChild(otherEventCell);

  // Location column (for pinned event)
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
  otherLocationInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const rowIndex = getRowIndex(state.schedule, row.id);
      const nextRow = state.schedule.rows[rowIndex + 1];
      const nextRowId = nextRow?.id;
      otherLocationInput.blur();
      // Move to next row's daytime input
      if (nextRowId) {
        setTimeout(() => {
          const nextTr = document.querySelector(`tr[data-row-id="${nextRowId}"]`);
          const nextDaytimeInput = nextTr?.querySelector('.daytime-cell input') as HTMLInputElement | null;
          if (nextDaytimeInput) nextDaytimeInput.focus();
        }, 0);
      }
    }
  });
  addArrowKeyNavigation(state, otherLocationInput, 'td:nth-child(7) input');
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

// Recalculate dates in place on the state
function recalculateDatesInState(state: UIState): void {
  if (state.schedule.rows.length === 0) return;
  state.schedule = recalculateDates(state.schedule);
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

// Copy HTML to clipboard (for email)
export async function copyHtmlToClipboard(schedule: Schedule): Promise<boolean> {
  const html = printToHtml(schedule);
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

// Copy Markdown to clipboard (for Obsidian)
export async function copyMarkdownToClipboard(schedule: Schedule): Promise<boolean> {
  const md = printToMarkdown(schedule);
  try {
    await navigator.clipboard.writeText(md);
    return true;
  } catch {
    return false;
  }
}
