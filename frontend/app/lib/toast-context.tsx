/**
 * toast-context.tsx — App-Wide Toast Notification System
 * ========================================================
 *
 * Replaces ugly alert() and window.confirm() with clean, non-blocking
 * toast notifications that slide in and auto-dismiss.
 *
 * Uses React Context so any component anywhere in the app can show a toast:
 *   const { toast } = useToast();
 *   toast.success("Entry deleted!");
 *   toast.error("Something went wrong");
 */
"use client";

import { createContext, useContext, useState, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextType {
  toasts: ToastItem[];
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
  };
}

// ── Context ──────────────────────────────────────────────────

const ToastContext = createContext<ToastContextType | null>(null);

let toastId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, variant: ToastVariant) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, variant }]);

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const toast = {
    success: (msg: string) => addToast(msg, "success"),
    error: (msg: string) => addToast(msg, "error"),
    info: (msg: string) => addToast(msg, "info"),
  };

  return (
    <ToastContext.Provider value={{ toasts, toast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
