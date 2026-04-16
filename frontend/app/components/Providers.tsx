/**
 * Providers.tsx — Client Wrapper for Context Providers
 * ======================================================
 * layout.tsx is a Server Component, but ToastProvider needs "use client".
 * This wrapper holds all client-side providers in one place.
 */
"use client";

import { ToastProvider } from "../lib/toast-context";
import ToastContainer from "./Toast";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      {children}
      <ToastContainer />
    </ToastProvider>
  );
}
