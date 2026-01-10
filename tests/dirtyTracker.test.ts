import { describe, it, expect, vi } from 'vitest';
import { createDirtyTracker } from '../src/dirtyTracker.js';

describe('DirtyTracker', () => {
  describe('initial state', () => {
    it('starts clean', () => {
      const tracker = createDirtyTracker();
      expect(tracker.isDirty()).toBe(false);
    });

    it('should not warn on close when clean', () => {
      const tracker = createDirtyTracker();
      expect(tracker.shouldWarnOnClose()).toBe(false);
    });
  });

  describe('markDirty', () => {
    it('sets dirty flag', () => {
      const tracker = createDirtyTracker();
      tracker.markDirty();
      expect(tracker.isDirty()).toBe(true);
    });

    it('should warn on close when dirty', () => {
      const tracker = createDirtyTracker();
      tracker.markDirty();
      expect(tracker.shouldWarnOnClose()).toBe(true);
    });
  });

  describe('markClean', () => {
    it('clears dirty flag', () => {
      const tracker = createDirtyTracker();
      tracker.markDirty();
      tracker.markClean();
      expect(tracker.isDirty()).toBe(false);
    });

    it('should not warn on close after marking clean', () => {
      const tracker = createDirtyTracker();
      tracker.markDirty();
      tracker.markClean();
      expect(tracker.shouldWarnOnClose()).toBe(false);
    });
  });

  describe('confirmPasteIfDirty', () => {
    it('allows paste without confirmation when clean', () => {
      const tracker = createDirtyTracker();
      const confirmFn = vi.fn();

      const result = tracker.confirmPasteIfDirty(confirmFn);

      expect(result).toBe(true);
      expect(confirmFn).not.toHaveBeenCalled();
    });

    it('shows confirmation when dirty and allows paste if confirmed', () => {
      const tracker = createDirtyTracker();
      tracker.markDirty();
      const confirmFn = vi.fn().mockReturnValue(true);

      const result = tracker.confirmPasteIfDirty(confirmFn);

      expect(result).toBe(true);
      expect(confirmFn).toHaveBeenCalledWith('You have unsaved changes. Paste anyway?');
    });

    it('shows confirmation when dirty and blocks paste if cancelled', () => {
      const tracker = createDirtyTracker();
      tracker.markDirty();
      const confirmFn = vi.fn().mockReturnValue(false);

      const result = tracker.confirmPasteIfDirty(confirmFn);

      expect(result).toBe(false);
      expect(confirmFn).toHaveBeenCalledWith('You have unsaved changes. Paste anyway?');
    });
  });

  describe('typical workflows', () => {
    it('fresh app then paste: no warning', () => {
      const tracker = createDirtyTracker();
      const confirmFn = vi.fn();

      // User pastes immediately after opening app
      expect(tracker.confirmPasteIfDirty(confirmFn)).toBe(true);
      expect(confirmFn).not.toHaveBeenCalled();
    });

    it('copy then close: no warning', () => {
      const tracker = createDirtyTracker();

      // User makes changes
      tracker.markDirty();
      // User copies
      tracker.markClean();
      // User closes tab
      expect(tracker.shouldWarnOnClose()).toBe(false);
    });

    it('edit then close: warning', () => {
      const tracker = createDirtyTracker();

      // User makes changes
      tracker.markDirty();
      // User tries to close tab
      expect(tracker.shouldWarnOnClose()).toBe(true);
    });

    it('edit then paste: warning', () => {
      const tracker = createDirtyTracker();
      const confirmFn = vi.fn().mockReturnValue(false);

      // User makes changes
      tracker.markDirty();
      // User tries to paste
      expect(tracker.confirmPasteIfDirty(confirmFn)).toBe(false);
      expect(confirmFn).toHaveBeenCalled();
    });

    it('copy then paste: no warning', () => {
      const tracker = createDirtyTracker();
      const confirmFn = vi.fn();

      // User makes changes
      tracker.markDirty();
      // User copies
      tracker.markClean();
      // User pastes different schedule
      expect(tracker.confirmPasteIfDirty(confirmFn)).toBe(true);
      expect(confirmFn).not.toHaveBeenCalled();
    });

    it('paste clears dirty flag scenario', () => {
      const tracker = createDirtyTracker();

      // User makes changes
      tracker.markDirty();
      // User confirms paste
      const confirmFn = vi.fn().mockReturnValue(true);
      expect(tracker.confirmPasteIfDirty(confirmFn)).toBe(true);
      // After successful paste, mark clean
      tracker.markClean();
      // Now close should not warn
      expect(tracker.shouldWarnOnClose()).toBe(false);
    });
  });
});
