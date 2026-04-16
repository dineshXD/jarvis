/**
 * EntriesGrid.tsx — Server Component for Displaying the Vault Grid
 * ==================================================================
 *
 * THIS IS A SERVER COMPONENT (no "use client" directive).
 *
 * WHY SERVER COMPONENT?
 *   1. Fetches data with `await` — only Server Components can do this
 *   2. The fetch runs on the Next.js server, not in the browser
 *   3. Zero JavaScript shipped to the browser for this component
 *   4. The HTML is generated on the server and sent to the browser
 *
 * BEFORE (problems):
 *   - fetch("http://localhost:8000/list") — hardcoded URL
 *   - No try/catch — app crashes when backend is down
 *   - data: any — no TypeScript safety
 *   - key={entry.id} — but API doesn't return "id" field!
 *
 * AFTER (fixes):
 *   - Uses lib/api.ts — centralized, typed API calls
 *   - Error propagates to error.tsx boundary
 *   - Proper Entry type — autocomplete, no typo bugs
 *   - key={entry.url} — URL is unique identifier
 *
 * HOW DATA FLOWS:
 *   1. User navigates to "/"
 *   2. Next.js renders page.tsx (Server Component)
 *   3. page.tsx renders <EntriesGrid /> (also Server Component)
 *   4. EntriesGrid calls getEntries() which calls the backend API
 *   5. Data comes back → HTML is generated on the server
 *   6. HTML is sent to the browser
 *   7. Browser shows the page — no loading spinner needed!
 *   8. Client Components (BlogCard, etc.) are hydrated for interactivity
 */

import { getEntries } from "../lib/api";
import type { Entry } from "../lib/types";
import { BlogCard } from "./BlogCard";
import { TweetCard } from "./TweetCard";
import { MovieCard } from "./MovieCard";
import { LinkCard } from "./LinksCard";

export default async function EntriesGrid() {
  // getEntries() is from lib/api.ts. It calls the backend's /list endpoint.
  //
  // If this throws (backend is down, network error, etc.), the error
  // bubbles up to error.tsx which shows a clean error UI with retry.
  //
  // We DON'T try/catch here because:
  // 1. error.tsx already handles it gracefully
  // 2. Catching here would mean showing an empty grid silently,
  //    which is confusing — the user wouldn't know something is wrong
  const entries: Entry[] = await getEntries();

  // Handle empty state — when the vault has no entries yet.
  // This is different from an error! The backend responded successfully,
  // it just has no data.
  if (entries.length === 0) {
    return (
      <section className="entries-section">
        <div className="entries-header">
          <span className="entries-title">All Entries</span>
          <span className="entries-count">0 entries</span>
        </div>
        <div className="entries-empty">
          <p>Your vault is empty. Paste a URL above to get started.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="entries-section">
      <div className="entries-header">
        <span className="entries-title">All Entries</span>
        <span className="entries-count">{entries.length} entries</span>
      </div>

      <div className="entries-grid">
        {entries.map((entry: Entry) => {
          // Render a different card component based on the entry type.
          // This is the "strategy pattern" — different rendering strategies
          // for different data types, selected at runtime.
          //
          // key={entry.url}: React uses the key to track which items
          // changed, were added, or removed. The key must be:
          // 1. Unique among siblings
          // 2. Stable (doesn't change between renders)
          // URL is perfect because each entry has a unique URL.
          //
          // Before we used entry.id, but the API doesn't return an id field!
          // This caused React warnings in the console.
          switch (entry.type) {
            case "blog":
              return <BlogCard key={entry.url} data={entry} />;
            case "tweet":
              return <TweetCard key={entry.url} data={entry} />;
            case "movie":
              return <MovieCard key={entry.url} data={entry} />;
            case "link":
              return <LinkCard key={entry.url} data={entry} />;
            default:
              // Default to BlogCard for any unknown type.
              // This is defensive programming — handle the unexpected.
              return <BlogCard key={entry.url} data={entry} />;
          }
        })}
      </div>
    </section>
  );
}
