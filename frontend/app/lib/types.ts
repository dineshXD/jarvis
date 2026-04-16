/**
 * types.ts — TypeScript Interfaces (Type Definitions)
 * =====================================================
 *
 * WHAT ARE TYPESCRIPT INTERFACES?
 *   In Java, you define the shape of data with classes:
 *     public class Entry {
 *       private String url;
 *       private String title;
 *     }
 *
 *   In TypeScript, you use interfaces:
 *     interface Entry {
 *       url: string;
 *       title: string;
 *     }
 *
 *   The difference: Java classes exist at runtime (you can create instances).
 *   TypeScript interfaces are ERASED at compile time — they only exist
 *   to help your IDE catch errors while you're coding.
 *
 * WHY USE INTERFACES INSTEAD OF `any`?
 *   With `any`:
 *     function BlogCard({ data }: { data: any }) {
 *       return <h2>{data.ttle}</h2>  // ← Typo! But NO error. Bug deployed.
 *     }
 *
 *   With interface:
 *     function BlogCard({ data }: { data: Entry }) {
 *       return <h2>{data.ttle}</h2>  // ← RED UNDERLINE! "Property 'ttle' does not exist"
 *     }
 *
 *   Interfaces catch bugs BEFORE they reach production.
 *   They also give you autocomplete — type "data." and see all fields.
 *
 * WHY A SEPARATE types.ts FILE?
 *   1. One place to find all type definitions
 *   2. Multiple components can import the same types
 *   3. When the API changes shape, you update ONE file
 *   4. It's a contract between frontend and backend
 */

// ── Entry Type ───────────────────────────────────────────────
// Represents a single item in the vault (blog, tweet, movie, link).
// This matches EXACTLY what the backend's /list endpoint returns.
//
// When you see `entry: Entry` in a component, you know the exact
// shape of the data. No guessing, no runtime surprises.
export interface Entry {
  /** The URL of the saved content */
  url: string;

  /** The page title (extracted from <title> tag during scraping) */
  title: string;

  /** When this entry was added to the vault (format: "2026-04-11") */
  date: string;

  /**
   * The domain name of the source (e.g., "blog.example.com").
   * Extracted by the backend: url.split("/")[2]
   */
  source: string;

  /**
   * The type of content. Currently always "blog" since we
   * haven't implemented type detection yet.
   * Future values: "tweet", "movie", "link"
   */
  type: "blog" | "tweet" | "movie" | "link";

  /** A short text preview. Currently empty — could be added later. */
  excerpt: string;

  /** Optional fields for specific card types */
  author?: string;
  year?: string;
  duration?: string;
  featured?: boolean;
}

// ── Source Type ───────────────────────────────────────────────
// Represents a source reference returned with AI answers.
// When Jarvis answers a question, it also tells you WHERE
// the answer came from (which URLs were used as context).
export interface Source {
  /** The URL of the source document */
  url: string;

  /** The title of the source page */
  title: string;

  /** When this source was added to the vault */
  fed_at: string;
}

// ── API Response Types ───────────────────────────────────────
// These match the exact JSON shape returned by the backend.
//
// WHAT IS A GENERIC TYPE?
//   ApiResponse<T> is a "template" — T can be any type.
//   ApiResponse<Entry[]> → successful response containing Entry array
//   ApiResponse<string>  → successful response containing a string message
//
//   In Java, this would be:
//     public class ApiResponse<T> {
//       private String status;
//       private T data;
//       private String message;
//     }

/** Response from /list endpoint */
export interface ListResponse {
  status: string;
  entries: Entry[];
}

/** Response from /feed endpoint */
export interface FeedResponse {
  status: string;
  message: string;
  chunks_count: number;
}

/** Response from /query endpoint */
export interface QueryResponse {
  status: string;
  answer: string;
  sources: Source[];
  message?: string;
}

/** Response from /delete endpoint */
export interface DeleteResponse {
  status: string;
  message: string;
}

/** Response from /health endpoint */
export interface HealthResponse {
  status: string;
  database: string;
  entries_count: number;
}

// ── Chat Types ───────────────────────────────────────────────
// Used by the chat page to track conversation messages.

export interface ChatMessage {
  /** Who sent this message */
  role: "user" | "bot";

  /** The message text */
  content: string;

  /** Source references (only for bot messages) */
  sources?: Source[];
}
