import type { Game } from '../../../../main/interfaces/game-library.interface';

function createLastVisitedGameStore() {
  let game = $state<Game | null>(null);

  return {
    get game() {
      return game;
    },
    setGame(newGame: Game | null) {
      game = newGame;
    },
    clear() {
      game = null;
    },
  };
}

export const lastVisitedGameStore = createLastVisitedGameStore();
