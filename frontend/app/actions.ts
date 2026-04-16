/**
 * actions.ts — Server Actions
 * =============================
 *
 * WHAT ARE SERVER ACTIONS?
 *   Server Actions are functions that run on the SERVER but can be
 *   CALLED from Client Components. They are Next.js's native way
 *   to handle form submissions and data mutations.
 *
 *   Think of it like an invisible API endpoint:
 *   1. You write a function here with "use server"
 *   2. Next.js creates an HTTP endpoint for it automatically
 *   3. Your client component calls the function
 *   4. Under the hood, the browser sends a POST request to Next.js server
 *   5. Next.js server runs the function and returns the result
 *   6. The client component gets the result
 *
 *   The function body NEVER runs in the browser. The browser only gets
 *   a tiny "stub" that sends the request.
 *
 * WHY USE SERVER ACTIONS INSTEAD OF CALLING THE API DIRECTLY?
 *
 *   Current approach (FeedForm calling fetch directly):
 *     Browser → POST http://localhost:8000/feed → Backend
 *     ❌ Backend URL is exposed in browser JavaScript
 *     ❌ Can't use environment variables (they'd be public)
 *     ❌ Can't revalidate cached data
 *     ❌ Requires CORS setup
 *
 *   Server Action approach:
 *     Browser → POST /next-internal-action → Next.js Server → Backend
 *     ✅ Backend URL is hidden (only on Next.js server)
 *     ✅ Can use server-only env vars
 *     ✅ Can call revalidatePath() to refresh data
 *     ✅ No CORS needed (same origin)
 *
 *   In Spring Boot terms, Server Actions are like having a BFF
 *   (Backend for Frontend) layer that proxies requests.
 *
 * WHAT IS revalidatePath()?
 *   When EntriesGrid (Server Component) fetches data, Next.js
 *   caches the result. After you feed a new URL, the grid won't
 *   update because it's showing cached data.
 *
 *   revalidatePath("/") says: "Hey Next.js, the data for the '/'
 *   route has changed. Throw away the cache and refetch."
 *
 *   Next time someone visits "/", EntriesGrid fetches fresh data.
 *
 *   In Spring Boot + Redis, this would be like:
 *     @CacheEvict(value = "entries", allEntries = true)
 */

"use server";

import { revalidatePath } from "next/cache";
import { feedUrl as apiFeedUrl, deleteUrl as apiDeleteUrl } from "./lib/api";

// ── Types for Server Action Results ──────────────────────────
// Server Actions should return a simple object indicating
// success or failure. The client component uses this to
// show appropriate feedback to the user.
//
// WHY NOT JUST THROW ERRORS?
//   If a Server Action throws an error, Next.js shows the ugly
//   default error page. Instead, we catch errors and return
//   a structured result that the component can handle gracefully.

interface ActionResult {
  success: boolean;
  message: string;
}

/**
 * Server Action: Feed a URL into the vault.
 *
 * Called by FeedForm when the user submits a URL.
 *
 * @param url - The URL to feed
 * @returns ActionResult with success status and message
 *
 * FLOW:
 *   1. FeedForm (client) calls feedUrlAction("https://...")
 *   2. Browser sends POST to Next.js server (not to backend!)
 *   3. Next.js server runs THIS function
 *   4. This function calls the backend API via lib/api.ts
 *   5. On success, revalidatePath("/") clears the cache
 *   6. FeedForm receives { success: true, message: "..." }
 *   7. FeedForm shows success message and clears the input
 *   8. EntriesGrid automatically refetches because cache was cleared
 */
export async function feedUrlAction(url: string): Promise<ActionResult> {
  try {
    const result = await apiFeedUrl(url);

    // Invalidate the cache for the home page so EntriesGrid refetches.
    // Without this, the user would have to refresh the page to see
    // their newly added entry.
    revalidatePath("/");

    return {
      success: true,
      message: result.message,
    };
  } catch (error) {
    // Return the error as a result instead of throwing.
    // This way the client component can show a nice error message
    // instead of the ugly default error page.
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to feed URL. Is the backend running?",
    };
  }
}

/**
 * Server Action: Delete a URL from the vault.
 *
 * Called by DeleteButton when the user clicks the × button on a card.
 *
 * @param url - The URL to delete
 * @returns ActionResult with success status and message
 *
 * FLOW:
 *   1. DeleteButton (client) calls deleteUrlAction("https://...")
 *   2. Same flow as feedUrlAction, but calls DELETE endpoint
 *   3. On success, revalidatePath("/") clears the cache
 *   4. The card disappears from the grid on next render
 */
export async function deleteUrlAction(url: string): Promise<ActionResult> {
  try {
    const result = await apiDeleteUrl(url);
    revalidatePath("/");
    return {
      success: true,
      message: result.message,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to delete entry. Please try again.",
    };
  }
}
