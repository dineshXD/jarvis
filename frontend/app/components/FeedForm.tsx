/**
 * FeedForm.tsx — URL Input Form with Toast Notifications
 */
"use client";

import { useState } from "react";
import { feedUrlAction } from "../actions";
import { useToast } from "../lib/toast-context";

export default function FeedForm() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || loading) return;

    setLoading(true);
    const result = await feedUrlAction(url.trim());

    if (result.success) {
      toast.success(result.message);
      setUrl("");
    } else {
      toast.error(result.message);
    }

    setLoading(false);
  }

  return (
    <form className="feed-form" onSubmit={handleSubmit}>
      <div className="feed-input-group">
        <input
          type="url"
          className="feed-input"
          placeholder="Paste a URL to save..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading}
          required
        />
        <button type="submit" className="feed-btn" disabled={loading || !url.trim()}>
          {loading ? "Feeding..." : "Feed"}
        </button>
      </div>
    </form>
  );
}
