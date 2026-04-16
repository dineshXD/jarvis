/**
 * VaultContent.tsx — Client Wrapper: Search + Sort + Filter + Entries
 * =====================================================================
 * Receives server-fetched entries and provides:
 * - Text search by title/URL/source
 * - Sort by date (newest/oldest) or title (A-Z)
 * - Source filter chips (click to filter by domain)
 */
"use client";

import { useState, useMemo } from "react";
import type { Entry } from "../lib/types";
import SearchBar from "./SearchBar";
import { BlogCard } from "./BlogCard";
import { TweetCard } from "./TweetCard";
import { MovieCard } from "./MovieCard";
import { LinkCard } from "./LinksCard";

interface VaultContentProps {
  entries: Entry[];
}

type SortOption = "newest" | "oldest" | "az";

export default function VaultContent({ entries }: VaultContentProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);

  // Get unique sources for filter chips
  const uniqueSources = useMemo(() => {
    const sources = new Set(entries.map((e) => e.source));
    return Array.from(sources).sort();
  }, [entries]);

  // Apply search → source filter → sort
  const processedEntries = useMemo(() => {
    let result = entries;

    // 1. Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.url.toLowerCase().includes(q) ||
          e.source.toLowerCase().includes(q)
      );
    }

    // 2. Source filter
    if (sourceFilter) {
      result = result.filter((e) => e.source === sourceFilter);
    }

    // 3. Sort
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return b.date.localeCompare(a.date);
        case "oldest":
          return a.date.localeCompare(b.date);
        case "az":
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

    return result;
  }, [entries, searchQuery, sourceFilter, sortBy]);

  return (
    <section className="entries-section">
      <div className="entries-header">
        <span className="entries-title">All Entries</span>
        <span className="entries-count">{entries.length} entries</span>
      </div>

      {/* Controls: Search + Sort */}
      {entries.length > 0 && (
        <>
          <div className="vault-controls">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              totalCount={entries.length}
              filteredCount={processedEntries.length}
            />
            <select
              className="sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="az">A → Z</option>
            </select>
          </div>

          {/* Source filter chips */}
          {uniqueSources.length > 1 && (
            <div className="source-filters">
              <button
                className={`source-chip ${sourceFilter === null ? "active" : ""}`}
                onClick={() => setSourceFilter(null)}
              >
                All
              </button>
              {uniqueSources.map((source) => (
                <button
                  key={source}
                  className={`source-chip ${sourceFilter === source ? "active" : ""}`}
                  onClick={() =>
                    setSourceFilter(sourceFilter === source ? null : source)
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${source}&sz=16`}
                    alt=""
                    width={14}
                    height={14}
                    className="chip-favicon"
                  />
                  {source}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Empty vault */}
      {entries.length === 0 && (
        <div className="entries-empty">
          <p>Your vault is empty. Paste a URL above to get started.</p>
        </div>
      )}

      {/* No results */}
      {entries.length > 0 && processedEntries.length === 0 && (
        <div className="entries-empty">
          <p>
            No entries match
            {searchQuery && ` "${searchQuery}"`}
            {sourceFilter && ` from ${sourceFilter}`}
          </p>
        </div>
      )}

      {/* Grid */}
      {processedEntries.length > 0 && (
        <div className="entries-grid">
          {processedEntries.map((entry: Entry) => {
            switch (entry.type) {
              case "tweet":
                return <TweetCard key={entry.url} data={entry} />;
              case "movie":
                return <MovieCard key={entry.url} data={entry} />;
              case "link":
                return <LinkCard key={entry.url} data={entry} />;
              default:
                return <BlogCard key={entry.url} data={entry} />;
            }
          })}
        </div>
      )}
    </section>
  );
}
