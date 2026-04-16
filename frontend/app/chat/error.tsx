"use client";

import { useEffect } from "react";

export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Chat page error:", error);
  }, [error]);

  return (
    <div className="error-container">
      <div className="error-content">
        <h2 className="error-title">Chat Unavailable</h2>
        <p className="error-message">
          {error.message || "Something went wrong with the chat. Please try again."}
        </p>
        <button className="error-retry" onClick={reset}>
          Try Again
        </button>
      </div>
    </div>
  );
}
