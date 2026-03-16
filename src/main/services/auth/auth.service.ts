/**
 * Auth Service
 *
 * Handles authentication state and token management using Electron's safeStorage API.
 * Tokens are encrypted using OS credentials and persisted to disk for session persistence.
 */

import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from '../../utils/logger.utils';
import { EnvService } from '../core/env.service';

const logger = createLogger('AuthService');

// Storage keys for encrypted token storage
const ACCESS_TOKEN_KEY = 'auth_access_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';
const TOKEN_FILE_NAME = 'auth-tokens.enc';

// Token refresh threshold: refresh when access token has less than 2 minutes remaining
const REFRESH_THRESHOLD_MS = 2 * 60 * 1000;

export interface AuthUser {
  id: string;
  username: string;
  email: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SignInRequest {
  email: string;
  password: string;
}

export interface SignUpRequest {
  username: string;
  email: string;
  password: string;
}

export interface VerifyRequest {
  userId: string;
  code: string;
}

export interface SignUpResponse {
  message: string;
  userId: string;
  emailSent?: boolean;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface SignInResponse {
  accessToken?: string;
  refreshToken?: string;
  user?: AuthUser;
  needsVerification?: boolean;
  userId?: string;
}

export interface RefreshResponse {
  accessToken: string;
}

export interface ApiError {
  error?: string;
  message?: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  message: string;
  userId?: string;
  emailSent?: boolean;
}

export interface ResetPasswordRequest {
  userId: string;
  code: string;
  newPassword: string;
}

// In-memory token cache to avoid repeated decryption
let cachedAccessToken: string | null = null;
let cachedRefreshToken: string | null = null;

// Track if we've loaded from disk
let hasLoadedFromDisk = false;

// In-memory storage for encrypted tokens (synced with disk)
const memoryStorage = new Map<string, string>();

/**
 * Get the path to the token storage file.
 */
function getTokenFilePath(): string {
  return path.join(app.getPath('userData'), TOKEN_FILE_NAME);
}

/**
 * Load encrypted tokens from disk into memory.
 */
function loadFromDisk(): void {
  if (hasLoadedFromDisk) return;
  hasLoadedFromDisk = true;

  const filePath = getTokenFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(data);

      if (parsed && typeof parsed === 'object') {
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value === 'string') {
            memoryStorage.set(key, value);
          }
        }
        logger.info('Loaded auth tokens from disk');
      }
    }
  } catch (error) {
    logger.error('Failed to load tokens from disk:', error);
    // Continue without persisted tokens - user will need to re-auth
  }
}

/**
 * Save encrypted tokens from memory to disk.
 */
function saveToDisk(): void {
  const filePath = getTokenFilePath();
  try {
    const data: Record<string, string> = {};
    for (const [key, value] of memoryStorage.entries()) {
      data[key] = value;
    }
    fs.writeFileSync(filePath, JSON.stringify(data), { mode: 0o600 });
    logger.info('Saved auth tokens to disk');
  } catch (error) {
    logger.error('Failed to save tokens to disk:', error);
  }
}

/**
 * Delete the token storage file from disk.
 */
function deleteFromDisk(): void {
  const filePath = getTokenFilePath();
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info('Deleted auth tokens from disk');
    }
  } catch (error) {
    logger.error('Failed to delete tokens from disk:', error);
  }
}

/**
 * Decode a JWT token payload without verification.
 * Used to extract user info and check expiry.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/**
 * Check if a JWT token is expired.
 */
function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return true;
  // Token is expired if current time is past the expiry
  return Date.now() >= payload.exp * 1000;
}

/**
 * Check if a JWT token needs to be refreshed (close to expiry).
 */
function tokenNeedsRefresh(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return true;
  // Token needs refresh if it expires within the threshold
  return Date.now() >= (payload.exp * 1000) - REFRESH_THRESHOLD_MS;
}

/**
 * Extract user info from a JWT access token.
 */
function extractUserFromToken(token: string): AuthUser | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;

  const sub = payload.sub;
  const username = payload.username;
  const email = payload.email;

  if (typeof sub !== 'string' || typeof username !== 'string' || typeof email !== 'string') {
    return null;
  }

  return { id: sub, username, email };
}

export const AuthService = {
  /**
   * Initialize the auth service - load persisted tokens from disk.
   * Should be called early in app startup.
   */
  init(): void {
    loadFromDisk();
  },

  /**
   * Check if safeStorage is available and encryption is ready.
   */
  isEncryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  },

  /**
   * Store a value securely using safeStorage.
   * Encrypts the value and persists to disk.
   * Falls back to plain storage if encryption is unavailable.
   */
  secureStore(key: string, value: string): void {
    loadFromDisk(); // Ensure we've loaded existing tokens

    if (this.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(value);
      // Store encrypted buffer as base64
      memoryStorage.set(key, encrypted.toString('base64'));
    } else {
      // Fallback to plain storage (less secure, but still persisted)
      logger.warn('safeStorage not available, using plain storage');
      memoryStorage.set(key, Buffer.from(value).toString('base64'));
    }

    // Persist to disk
    saveToDisk();
  },

  /**
   * Retrieve a value from secure storage.
   */
  secureRetrieve(key: string): string | null {
    loadFromDisk(); // Ensure we've loaded existing tokens

    const stored = memoryStorage.get(key);
    if (!stored) return null;

    if (this.isEncryptionAvailable()) {
      try {
        const encrypted = Buffer.from(stored, 'base64');
        return safeStorage.decryptString(encrypted);
      } catch (error) {
        logger.error('Failed to decrypt stored value:', error);
        return null;
      }
    } else {
      // Plain storage fallback
      try {
        return Buffer.from(stored, 'base64').toString('utf8');
      } catch {
        return null;
      }
    }
  },

  /**
   * Remove a value from secure storage.
   */
  secureRemove(key: string): void {
    memoryStorage.delete(key);
    saveToDisk();
  },

  /**
   * Store tokens securely.
   */
  storeTokens(tokens: AuthTokens): void {
    this.secureStore(ACCESS_TOKEN_KEY, tokens.accessToken);
    this.secureStore(REFRESH_TOKEN_KEY, tokens.refreshToken);
    cachedAccessToken = tokens.accessToken;
    cachedRefreshToken = tokens.refreshToken;
    logger.info('Tokens stored securely');
  },

  /**
   * Get the current access token.
   */
  getAccessToken(): string | null {
    if (cachedAccessToken) return cachedAccessToken;
    cachedAccessToken = this.secureRetrieve(ACCESS_TOKEN_KEY);
    return cachedAccessToken;
  },

  /**
   * Get the current refresh token.
   */
  getRefreshToken(): string | null {
    if (cachedRefreshToken) return cachedRefreshToken;
    cachedRefreshToken = this.secureRetrieve(REFRESH_TOKEN_KEY);
    return cachedRefreshToken;
  },

  /**
   * Clear all stored tokens.
   */
  clearTokens(): void {
    this.secureRemove(ACCESS_TOKEN_KEY);
    this.secureRemove(REFRESH_TOKEN_KEY);
    cachedAccessToken = null;
    cachedRefreshToken = null;
    deleteFromDisk();
    logger.info('Tokens cleared');
  },

  /**
   * Check if user is authenticated (has valid access token).
   */
  isAuthenticated(): boolean {
    const token = this.getAccessToken();
    if (!token) return false;
    // Consider authenticated if we have a non-expired access token
    // or if we have a refresh token (can refresh)
    if (!isTokenExpired(token)) return true;
    // Check if we can refresh
    return this.getRefreshToken() !== null;
  },

  /**
   * Get the current authenticated user from the access token.
   */
  getCurrentUser(): AuthUser | null {
    const token = this.getAccessToken();
    if (!token) return null;
    return extractUserFromToken(token);
  },

  /**
   * Get the current auth state.
   */
  getAuthState(): AuthState {
    return {
      isAuthenticated: this.isAuthenticated(),
      user: this.getCurrentUser(),
    };
  },

  /**
   * Check if the access token needs to be refreshed.
   */
  needsTokenRefresh(): boolean {
    const token = this.getAccessToken();
    if (!token) return false;
    return tokenNeedsRefresh(token);
  },

  /**
   * Get a valid access token, refreshing if necessary.
   * Returns null if not authenticated or refresh fails.
   */
  async getValidAccessToken(): Promise<string | null> {
    let token = this.getAccessToken();

    // No token at all
    if (!token) return null;

    // Token is valid and not near expiry
    if (!tokenNeedsRefresh(token)) {
      return token;
    }

    // Try to refresh
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      this.clearTokens();
      return null;
    }

    try {
      const newToken = await this.refreshAccessToken(refreshToken);
      return newToken;
    } catch (error) {
      logger.error('Token refresh failed:', error);
      this.clearTokens();
      return null;
    }
  },

  // ============================================================================
  // API Methods
  // ============================================================================

  /**
   * Sign in with email and password.
   * Returns needsVerification: true if the user needs to verify their email first.
   */
  async signIn(request: SignInRequest): Promise<SignInResponse> {
    const apiUrl = EnvService.get('API_URL');

    let response: Response;
    try {
      response = await fetch(`${apiUrl}/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
    } catch {
      throw new Error('Unable to connect to server. Please check your internet connection.');
    }

    // Handle 403 - user needs verification
    if (response.status === 403) {
      const data = await response.json().catch(() => ({}));
      if (data.needsVerification && data.userId) {
        return {
          needsVerification: true,
          userId: data.userId,
        };
      }
      throw new Error(data.error || data.message || 'Sign in failed');
    }

    if (!response.ok) {
      const errorData: ApiError = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || 'Sign in failed');
    }

    const data: AuthResponse = await response.json();
    this.storeTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    return data;
  },

  /**
   * Sign up with username, email, and password.
   */
  async signUp(request: SignUpRequest): Promise<SignUpResponse> {
    const apiUrl = EnvService.get('API_URL');

    let response: Response;
    try {
      response = await fetch(`${apiUrl}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
    } catch {
      throw new Error('Unable to connect to server. Please check your internet connection.');
    }

    if (!response.ok) {
      const errorData: ApiError = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || 'Sign up failed');
    }

    return await response.json();
  },

  /**
   * Verify email with code.
   */
  async verify(request: VerifyRequest): Promise<AuthResponse> {
    const apiUrl = EnvService.get('API_URL');

    let response: Response;
    try {
      response = await fetch(`${apiUrl}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
    } catch {
      throw new Error('Unable to connect to server. Please check your internet connection.');
    }

    if (!response.ok) {
      const errorData: ApiError = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || 'Verification failed');
    }

    const data: AuthResponse = await response.json();
    this.storeTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    return data;
  },

  /**
   * Resend verification code.
   */
  async resendCode(userId: string): Promise<void> {
    const apiUrl = EnvService.get('API_URL');

    let response: Response;
    try {
      response = await fetch(`${apiUrl}/auth/resend-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
    } catch {
      throw new Error('Unable to connect to server. Please check your internet connection.');
    }

    if (!response.ok) {
      const errorData: ApiError = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || 'Failed to resend code');
    }
  },

  /**
   * Refresh the access token using the refresh token.
   */
  async refreshAccessToken(refreshToken: string): Promise<string> {
    const apiUrl = EnvService.get('API_URL');

    let response: Response;
    try {
      response = await fetch(`${apiUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      throw new Error('Unable to connect to server. Please check your internet connection.');
    }

    if (!response.ok) {
      const errorData: ApiError = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || 'Token refresh failed');
    }

    const data: RefreshResponse = await response.json();

    // Update stored access token (persisted to disk)
    this.secureStore(ACCESS_TOKEN_KEY, data.accessToken);
    cachedAccessToken = data.accessToken;

    return data.accessToken;
  },

  /**
   * Sign out - clear tokens.
   */
  signOut(): void {
    this.clearTokens();
    logger.info('User signed out');
  },

  /**
   * Request password reset.
   */
  async forgotPassword(email: string): Promise<ForgotPasswordResponse> {
    const apiUrl = EnvService.get('API_URL');

    let response: Response;
    try {
      response = await fetch(`${apiUrl}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch {
      throw new Error('Unable to connect to server. Please check your internet connection.');
    }

    if (!response.ok) {
      const errorData: ApiError = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || 'Password reset request failed');
    }

    return await response.json();
  },

  /**
   * Reset password with verification code.
   */
  async resetPassword(userId: string, code: string, newPassword: string): Promise<void> {
    const apiUrl = EnvService.get('API_URL');

    let response: Response;
    try {
      response = await fetch(`${apiUrl}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, code, newPassword }),
      });
    } catch {
      throw new Error('Unable to connect to server. Please check your internet connection.');
    }

    if (!response.ok) {
      const errorData: ApiError = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || 'Password reset failed');
    }
  },

  /**
   * Resend password reset code.
   */
  async resendResetCode(userId: string): Promise<void> {
    const apiUrl = EnvService.get('API_URL');

    let response: Response;
    try {
      response = await fetch(`${apiUrl}/auth/resend-reset-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
    } catch {
      throw new Error('Unable to connect to server. Please check your internet connection.');
    }

    if (!response.ok) {
      const errorData: ApiError = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || 'Failed to resend code');
    }
  },
};
