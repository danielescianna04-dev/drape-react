import chalk from "chalk";
import readline from "node:readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

const CATEGORIES = {
  Science: [
    {
      question: "What planet is known as the Red Planet?",
      options: ["Venus", "Mars", "Jupiter", "Saturn"],
      answer: 1,
    },
    {
      question: "What is the chemical symbol for gold?",
      options: ["Go", "Gd", "Au", "Ag"],
      answer: 2,
    },
    {
      question: "How many bones are in the adult human body?",
      options: ["186", "206", "226", "256"],
      answer: 1,
    },
    {
      question: "What is the speed of light in km/s (approximately)?",
      options: ["150,000", "200,000", "300,000", "400,000"],
      answer: 2,
    },
  ],
  History: [
    {
      question: "In what year did World War II end?",
      options: ["1943", "1944", "1945", "1946"],
      answer: 2,
    },
    {
      question: "Who was the first person to walk on the Moon?",
      options: ["Buzz Aldrin", "Neil Armstrong", "John Glenn", "Yuri Gagarin"],
      answer: 1,
    },
    {
      question: "The Great Wall of China was primarily built to protect against whom?",
      options: ["Japanese", "Mongols", "Koreans", "Russians"],
      answer: 1,
    },
    {
      question: "Which ancient civilization built Machu Picchu?",
      options: ["Aztec", "Maya", "Inca", "Olmec"],
      answer: 2,
    },
  ],
  Technology: [
    {
      question: "Who created the Linux kernel?",
      options: ["Dennis Ritchie", "Linus Torvalds", "Ken Thompson", "Richard Stallman"],
      answer: 1,
    },
    {
      question: "What does CPU stand for?",
      options: [
        "Central Process Unit",
        "Central Processing Unit",
        "Computer Personal Unit",
        "Central Program Utility",
      ],
      answer: 1,
    },
    {
      question: "In what year was the first iPhone released?",
      options: ["2005", "2006", "2007", "2008"],
      answer: 2,
    },
    {
      question: "What programming language was created by Brendan Eich in 10 days?",
      options: ["Java", "Python", "JavaScript", "Ruby"],
      answer: 2,
    },
  ],
};

function printBanner() {
  console.log();
  console.log(chalk.cyan.bold("  ╔══════════════════════════════════════╗"));
  console.log(chalk.cyan.bold("  ║") + chalk.yellow.bold("         QUIZ MASTER v1.0              ") + chalk.cyan.bold("║"));
  console.log(chalk.cyan.bold("  ║") + chalk.dim("    Test your knowledge across        ") + chalk.cyan.bold("║"));
  console.log(chalk.cyan.bold("  ║") + chalk.dim("    Science, History & Technology      ") + chalk.cyan.bold("║"));
  console.log(chalk.cyan.bold("  ╚══════════════════════════════════════╝"));
  console.log();
}

function printDivider() {
  console.log(chalk.dim("  ─".repeat(20)));
}

function printScoreBar(score, total) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const filled = Math.round(pct / 5);
  const empty = 20 - filled;
  const color = pct >= 75 ? chalk.green : pct >= 50 ? chalk.yellow : chalk.red;
  const bar = color("█".repeat(filled)) + chalk.dim("░".repeat(empty));
  console.log(`  ${bar} ${color.bold(`${pct}%`)} (${score}/${total})`);
}

export class QuizGame {
  constructor() {
    this.score = 0;
    this.totalAnswered = 0;
    this.streakCurrent = 0;
    this.streakBest = 0;
  }

  async selectCategory() {
    const categories = Object.keys(CATEGORIES);
    console.log(chalk.bold("\n  Choose a category:\n"));
    categories.forEach((cat, i) => {
      const count = CATEGORIES[cat].length;
      console.log(`    ${chalk.cyan.bold(i + 1)}. ${cat} ${chalk.dim(`(${count} questions)`)}`);
    });
    console.log(`    ${chalk.cyan.bold(categories.length + 1)}. ${chalk.magenta("All categories")}`);
    console.log(`    ${chalk.cyan.bold("0")}. ${chalk.dim("Quit")}`);
    console.log();

    const choice = await ask(chalk.bold("  Your choice: "));
    const idx = parseInt(choice, 10);

    if (idx === 0 || choice.toLowerCase() === "q") return null;
    if (idx === categories.length + 1) return "all";
    if (idx >= 1 && idx <= categories.length) return categories[idx - 1];

    console.log(chalk.red("  Invalid choice. Try again."));
    return this.selectCategory();
  }

  async askQuestion(q, questionNum, totalQuestions) {
    console.log();
    console.log(
      chalk.bgBlue.white.bold(` Question ${questionNum}/${totalQuestions} `) +
        (this.streakCurrent > 0 ? chalk.yellow(` 🔥 Streak: ${this.streakCurrent}`) : "")
    );
    console.log(chalk.white.bold(`\n  ${q.question}\n`));

    q.options.forEach((opt, i) => {
      console.log(`    ${chalk.cyan.bold(`${i + 1}.`)} ${opt}`);
    });
    console.log();

    const input = await ask(chalk.bold("  Your answer (1-4): "));
    const chosen = parseInt(input, 10) - 1;

    if (chosen < 0 || chosen > 3 || isNaN(chosen)) {
      console.log(chalk.yellow("  Skipped!"));
      this.streakCurrent = 0;
      return;
    }

    this.totalAnswered++;

    if (chosen === q.answer) {
      this.score++;
      this.streakCurrent++;
      if (this.streakCurrent > this.streakBest) this.streakBest = this.streakCurrent;
      const bonus = this.streakCurrent >= 3 ? chalk.yellow(" STREAK BONUS!") : "";
      console.log(chalk.green.bold("  ✓ Correct!") + bonus);
    } else {
      this.streakCurrent = 0;
      console.log(
        chalk.red.bold("  ✗ Wrong!") +
          chalk.dim(` The answer was: ${q.options[q.answer]}`)
      );
    }
  }

  showResults() {
    console.log();
    printDivider();
    console.log(chalk.bold("\n  ═══ FINAL RESULTS ═══\n"));

    printScoreBar(this.score, this.totalAnswered);
    console.log();

    if (this.streakBest > 0) {
      console.log(chalk.dim(`  Best streak: ${chalk.yellow.bold(this.streakBest)} in a row`));
    }

    const pct = this.totalAnswered > 0 ? (this.score / this.totalAnswered) * 100 : 0;
    let remark;
    if (pct === 100) remark = chalk.green.bold("  PERFECT SCORE! You're a genius!");
    else if (pct >= 75) remark = chalk.green("  Great job! Very impressive.");
    else if (pct >= 50) remark = chalk.yellow("  Not bad! Keep studying.");
    else remark = chalk.red("  Better luck next time!");

    console.log(remark);
    console.log();
  }

  async run() {
    printBanner();

    let playing = true;
    while (playing) {
      const category = await this.selectCategory();
      if (category === null) break;

      let questions;
      if (category === "all") {
        questions = Object.values(CATEGORIES).flat();
      } else {
        questions = [...CATEGORIES[category]];
      }

      // Shuffle
      for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questions[i], questions[j]] = [questions[j], questions[i]];
      }

      this.score = 0;
      this.totalAnswered = 0;
      this.streakCurrent = 0;
      this.streakBest = 0;

      printDivider();
      console.log(
        chalk.bold(`\n  Starting ${category === "all" ? "ALL CATEGORIES" : category} — ${questions.length} questions\n`)
      );

      for (let i = 0; i < questions.length; i++) {
        await this.askQuestion(questions[i], i + 1, questions.length);
      }

      this.showResults();

      const again = await ask(chalk.bold("  Play again? (y/n): "));
      playing = again.toLowerCase() === "y" || again.toLowerCase() === "yes";
    }

    console.log(chalk.magenta.bold("\n  Thanks for playing! Goodbye.\n"));
    rl.close();
  }
}
