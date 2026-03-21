package src;

/**
 * Utility class for ANSI colors and terminal formatting.
 */
public final class Utils {

    private Utils() {} // prevent instantiation

    // ANSI color codes
    public static final String RESET   = "\033[0m";
    public static final String RED     = "\033[1;31m";
    public static final String GREEN   = "\033[1;32m";
    public static final String YELLOW  = "\033[1;33m";
    public static final String BLUE    = "\033[1;34m";
    public static final String MAGENTA = "\033[1;35m";
    public static final String CYAN    = "\033[1;36m";
    public static final String WHITE   = "\033[1;37m";
    public static final String DIM     = "\033[2m";
    public static final String BOLD    = "\033[1m";
    public static final String BG_BLUE = "\033[44m";

    /**
     * Print colored text without newline.
     */
    public static void printColored(String color, String text) {
        System.out.print(color + text + RESET);
    }

    /**
     * Print colored text with newline.
     */
    public static void printColoredLn(String color, String text) {
        System.out.println(color + text + RESET);
    }

    /**
     * Print a horizontal divider.
     */
    public static void printDivider() {
        System.out.print("  " + DIM);
        for (int i = 0; i < 44; i++) System.out.print("\u2500");
        System.out.println(RESET);
    }

    /**
     * Print a boxed banner.
     */
    public static void printBanner(String title, String subtitle) {
        int boxWidth = Math.max(title.length() + 8, 44);

        System.out.println();
        System.out.print("  " + CYAN + "\u2554");
        for (int i = 0; i < boxWidth; i++) System.out.print("\u2550");
        System.out.println("\u2557" + RESET);

        int pad = (boxWidth - title.length()) / 2;
        System.out.print("  " + CYAN + "\u2551" + RESET);
        for (int i = 0; i < pad; i++) System.out.print(" ");
        System.out.print(YELLOW + BOLD + title + RESET);
        for (int i = 0; i < boxWidth - pad - title.length(); i++) System.out.print(" ");
        System.out.println(CYAN + "\u2551" + RESET);

        if (subtitle != null && !subtitle.isEmpty()) {
            int subPad = (boxWidth - subtitle.length()) / 2;
            System.out.print("  " + CYAN + "\u2551" + RESET);
            for (int i = 0; i < subPad; i++) System.out.print(" ");
            System.out.print(DIM + subtitle + RESET);
            for (int i = 0; i < boxWidth - subPad - subtitle.length(); i++) System.out.print(" ");
            System.out.println(CYAN + "\u2551" + RESET);
        }

        System.out.print("  " + CYAN + "\u255A");
        for (int i = 0; i < boxWidth; i++) System.out.print("\u2550");
        System.out.println("\u255D" + RESET);
        System.out.println();
    }

    /**
     * Print a progress/score bar.
     */
    public static void printBar(int filled, int total, String color) {
        int empty = total - filled;
        System.out.print(color);
        for (int i = 0; i < filled; i++) System.out.print("\u2588");
        System.out.print(DIM);
        for (int i = 0; i < empty; i++) System.out.print("\u2591");
        System.out.print(RESET);
    }

    /**
     * Truncate or pad a string to a fixed width.
     */
    public static String fixedWidth(String s, int width) {
        if (s.length() > width) {
            return s.substring(0, width - 2) + "..";
        }
        return String.format("%-" + width + "s", s);
    }
}
