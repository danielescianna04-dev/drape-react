#ifndef UTILS_H
#define UTILS_H

/* ANSI color codes */
#define COLOR_RESET   "\033[0m"
#define COLOR_RED     "\033[1;31m"
#define COLOR_GREEN   "\033[1;32m"
#define COLOR_YELLOW  "\033[1;33m"
#define COLOR_BLUE    "\033[1;34m"
#define COLOR_MAGENTA "\033[1;35m"
#define COLOR_CYAN    "\033[1;36m"
#define COLOR_WHITE   "\033[1;37m"
#define COLOR_DIM     "\033[2m"
#define COLOR_BOLD    "\033[1m"

#define BG_BLUE       "\033[44m"
#define BG_GREEN      "\033[42m"
#define BG_RED        "\033[41m"

/* Maximum limits */
#define MAX_EXPR_LEN 256
#define HISTORY_SIZE 50

/**
 * Print a colored string to stdout.
 */
void print_colored(const char *color, const char *text);

/**
 * Print a horizontal divider line.
 */
void print_divider(void);

/**
 * Print a boxed banner with a title.
 */
void print_banner(const char *title, const char *subtitle);

/**
 * Clear the terminal screen.
 */
void clear_screen(void);

/**
 * Print text centered in a given width.
 */
void print_centered(const char *text, int width);

/**
 * Pause and wait for the user to press Enter.
 */
void pause_prompt(void);

#endif /* UTILS_H */
