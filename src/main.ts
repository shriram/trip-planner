// Entry point - wire up UI to DOM

import { Schedule, createRow } from './model.js';
import { checkConstraints } from './constraints.js';
import {
  createUI,
  updateState,
  addRow,
  copyToClipboard,
  pasteFromClipboard,
  copyHtmlToClipboard,
  copyMarkdownToClipboard
} from './ui.js';

function main(): void {
  const tableBody = document.getElementById('schedule-body') as HTMLTableSectionElement;
  const constraintPanel = document.getElementById('constraint-panel') as HTMLElement;
  const violationList = document.getElementById('violation-list') as HTMLUListElement;
  const addRowBtn = document.getElementById('add-row') as HTMLButtonElement;
  const copyBtn = document.getElementById('copy-data') as HTMLButtonElement;
  const pasteBtn = document.getElementById('paste-data') as HTMLButtonElement;
  const printBtn = document.getElementById('print-btn') as HTMLButtonElement;
  const printDropdown = document.getElementById('print-dropdown')?.parentElement as HTMLElement;
  const printHtmlBtn = document.getElementById('print-html') as HTMLAnchorElement;
  const printMarkdownBtn = document.getElementById('print-markdown') as HTMLAnchorElement;

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

  // Print dropdown toggle
  printBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    printDropdown?.classList.toggle('open');
  });

  // Close dropdown when clicking elsewhere
  document.addEventListener('click', () => {
    printDropdown?.classList.remove('open');
  });

  printHtmlBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    printDropdown?.classList.remove('open');
    const success = await copyHtmlToClipboard(state.schedule);
    if (success) {
      printBtn.textContent = 'Copied HTML!';
      setTimeout(() => { printBtn.textContent = 'Print ▾'; }, 1500);
    } else {
      alert('Failed to copy HTML to clipboard');
    }
  });

  printMarkdownBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    printDropdown?.classList.remove('open');
    const success = await copyMarkdownToClipboard(state.schedule);
    if (success) {
      printBtn.textContent = 'Copied MD!';
      setTimeout(() => { printBtn.textContent = 'Print ▾'; }, 1500);
    } else {
      alert('Failed to copy Markdown to clipboard');
    }
  });
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
