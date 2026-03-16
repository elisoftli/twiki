/**
 * Settings Store
 *
 * Reactive settings state management using Svelte 5 runes.
 * Manages application settings loaded from the main process.
 */

import type { Settings } from '../../../../main/interfaces';

// =============================================================================
// Store Implementation
// =============================================================================

function createSettingsStore() {
  let settings = $state<Settings | null>(null);

  return {
    /**
     * Get current settings.
     */
    get value() {
      return settings;
    },

    /**
     * Set the settings value.
     * Called when settings are loaded or updated from main process.
     */
    set(value: Settings) {
      settings = value;
    },

    /**
     * Update settings with partial values.
     * Calls the main process API to persist changes.
     */
    async update(updates: Partial<Settings>): Promise<void> {
      await window.api.updateSettings(updates);
      // Note: The actual settings update will come back via IPC event
      // and be applied through the set() method
    },
  };
}

// Singleton instance
export const settingsStore = createSettingsStore();
