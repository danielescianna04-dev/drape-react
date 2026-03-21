/**
 * Scientific Calculator CLI
 *
 * A full-featured terminal calculator with colored output,
 * expression history, and memory functions.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "src/utils.h"

/* Calculation history */
typedef struct {
    char expression[MAX_EXPR_LEN];
    double result;
} HistoryEntry;

static HistoryEntry history[HISTORY_SIZE];
static int history_count = 0;
static double memory = 0.0;

static void add_to_history(const char *expr, double result) {
    if (history_count < HISTORY_SIZE) {
        strncpy(history[history_count].expression, expr, MAX_EXPR_LEN - 1);
        history[history_count].expression[MAX_EXPR_LEN - 1] = '\0';
        history[history_count].result = result;
        history_count++;
    } else {
        /* Shift everything down */
        for (int i = 0; i < HISTORY_SIZE - 1; i++) {
            history[i] = history[i + 1];
        }
        strncpy(history[HISTORY_SIZE - 1].expression, expr, MAX_EXPR_LEN - 1);
        history[HISTORY_SIZE - 1].expression[MAX_EXPR_LEN - 1] = '\0';
        history[HISTORY_SIZE - 1].result = result;
    }
}

static void show_history(void) {
    if (history_count == 0) {
        printf("\n  %sNo calculations yet.%s\n", COLOR_DIM, COLOR_RESET);
        return;
    }

    printf("\n");
    print_colored(COLOR_BOLD, "  ═══ Calculation History ═══\n\n");

    for (int i = 0; i < history_count; i++) {
        printf("  %s%2d.%s %s%-30s%s = %s%.6g%s\n",
            COLOR_CYAN, i + 1, COLOR_RESET,
            COLOR_WHITE, history[i].expression, COLOR_RESET,
            COLOR_GREEN, history[i].result, COLOR_RESET);
    }
    printf("\n");
}

static void basic_calculator(void) {
    double a, b;
    char op;

    printf("\n  %sEnter expression (e.g. 42 + 8):%s ", COLOR_BOLD, COLOR_RESET);

    if (scanf("%lf %c %lf", &a, &op, &b) != 3) {
        printf("  %sInvalid input. Use format: number operator number%s\n", COLOR_RED, COLOR_RESET);
        while (getchar() != '\n');
        return;
    }
    while (getchar() != '\n');

    double result;
    char expr[MAX_EXPR_LEN];
    snprintf(expr, sizeof(expr), "%.6g %c %.6g", a, op, b);

    switch (op) {
        case '+': result = a + b; break;
        case '-': result = a - b; break;
        case '*': result = a * b; break;
        case '/':
            if (b == 0.0) {
                printf("  %sError: Division by zero!%s\n", COLOR_RED, COLOR_RESET);
                return;
            }
            result = a / b;
            break;
        case '%':
            if (b == 0.0) {
                printf("  %sError: Modulo by zero!%s\n", COLOR_RED, COLOR_RESET);
                return;
            }
            result = fmod(a, b);
            break;
        case '^': result = pow(a, b); break;
        default:
            printf("  %sUnknown operator '%c'. Use +, -, *, /, %%, ^%s\n",
                COLOR_RED, op, COLOR_RESET);
            return;
    }

    printf("\n  %s  %s = %s%.6g%s\n", COLOR_DIM, expr, COLOR_GREEN, result, COLOR_RESET);
    add_to_history(expr, result);
}

static void scientific_functions(void) {
    printf("\n  %sScientific Functions:%s\n\n", COLOR_BOLD, COLOR_RESET);
    printf("    %s1.%s sin(x)        %s5.%s log10(x)\n", COLOR_CYAN, COLOR_RESET, COLOR_CYAN, COLOR_RESET);
    printf("    %s2.%s cos(x)        %s6.%s ln(x)\n", COLOR_CYAN, COLOR_RESET, COLOR_CYAN, COLOR_RESET);
    printf("    %s3.%s tan(x)        %s7.%s sqrt(x)\n", COLOR_CYAN, COLOR_RESET, COLOR_CYAN, COLOR_RESET);
    printf("    %s4.%s abs(x)        %s8.%s factorial(n)\n", COLOR_CYAN, COLOR_RESET, COLOR_CYAN, COLOR_RESET);

    printf("\n  %sChoose function (1-8):%s ", COLOR_BOLD, COLOR_RESET);

    int choice;
    if (scanf("%d", &choice) != 1 || choice < 1 || choice > 8) {
        printf("  %sInvalid choice.%s\n", COLOR_RED, COLOR_RESET);
        while (getchar() != '\n');
        return;
    }
    while (getchar() != '\n');

    double x;
    printf("  %sEnter value:%s ", COLOR_BOLD, COLOR_RESET);
    if (scanf("%lf", &x) != 1) {
        printf("  %sInvalid number.%s\n", COLOR_RED, COLOR_RESET);
        while (getchar() != '\n');
        return;
    }
    while (getchar() != '\n');

    double result;
    char expr[MAX_EXPR_LEN];

    switch (choice) {
        case 1:
            result = sin(x);
            snprintf(expr, sizeof(expr), "sin(%.6g)", x);
            break;
        case 2:
            result = cos(x);
            snprintf(expr, sizeof(expr), "cos(%.6g)", x);
            break;
        case 3:
            result = tan(x);
            snprintf(expr, sizeof(expr), "tan(%.6g)", x);
            break;
        case 4:
            result = fabs(x);
            snprintf(expr, sizeof(expr), "abs(%.6g)", x);
            break;
        case 5:
            if (x <= 0) { printf("  %sError: log requires positive input.%s\n", COLOR_RED, COLOR_RESET); return; }
            result = log10(x);
            snprintf(expr, sizeof(expr), "log10(%.6g)", x);
            break;
        case 6:
            if (x <= 0) { printf("  %sError: ln requires positive input.%s\n", COLOR_RED, COLOR_RESET); return; }
            result = log(x);
            snprintf(expr, sizeof(expr), "ln(%.6g)", x);
            break;
        case 7:
            if (x < 0) { printf("  %sError: sqrt requires non-negative input.%s\n", COLOR_RED, COLOR_RESET); return; }
            result = sqrt(x);
            snprintf(expr, sizeof(expr), "sqrt(%.6g)", x);
            break;
        case 8: {
            int n = (int)x;
            if (n < 0 || n > 20) { printf("  %sError: factorial supports 0-20.%s\n", COLOR_RED, COLOR_RESET); return; }
            result = 1.0;
            for (int i = 2; i <= n; i++) result *= i;
            snprintf(expr, sizeof(expr), "%d!", n);
            break;
        }
        default:
            return;
    }

    printf("\n  %s  %s = %s%.6g%s\n", COLOR_DIM, expr, COLOR_GREEN, result, COLOR_RESET);
    add_to_history(expr, result);
}

static void memory_operations(void) {
    printf("\n  %sMemory:%s %s%.6g%s\n\n", COLOR_BOLD, COLOR_RESET, COLOR_YELLOW, memory, COLOR_RESET);
    printf("    %s1.%s Store last result (MS)\n", COLOR_CYAN, COLOR_RESET);
    printf("    %s2.%s Recall memory (MR)\n", COLOR_CYAN, COLOR_RESET);
    printf("    %s3.%s Clear memory (MC)\n", COLOR_CYAN, COLOR_RESET);
    printf("    %s4.%s Add to memory (M+)\n", COLOR_CYAN, COLOR_RESET);

    printf("\n  %sChoose (1-4):%s ", COLOR_BOLD, COLOR_RESET);
    int choice;
    if (scanf("%d", &choice) != 1) {
        while (getchar() != '\n');
        return;
    }
    while (getchar() != '\n');

    switch (choice) {
        case 1:
            if (history_count > 0) {
                memory = history[history_count - 1].result;
                printf("  %sStored %.6g in memory.%s\n", COLOR_GREEN, memory, COLOR_RESET);
            } else {
                printf("  %sNo results to store.%s\n", COLOR_RED, COLOR_RESET);
            }
            break;
        case 2:
            printf("  %sMemory: %s%.6g%s\n", COLOR_BOLD, COLOR_GREEN, memory, COLOR_RESET);
            break;
        case 3:
            memory = 0.0;
            printf("  %sMemory cleared.%s\n", COLOR_GREEN, COLOR_RESET);
            break;
        case 4: {
            double val;
            printf("  %sValue to add:%s ", COLOR_BOLD, COLOR_RESET);
            if (scanf("%lf", &val) == 1) {
                memory += val;
                printf("  %sMemory is now %.6g%s\n", COLOR_GREEN, memory, COLOR_RESET);
            }
            while (getchar() != '\n');
            break;
        }
        default:
            printf("  %sInvalid choice.%s\n", COLOR_RED, COLOR_RESET);
    }
}

static void show_menu(void) {
    printf("\n");
    printf("  %s╭──────────────────────────────╮%s\n", COLOR_BLUE, COLOR_RESET);
    printf("  %s│%s  %s1.%s Basic Calculation          %s│%s\n", COLOR_BLUE, COLOR_RESET, COLOR_CYAN, COLOR_RESET, COLOR_BLUE, COLOR_RESET);
    printf("  %s│%s  %s2.%s Scientific Functions        %s│%s\n", COLOR_BLUE, COLOR_RESET, COLOR_CYAN, COLOR_RESET, COLOR_BLUE, COLOR_RESET);
    printf("  %s│%s  %s3.%s Memory Operations           %s│%s\n", COLOR_BLUE, COLOR_RESET, COLOR_CYAN, COLOR_RESET, COLOR_BLUE, COLOR_RESET);
    printf("  %s│%s  %s4.%s Calculation History         %s│%s\n", COLOR_BLUE, COLOR_RESET, COLOR_CYAN, COLOR_RESET, COLOR_BLUE, COLOR_RESET);
    printf("  %s│%s  %s0.%s %sExit%s                       %s│%s\n", COLOR_BLUE, COLOR_RESET, COLOR_CYAN, COLOR_RESET, COLOR_DIM, COLOR_RESET, COLOR_BLUE, COLOR_RESET);
    printf("  %s╰──────────────────────────────╯%s\n", COLOR_BLUE, COLOR_RESET);
}

int main(void) {
    print_banner("SCIENTIFIC CALCULATOR", "A powerful CLI calculator in C");

    int running = 1;
    while (running) {
        show_menu();
        printf("\n  %sChoice:%s ", COLOR_BOLD, COLOR_RESET);

        int choice;
        if (scanf("%d", &choice) != 1) {
            printf("  %sPlease enter a number.%s\n", COLOR_RED, COLOR_RESET);
            while (getchar() != '\n');
            continue;
        }
        while (getchar() != '\n');

        switch (choice) {
            case 1: basic_calculator(); break;
            case 2: scientific_functions(); break;
            case 3: memory_operations(); break;
            case 4: show_history(); break;
            case 0:
                running = 0;
                printf("\n  %sGoodbye!%s\n\n", COLOR_MAGENTA, COLOR_RESET);
                break;
            default:
                printf("  %sInvalid option. Try 0-4.%s\n", COLOR_RED, COLOR_RESET);
        }
    }

    return 0;
}
