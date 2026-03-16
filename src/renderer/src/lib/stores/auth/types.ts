/**
 * Auth Store Types
 *
 * Shared types for auth-related stores.
 */

import type { AuthUser } from '../../../../../main/services/auth/auth.service';
import type { StartTweakParams } from '../tweak/types';

// =============================================================================
// Auth State Types
// =============================================================================

export interface AuthStoreState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  isLoading: boolean;
  pendingTweakRequest: StartTweakParams | null;
}

export type AuthDialogView = 'signin' | 'signup' | 'verify' | 'forgot-password' | 'reset-password';

// Re-export AuthUser for convenience
export type { AuthUser };
