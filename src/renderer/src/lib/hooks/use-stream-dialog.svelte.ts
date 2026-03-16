import type { TweakStreamStatus } from '../../../../main/interfaces/tweak-agent.interface';

/**
 * Hook for managing the stream dialog state.
 * Handles dialog visibility, title, text output, and status tracking.
 */
export function useStreamDialog() {
  let isOpen = $state(false);
  let title = $state('');
  let textOutput = $state('');
  let status = $state<TweakStreamStatus>('idle');

  /**
   * Opens the dialog with the given title and resets state.
   */
  function open(dialogTitle: string): void {
    title = dialogTitle;
    textOutput = '';
    status = 'running';
    isOpen = true;
  }

  /**
   * Closes the dialog.
   */
  function close(): void {
    isOpen = false;
  }

  /**
   * Resets all dialog state.
   */
  function reset(): void {
    isOpen = false;
    title = '';
    textOutput = '';
    status = 'idle';
  }

  /**
   * Appends text to the output.
   */
  function appendText(text: string): void {
    textOutput += text;
  }

  /**
   * Sets the status.
   */
  function setStatus(newStatus: TweakStreamStatus): void {
    status = newStatus;
  }

  /**
   * Checks if the stream is currently active (running or awaiting approval).
   */
  function isActive(): boolean {
    return status === 'running' || status === 'awaiting-approval';
  }

  return {
    // State
    get isOpen() { return isOpen; },
    set isOpen(value: boolean) { isOpen = value; },
    get title() { return title; },
    get textOutput() { return textOutput; },
    get status() { return status; },

    // Actions
    open,
    close,
    reset,
    appendText,
    setStatus,

    // Helpers
    isActive,
  };
}
