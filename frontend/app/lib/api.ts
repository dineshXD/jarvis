/**
 * api.ts — Centralized API Layer
 * ================================
 *
 * WHAT IS AN "API LAYER"?
 *   Right now, API calls are scattered across components:
 *   - EntriesGrid.tsx has `fetch("http://localhost:8000/list")`
 *   - FeedForm.tsx has `fetch("http://localhost:8000/feed")`
 *   - Chat page has mock data
 *
 *   Problems:
 *   1. URL "http://localhost:8000" is hardcoded in 3 places
 *   2. Each component handles errors differently (or not at all)
 *   3. If you add auth headers, you'd add them in 3 places
 *   4. No single place to see "what API calls does our app make?"
 *
 *   Solution: Put ALL API calls in ONE file (this one).
 *   Every component imports from here instead of calling fetch directly.
 *
 *   In Spring Boot, this would be a @Service class that wraps RestTemplate calls.
 *   In Android, this would be a Retrofit interface.
 *   In Angular, this would be a service with HttpClient.
 *
 * HOW ENVIRONMENT VARIABLES WORK IN NEXT.JS:
 *   Next.js has TWO types of env vars:
 *
 *   1. Server-only (no prefix):
 *      API_URL=http://localhost:8000
 *      → Only accessible in Server Components and Server Actions
 *      → NEVER shipped to the browser
 *      → Safe for secrets (API keys, DB passwords, etc.)
 *
 *   2. Public (NEXT_PUBLIC_ prefix):
 *      NEXT_PUBLIC_API_URL=http://localhost:8000
 *      → Inlined into the JavaScript bundle
 *      → Visible in browser DevTools
 *      → NEVER put secrets here!
 *
 *   We use server-only API_URL because all our API calls happen in
 *   Server Components or Server Actions — the browser never calls
 *   the backend directly. This is more secure.
 */

import type {
  ListResponse,
  FeedResponse,
  QueryResponse,
  DeleteResponse,
  Entry,
  HealthResponse,
} from "./types";

// ── API Base URL ─────────────────────────────────────────────
// process.env.API_URL reads from .env.local file.
// Falls back to localhost:8000 for development.
//
// In Spring Boot, this would be:
//   @Value("${api.url:http://localhost:8000}")
//   private String apiUrl;
const API_BASE = process.env.API_URL || "http://127.0.0.1:8000";

/**
 * Internal helper: Make an API request with error handling.
 *
 * WHY A HELPER FUNCTION?
 *   Without this, every API function repeats the same error handling:
 *     const res = await fetch(...)
 *     if (!res.ok) throw new Error(...)
 *     return await res.json()
 *
 *   With this helper, each API function is just 3-4 lines.
 *   DRY = Don't Repeat Yourself.
 *
 * WHAT DOES THE GENERIC <T> DO?
 *   It says "this function returns a Promise that resolves to type T".
 *   When you call apiRequest<ListResponse>(...), TypeScript knows
 *   the return value is a ListResponse, giving you autocomplete
 *   and error checking.
 *
 *   In Java, this would be:
 *     public <T> T apiRequest(String path, Class<T> responseType) { ... }
 */
async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  // Merge default options with provided options.
  // The spread operator { ...a, ...b } combines objects.
  // Later properties override earlier ones.
  const config: RequestInit = {
    headers: {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    },
    // cache: "no-store" tells Next.js: "Don't cache this request,
    // always fetch fresh data from the backend."
    //
    // Without this, Next.js might serve stale data because it
    // aggressively caches fetch() calls in Server Components.
    //
    // Other options:
    //   "force-cache" → cache forever (good for static data)
    //   "no-store" → never cache (good for dynamic data)
    //   { next: { revalidate: 60 } } → cache for 60 seconds
    cache: "no-store" as RequestCache,
    ...options,
  };

  // ── Make the request ─────────────────────────────────────
  const res = await fetch(`${API_BASE}${path}`, config);

  // ── Handle HTTP errors ───────────────────────────────────
  // res.ok is true for status codes 200-299.
  // For 400, 404, 409, 500, etc., res.ok is false.
  if (!res.ok) {
    // Try to extract the error message from the JSON body.
    // Our backend always returns {"status": "error", "message": "..."}.
    let errorMessage = `API Error: ${res.status} ${res.statusText}`;
    try {
      const errorData = await res.json();
      if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch {
      // If response body isn't JSON, use the default error message.
      // This happens when the backend is completely crashed and
      // returns an HTML error page instead of JSON.
    }

    throw new Error(errorMessage);
  }

  // ── Parse and return the JSON response ───────────────────
  return (await res.json()) as T;
}

// ══════════════════════════════════════════════════════════════
// PUBLIC API FUNCTIONS
// ══════════════════════════════════════════════════════════════
// These are the functions that components import and use.
// Each function is a clean, typed wrapper around apiRequest.

/**
 * Fetch all entries from the vault.
 * Used by EntriesGrid (Server Component) to display the card grid.
 *
 * Returns an empty array if the fetch fails, so the UI always
 * has something to render (graceful degradation).
 */
export async function getEntries(): Promise<Entry[]> {
  // We don't try/catch here — let the error propagate up to
  // the Server Component, which will be caught by error.tsx.
  // This is the "let it crash" pattern — errors bubble up to
  // the nearest error boundary.
  const data = await apiRequest<ListResponse>("/list");
  return data.entries || [];
}

/**
 * Feed a new URL into the vault.
 * Used by the feedUrl Server Action.
 *
 * @param url - The URL to scrape and store
 * @returns The feed result with status and chunk count
 */
export async function feedUrl(url: string): Promise<FeedResponse> {
  return apiRequest<FeedResponse>("/feed", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

/**
 * Delete a URL from the vault.
 * Used by the deleteUrl Server Action.
 *
 * @param url - The URL to delete
 * @returns The deletion result with status message
 */
export async function deleteUrl(url: string): Promise<DeleteResponse> {
  return apiRequest<DeleteResponse>(`/delete?url=${encodeURIComponent(url)}`, {
    method: "DELETE",
  });
}

/**
 * Ask Jarvis a question about your vault content.
 * Used by the chat page.
 *
 * @param question - The question to ask
 * @returns The AI-generated answer with source references
 *
 * encodeURIComponent() converts special characters in the question
 * to URL-safe format:
 *   "What is C++?" → "What%20is%20C%2B%2B%3F"
 *
 * Without this, special characters like ?, &, #, + would break
 * the URL parsing because they have special meaning in URLs:
 *   ? = start of query parameters
 *   & = separator between parameters
 *   # = fragment identifier
 */
export async function askJarvis(question: string): Promise<QueryResponse> {
  return apiRequest<QueryResponse>(
    `/query?question=${encodeURIComponent(question)}`,
  );
}

/**
 * Check if the backend API is running and healthy.
 * Can be used by the frontend to show a connection status indicator.
 *
 * @returns Health status with database info and entry count
 */
export async function checkHealth(): Promise<HealthResponse> {
  return apiRequest<HealthResponse>("/health");
}
