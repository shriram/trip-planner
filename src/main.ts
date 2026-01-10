// Entry point - wire up UI to DOM

import { Schedule, createRow } from './model.js';
import { checkConstraints } from './constraints.js';
import {
  createUI,
  updateState,
  copyToClipboard,
  pasteFromClipboard
} from './ui.js';
import { showMapModal } from './mapUI.js';
import { showShareModal } from './shareUI.js';
import { createDirtyTracker } from './dirtyTracker.js';

function main(): void {
  const tableBody = document.getElementById('schedule-body') as HTMLTableSectionElement;
  const constraintPanel = document.getElementById('constraint-panel') as HTMLElement;
  const violationList = document.getElementById('violation-list') as HTMLUListElement;
  const copyBtn = document.getElementById('copy-data') as HTMLButtonElement;
  const pasteBtn = document.getElementById('paste-data') as HTMLButtonElement;
  const shareBtn = document.getElementById('share-btn') as HTMLButtonElement;
  const mapBtn = document.getElementById('map-btn') as HTMLButtonElement;

  if (!tableBody || !constraintPanel || !violationList) {
    console.error('Required DOM elements not found');
    return;
  }

  // Track unsaved changes
  const dirtyTracker = createDirtyTracker();

  const state = createUI(tableBody, constraintPanel, violationList);

  // Set up the update handler
  state.onUpdate = (schedule: Schedule) => {
    dirtyTracker.markDirty();
    updateState(state, schedule, tableBody, constraintPanel, violationList);
  };

  // Warn before closing tab if there are unsaved changes
  window.addEventListener('beforeunload', (e) => {
    if (dirtyTracker.shouldWarnOnClose()) {
      e.preventDefault();
      // Modern browsers ignore custom messages, but returnValue must be set
      e.returnValue = '';
    }
  });

  // Initialize with a sample row
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const initialRow = createRow(today);
  state.schedule = { rows: [initialRow], placeDisambiguations: {}, geocodedPlaces: {}, hiddenPlaces: {} };
  state.violations = checkConstraints(state.schedule);
  updateState(state, state.schedule, tableBody, constraintPanel, violationList);

  // Button handlers
  copyBtn?.addEventListener('click', async () => {
    const success = await copyToClipboard(state.schedule);
    if (success) {
      dirtyTracker.markClean();
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    } else {
      alert('Failed to copy to clipboard');
    }
  });

  pasteBtn?.addEventListener('click', async () => {
    // Warn if there are unsaved changes
    if (!dirtyTracker.confirmPasteIfDirty(confirm)) {
      return;
    }
    const schedule = await pasteFromClipboard();
    if (schedule) {
      dirtyTracker.markClean();
      state.onUpdate(schedule);
      // onUpdate marks dirty, but paste is a "clean" operation
      dirtyTracker.markClean();
      pasteBtn.textContent = 'Pasted!';
      setTimeout(() => { pasteBtn.textContent = 'Paste'; }, 1500);
    } else {
      alert('Failed to paste: invalid or no data in clipboard');
    }
  });

  // Share button handler
  shareBtn?.addEventListener('click', () => {
    showShareModal(state.schedule);
  });

  // Map button handler
  mapBtn?.addEventListener('click', () => {
    showMapModal(state.schedule, (updatedSchedule) => {
      state.onUpdate(updatedSchedule);
    });
  });
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
