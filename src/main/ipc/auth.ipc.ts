/**
 * Auth IPC Handlers
 *
 * Handles IPC operations for authentication:
 * - Sign in / Sign up / Verify
 * - Resend verification code
 * - Token refresh
 * - Sign out
 * - Get auth state
 */

import {
  AuthService,
  type AuthState,
  type AuthUser,
  type SignInRequest,
  type SignUpRequest,
  type VerifyRequest,
  type SignUpResponse,
} from '../services/auth/auth.service';
import { createLogger } from '../utils/logger.utils';
import { createIpcHandlers } from './ipc-handler.factory';

const logger = createLogger('AuthIpc');

export interface SignInResult {
  success: boolean;
  user?: AuthUser;
  error?: string;
  needsVerification?: boolean;
  userId?: string;
}

export interface SignUpResult {
  success: boolean;
  userId?: string;
  error?: string;
  emailSent?: boolean;
}

export interface VerifyResult {
  success: boolean;
  user?: AuthUser;
  error?: string;
}

export interface ResendCodeResult {
  success: boolean;
  error?: string;
}

export interface RefreshResult {
  success: boolean;
  error?: string;
}

export interface ForgotPasswordResult {
  success: boolean;
  userId?: string;
  error?: string;
  emailSent?: boolean;
}

export interface ResetPasswordResult {
  success: boolean;
  error?: string;
}

/**
 * Setup authentication-related IPC handlers.
 */
export function setupAuthIpc(): void {
  createIpcHandlers([
    // Get current auth state
    {
      channel: 'auth:get-state',
      handler: (): AuthState => AuthService.getAuthState(),
    },

    // Sign in
    {
      channel: 'auth:signin',
      handler: async (_, request: SignInRequest): Promise<SignInResult> => {
        try {
          const response = await AuthService.signIn(request);

          // Handle case where user needs to verify email first
          if (response.needsVerification && response.userId) {
            logger.info('User needs verification, redirecting to verify view');
            return {
              success: false,
              needsVerification: true,
              userId: response.userId,
            };
          }

          logger.info('User signed in:', response.user?.username);
          return { success: true, user: response.user };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Sign in failed';
          logger.warn('Sign in failed:', message);
          return { success: false, error: message };
        }
      },
    },

    // Sign up
    {
      channel: 'auth:signup',
      handler: async (_, request: SignUpRequest): Promise<SignUpResult> => {
        try {
          const response: SignUpResponse = await AuthService.signUp(request);
          logger.info('User signed up, verification code sent:', response.emailSent);
          return { success: true, userId: response.userId, emailSent: response.emailSent };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Sign up failed';
          logger.warn('Sign up failed:', message);
          return { success: false, error: message };
        }
      },
    },

    // Verify email
    {
      channel: 'auth:verify',
      handler: async (_, request: VerifyRequest): Promise<VerifyResult> => {
        try {
          const response = await AuthService.verify(request);
          logger.info('User verified:', response.user.username);
          return { success: true, user: response.user };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Verification failed';
          logger.warn('Verification failed:', message);
          return { success: false, error: message };
        }
      },
    },

    // Resend verification code
    {
      channel: 'auth:resend-code',
      handler: async (_, userId: string): Promise<ResendCodeResult> => {
        try {
          await AuthService.resendCode(userId);
          logger.debug('Verification code resent');
          return { success: true };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to resend code';
          logger.warn('Resend code failed:', message);
          return { success: false, error: message };
        }
      },
    },

    // Refresh token
    {
      channel: 'auth:refresh',
      handler: async (): Promise<RefreshResult> => {
        try {
          const refreshToken = AuthService.getRefreshToken();
          if (!refreshToken) {
            return { success: false, error: 'No refresh token available' };
          }
          await AuthService.refreshAccessToken(refreshToken);
          logger.debug('Token refreshed');
          return { success: true };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Token refresh failed';
          logger.warn('Token refresh failed:', message);
          return { success: false, error: message };
        }
      },
    },

    // Sign out
    {
      channel: 'auth:signout',
      handler: (): void => {
        AuthService.signOut();
        logger.info('User signed out');
      },
    },

    // Check if token needs refresh (for proactive refresh)
    {
      channel: 'auth:needs-refresh',
      handler: (): boolean => AuthService.needsTokenRefresh(),
    },

    // Get valid access token (refreshes if needed)
    {
      channel: 'auth:get-valid-token',
      handler: async (): Promise<string | null> => AuthService.getValidAccessToken(),
    },

    // Forgot password
    {
      channel: 'auth:forgot-password',
      handler: async (_, email: string): Promise<ForgotPasswordResult> => {
        try {
          const response = await AuthService.forgotPassword(email);
          logger.info('Password reset code sent:', response.emailSent);
          return { success: true, userId: response.userId, emailSent: response.emailSent };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Password reset request failed';
          logger.warn('Forgot password failed:', message);
          return { success: false, error: message };
        }
      },
    },

    // Reset password
    {
      channel: 'auth:reset-password',
      handler: async (
        _,
        request: { userId: string; code: string; newPassword: string }
      ): Promise<ResetPasswordResult> => {
        try {
          await AuthService.resetPassword(request.userId, request.code, request.newPassword);
          logger.info('Password reset successful');
          return { success: true };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Password reset failed';
          logger.warn('Reset password failed:', message);
          return { success: false, error: message };
        }
      },
    },

    // Resend password reset code
    {
      channel: 'auth:resend-reset-code',
      handler: async (_, userId: string): Promise<ResendCodeResult> => {
        try {
          await AuthService.resendResetCode(userId);
          logger.debug('Password reset code resent');
          return { success: true };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to resend code';
          logger.warn('Resend reset code failed:', message);
          return { success: false, error: message };
        }
      },
    },
  ]);
}
