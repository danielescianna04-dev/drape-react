#ifndef APP_H
#define APP_H

#include <string>
#include <vector>
#include <map>

namespace colors {
    constexpr const char* RESET   = "\033[0m";
    constexpr const char* RED     = "\033[1;31m";
    constexpr const char* GREEN   = "\033[1;32m";
    constexpr const char* YELLOW  = "\033[1;33m";
    constexpr const char* BLUE    = "\033[1;34m";
    constexpr const char* MAGENTA = "\033[1;35m";
    constexpr const char* CYAN    = "\033[1;36m";
    constexpr const char* WHITE   = "\033[1;37m";
    constexpr const char* DIM     = "\033[2m";
    constexpr const char* BOLD    = "\033[1m";
    constexpr const char* BG_BLUE = "\033[44m";
    constexpr const char* BG_RED  = "\033[41m";
    constexpr const char* BG_GREEN= "\033[42m";
}

struct Student {
    int id;
    std::string name;
    std::map<std::string, std::vector<double>> grades; // subject -> list of grades

    double subjectAverage(const std::string& subject) const;
    double overallAverage() const;
    std::string letterGrade() const;
};

class GradeManager {
public:
    GradeManager();
    void run();

private:
    std::vector<Student> students_;
    int nextId_;

    // UI
    void showBanner() const;
    void showMenu() const;
    void showDivider() const;

    // Actions
    void listStudents() const;
    void addStudent();
    void addGrade();
    void viewStudent() const;
    void showClassReport() const;
    void removeStudent();

    // Helpers
    Student* findStudent(int id);
    const Student* findStudent(int id) const;
    void seedSampleData();
    static void printBar(double value, double maxValue, int width, const char* color);
    static const char* gradeColor(const std::string& letter);
};

#endif // APP_H
