/**
 * AuthService Tests
 *
 * Tests the authentication service including:
 * - Token encryption/decryption with safeStorage
 * - Token persistence to disk
 * - Token refresh threshold logic
 * - Cache invalidation
 * - Sign-in/sign-up flows
 * - Email verification
 * - Password reset flow
 * - Token expiration handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock electron
const mockEncryptString = vi.fn();
const mockDecryptString = vi.fn();
const mockIsEncryptionAvailable = vi.fn();
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/userData'),
  },
  safeStorage: {
    isEncryptionAvailable: () => mockIsEncryptionAvailable(),
    encryptString: (value: string) => mockEncryptString(value),
    decryptString: (buffer: Buffer) => mockDecryptString(buffer),
  },
}));

// Mock fs
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockWriteFileSync = vi.fn();
const mockUnlinkSync = vi.fn();
vi.mock('node:fs', () => ({
  default: {
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
    writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
    unlinkSync: (...args: unknown[]) => mockUnlinkSync(...args),
  },
}));

// Mock logger
vi.mock('../../../utils/logger.utils', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock EnvService
vi.mock('../../core/env.service', () => ({
  EnvService: {
    get: (key: string) => {
      if (key === 'API_URL') return 'http://localhost:4111/api';
      return undefined;
    },
  },
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a mock JWT token with specific claims
 */
function createMockJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = 'mock-signature';
  return `${header}.${body}.${signature}`;
}

/**
 * Create a valid access token that expires in the future
 */
function createValidAccessToken(expiresInSeconds: number = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return createMockJwt({
    sub: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    exp,
  });
}

/**
 * Create an expired access token
 */
function createExpiredAccessToken(): string {
  const exp = Math.floor(Date.now() / 1000) - 3600; // Expired 1 hour ago
  return createMockJwt({
    sub: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    exp,
  });
}

/**
 * Create a token that needs refresh (expires within 2 minutes)
 */
function createNeedsRefreshToken(): string {
  const exp = Math.floor(Date.now() / 1000) + 60; // Expires in 60 seconds
  return createMockJwt({
    sub: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    exp,
  });
}

// =============================================================================
// Tests
// =============================================================================

// Reset module between tests to clear singleton state
let AuthService: typeof import('../auth.service').AuthService;

describe('AuthService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockFetch.mockReset();

    // Default mock behaviors
    mockIsEncryptionAvailable.mockReturnValue(true);
    mockEncryptString.mockImplementation((value: string) => Buffer.from(`encrypted:${value}`));
    mockDecryptString.mockImplementation((buffer: Buffer) => {
      const str = buffer.toString();
      if (str.startsWith('encrypted:')) {
        return str.replace('encrypted:', '');
      }
      throw new Error('Decryption failed');
    });
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('{}');
    mockWriteFileSync.mockImplementation(() => {});
    mockUnlinkSync.mockImplementation(() => {});

    // Reset module to clear state
    vi.resetModules();
    const module = await import('../auth.service');
    AuthService = module.AuthService;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('isEncryptionAvailable', () => {
    it('should return true when safeStorage is available', () => {
      mockIsEncryptionAvailable.mockReturnValue(true);
      expect(AuthService.isEncryptionAvailable()).toBe(true);
    });

    it('should return false when safeStorage is unavailable', () => {
      mockIsEncryptionAvailable.mockReturnValue(false);
      expect(AuthService.isEncryptionAvailable()).toBe(false);
    });
  });

  describe('secureStore / secureRetrieve', () => {
    it('should encrypt and store value when encryption is available', () => {
      AuthService.secureStore('test-key', 'test-value');

      expect(mockEncryptString).toHaveBeenCalledWith('test-value');
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('should retrieve and decrypt value', () => {
      // Store a value first
      AuthService.secureStore('test-key', 'test-value');

      // Clear the call and set up for retrieval
      mockExistsSync.mockReturnValue(true);
      const storedData: Record<string, string> = {};
      mockWriteFileSync.mockImplementation((_, data: string) => {
        const parsed = JSON.parse(data);
        Object.assign(storedData, parsed);
      });
      mockReadFileSync.mockImplementation(() => JSON.stringify(storedData));

      // Re-store to populate storedData
      AuthService.secureStore('test-key', 'test-value');

      // Retrieve
      const result = AuthService.secureRetrieve('test-key');
      expect(result).toBe('test-value');
    });

    it('should return null for non-existent key', () => {
      const result = AuthService.secureRetrieve('non-existent-key');
      expect(result).toBeNull();
    });

    it('should use plain storage fallback when encryption unavailable', () => {
      mockIsEncryptionAvailable.mockReturnValue(false);

      AuthService.secureStore('test-key', 'test-value');

      // Should not call encryptString
      expect(mockEncryptString).not.toHaveBeenCalled();
      // Should still write to disk
      expect(mockWriteFileSync).toHaveBeenCalled();
    });
  });

  describe('storeTokens / getAccessToken / getRefreshToken', () => {
    it('should store and retrieve access token', () => {
      const accessToken = createValidAccessToken();
      const refreshToken = 'mock-refresh-token';

      AuthService.storeTokens({ accessToken, refreshToken });

      expect(AuthService.getAccessToken()).toBe(accessToken);
    });

    it('should store and retrieve refresh token', () => {
      const accessToken = createValidAccessToken();
      const refreshToken = 'mock-refresh-token';

      AuthService.storeTokens({ accessToken, refreshToken });

      expect(AuthService.getRefreshToken()).toBe(refreshToken);
    });

    it('should cache tokens in memory', () => {
      const accessToken = createValidAccessToken();
      const refreshToken = 'mock-refresh-token';

      AuthService.storeTokens({ accessToken, refreshToken });

      // Clear mock to verify cache is used
      mockReadFileSync.mockClear();

      // Should return cached value without reading from disk
      expect(AuthService.getAccessToken()).toBe(accessToken);
    });
  });

  describe('clearTokens', () => {
    it('should clear all tokens from storage and cache', () => {
      const accessToken = createValidAccessToken();
      const refreshToken = 'mock-refresh-token';

      AuthService.storeTokens({ accessToken, refreshToken });
      AuthService.clearTokens();

      expect(AuthService.getAccessToken()).toBeNull();
      expect(AuthService.getRefreshToken()).toBeNull();
    });

    it('should delete token file from disk', () => {
      mockExistsSync.mockReturnValue(true);

      AuthService.clearTokens();

      expect(mockUnlinkSync).toHaveBeenCalled();
    });
  });

  describe('isAuthenticated', () => {
    it('should return true with valid non-expired token', () => {
      const accessToken = createValidAccessToken();
      AuthService.storeTokens({ accessToken, refreshToken: 'refresh' });

      expect(AuthService.isAuthenticated()).toBe(true);
    });

    it('should return true with expired token but valid refresh token', () => {
      const accessToken = createExpiredAccessToken();
      AuthService.storeTokens({ accessToken, refreshToken: 'refresh' });

      expect(AuthService.isAuthenticated()).toBe(true);
    });

    it('should return false with no tokens', () => {
      expect(AuthService.isAuthenticated()).toBe(false);
    });
  });

  describe('getCurrentUser', () => {
    it('should extract user info from access token', () => {
      const accessToken = createValidAccessToken();
      AuthService.storeTokens({ accessToken, refreshToken: 'refresh' });

      const user = AuthService.getCurrentUser();

      expect(user).toEqual({
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
      });
    });

    it('should return null without access token', () => {
      expect(AuthService.getCurrentUser()).toBeNull();
    });

    it('should return null for invalid token', () => {
      // Store invalid token directly in cache
      AuthService.storeTokens({ accessToken: 'invalid-token', refreshToken: 'refresh' });

      expect(AuthService.getCurrentUser()).toBeNull();
    });
  });

  describe('getAuthState', () => {
    it('should return authenticated state with user', () => {
      const accessToken = createValidAccessToken();
      AuthService.storeTokens({ accessToken, refreshToken: 'refresh' });

      const state = AuthService.getAuthState();

      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual({
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
      });
    });

    it('should return unauthenticated state without tokens', () => {
      const state = AuthService.getAuthState();

      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
    });
  });

  describe('needsTokenRefresh', () => {
    it('should return false for token with plenty of time', () => {
      const accessToken = createValidAccessToken(3600); // 1 hour
      AuthService.storeTokens({ accessToken, refreshToken: 'refresh' });

      expect(AuthService.needsTokenRefresh()).toBe(false);
    });

    it('should return true for token expiring soon', () => {
      const accessToken = createNeedsRefreshToken(); // < 2 minutes
      AuthService.storeTokens({ accessToken, refreshToken: 'refresh' });

      expect(AuthService.needsTokenRefresh()).toBe(true);
    });

    it('should return false without access token', () => {
      expect(AuthService.needsTokenRefresh()).toBe(false);
    });
  });

  describe('getValidAccessToken', () => {
    it('should return token directly if valid and not near expiry', async () => {
      const accessToken = createValidAccessToken(3600);
      AuthService.storeTokens({ accessToken, refreshToken: 'refresh' });

      const result = await AuthService.getValidAccessToken();

      expect(result).toBe(accessToken);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should refresh token if near expiry', async () => {
      const oldToken = createNeedsRefreshToken();
      const newToken = createValidAccessToken(3600);

      AuthService.storeTokens({ accessToken: oldToken, refreshToken: 'refresh-token' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accessToken: newToken }),
      });

      const result = await AuthService.getValidAccessToken();

      expect(result).toBe(newToken);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/refresh'),
        expect.any(Object)
      );
    });

    it('should return null if no access token', async () => {
      const result = await AuthService.getValidAccessToken();
      expect(result).toBeNull();
    });

    it('should clear tokens and return null if refresh fails', async () => {
      const oldToken = createNeedsRefreshToken();
      AuthService.storeTokens({ accessToken: oldToken, refreshToken: 'refresh-token' });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Invalid refresh token' }),
      });

      const result = await AuthService.getValidAccessToken();

      expect(result).toBeNull();
      expect(AuthService.getAccessToken()).toBeNull();
    });
  });

  describe('signIn', () => {
    it('should sign in successfully and store tokens', async () => {
      const accessToken = createValidAccessToken();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            accessToken,
            refreshToken: 'refresh-token',
            user: { id: 'user-123', username: 'testuser', email: 'test@example.com' },
          }),
      });

      const result = await AuthService.signIn({ email: 'test@example.com', password: 'password' });

      expect(result.user).toBeDefined();
      expect(result.accessToken).toBe(accessToken);
      expect(AuthService.getAccessToken()).toBe(accessToken);
    });

    it('should handle needs verification response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () =>
          Promise.resolve({
            needsVerification: true,
            userId: 'user-123',
          }),
      });

      const result = await AuthService.signIn({ email: 'test@example.com', password: 'password' });

      expect(result.needsVerification).toBe(true);
      expect(result.userId).toBe('user-123');
    });

    it('should throw error on failed sign in', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Invalid credentials' }),
      });

      await expect(
        AuthService.signIn({ email: 'test@example.com', password: 'wrong' })
      ).rejects.toThrow('Invalid credentials');
    });

    it('should throw error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        AuthService.signIn({ email: 'test@example.com', password: 'password' })
      ).rejects.toThrow('Unable to connect to server');
    });
  });

  describe('signUp', () => {
    it('should sign up successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            message: 'Verification code sent',
            userId: 'new-user-123',
            emailSent: true,
          }),
      });

      const result = await AuthService.signUp({
        username: 'newuser',
        email: 'new@example.com',
        password: 'password123',
      });

      expect(result.userId).toBe('new-user-123');
      expect(result.emailSent).toBe(true);
    });

    it('should throw error on failed sign up', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Email already exists' }),
      });

      await expect(
        AuthService.signUp({
          username: 'newuser',
          email: 'existing@example.com',
          password: 'password',
        })
      ).rejects.toThrow('Email already exists');
    });
  });

  describe('verify', () => {
    it('should verify email and store tokens', async () => {
      const accessToken = createValidAccessToken();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            accessToken,
            refreshToken: 'refresh-token',
            user: { id: 'user-123', username: 'testuser', email: 'test@example.com' },
          }),
      });

      const result = await AuthService.verify({ userId: 'user-123', code: '123456' });

      expect(result.user).toBeDefined();
      expect(AuthService.getAccessToken()).toBe(accessToken);
    });

    it('should throw error on invalid code', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Invalid verification code' }),
      });

      await expect(
        AuthService.verify({ userId: 'user-123', code: 'wrong' })
      ).rejects.toThrow('Invalid verification code');
    });
  });

  describe('resendCode', () => {
    it('should resend verification code successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: 'Code sent' }),
      });

      await expect(AuthService.resendCode('user-123')).resolves.toBeUndefined();
    });

    it('should throw error on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Rate limited' }),
      });

      await expect(AuthService.resendCode('user-123')).rejects.toThrow('Rate limited');
    });
  });

  describe('signOut', () => {
    it('should clear all tokens', () => {
      const accessToken = createValidAccessToken();
      AuthService.storeTokens({ accessToken, refreshToken: 'refresh' });

      AuthService.signOut();

      expect(AuthService.isAuthenticated()).toBe(false);
      expect(AuthService.getAccessToken()).toBeNull();
    });
  });

  describe('forgotPassword', () => {
    it('should request password reset successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            message: 'Reset code sent',
            userId: 'user-123',
            emailSent: true,
          }),
      });

      const result = await AuthService.forgotPassword('test@example.com');

      expect(result.userId).toBe('user-123');
      expect(result.emailSent).toBe(true);
    });

    it('should throw error on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'User not found' }),
      });

      await expect(AuthService.forgotPassword('unknown@example.com')).rejects.toThrow('User not found');
    });
  });

  describe('resetPassword', () => {
    it('should reset password successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: 'Password reset' }),
      });

      await expect(
        AuthService.resetPassword('user-123', '123456', 'newpassword')
      ).resolves.toBeUndefined();
    });

    it('should throw error on invalid code', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Invalid or expired code' }),
      });

      await expect(
        AuthService.resetPassword('user-123', 'wrong', 'newpassword')
      ).rejects.toThrow('Invalid or expired code');
    });
  });

  describe('resendResetCode', () => {
    it('should resend reset code successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: 'Code sent' }),
      });

      await expect(AuthService.resendResetCode('user-123')).resolves.toBeUndefined();
    });

    it('should throw error on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Rate limited' }),
      });

      await expect(AuthService.resendResetCode('user-123')).rejects.toThrow('Rate limited');
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh access token successfully', async () => {
      const newToken = createValidAccessToken();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accessToken: newToken }),
      });

      const result = await AuthService.refreshAccessToken('refresh-token');

      expect(result).toBe(newToken);
      expect(AuthService.getAccessToken()).toBe(newToken);
    });

    it('should throw error on refresh failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Invalid refresh token' }),
      });

      await expect(AuthService.refreshAccessToken('invalid-token')).rejects.toThrow(
        'Invalid refresh token'
      );
    });
  });

  describe('init', () => {
    it('should load tokens from disk', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ key: 'value' }));

      AuthService.init();

      expect(mockReadFileSync).toHaveBeenCalled();
    });

    it('should handle missing token file gracefully', () => {
      mockExistsSync.mockReturnValue(false);

      // Should not throw
      AuthService.init();
    });

    it('should handle corrupted token file gracefully', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('not valid json');

      // Should not throw
      AuthService.init();
    });
  });
});
