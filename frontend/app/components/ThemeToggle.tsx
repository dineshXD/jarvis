/**
 * ThemeToggle.tsx — Dark/Light Mode Toggle
 * ==========================================
 *
 * How it works:
 * 1. Reads preference from localStorage (persists across visits)
 * 2. Falls back to OS preference (prefers-color-scheme)
 * 3. Sets data-theme="dark" on <html> element
 * 4. CSS variables in globals.css respond to data-theme
 *
 * The toggle is a simple button — no external dependencies.
 */
"use client";

import { useState, useEffect } from "react";

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Initialize theme on mount (avoid hydration mismatch)
  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("jarvis-theme");
    if (stored) {
      setIsDark(stored === "dark");
      document.documentElement.setAttribute("data-theme", stored);
    } else {
      // Check OS preference
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setIsDark(prefersDark);
      if (prefersDark) {
        document.documentElement.setAttribute("data-theme", "dark");
      }
    }
  }, []);

  function toggleTheme() {
    const newTheme = isDark ? "light" : "dark";
    setIsDark(!isDark);
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("jarvis-theme", newTheme);
  }

  // Don't render until mounted (prevents hydration mismatch)
  if (!mounted) return <div style={{ width: 28, height: 28 }} />;

  return (
    <button
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      {isDark ? "☀" : "◑"}
    </button>
  );
}
