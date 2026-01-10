// Tracks unsaved changes to prevent data loss
// Pure state machine - no DOM dependencies

export interface DirtyTracker {
  isDirty(): boolean;
  markDirty(): void;
  markClean(): void;
  /** Returns true if paste should proceed, false if cancelled */
  confirmPasteIfDirty(confirmFn: (message: string) => boolean): boolean;
  /** Returns true if the beforeunload event should warn */
  shouldWarnOnClose(): boolean;
}

export function createDirtyTracker(): DirtyTracker {
  let dirty = false;

  return {
    isDirty(): boolean {
      return dirty;
    },

    markDirty(): void {
      dirty = true;
    },

    markClean(): void {
      dirty = false;
    },

    confirmPasteIfDirty(confirmFn: (message: string) => boolean): boolean {
      if (dirty) {
        return confirmFn('You have unsaved changes. Paste anyway?');
      }
      return true;
    },

    shouldWarnOnClose(): boolean {
      return dirty;
    }
  };
}
