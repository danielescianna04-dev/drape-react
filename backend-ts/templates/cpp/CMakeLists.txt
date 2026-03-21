cmake_minimum_required(VERSION 3.16)
project(GradeManager LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_executable(grade_manager
    main.cpp
    src/app.cpp
)

target_include_directories(grade_manager PRIVATE ${CMAKE_SOURCE_DIR})
