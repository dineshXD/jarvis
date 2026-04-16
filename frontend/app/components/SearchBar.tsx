/**
 * SearchBar.tsx — Vault Search Input
 * ====================================
 *
 * A client component that filters vault entries by title/URL.
 *
 * WHY CLIENT COMPONENT?
 *   Needs useState for the input value and onChange for real-time filtering.
 *
 * WHY CLIENT-SIDE FILTERING (not API)?
 *   The vault has tens to hundreds of entries — not millions.
 *   Filtering locally is INSTANT (no network round-trip).
 *   This is a pragmatic decision. If you had 10,000+ entries,
 *   you'd use server-side search with a text index.
 */
"use client";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  totalCount: number;
  filteredCount: number;
}

export default function SearchBar({
  value,
  onChange,
  totalCount,
  filteredCount,
}: SearchBarProps) {
  return (
    <div className="search-bar">
      <input
        type="text"
        placeholder="Search entries..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="search-input"
      />
      {value && (
        <span className="search-count">
          {filteredCount} of {totalCount} entries
        </span>
      )}
    </div>
  );
}
