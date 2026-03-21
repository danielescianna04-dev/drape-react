# Contact Book CLI

A terminal-based contact management application written in Java 17+.

## Build & Run

```bash
make
make run
```

Or manually:
```bash
mkdir -p out
javac --release 17 -d out Main.java src/App.java src/Utils.java
java -cp out Main
```

## Features

- Add, search, view, and delete contacts
- Mark contacts as favorites (displayed first)
- Category classification: Personal, Work, Family, Other
- Full-text search across name, phone, email, and category
- Statistics dashboard with category breakdown
- Colored ANSI terminal output
