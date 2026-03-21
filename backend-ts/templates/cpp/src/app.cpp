#include "app.h"
#include <iostream>
#include <iomanip>
#include <numeric>
#include <algorithm>
#include <sstream>
#include <limits>

using namespace colors;

// ── Student methods ──────────────────────────────────────────────────

double Student::subjectAverage(const std::string& subject) const {
    auto it = grades.find(subject);
    if (it == grades.end() || it->second.empty()) return 0.0;
    double sum = std::accumulate(it->second.begin(), it->second.end(), 0.0);
    return sum / static_cast<double>(it->second.size());
}

double Student::overallAverage() const {
    if (grades.empty()) return 0.0;
    double total = 0.0;
    int count = 0;
    for (const auto& [subject, gradeList] : grades) {
        for (double g : gradeList) {
            total += g;
            count++;
        }
    }
    return count > 0 ? total / count : 0.0;
}

std::string Student::letterGrade() const {
    double avg = overallAverage();
    if (avg >= 90) return "A";
    if (avg >= 80) return "B";
    if (avg >= 70) return "C";
    if (avg >= 60) return "D";
    return "F";
}

// ── GradeManager ─────────────────────────────────────────────────────

GradeManager::GradeManager() : nextId_(1) {
    seedSampleData();
}

void GradeManager::seedSampleData() {
    students_.push_back({nextId_++, "Alice Johnson", {
        {"Math", {92, 88, 95, 91}},
        {"Physics", {85, 90, 78}},
        {"English", {88, 92, 90}},
    }});
    students_.push_back({nextId_++, "Bob Martinez", {
        {"Math", {76, 82, 79}},
        {"Physics", {90, 85, 92, 88}},
        {"English", {72, 68, 75}},
    }});
    students_.push_back({nextId_++, "Carol Chen", {
        {"Math", {98, 100, 97, 95}},
        {"Physics", {92, 96, 94}},
        {"English", {91, 89, 93}},
    }});
    students_.push_back({nextId_++, "David Kim", {
        {"Math", {65, 70, 58, 72}},
        {"Physics", {60, 55, 63}},
        {"English", {78, 82, 75}},
    }});
}

void GradeManager::showBanner() const {
    std::cout << "\n";
    std::cout << "  " << CYAN << "╔════════════════════════════════════════════╗" << RESET << "\n";
    std::cout << "  " << CYAN << "║" << RESET << YELLOW << BOLD << "        STUDENT GRADE MANAGER v1.0          " << CYAN << "║" << RESET << "\n";
    std::cout << "  " << CYAN << "║" << RESET << DIM << "     Track grades, analyze performance      " << CYAN << "║" << RESET << "\n";
    std::cout << "  " << CYAN << "╚════════════════════════════════════════════╝" << RESET << "\n\n";
}

void GradeManager::showDivider() const {
    std::cout << "  " << DIM;
    for (int i = 0; i < 44; i++) std::cout << "─";
    std::cout << RESET << "\n";
}

void GradeManager::showMenu() const {
    std::cout << "\n";
    std::cout << "  " << BLUE << "╭────────────────────────────────╮" << RESET << "\n";
    std::cout << "  " << BLUE << "│" << RESET << "  " << CYAN << "1." << RESET << " List all students          " << BLUE << "│" << RESET << "\n";
    std::cout << "  " << BLUE << "│" << RESET << "  " << CYAN << "2." << RESET << " Add new student            " << BLUE << "│" << RESET << "\n";
    std::cout << "  " << BLUE << "│" << RESET << "  " << CYAN << "3." << RESET << " Add grade                  " << BLUE << "│" << RESET << "\n";
    std::cout << "  " << BLUE << "│" << RESET << "  " << CYAN << "4." << RESET << " View student details       " << BLUE << "│" << RESET << "\n";
    std::cout << "  " << BLUE << "│" << RESET << "  " << CYAN << "5." << RESET << " Class report               " << BLUE << "│" << RESET << "\n";
    std::cout << "  " << BLUE << "│" << RESET << "  " << CYAN << "6." << RESET << " Remove student             " << BLUE << "│" << RESET << "\n";
    std::cout << "  " << BLUE << "│" << RESET << "  " << CYAN << "0." << RESET << " " << DIM << "Exit" << RESET << "                       " << BLUE << "│" << RESET << "\n";
    std::cout << "  " << BLUE << "╰────────────────────────────────╯" << RESET << "\n";
}

Student* GradeManager::findStudent(int id) {
    for (auto& s : students_) {
        if (s.id == id) return &s;
    }
    return nullptr;
}

const Student* GradeManager::findStudent(int id) const {
    for (const auto& s : students_) {
        if (s.id == id) return &s;
    }
    return nullptr;
}

void GradeManager::printBar(double value, double maxValue, int width, const char* color) {
    int filled = maxValue > 0 ? static_cast<int>((value / maxValue) * width) : 0;
    if (filled > width) filled = width;
    int empty = width - filled;

    std::cout << color;
    for (int i = 0; i < filled; i++) std::cout << "█";
    std::cout << DIM;
    for (int i = 0; i < empty; i++) std::cout << "░";
    std::cout << RESET;
}

const char* GradeManager::gradeColor(const std::string& letter) {
    if (letter == "A") return GREEN;
    if (letter == "B") return CYAN;
    if (letter == "C") return YELLOW;
    if (letter == "D") return RED;
    return RED;
}

void GradeManager::listStudents() const {
    if (students_.empty()) {
        std::cout << "\n  " << DIM << "No students enrolled." << RESET << "\n";
        return;
    }

    std::cout << "\n";
    // Header
    std::cout << "  " << BG_BLUE << WHITE
              << " ID   Name                     Avg     Grade  Subjects " << RESET << "\n";

    for (const auto& s : students_) {
        double avg = s.overallAverage();
        std::string letter = s.letterGrade();

        std::cout << "  " << CYAN << std::setw(3) << s.id << RESET << "  "
                  << std::left << std::setw(25) << s.name << std::right
                  << "  ";

        // Average with bar
        printBar(avg, 100.0, 10, gradeColor(letter));
        std::cout << " " << gradeColor(letter) << std::fixed << std::setprecision(1)
                  << std::setw(5) << avg << RESET
                  << "   " << gradeColor(letter) << BOLD << std::setw(2) << letter << RESET
                  << "    " << DIM << s.grades.size() << RESET << "\n";
    }
    std::cout << "\n";
}

void GradeManager::addStudent() {
    std::cout << "\n  " << BOLD << "Student name: " << RESET;
    std::string name;
    std::getline(std::cin, name);

    if (name.empty()) {
        std::cout << "  " << RED << "Name cannot be empty." << RESET << "\n";
        return;
    }

    students_.push_back({nextId_++, name, {}});
    std::cout << "  " << GREEN << BOLD << "Student '" << name << "' added (ID: "
              << (nextId_ - 1) << ")" << RESET << "\n";
}

void GradeManager::addGrade() {
    listStudents();

    std::cout << "  " << BOLD << "Student ID: " << RESET;
    int id;
    if (!(std::cin >> id)) {
        std::cin.clear();
        std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
        std::cout << "  " << RED << "Invalid ID." << RESET << "\n";
        return;
    }
    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');

    Student* student = findStudent(id);
    if (!student) {
        std::cout << "  " << RED << "Student not found." << RESET << "\n";
        return;
    }

    std::cout << "  " << BOLD << "Subject: " << RESET;
    std::string subject;
    std::getline(std::cin, subject);
    if (subject.empty()) {
        std::cout << "  " << RED << "Subject cannot be empty." << RESET << "\n";
        return;
    }

    std::cout << "  " << BOLD << "Grade (0-100): " << RESET;
    double grade;
    if (!(std::cin >> grade) || grade < 0 || grade > 100) {
        std::cin.clear();
        std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
        std::cout << "  " << RED << "Invalid grade. Must be 0-100." << RESET << "\n";
        return;
    }
    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');

    student->grades[subject].push_back(grade);
    std::cout << "  " << GREEN << BOLD << "Grade " << grade << " added for "
              << student->name << " in " << subject << "." << RESET << "\n";
}

void GradeManager::viewStudent() const {
    std::cout << "\n  " << BOLD << "Student ID: " << RESET;
    int id;
    if (!(std::cin >> id)) {
        std::cin.clear();
        std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
        std::cout << "  " << RED << "Invalid ID." << RESET << "\n";
        return;
    }
    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');

    const Student* student = findStudent(id);
    if (!student) {
        std::cout << "  " << RED << "Student not found." << RESET << "\n";
        return;
    }

    std::cout << "\n";
    showDivider();
    std::cout << "  " << BOLD << WHITE << student->name << RESET
              << DIM << " (ID: " << student->id << ")" << RESET << "\n";
    std::cout << "  Overall: " << gradeColor(student->letterGrade())
              << BOLD << student->letterGrade() << RESET
              << " (" << std::fixed << std::setprecision(1)
              << student->overallAverage() << "%)\n";
    showDivider();

    if (student->grades.empty()) {
        std::cout << "  " << DIM << "No grades recorded." << RESET << "\n\n";
        return;
    }

    for (const auto& [subject, gradeList] : student->grades) {
        double avg = student->subjectAverage(subject);
        std::cout << "\n  " << CYAN << BOLD << subject << RESET << "\n";
        std::cout << "    Grades: " << DIM;
        for (size_t i = 0; i < gradeList.size(); i++) {
            if (i > 0) std::cout << ", ";
            std::cout << gradeList[i];
        }
        std::cout << RESET << "\n";
        std::cout << "    Average: ";
        printBar(avg, 100.0, 20, avg >= 70 ? GREEN : RED);
        std::cout << " " << std::fixed << std::setprecision(1) << avg << "%\n";
    }
    std::cout << "\n";
}

void GradeManager::showClassReport() const {
    if (students_.empty()) {
        std::cout << "\n  " << DIM << "No students enrolled." << RESET << "\n";
        return;
    }

    std::cout << "\n";
    std::cout << "  " << BOLD << "═══ CLASS REPORT ═══" << RESET << "\n\n";

    // Gather all subjects
    std::map<std::string, std::vector<double>> allGrades;
    for (const auto& s : students_) {
        for (const auto& [subject, grades] : s.grades) {
            allGrades[subject].insert(allGrades[subject].end(), grades.begin(), grades.end());
        }
    }

    // Class-wide stats
    double classTotal = 0;
    int classCount = 0;
    for (const auto& [_, grades] : allGrades) {
        for (double g : grades) { classTotal += g; classCount++; }
    }
    double classAvg = classCount > 0 ? classTotal / classCount : 0;

    std::cout << "  Students: " << BOLD << students_.size() << RESET
              << "    Subjects: " << BOLD << allGrades.size() << RESET
              << "    Class Average: " << BOLD;
    if (classAvg >= 70) std::cout << GREEN;
    else std::cout << RED;
    std::cout << std::fixed << std::setprecision(1) << classAvg << "%" << RESET << "\n\n";

    // Per-subject breakdown
    for (const auto& [subject, grades] : allGrades) {
        double sum = std::accumulate(grades.begin(), grades.end(), 0.0);
        double avg = grades.empty() ? 0 : sum / grades.size();
        double minG = *std::min_element(grades.begin(), grades.end());
        double maxG = *std::max_element(grades.begin(), grades.end());

        std::cout << "  " << CYAN << BOLD << std::left << std::setw(12) << subject << RESET;
        printBar(avg, 100.0, 15, avg >= 70 ? GREEN : RED);
        std::cout << "  avg:" << std::fixed << std::setprecision(1) << std::setw(6) << avg
                  << "  min:" << std::setw(6) << minG
                  << "  max:" << std::setw(6) << maxG << "\n";
    }

    // Top students
    std::cout << "\n  " << YELLOW << BOLD << "Top Performers:" << RESET << "\n";
    auto sorted = students_;
    std::sort(sorted.begin(), sorted.end(), [](const Student& a, const Student& b) {
        return a.overallAverage() > b.overallAverage();
    });

    int rank = 1;
    for (const auto& s : sorted) {
        if (rank > 3) break;
        const char* medal = rank == 1 ? "[1st]" : rank == 2 ? "[2nd]" : "[3rd]";
        std::cout << "    " << YELLOW << medal << RESET << " " << s.name
                  << " - " << std::fixed << std::setprecision(1)
                  << s.overallAverage() << "% (" << s.letterGrade() << ")\n";
        rank++;
    }
    std::cout << "\n";
}

void GradeManager::removeStudent() {
    listStudents();

    std::cout << "  " << BOLD << "Student ID to remove: " << RESET;
    int id;
    if (!(std::cin >> id)) {
        std::cin.clear();
        std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
        std::cout << "  " << RED << "Invalid ID." << RESET << "\n";
        return;
    }
    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');

    auto it = std::find_if(students_.begin(), students_.end(),
        [id](const Student& s) { return s.id == id; });

    if (it == students_.end()) {
        std::cout << "  " << RED << "Student not found." << RESET << "\n";
        return;
    }

    std::cout << "  " << RED << BOLD << "Remove '" << it->name << "'? (y/n): " << RESET;
    std::string confirm;
    std::getline(std::cin, confirm);

    if (confirm == "y" || confirm == "Y" || confirm == "yes") {
        std::string name = it->name;
        students_.erase(it);
        std::cout << "  " << RED << "Removed " << name << "." << RESET << "\n";
    } else {
        std::cout << "  " << DIM << "Cancelled." << RESET << "\n";
    }
}

void GradeManager::run() {
    showBanner();

    while (true) {
        showMenu();
        std::cout << "\n  " << BOLD << "Choice: " << RESET;

        int choice;
        if (!(std::cin >> choice)) {
            std::cin.clear();
            std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
            std::cout << "  " << RED << "Please enter a number." << RESET << "\n";
            continue;
        }
        std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');

        switch (choice) {
            case 1: listStudents(); break;
            case 2: addStudent(); break;
            case 3: addGrade(); break;
            case 4: viewStudent(); break;
            case 5: showClassReport(); break;
            case 6: removeStudent(); break;
            case 0:
                std::cout << "\n  " << MAGENTA << BOLD << "Goodbye!" << RESET << "\n\n";
                return;
            default:
                std::cout << "  " << RED << "Invalid option. Try 0-6." << RESET << "\n";
        }
    }
}
