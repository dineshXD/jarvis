"""
app — Jarvis Backend Package
==============================

WHAT IS __init__.py?
    In Python, a directory with __init__.py is a "package".
    Without this file, Python doesn't recognize 'app' as a package,
    and imports like 'from app.feed import feed' would fail.

    This is similar to how Java packages work — the directory structure
    defines the package hierarchy:
        app/
        ├── __init__.py     ← Makes 'app' a package (like package statement in Java)
        ├── main.py         ← app.main
        ├── feed.py         ← app.feed
        └── query.py        ← app.query

    __init__.py can be empty, or it can contain initialization code
    that runs when the package is first imported.

    In Java:
        package app;  // This is implicit from the directory structure

    In Python:
        # The existence of __init__.py IS the package declaration
"""
