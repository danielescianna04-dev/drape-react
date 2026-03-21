package src;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Scanner;
import java.util.stream.Collectors;

/**
 * Contact Book — A CLI contact management application.
 */
public class App {

    private static class Contact {
        int id;
        String name;
        String phone;
        String email;
        String category; // Personal, Work, Family, Other
        boolean favorite;

        Contact(int id, String name, String phone, String email, String category) {
            this.id = id;
            this.name = name;
            this.phone = phone;
            this.email = email;
            this.category = category;
            this.favorite = false;
        }

        String categoryIcon() {
            return switch (category.toLowerCase()) {
                case "work" -> "[W]";
                case "family" -> "[F]";
                case "personal" -> "[P]";
                default -> "[O]";
            };
        }

        String categoryColor() {
            return switch (category.toLowerCase()) {
                case "work" -> Utils.BLUE;
                case "family" -> Utils.MAGENTA;
                case "personal" -> Utils.GREEN;
                default -> Utils.DIM;
            };
        }
    }

    private final List<Contact> contacts = new ArrayList<>();
    private final Scanner scanner = new Scanner(System.in);
    private int nextId = 1;

    public App() {
        seedData();
    }

    private void seedData() {
        addContact("Alice Johnson", "+1-555-0101", "alice@example.com", "Personal", true);
        addContact("Bob Martinez", "+1-555-0202", "bob.m@work.com", "Work", false);
        addContact("Carol Chen", "+1-555-0303", "carol.chen@email.com", "Family", true);
        addContact("David Kim", "+1-555-0404", "d.kim@company.org", "Work", false);
        addContact("Eve Williams", "+1-555-0505", "eve.w@mail.com", "Personal", false);
        addContact("Frank Brown", "+1-555-0606", "frank@startup.io", "Work", true);
        addContact("Grace Lee", "+1-555-0707", "grace.lee@family.net", "Family", false);
    }

    private void addContact(String name, String phone, String email, String category, boolean fav) {
        Contact c = new Contact(nextId++, name, phone, email, category);
        c.favorite = fav;
        contacts.add(c);
    }

    private void showMenu() {
        System.out.println();
        System.out.println("  " + Utils.BLUE + "\u256D\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256E" + Utils.RESET);
        System.out.println("  " + Utils.BLUE + "\u2502" + Utils.RESET + "  " + Utils.CYAN + "1." + Utils.RESET + " List all contacts          " + Utils.BLUE + "\u2502" + Utils.RESET);
        System.out.println("  " + Utils.BLUE + "\u2502" + Utils.RESET + "  " + Utils.CYAN + "2." + Utils.RESET + " Add new contact            " + Utils.BLUE + "\u2502" + Utils.RESET);
        System.out.println("  " + Utils.BLUE + "\u2502" + Utils.RESET + "  " + Utils.CYAN + "3." + Utils.RESET + " Search contacts            " + Utils.BLUE + "\u2502" + Utils.RESET);
        System.out.println("  " + Utils.BLUE + "\u2502" + Utils.RESET + "  " + Utils.CYAN + "4." + Utils.RESET + " View contact details       " + Utils.BLUE + "\u2502" + Utils.RESET);
        System.out.println("  " + Utils.BLUE + "\u2502" + Utils.RESET + "  " + Utils.CYAN + "5." + Utils.RESET + " Toggle favorite            " + Utils.BLUE + "\u2502" + Utils.RESET);
        System.out.println("  " + Utils.BLUE + "\u2502" + Utils.RESET + "  " + Utils.CYAN + "6." + Utils.RESET + " Delete contact             " + Utils.BLUE + "\u2502" + Utils.RESET);
        System.out.println("  " + Utils.BLUE + "\u2502" + Utils.RESET + "  " + Utils.CYAN + "7." + Utils.RESET + " Show statistics            " + Utils.BLUE + "\u2502" + Utils.RESET);
        System.out.println("  " + Utils.BLUE + "\u2502" + Utils.RESET + "  " + Utils.CYAN + "0." + Utils.RESET + " " + Utils.DIM + "Exit" + Utils.RESET + "                       " + Utils.BLUE + "\u2502" + Utils.RESET);
        System.out.println("  " + Utils.BLUE + "\u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256F" + Utils.RESET);
    }

    private void listContacts() {
        listContacts(contacts);
    }

    private void listContacts(List<Contact> list) {
        if (list.isEmpty()) {
            System.out.println("\n  " + Utils.DIM + "No contacts found." + Utils.RESET);
            return;
        }

        System.out.println();

        // Header
        System.out.println("  " + Utils.BG_BLUE + Utils.WHITE
                + " ID  Fav  Name                   Phone            Category  " + Utils.RESET);

        // Sort: favorites first, then alphabetical
        List<Contact> sorted = list.stream()
                .sorted(Comparator.comparing((Contact c) -> !c.favorite)
                        .thenComparing(c -> c.name.toLowerCase()))
                .collect(Collectors.toList());

        for (Contact c : sorted) {
            String fav = c.favorite ? (Utils.YELLOW + " *  " + Utils.RESET) : "    ";
            String catDisplay = c.categoryColor() + c.categoryIcon() + " "
                    + Utils.fixedWidth(c.category, 8) + Utils.RESET;

            System.out.printf("  %s%3d%s %s %s  %s  %s%n",
                    Utils.CYAN, c.id, Utils.RESET,
                    fav,
                    Utils.fixedWidth(c.name, 23),
                    Utils.fixedWidth(c.phone, 16),
                    catDisplay);
        }
        System.out.println();
    }

    private void addNewContact() {
        System.out.println("\n  " + Utils.BOLD + "--- Add New Contact ---" + Utils.RESET);

        System.out.print("  " + Utils.BOLD + "Name: " + Utils.RESET);
        String name = scanner.nextLine().trim();
        if (name.isEmpty()) {
            Utils.printColoredLn(Utils.RED, "  Name cannot be empty.");
            return;
        }

        System.out.print("  " + Utils.BOLD + "Phone: " + Utils.RESET);
        String phone = scanner.nextLine().trim();
        if (phone.isEmpty()) phone = "N/A";

        System.out.print("  " + Utils.BOLD + "Email: " + Utils.RESET);
        String email = scanner.nextLine().trim();
        if (email.isEmpty()) email = "N/A";

        System.out.println("  " + Utils.BOLD + "Category:" + Utils.RESET);
        System.out.println("    " + Utils.CYAN + "1." + Utils.RESET + " Personal");
        System.out.println("    " + Utils.CYAN + "2." + Utils.RESET + " Work");
        System.out.println("    " + Utils.CYAN + "3." + Utils.RESET + " Family");
        System.out.println("    " + Utils.CYAN + "4." + Utils.RESET + " Other");
        System.out.print("  Choice (1-4): ");

        String catChoice = scanner.nextLine().trim();
        String category = switch (catChoice) {
            case "1" -> "Personal";
            case "2" -> "Work";
            case "3" -> "Family";
            default -> "Other";
        };

        Contact c = new Contact(nextId++, name, phone, email, category);
        contacts.add(c);

        System.out.println("  " + Utils.GREEN + Utils.BOLD + "Contact '" + name
                + "' added! (ID: " + c.id + ")" + Utils.RESET);
    }

    private void searchContacts() {
        System.out.print("\n  " + Utils.BOLD + "Search query: " + Utils.RESET);
        String query = scanner.nextLine().trim().toLowerCase();
        if (query.isEmpty()) {
            Utils.printColoredLn(Utils.RED, "  Empty search query.");
            return;
        }

        List<Contact> results = contacts.stream()
                .filter(c -> c.name.toLowerCase().contains(query)
                        || c.phone.contains(query)
                        || c.email.toLowerCase().contains(query)
                        || c.category.toLowerCase().contains(query))
                .collect(Collectors.toList());

        System.out.println("  " + Utils.DIM + "Found " + results.size()
                + " result(s) for '" + query + "'" + Utils.RESET);
        listContacts(results);
    }

    private Contact findById(int id) {
        return contacts.stream().filter(c -> c.id == id).findFirst().orElse(null);
    }

    private void viewContactDetails() {
        System.out.print("\n  " + Utils.BOLD + "Contact ID: " + Utils.RESET);
        int id;
        try {
            id = Integer.parseInt(scanner.nextLine().trim());
        } catch (NumberFormatException e) {
            Utils.printColoredLn(Utils.RED, "  Invalid ID.");
            return;
        }

        Contact c = findById(id);
        if (c == null) {
            Utils.printColoredLn(Utils.RED, "  Contact not found.");
            return;
        }

        System.out.println();
        Utils.printDivider();
        System.out.println("  " + Utils.WHITE + Utils.BOLD + c.name + Utils.RESET
                + (c.favorite ? (" " + Utils.YELLOW + "[FAVORITE]" + Utils.RESET) : ""));
        Utils.printDivider();

        System.out.println("  " + Utils.CYAN + "Phone:    " + Utils.RESET + c.phone);
        System.out.println("  " + Utils.CYAN + "Email:    " + Utils.RESET + c.email);
        System.out.println("  " + Utils.CYAN + "Category: " + Utils.RESET
                + c.categoryColor() + c.category + Utils.RESET);
        System.out.println("  " + Utils.CYAN + "ID:       " + Utils.RESET + Utils.DIM + c.id + Utils.RESET);
        System.out.println();
    }

    private void toggleFavorite() {
        System.out.print("\n  " + Utils.BOLD + "Contact ID: " + Utils.RESET);
        int id;
        try {
            id = Integer.parseInt(scanner.nextLine().trim());
        } catch (NumberFormatException e) {
            Utils.printColoredLn(Utils.RED, "  Invalid ID.");
            return;
        }

        Contact c = findById(id);
        if (c == null) {
            Utils.printColoredLn(Utils.RED, "  Contact not found.");
            return;
        }

        c.favorite = !c.favorite;
        if (c.favorite) {
            System.out.println("  " + Utils.YELLOW + Utils.BOLD + c.name
                    + " added to favorites!" + Utils.RESET);
        } else {
            System.out.println("  " + Utils.DIM + c.name + " removed from favorites." + Utils.RESET);
        }
    }

    private void deleteContact() {
        listContacts();
        System.out.print("  " + Utils.BOLD + "Contact ID to delete: " + Utils.RESET);
        int id;
        try {
            id = Integer.parseInt(scanner.nextLine().trim());
        } catch (NumberFormatException e) {
            Utils.printColoredLn(Utils.RED, "  Invalid ID.");
            return;
        }

        Contact c = findById(id);
        if (c == null) {
            Utils.printColoredLn(Utils.RED, "  Contact not found.");
            return;
        }

        System.out.print("  " + Utils.RED + Utils.BOLD + "Delete '" + c.name
                + "'? (y/n): " + Utils.RESET);
        String confirm = scanner.nextLine().trim().toLowerCase();

        if (confirm.equals("y") || confirm.equals("yes")) {
            contacts.remove(c);
            Utils.printColoredLn(Utils.RED, "  Deleted " + c.name + ".");
        } else {
            Utils.printColoredLn(Utils.DIM, "  Cancelled.");
        }
    }

    private void showStatistics() {
        System.out.println("\n  " + Utils.BOLD + "\u2550\u2550\u2550 CONTACT BOOK STATISTICS \u2550\u2550\u2550" + Utils.RESET + "\n");

        int total = contacts.size();
        long favs = contacts.stream().filter(c -> c.favorite).count();

        System.out.println("  Total contacts:  " + Utils.BOLD + total + Utils.RESET);
        System.out.println("  Favorites:       " + Utils.YELLOW + Utils.BOLD + favs + Utils.RESET);
        System.out.println();

        // Category breakdown
        System.out.println("  " + Utils.BOLD + "By Category:" + Utils.RESET);
        var categories = new String[]{"Personal", "Work", "Family", "Other"};
        for (String cat : categories) {
            long count = contacts.stream().filter(c -> c.category.equalsIgnoreCase(cat)).count();
            if (count == 0) continue;

            int barLen = total > 0 ? (int) ((count * 20) / total) : 0;
            if (barLen < 1 && count > 0) barLen = 1;

            String color = switch (cat.toLowerCase()) {
                case "work" -> Utils.BLUE;
                case "family" -> Utils.MAGENTA;
                case "personal" -> Utils.GREEN;
                default -> Utils.DIM;
            };

            System.out.printf("    %-10s ", cat);
            Utils.printBar(barLen, 20, color);
            System.out.printf(" %d (%d%%)%n", count, total > 0 ? (count * 100 / total) : 0);
        }
        System.out.println();
    }

    public void run() {
        Utils.printBanner("CONTACT BOOK v1.0", "Manage your contacts from the terminal");

        while (true) {
            showMenu();
            System.out.print("\n  " + Utils.BOLD + "Choice: " + Utils.RESET);

            String input = scanner.nextLine().trim();
            int choice;
            try {
                choice = Integer.parseInt(input);
            } catch (NumberFormatException e) {
                Utils.printColoredLn(Utils.RED, "  Please enter a number.");
                continue;
            }

            switch (choice) {
                case 1 -> listContacts();
                case 2 -> addNewContact();
                case 3 -> searchContacts();
                case 4 -> viewContactDetails();
                case 5 -> toggleFavorite();
                case 6 -> deleteContact();
                case 7 -> showStatistics();
                case 0 -> {
                    System.out.println("\n  " + Utils.MAGENTA + Utils.BOLD + "Goodbye!" + Utils.RESET + "\n");
                    return;
                }
                default -> Utils.printColoredLn(Utils.RED, "  Invalid option. Try 0-7.");
            }
        }
    }
}
