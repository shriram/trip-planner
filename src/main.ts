// Entry point - wire up UI to DOM

import { Schedule, createRow } from './model.js';
import { checkConstraints } from './constraints.js';
import {
  createUI,
  updateState,
  addRow,
  copyToClipboard,
  pasteFromClipboard,
  copyPrettyPrint
} from './ui.js';

function main(): void {
  const tableBody = document.getElementById('schedule-body') as HTMLTableSectionElement;
  const constraintPanel = document.getElementById('constraint-panel') as HTMLElement;
  const violationList = document.getElementById('violation-list') as HTMLUListElement;
  const addRowBtn = document.getElementById('add-row') as HTMLButtonElement;
  const copyBtn = document.getElementById('copy-data') as HTMLButtonElement;
  const pasteBtn = document.getElementById('paste-data') as HTMLButtonElement;
  const prettyPrintBtn = document.getElementById('pretty-print') as HTMLButtonElement;

  if (!tableBody || !constraintPanel || !violationList) {
    console.error('Required DOM elements not found');
    return;
  }

  const state = createUI(tableBody, constraintPanel, violationList);

  // Set up the update handler
  state.onUpdate = (schedule: Schedule) => {
    updateState(state, schedule, tableBody, constraintPanel, violationList);
  };

  // Initialize with a sample row
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const initialRow = createRow(today);
  state.schedule = { rows: [initialRow] };
  state.violations = checkConstraints(state.schedule);
  updateState(state, state.schedule, tableBody, constraintPanel, violationList);

  // Button handlers
  addRowBtn?.addEventListener('click', () => {
    addRow(state);
  });

  copyBtn?.addEventListener('click', async () => {
    const success = await copyToClipboard(state.schedule);
    if (success) {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    } else {
      alert('Failed to copy to clipboard');
    }
  });

  pasteBtn?.addEventListener('click', async () => {
    const schedule = await pasteFromClipboard();
    if (schedule) {
      state.onUpdate(schedule);
      pasteBtn.textContent = 'Pasted!';
      setTimeout(() => { pasteBtn.textContent = 'Paste'; }, 1500);
    } else {
      alert('Failed to paste: invalid or no data in clipboard');
    }
  });

  prettyPrintBtn?.addEventListener('click', async () => {
    const success = await copyPrettyPrint(state.schedule);
    if (success) {
      prettyPrintBtn.textContent = 'Copied HTML!';
      setTimeout(() => { prettyPrintBtn.textContent = 'Pretty Print'; }, 1500);
    } else {
      alert('Failed to copy pretty print to clipboard');
    }
  });
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
