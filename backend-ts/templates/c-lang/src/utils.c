#include <stdio.h>
#include <string.h>
#include "utils.h"

void print_colored(const char *color, const char *text) {
    printf("%s%s%s", color, text, COLOR_RESET);
}

void print_divider(void) {
    printf("  ");
    print_colored(COLOR_DIM, "────────────────────────────────────────");
    printf("\n");
}

void print_banner(const char *title, const char *subtitle) {
    int title_len = (int)strlen(title);
    int box_width = title_len + 8;
    if (box_width < 40) box_width = 40;

    printf("\n");

    /* Top border */
    printf("  %s╔", COLOR_CYAN);
    for (int i = 0; i < box_width; i++) printf("═");
    printf("╗%s\n", COLOR_RESET);

    /* Title line */
    int padding = (box_width - title_len) / 2;
    printf("  %s║", COLOR_CYAN);
    for (int i = 0; i < padding; i++) printf(" ");
    printf("%s%s%s%s", COLOR_RESET, COLOR_YELLOW, title, COLOR_CYAN);
    for (int i = 0; i < box_width - padding - title_len; i++) printf(" ");
    printf("║%s\n", COLOR_RESET);

    /* Subtitle line */
    if (subtitle && strlen(subtitle) > 0) {
        int sub_len = (int)strlen(subtitle);
        int sub_pad = (box_width - sub_len) / 2;
        printf("  %s║", COLOR_CYAN);
        for (int i = 0; i < sub_pad; i++) printf(" ");
        printf("%s%s%s%s", COLOR_RESET, COLOR_DIM, subtitle, COLOR_CYAN);
        for (int i = 0; i < box_width - sub_pad - sub_len; i++) printf(" ");
        printf("║%s\n", COLOR_RESET);
    }

    /* Bottom border */
    printf("  %s╚", COLOR_CYAN);
    for (int i = 0; i < box_width; i++) printf("═");
    printf("╝%s\n\n", COLOR_RESET);
}

void clear_screen(void) {
    printf("\033[2J\033[H");
}

void print_centered(const char *text, int width) {
    int len = (int)strlen(text);
    int pad = (width - len) / 2;
    if (pad < 0) pad = 0;
    for (int i = 0; i < pad; i++) printf(" ");
    printf("%s", text);
}

void pause_prompt(void) {
    printf("\n  %sPress Enter to continue...%s", COLOR_DIM, COLOR_RESET);
    int c;
    while ((c = getchar()) != '\n' && c != EOF);
}
