/**
 * Auth Store
 *
 * Reactive authentication state management using Svelte 5 runes.
 * Manages user authentication, sign in/out flows, and pending tweak requests.
 */

import type { AuthUser } from '../../../../../main/services/auth/auth.service';
import type { StartTweakParams } from '../tweak/types';
import type { AuthDialogView } from './types';
import { createLogger } from '$lib/utils/logger.utils';

const logger = createLogger('AuthStore');

// =============================================================================
// Store Implementation
// =============================================================================

function createAuthStore() {
  // =========================================================================
  // Auth State
  // =========================================================================
  let isAuthenticated = $state(false);
  let user = $state<AuthUser | null>(null);
  let isLoading = $state(true); // Start as loading until init completes
  let pendingTweakRequest = $state<StartTweakParams | null>(null);

  // =========================================================================
  // Dialog State
  // =========================================================================
  let isDialogOpen = $state(false);
  let dialogView = $state<AuthDialogView>('signin');
  let pendingUserId = $state<string | null>(null); // For verification flow
  let pendingResetUserId = $state<string | null>(null); // For password reset flow
  let pendingResetEmail = $state<string | null>(null); // Email being reset (for display)
  let emailWarning = $state(false); // True if initial verification email failed to send

  // =========================================================================
  // Lifecycle
  // =========================================================================

  /**
   * Initialize the auth store - load auth state from main process.
   * Should be called once in layout component.
   */
  async function init(): Promise<void> {
    try {
      isLoading = true;
      const state = await window.api.auth.getState();
      isAuthenticated = state.isAuthenticated;
      user = state.user;
      logger.info('Initialized:', { isAuthenticated, user: user?.username });

      // Listen for auth errors from WebSocket (e.g., expired token)
      window.api.auth.onAuthError(() => {
        logger.info('Auth error received, opening dialog');
        handleAuthError();
      });
    } catch (error) {
      logger.error('Failed to initialize:', error);
      isAuthenticated = false;
      user = null;
    } finally {
      isLoading = false;
    }
  }

  /**
   * Cleanup listeners.
   */
  function cleanup(): void {
    window.api.auth.removeAllListeners();
  }

  // =========================================================================
  // Auth Actions
  // =========================================================================

  /**
   * Sign in with email and password.
   */
  async function signIn(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      isLoading = true;
      const result = await window.api.auth.signIn(email, password);

      if (result.success && result.user) {
        isAuthenticated = true;
        user = result.user;
        closeDialog();
        await executePendingTweak();
        return { success: true };
      }

      // Handle case where user needs to verify their email
      if (result.needsVerification && result.userId) {
        pendingUserId = result.userId;
        dialogView = 'verify';
        return { success: true }; // Not an error - just redirecting to verify
      }

      return { success: false, error: result.error || 'Sign in failed' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign in failed';
      return { success: false, error: message };
    } finally {
      isLoading = false;
    }
  }

  /**
   * Sign up with username, email, and password.
   */
  async function signUp(
    username: string,
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      isLoading = true;
      const result = await window.api.auth.signUp(username, email, password);

      if (result.success && result.userId) {
        pendingUserId = result.userId;
        emailWarning = result.emailSent === false;
        dialogView = 'verify';
        return { success: true };
      }

      return { success: false, error: result.error || 'Sign up failed' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign up failed';
      return { success: false, error: message };
    } finally {
      isLoading = false;
    }
  }

  /**
   * Verify email with 6-digit code.
   */
  async function verify(code: string): Promise<{ success: boolean; error?: string }> {
    if (!pendingUserId) {
      return { success: false, error: 'No pending verification' };
    }

    try {
      isLoading = true;
      const result = await window.api.auth.verify(pendingUserId, code);

      if (result.success && result.user) {
        isAuthenticated = true;
        user = result.user;
        pendingUserId = null;
        closeDialog();
        await executePendingTweak();
        return { success: true };
      }

      return { success: false, error: result.error || 'Verification failed' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Verification failed';
      return { success: false, error: message };
    } finally {
      isLoading = false;
    }
  }

  /**
   * Resend verification code.
   */
  async function resendCode(): Promise<{ success: boolean; error?: string }> {
    if (!pendingUserId) {
      return { success: false, error: 'No pending verification' };
    }

    try {
      const result = await window.api.auth.resendCode(pendingUserId);
      return { success: result.success, error: result.error };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to resend code';
      return { success: false, error: message };
    }
  }

  /**
   * Request password reset.
   */
  async function forgotPassword(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      isLoading = true;
      const result = await window.api.auth.forgotPassword(email);

      if (result.success && result.userId) {
        pendingResetUserId = result.userId;
        pendingResetEmail = email;
        emailWarning = result.emailSent === false;
        dialogView = 'reset-password';
        return { success: true };
      }

      // If no userId returned, email wasn't found but we don't reveal that
      // Show generic success message
      if (result.success) {
        return { success: false, error: 'If an account exists with this email, a reset code has been sent.' };
      }

      return { success: false, error: result.error || 'Password reset request failed' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Password reset request failed';
      return { success: false, error: message };
    } finally {
      isLoading = false;
    }
  }

  /**
   * Reset password with verification code.
   */
  async function resetPassword(code: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    if (!pendingResetUserId) {
      return { success: false, error: 'No pending password reset' };
    }

    try {
      isLoading = true;
      const result = await window.api.auth.resetPassword(pendingResetUserId, code, newPassword);

      if (result.success) {
        pendingResetUserId = null;
        pendingResetEmail = null;
        dialogView = 'signin';
        return { success: true };
      }

      return { success: false, error: result.error || 'Password reset failed' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Password reset failed';
      return { success: false, error: message };
    } finally {
      isLoading = false;
    }
  }

  /**
   * Resend password reset code.
   */
  async function resendResetCode(): Promise<{ success: boolean; error?: string }> {
    if (!pendingResetUserId) {
      return { success: false, error: 'No pending password reset' };
    }

    try {
      const result = await window.api.auth.resendResetCode(pendingResetUserId);
      return { success: result.success, error: result.error };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to resend code';
      return { success: false, error: message };
    }
  }

  /**
   * Sign out.
   */
  async function signOut(): Promise<void> {
    try {
      await window.api.auth.signOut();
      isAuthenticated = false;
      user = null;
      logger.info('User signed out');
    } catch (error) {
      logger.error('Sign out failed:', error);
    }
  }

  /**
   * Refresh the access token if needed.
   */
  async function refreshTokenIfNeeded(): Promise<boolean> {
    try {
      const needsRefresh = await window.api.auth.needsRefresh();
      if (needsRefresh) {
        const result = await window.api.auth.refresh();
        return result.success;
      }
      return true; // No refresh needed
    } catch (error) {
      logger.error('Token refresh failed:', error);
      return false;
    }
  }

  // =========================================================================
  // Dialog Management
  // =========================================================================

  /**
   * Open the auth dialog.
   */
  function openDialog(view: AuthDialogView = 'signin'): void {
    dialogView = view;
    isDialogOpen = true;
  }

  /**
   * Close the auth dialog and clear pending state.
   */
  function closeDialog(): void {
    isDialogOpen = false;
    // Only clear pending user if we're authenticated (successful auth)
    // or if user explicitly closes the dialog
    if (!isAuthenticated) {
      pendingUserId = null;
      pendingResetUserId = null;
      pendingResetEmail = null;
    }
  }

  /**
   * Switch between signin/signup views.
   */
  function switchView(view: AuthDialogView): void {
    dialogView = view;
  }

  // =========================================================================
  // Pending Tweak Management
  // =========================================================================

  /**
   * Store a pending tweak request (user tried to tweak while not authenticated).
   */
  function setPendingTweak(params: StartTweakParams): void {
    pendingTweakRequest = params;
  }

  /**
   * Clear the pending tweak request.
   */
  function clearPendingTweak(): void {
    pendingTweakRequest = null;
  }

  /**
   * Execute the pending tweak after successful auth.
   */
  async function executePendingTweak(): Promise<void> {
    if (!pendingTweakRequest) return;

    const params = pendingTweakRequest;
    pendingTweakRequest = null;

    // Import dynamically to avoid circular dependency
    const { tweakDialogStore } = await import('../tweak');
    logger.info('Executing pending tweak:', params.tweak.title);
    await tweakDialogStore.startTweak(params);
  }

  // =========================================================================
  // Error Handling
  // =========================================================================

  /**
   * Handle auth errors (e.g., from WebSocket auth failure).
   */
  function handleAuthError(): void {
    // Clear auth state
    isAuthenticated = false;
    user = null;

    // Open the auth dialog for re-authentication
    openDialog('signin');
  }

  // =========================================================================
  // Public API
  // =========================================================================

  return {
    // Auth state
    get isAuthenticated() { return isAuthenticated; },
    get user() { return user; },
    get isLoading() { return isLoading; },

    // Dialog state
    get isDialogOpen() { return isDialogOpen; },
    set isDialogOpen(value: boolean) {
      isDialogOpen = value;
      if (!value) {
        // Clear pending tweak when dialog is closed without auth
        if (!isAuthenticated) {
          pendingTweakRequest = null;
        }
        // Clear email warning when dialog closes
        emailWarning = false;
      }
    },
    get dialogView() { return dialogView; },
    get pendingUserId() { return pendingUserId; },
    get pendingResetUserId() { return pendingResetUserId; },
    get pendingResetEmail() { return pendingResetEmail; },
    get emailWarning() { return emailWarning; },

    // Pending tweak
    get pendingTweakRequest() { return pendingTweakRequest; },

    // Lifecycle
    init,
    cleanup,

    // Auth actions
    signIn,
    signUp,
    verify,
    resendCode,
    signOut,
    refreshTokenIfNeeded,
    forgotPassword,
    resetPassword,
    resendResetCode,

    // Dialog management
    openDialog,
    closeDialog,
    switchView,

    // Pending tweak
    setPendingTweak,
    clearPendingTweak,

    // Error handling
    handleAuthError,
  };
}

// Singleton instance
export const authStore = createAuthStore();
