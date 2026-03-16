/**
 * Auth IPC Handler Tests
 *
 * Tests the authentication IPC handlers including:
 * - Sign-in handler
 * - Sign-up handler
 * - Verify handler
 * - Password reset flow
 * - Error responses
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthState, AuthUser, SignInRequest, SignUpRequest, VerifyRequest } from '../../services/auth/auth.service';

// Store registered handlers for testing
const registeredHandlers: Map<string, Function> = new Map();

// Mock ipc-handler.factory
vi.mock('../ipc-handler.factory', () => ({
  createIpcHandlers: (configs: Array<{ channel: string; handler: Function }>) => {
    for (const config of configs) {
      registeredHandlers.set(config.channel, config.handler);
    }
  },
}));

// Mock logger
vi.mock('../../utils/logger.utils', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock AuthService - use plain object mock
vi.mock('../../services/auth/auth.service', () => ({
  AuthService: {
    getAuthState: vi.fn(),
    signIn: vi.fn(),
    signUp: vi.fn(),
    verify: vi.fn(),
    resendCode: vi.fn(),
    getRefreshToken: vi.fn(),
    refreshAccessToken: vi.fn(),
    signOut: vi.fn(),
    needsTokenRefresh: vi.fn(),
    getValidAccessToken: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    resendResetCode: vi.fn(),
  },
}));

// Import after mocks
import { setupAuthIpc } from '../auth.ipc';
import { AuthService } from '../../services/auth/auth.service';

// =============================================================================
// Test Fixtures
// =============================================================================

const createMockUser = (): AuthUser => ({
  id: 'user-123',
  username: 'testuser',
  email: 'test@example.com',
});

const createMockAuthState = (isAuthenticated: boolean): AuthState => ({
  isAuthenticated,
  user: isAuthenticated ? createMockUser() : null,
});

// Helper to invoke a registered handler
const invokeHandler = async (channel: string, args?: unknown) => {
  const handler = registeredHandlers.get(channel);
  if (!handler) {
    throw new Error(`No handler registered for channel: ${channel}`);
  }
  const mockEvent = { sender: {} };
  return handler(mockEvent, args);
};

// =============================================================================
// Tests
// =============================================================================

describe('Auth IPC Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registeredHandlers.clear();

    // Setup handlers
    setupAuthIpc();
  });

  describe('auth:get-state', () => {
    it('should return authenticated state', async () => {
      const state = createMockAuthState(true);
      vi.mocked(AuthService.getAuthState).mockReturnValue(state);

      const result = await invokeHandler('auth:get-state');

      expect(result).toEqual(state);
      expect(AuthService.getAuthState).toHaveBeenCalled();
    });

    it('should return unauthenticated state', async () => {
      const state = createMockAuthState(false);
      vi.mocked(AuthService.getAuthState).mockReturnValue(state);

      const result = await invokeHandler('auth:get-state');

      expect(result.isAuthenticated).toBe(false);
      expect(result.user).toBeNull();
    });
  });

  describe('auth:signin', () => {
    it('should sign in successfully', async () => {
      const user = createMockUser();
      vi.mocked(AuthService.signIn).mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh',
        user,
      });

      const request: SignInRequest = { email: 'test@example.com', password: 'password' };
      const result = await invokeHandler('auth:signin', request);

      expect(result.success).toBe(true);
      expect(result.user).toEqual(user);
      expect(AuthService.signIn).toHaveBeenCalledWith(request);
    });

    it('should handle needs verification response', async () => {
      vi.mocked(AuthService.signIn).mockResolvedValue({
        needsVerification: true,
        userId: 'user-123',
      });

      const result = await invokeHandler('auth:signin', { email: 'test@example.com', password: 'password' });

      expect(result.success).toBe(false);
      expect(result.needsVerification).toBe(true);
      expect(result.userId).toBe('user-123');
    });

    it('should handle sign in error', async () => {
      vi.mocked(AuthService.signIn).mockRejectedValue(new Error('Invalid credentials'));

      const result = await invokeHandler('auth:signin', { email: 'test@example.com', password: 'wrong' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(AuthService.signIn).mockRejectedValue('string error');

      const result = await invokeHandler('auth:signin', { email: 'test@example.com', password: 'password' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Sign in failed');
    });
  });

  describe('auth:signup', () => {
    it('should sign up successfully', async () => {
      vi.mocked(AuthService.signUp).mockResolvedValue({
        message: 'Verification code sent',
        userId: 'new-user-123',
        emailSent: true,
      });

      const request: SignUpRequest = {
        username: 'newuser',
        email: 'new@example.com',
        password: 'password123',
      };
      const result = await invokeHandler('auth:signup', request);

      expect(result.success).toBe(true);
      expect(result.userId).toBe('new-user-123');
      expect(result.emailSent).toBe(true);
    });

    it('should handle sign up error', async () => {
      vi.mocked(AuthService.signUp).mockRejectedValue(new Error('Email already exists'));

      const result = await invokeHandler('auth:signup', {
        username: 'user',
        email: 'existing@example.com',
        password: 'password',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email already exists');
    });
  });

  describe('auth:verify', () => {
    it('should verify successfully', async () => {
      const user = createMockUser();
      vi.mocked(AuthService.verify).mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh',
        user,
      });

      const request: VerifyRequest = { userId: 'user-123', code: '123456' };
      const result = await invokeHandler('auth:verify', request);

      expect(result.success).toBe(true);
      expect(result.user).toEqual(user);
    });

    it('should handle verification error', async () => {
      vi.mocked(AuthService.verify).mockRejectedValue(new Error('Invalid code'));

      const result = await invokeHandler('auth:verify', { userId: 'user-123', code: 'wrong' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid code');
    });
  });

  describe('auth:resend-code', () => {
    it('should resend code successfully', async () => {
      vi.mocked(AuthService.resendCode).mockResolvedValue(undefined);

      const result = await invokeHandler('auth:resend-code', 'user-123');

      expect(result.success).toBe(true);
      expect(AuthService.resendCode).toHaveBeenCalledWith('user-123');
    });

    it('should handle resend error', async () => {
      vi.mocked(AuthService.resendCode).mockRejectedValue(new Error('Rate limited'));

      const result = await invokeHandler('auth:resend-code', 'user-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Rate limited');
    });
  });

  describe('auth:refresh', () => {
    it('should refresh token successfully', async () => {
      vi.mocked(AuthService.getRefreshToken).mockReturnValue('refresh-token');
      vi.mocked(AuthService.refreshAccessToken).mockResolvedValue('new-access-token');

      const result = await invokeHandler('auth:refresh');

      expect(result.success).toBe(true);
      expect(AuthService.refreshAccessToken).toHaveBeenCalledWith('refresh-token');
    });

    it('should return error when no refresh token', async () => {
      vi.mocked(AuthService.getRefreshToken).mockReturnValue(null);

      const result = await invokeHandler('auth:refresh');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No refresh token available');
    });

    it('should handle refresh error', async () => {
      vi.mocked(AuthService.getRefreshToken).mockReturnValue('refresh-token');
      vi.mocked(AuthService.refreshAccessToken).mockRejectedValue(new Error('Token expired'));

      const result = await invokeHandler('auth:refresh');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Token expired');
    });
  });

  describe('auth:signout', () => {
    it('should sign out', async () => {
      await invokeHandler('auth:signout');

      expect(AuthService.signOut).toHaveBeenCalled();
    });
  });

  describe('auth:needs-refresh', () => {
    it('should return true when refresh needed', async () => {
      vi.mocked(AuthService.needsTokenRefresh).mockReturnValue(true);

      const result = await invokeHandler('auth:needs-refresh');

      expect(result).toBe(true);
    });

    it('should return false when no refresh needed', async () => {
      vi.mocked(AuthService.needsTokenRefresh).mockReturnValue(false);

      const result = await invokeHandler('auth:needs-refresh');

      expect(result).toBe(false);
    });
  });

  describe('auth:get-valid-token', () => {
    it('should return valid token', async () => {
      vi.mocked(AuthService.getValidAccessToken).mockResolvedValue('valid-token');

      const result = await invokeHandler('auth:get-valid-token');

      expect(result).toBe('valid-token');
    });

    it('should return null when no valid token', async () => {
      vi.mocked(AuthService.getValidAccessToken).mockResolvedValue(null);

      const result = await invokeHandler('auth:get-valid-token');

      expect(result).toBeNull();
    });
  });

  describe('auth:forgot-password', () => {
    it('should request password reset successfully', async () => {
      vi.mocked(AuthService.forgotPassword).mockResolvedValue({
        message: 'Reset code sent',
        userId: 'user-123',
        emailSent: true,
      });

      const result = await invokeHandler('auth:forgot-password', 'test@example.com');

      expect(result.success).toBe(true);
      expect(result.userId).toBe('user-123');
      expect(result.emailSent).toBe(true);
    });

    it('should handle forgot password error', async () => {
      vi.mocked(AuthService.forgotPassword).mockRejectedValue(new Error('User not found'));

      const result = await invokeHandler('auth:forgot-password', 'unknown@example.com');

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });
  });

  describe('auth:reset-password', () => {
    it('should reset password successfully', async () => {
      vi.mocked(AuthService.resetPassword).mockResolvedValue(undefined);

      const result = await invokeHandler('auth:reset-password', {
        userId: 'user-123',
        code: '123456',
        newPassword: 'newpassword',
      });

      expect(result.success).toBe(true);
      expect(AuthService.resetPassword).toHaveBeenCalledWith('user-123', '123456', 'newpassword');
    });

    it('should handle reset password error', async () => {
      vi.mocked(AuthService.resetPassword).mockRejectedValue(new Error('Invalid code'));

      const result = await invokeHandler('auth:reset-password', {
        userId: 'user-123',
        code: 'wrong',
        newPassword: 'newpassword',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid code');
    });
  });

  describe('auth:resend-reset-code', () => {
    it('should resend reset code successfully', async () => {
      vi.mocked(AuthService.resendResetCode).mockResolvedValue(undefined);

      const result = await invokeHandler('auth:resend-reset-code', 'user-123');

      expect(result.success).toBe(true);
      expect(AuthService.resendResetCode).toHaveBeenCalledWith('user-123');
    });

    it('should handle resend error', async () => {
      vi.mocked(AuthService.resendResetCode).mockRejectedValue(new Error('Rate limited'));

      const result = await invokeHandler('auth:resend-reset-code', 'user-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Rate limited');
    });
  });
});
