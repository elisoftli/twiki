import type { Page } from '@playwright/test';

export class LibraryPage {
  constructor(private page: Page) {}

  // Locators
  get heading() {
    return this.page.getByRole('heading', { name: /your games/i });
  }

  get headerSubtitle() {
    return this.page.locator('.text-muted-foreground').first();
  }

  get searchInput() {
    return this.page.getByPlaceholder(/search/i);
  }

  get clearSearchButton() {
    return this.page.locator('button').filter({ has: this.page.locator('svg.lucide-x') });
  }

  get reloadButton() {
    return this.page.getByRole('button', { name: /reload/i });
  }

  get gameCountBadge() {
    return this.page.locator('.min-w-26');
  }

  get gameCards() {
    return this.page.locator('[data-testid="game-card"]');
  }

  get loadingState() {
    return this.page.getByText(/loading your library/i);
  }

  get loadingSkeleton() {
    return this.page.locator('.animate-shimmer, .animate-pulse').first();
  }

  get emptyState() {
    return this.page.getByText(/no games found/i);
  }

  get errorState() {
    return this.page.getByText(/library error/i);
  }

  // Actions
  async searchForGame(query: string) {
    await this.searchInput.fill(query);
  }

  async clearSearch() {
    await this.searchInput.clear();
  }

  async clearSearchWithButton() {
    await this.clearSearchButton.click();
  }

  async clickGame(gameName: string) {
    await this.page.getByText(gameName).click();
  }

  async clickFirstGame() {
    await this.gameCards.first().click();
  }

  async reload() {
    await this.reloadButton.click();
  }

  // Getters
  async getGameCount() {
    const count = await this.gameCards.count();
    return count;
  }

  async getGameNames() {
    const cards = await this.gameCards.all();
    const names: string[] = [];
    for (const card of cards) {
      const name = await card.locator('p').textContent();
      if (name) names.push(name);
    }
    return names;
  }

  async getBadgeText() {
    return this.gameCountBadge.textContent();
  }

  // Wait helpers
  async waitForLoad() {
    // Wait for loading to disappear or games/empty state to appear
    await this.page
      .waitForFunction(
        () => {
          const loading = document.body.textContent?.toLowerCase().includes('loading');
          return !loading;
        },
        { timeout: 10000 }
      )
      .catch(() => {
        // Timeout is fine - app may have loaded already
      });
  }

  async waitForGames() {
    await this.gameCards.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
      // No games may exist
    });
  }
}
