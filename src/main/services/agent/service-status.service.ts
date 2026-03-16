/**
 * Service Status Service
 *
 * Polls the server status endpoint to collect service status entries.
 * Pushes status updates to the renderer process.
 * Injects a synthetic 'server-connectivity' entry when the server is unreachable.
 */

import type { StatusEntry } from '@twiki/shared';
import type { ServiceStatusState } from '../../../shared/types/agent.types';
import { EnvService } from '../core/env.service';
import { MainWindow } from '../../windows';
import { createLogger } from '../../utils/logger.utils';

const logger = createLogger('ServiceStatusService');

const POLL_INTERVAL_MS = 30000; // 30 seconds
const REQUEST_TIMEOUT_MS = 10000; // 10 seconds

export class ServiceStatusService {
  private static _instance: ServiceStatusService | null = null;
  private pollTimer: NodeJS.Timeout | null = null;

  private _entries: StatusEntry[] = [];
  private _isServerReachable: boolean = true; // Optimistic default
  private _lastChecked: number | null = null;

  public get state(): ServiceStatusState {
    return {
      entries: [...this._entries],
      isServerReachable: this._isServerReachable,
      lastChecked: this._lastChecked,
    };
  }

  private constructor() {}

  /**
   * Initialize the ServiceStatusService singleton.
   * Should only be called once during app startup.
   */
  public static initialize(): ServiceStatusService {
    if (ServiceStatusService._instance) {
      throw new Error('ServiceStatusService has already been initialized');
    }
    ServiceStatusService._instance = new ServiceStatusService();
    ServiceStatusService._instance.startPolling();
    return ServiceStatusService._instance;
  }

  /**
   * Get the ServiceStatusService singleton instance.
   * @throws Error if ServiceStatusService has not been initialized
   */
  public static getInstance(): ServiceStatusService {
    if (!ServiceStatusService._instance) {
      throw new Error(
        'ServiceStatusService has not been initialized. Call ServiceStatusService.initialize() first.'
      );
    }
    return ServiceStatusService._instance;
  }

  /**
   * Start the polling interval.
   */
  private startPolling(): void {
    // Initial check
    this.checkStatus();

    // Start interval
    this.pollTimer = setInterval(() => {
      this.checkStatus();
    }, POLL_INTERVAL_MS);
  }

  /**
   * Stop the polling interval.
   */
  public stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Check the server status endpoint.
   */
  private async checkStatus(): Promise<void> {
    const apiUrl = EnvService.get('API_URL');
    const statusUrl = `${apiUrl}/status`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(statusUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        this.updateState([], false);
        return;
      }

      const data = await response.json();
      const entries: StatusEntry[] = Array.isArray(data.entries) ? data.entries : [];
      this.updateState(entries, true);
    } catch (error) {
      logger.warn('Status check failed:', error);
      this.updateState([], false);
    }
  }

  /**
   * Update the internal state and notify renderer if changed.
   */
  private updateState(entries: StatusEntry[], isServerReachable: boolean): void {
    const prevEntriesJson = JSON.stringify(this._entries);
    const prevReachable = this._isServerReachable;

    this._entries = entries;
    this._isServerReachable = isServerReachable;
    this._lastChecked = Date.now();

    const changed =
      prevReachable !== isServerReachable ||
      prevEntriesJson !== JSON.stringify(entries);

    if (changed) {
      this.sendStateToMainWindow();
    }
  }

  /**
   * Send current state to the renderer process.
   */
  private sendStateToMainWindow(): void {
    try {
      MainWindow.getInstance().sendEvent('service-status:updated', this.state);
    } catch {
      // Window may not be ready yet
    }
  }

  /**
   * Check if a status entry with the given ID has 'error' severity.
   * Reads internal state directly without copying (avoids allocation from .state getter).
   */
  public hasStatusError(id: string): boolean {
    return this._entries.some((e) => e.id === id && e.severity === 'error');
  }

  /**
   * Force an immediate status check.
   * @returns The updated state after the check
   */
  public async forceCheck(): Promise<ServiceStatusState> {
    await this.checkStatus();
    return this.state;
  }
}
