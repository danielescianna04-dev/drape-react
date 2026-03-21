#!/usr/bin/env node

/**
 * Quiz Master CLI — An interactive quiz game with colored terminal output.
 */

import { QuizGame } from "./src/app.js";

const game = new QuizGame();
game.run().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
