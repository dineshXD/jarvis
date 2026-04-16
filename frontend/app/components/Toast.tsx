/**
 * Toast.tsx — Toast Notification UI Component
 * ==============================================
 * Renders toast notifications at the bottom-right of the screen.
 * Auto-dismisses after 3 seconds with a slide-out animation.
 */
"use client";

import { useToast } from "../lib/toast-context";

export default function ToastContainer() {
  const { toasts } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.variant}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
