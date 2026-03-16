import { test, expect } from '../fixtures/electron.fixture';
import { LibraryPage } from '../page-objects/library.page';
import { GameDetailPage } from '../page-objects/game-detail.page';

test.describe('Game Library', () => {
  test.describe('UI States', () => {
    test('should display header with correct title', async ({ window }) => {
      const libraryPage = new LibraryPage(window);
      await libraryPage.waitForLoad();

      await expect(libraryPage.heading).toBeVisible();
      await expect(libraryPage.heading).toHaveText('Your Games');
    });

    test('should show header subtitle based on state', async ({ window }) => {
      const libraryPage = new LibraryPage(window);
      await libraryPage.waitForLoad();

      const subtitle = libraryPage.headerSubtitle;
      const subtitleText = await subtitle.textContent();

      // Subtitle should be one of: "Loading...", "Browse and tweak...", or "No games detected"
      const validSubtitles = [
        'loading your library',
        'browse and tweak your installed games',
        'no games detected',
      ];

      const isValidSubtitle = validSubtitles.some((valid) =>
        subtitleText?.toLowerCase().includes(valid.toLowerCase())
      );
      expect(isValidSubtitle).toBe(true);
    });

    test('should display game count badge when games exist', async ({ window }) => {
      const libraryPage = new LibraryPage(window);
      await libraryPage.waitForLoad();
      await libraryPage.waitForGames();

      const gameCount = await libraryPage.getGameCount();

      if (gameCount > 0) {
        const badgeText = await libraryPage.getBadgeText();
        expect(badgeText).toBeTruthy();

        // Badge should show "X games" or "X game" format
        const expectedPattern = gameCount === 1 ? /1 game/ : new RegExp(`${gameCount} games`);
        expect(badgeText).toMatch(expectedPattern);
      }
    });

    test('should show empty state when no games exist', async ({ window }) => {
      const libraryPage = new LibraryPage(window);
      await libraryPage.waitForLoad();

      const gameCount = await libraryPage.getGameCount();

      if (gameCount === 0) {
        await expect(libraryPage.emptyState).toBeVisible();
      } else {
        // If games exist, empty state should not be visible
        await expect(libraryPage.emptyState).not.toBeVisible();
      }
    });

    test('should show content area with body content', async ({ window }) => {
      const libraryPage = new LibraryPage(window);
      await libraryPage.waitForLoad();

      // Wait for content to stabilize
      await window.waitForTimeout(500);

      // Check that the app has rendered something
      const body = window.locator('body');
      const html = await body.innerHTML();
      expect(html.length).toBeGreaterThan(100);
    });
  });

  test.describe('User Interactions', () => {
    test('should have a search input when games exist', async ({ window }) => {
      const libraryPage = new LibraryPage(window);
      await libraryPage.waitForLoad();
      await libraryPage.waitForGames();

      const gameCount = await libraryPage.getGameCount();

      if (gameCount > 0) {
        await expect(libraryPage.searchInput).toBeVisible();
      }
    });

    test('should allow typing in search input', async ({ window }) => {
      const libraryPage = new LibraryPage(window);
      await libraryPage.waitForLoad();
      await libraryPage.waitForGames();

      const isSearchVisible = await libraryPage.searchInput.isVisible().catch(() => false);

      if (isSearchVisible) {
        await libraryPage.searchForGame('test query');
        const value = await libraryPage.searchInput.inputValue();
        expect(value).toBe('test query');
      }
    });

    test('should filter games when searching', async ({ window }) => {
      const libraryPage = new LibraryPage(window);
      await libraryPage.waitForLoad();
      await libraryPage.waitForGames();

      const initialCount = await libraryPage.getGameCount();
      const isSearchVisible = await libraryPage.searchInput.isVisible().catch(() => false);

      if (isSearchVisible && initialCount > 0) {
        // Get the first game name to search for
        const gameNames = await libraryPage.getGameNames();
        if (gameNames.length > 0) {
          const searchTerm = gameNames[0].substring(0, 3); // First 3 chars
          await libraryPage.searchForGame(searchTerm);

          // Wait for filter to apply
          await window.waitForTimeout(200);

          const filteredCount = await libraryPage.getGameCount();
          // Filtered count should be <= initial count
          expect(filteredCount).toBeLessThanOrEqual(initialCount);
        }
      }
    });

    test('should show search count ratio when filtering', async ({ window }) => {
      const libraryPage = new LibraryPage(window);
      await libraryPage.waitForLoad();
      await libraryPage.waitForGames();

      const initialCount = await libraryPage.getGameCount();
      const isSearchVisible = await libraryPage.searchInput.isVisible().catch(() => false);

      if (isSearchVisible && initialCount > 1) {
        // Search for something that likely won't match all games
        await libraryPage.searchForGame('xyz');

        // Wait for filter to apply
        await window.waitForTimeout(200);

        const badgeText = await libraryPage.getBadgeText();
        // When searching, badge should show "X / Y" format
        expect(badgeText).toMatch(/\d+\s*\/\s*\d+/);
      }
    });

    test('should clear search with X button', async ({ window }) => {
      const libraryPage = new LibraryPage(window);
      await libraryPage.waitForLoad();
      await libraryPage.waitForGames();

      const isSearchVisible = await libraryPage.searchInput.isVisible().catch(() => false);

      if (isSearchVisible) {
        // Type something first
        await libraryPage.searchForGame('test');
        await window.waitForTimeout(100);

        // Clear button should appear
        const clearButton = libraryPage.clearSearchButton;
        const isClearVisible = await clearButton.isVisible().catch(() => false);

        if (isClearVisible) {
          await libraryPage.clearSearchWithButton();
          await window.waitForTimeout(100);

          const value = await libraryPage.searchInput.inputValue();
          expect(value).toBe('');
        }
      }
    });

    test('should clear search on Escape key', async ({ window }) => {
      const libraryPage = new LibraryPage(window);
      await libraryPage.waitForLoad();
      await libraryPage.waitForGames();

      const isSearchVisible = await libraryPage.searchInput.isVisible().catch(() => false);

      if (isSearchVisible) {
        // Type something first
        await libraryPage.searchForGame('test');
        await window.waitForTimeout(100);

        // Press Escape
        await libraryPage.searchInput.press('Escape');
        await window.waitForTimeout(100);

        const value = await libraryPage.searchInput.inputValue();
        expect(value).toBe('');
      }
    });

    test('should have reload button visible after loading', async ({ window }) => {
      const libraryPage = new LibraryPage(window);
      await libraryPage.waitForLoad();

      await expect(libraryPage.reloadButton).toBeVisible();
    });

    test('should reload library when clicking reload button', async ({ window }) => {
      const libraryPage = new LibraryPage(window);
      await libraryPage.waitForLoad();

      // Click reload
      await libraryPage.reload();

      // Wait a moment for reload to trigger
      await window.waitForTimeout(500);

      // After reload completes, page should stabilize
      await libraryPage.waitForLoad();

      // Verify page is still functional
      await expect(libraryPage.heading).toBeVisible();
    });
  });

  test.describe('Game Grid Behavior', () => {
    test('should display game cards in grid when games exist', async ({ window }) => {
      const libraryPage = new LibraryPage(window);
      await libraryPage.waitForLoad();
      await libraryPage.waitForGames();

      const gameCount = await libraryPage.getGameCount();

      if (gameCount > 0) {
        // Verify at least one game card is visible
        await expect(libraryPage.gameCards.first()).toBeVisible();
      }
    });

    test('should show game names on cards', async ({ window }) => {
      const libraryPage = new LibraryPage(window);
      await libraryPage.waitForLoad();
      await libraryPage.waitForGames();

      const gameCount = await libraryPage.getGameCount();

      if (gameCount > 0) {
        const gameNames = await libraryPage.getGameNames();
        expect(gameNames.length).toBeGreaterThan(0);

        // Each game should have a non-empty name
        for (const name of gameNames) {
          expect(name.trim().length).toBeGreaterThan(0);
        }
      }
    });

    test('should navigate to game detail page on card click', async ({ window }) => {
      const libraryPage = new LibraryPage(window);
      await libraryPage.waitForLoad();
      await libraryPage.waitForGames();

      const gameCount = await libraryPage.getGameCount();

      if (gameCount > 0) {
        // Click the first game
        await libraryPage.clickFirstGame();

        // Wait for navigation
        await window.waitForTimeout(500);

        // Verify we navigated to game detail page
        const currentUrl = window.url();
        expect(currentUrl).toContain('/game/');
      }
    });

    test('should be able to navigate back from game detail page', async ({ window }) => {
      const libraryPage = new LibraryPage(window);
      await libraryPage.waitForLoad();
      await libraryPage.waitForGames();

      const gameCount = await libraryPage.getGameCount();

      if (gameCount > 0) {
        // Navigate to game detail page
        await libraryPage.clickFirstGame();
        await window.waitForTimeout(500);

        const gameDetailPage = new GameDetailPage(window);

        // Verify we're on game detail page
        expect(gameDetailPage.isOnGameDetailPage()).toBe(true);

        // Click back button
        await gameDetailPage.goBack();
        await window.waitForTimeout(500);

        // Verify we're back on library page
        await expect(libraryPage.heading).toBeVisible();
      }
    });

    test('should preserve game id in URL on navigation', async ({ window }) => {
      const libraryPage = new LibraryPage(window);
      await libraryPage.waitForLoad();
      await libraryPage.waitForGames();

      const gameCount = await libraryPage.getGameCount();

      if (gameCount > 0) {
        // Navigate to game detail page
        await libraryPage.clickFirstGame();
        await window.waitForTimeout(500);

        const gameDetailPage = new GameDetailPage(window);

        // Verify game ID is in URL
        const gameId = gameDetailPage.getGameIdFromUrl();
        expect(gameId).toBeTruthy();
        expect(gameId?.length).toBeGreaterThan(0);
      }
    });

    test('should make game cards keyboard accessible', async ({ window }) => {
      const libraryPage = new LibraryPage(window);
      await libraryPage.waitForLoad();
      await libraryPage.waitForGames();

      const gameCount = await libraryPage.getGameCount();

      if (gameCount > 0) {
        const firstCard = libraryPage.gameCards.first();

        // Check that game card has role="button"
        const role = await firstCard.getAttribute('role');
        expect(role).toBe('button');

        // Check that game card has tabindex
        const tabindex = await firstCard.getAttribute('tabindex');
        expect(tabindex).toBe('0');
      }
    });
  });
});
