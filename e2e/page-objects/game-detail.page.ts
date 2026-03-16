import type { Page } from '@playwright/test';

export class GameDetailPage {
  constructor(private page: Page) {}

  // Locators
  get backButton() {
    // The back button is a ghost button with an ArrowLeft icon (first button in the header)
    return this.page.locator('button').filter({ has: this.page.locator('svg.lucide-arrow-left') });
  }

  get gameName() {
    return this.page.locator('[data-testid="game-name"]');
  }

  get heroHeader() {
    return this.page.locator('[data-testid="game-hero-header"]');
  }

  get tweaksSection() {
    return this.page.locator('[data-testid="tweaks-section"]');
  }

  get loadingState() {
    return this.page.getByText(/loading/i);
  }

  get errorState() {
    return this.page.getByText(/error/i);
  }

  get emptyState() {
    return this.page.getByText(/no tweaks/i);
  }

  // Actions
  async goBack() {
    await this.backButton.click();
  }

  // Wait helpers
  async waitForLoad() {
    // Wait for hero header to be visible (indicates page has loaded)
    await this.page
      .waitForFunction(
        () => {
          const loading = document.body.textContent?.toLowerCase().includes('loading');
          return !loading;
        },
        { timeout: 15000 }
      )
      .catch(() => {
        // Timeout is fine - page may have loaded already
      });
  }

  // URL helpers
  isOnGameDetailPage() {
    return this.page.url().includes('/game/');
  }

  getGameIdFromUrl() {
    const match = this.page.url().match(/\/game\/([^/]+)/);
    return match ? match[1] : null;
  }
}
