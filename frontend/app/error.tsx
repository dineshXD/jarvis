/**
 * error.tsx — Error Boundary for the Vault Page
 * ================================================
 *
 * WHAT IS AN ERROR BOUNDARY?
 *   When a component throws an error (like fetch failing when the
 *   backend is down), React normally crashes the ENTIRE page and
 *   shows an ugly error screen.
 *
 *   An error boundary CATCHES the error and shows a nice fallback UI
 *   instead. Think of it as a try/catch for React components:
 *
 *     try {
 *       <EntriesGrid />    // This might crash if backend is down
 *     } catch (error) {
 *       <ErrorPage />      // Show this instead of crashing
 *     }
 *
 *   In Next.js, you create error boundaries by adding an error.tsx
 *   file in the same directory as the page that might fail.
 *
 * HOW NEXT.JS USES THIS FILE:
 *   Next.js wraps your page.tsx in an error boundary automatically:
 *
 *   <ErrorBoundary fallback={<Error />}>
 *     <Suspense fallback={<Loading />}>
 *       <Page />
 *     </Suspense>
 *   </ErrorBoundary>
 *
 *   If Page (or any component inside it) throws, Error is shown.
 *   While Page is streaming/loading, Loading is shown.
 *
 * RULES:
 *   1. error.tsx MUST be a Client Component ("use client")
 *      Because it needs to handle user interactions (reset button).
 *   2. It receives two props: error and reset
 *      - error: the Error object that was thrown
 *      - reset: a function to retry rendering the page
 *   3. It only catches errors in child components, not in layout.tsx
 *
 * YOUR BUG (FIXED):
 *   Before: EntriesGrid crashes → ugly runtime error on screen
 *   After:  EntriesGrid crashes → this nice error UI with retry button
 */
"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  /** The error that was thrown */
  error: Error & { digest?: string };
  /** Function to retry rendering the page */
  reset: () => void;
}) {
  // Log the error for debugging.
  // In production, you'd send this to an error tracking service
  // like Sentry, Datadog, or LogRocket.
  useEffect(() => {
    console.error("Vault page error:", error);
  }, [error]);

  return (
    <div className="error-container">
      <div className="error-content">
        <h2 className="error-title">Something went wrong</h2>
        <p className="error-message">
          {error.message.includes("fetch")
            ? "Unable to connect to the server. Make sure the backend is running."
            : error.message || "An unexpected error occurred."}
        </p>
        <button className="error-retry" onClick={reset}>
          Try Again
        </button>
      </div>
    </div>
  );
}
