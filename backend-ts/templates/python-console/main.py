#!/usr/bin/env python3
"""Task Manager CLI — A beautiful terminal task manager built with Rich."""

import sys

def main() -> int:
    try:
        from src.app import TaskManager
    except ImportError:
        print("Missing dependencies. Run: pip install -r requirements.txt")
        return 1

    app = TaskManager()
    app.run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
