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
  const exportBtn = document.getElementById('export-btn') as HTMLButtonElement;
  const importBtn = document.getElementById('import-btn') as HTMLButtonElement;
  const formatBtn = document.getElementById('format-btn') as HTMLButtonElement;
  const mapBtn = document.getElementById('map-btn') as HTMLButtonElement;
  const statusIndicator = document.getElementById('status-indicator') as HTMLSpanElement;

  if (!tableBody || !constraintPanel || !violationList) {
    console.error('Required DOM elements not found');
    return;
  }

  // Track unsaved changes
  const dirtyTracker = createDirtyTracker();

  // Update the dirty indicator UI and export button styling
  function updateDirtyIndicator(): void {
    const isDirty = dirtyTracker.shouldWarnOnClose();

    if (statusIndicator) {
      if (isDirty) {
        statusIndicator.textContent = 'Unsaved changes';
        statusIndicator.className = 'status-indicator';
      } else {
        statusIndicator.className = 'status-indicator hidden';
      }
    }

    if (exportBtn) {
      if (isDirty) {
        exportBtn.classList.add('export-dirty');
      } else {
        exportBtn.classList.remove('export-dirty');
      }
    }
  }

  // Show save reminder temporarily
  function showSaveReminder(): void {
    if (statusIndicator) {
      statusIndicator.textContent = 'Copied to clipboard — save this somewhere!';
      statusIndicator.className = 'status-indicator save-reminder';
    }
    setTimeout(() => {
      updateDirtyIndicator();
    }, 3000);
  }

  const state = createUI(tableBody, constraintPanel, violationList);

  // Set up the update handler
  state.onUpdate = (schedule: Schedule) => {
    dirtyTracker.markDirty();
    updateDirtyIndicator();
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

  async function doExport(): Promise<void> {
    const success = await copyToClipboard(state.schedule);
    if (success) {
      dirtyTracker.markClean();
      showSaveReminder();
    } else {
      alert('Failed to copy to clipboard');
    }
  }

  async function doImport(): Promise<void> {
    if (!dirtyTracker.confirmPasteIfDirty(confirm)) return;
    const schedule = await pasteFromClipboard();
    if (schedule) {
      dirtyTracker.markClean();
      state.onUpdate(schedule);
      // onUpdate marks dirty, but import is a "clean" operation
      dirtyTracker.markClean();
      updateDirtyIndicator();
    } else {
      alert('Failed to import: invalid or no JSON data in clipboard');
    }
  }

  exportBtn?.addEventListener('click', doExport);
  importBtn?.addEventListener('click', doImport);

  // Keyboard shortcuts: Cmd/Ctrl+C to export, Cmd/Ctrl+V to import
  // Only fire when focus is not in a text field (where copy/paste should work normally)
  document.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
    if (!(e.metaKey || e.ctrlKey)) return;

    if (e.key === 'c') {
      e.preventDefault();
      doExport();
    } else if (e.key === 'v') {
      e.preventDefault();
      doImport();
    }
  });

  // Format button handler
  formatBtn?.addEventListener('click', () => {
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
