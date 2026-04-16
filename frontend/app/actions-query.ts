/**
 * actions-query.ts — Server Action for Chat Queries
 * ====================================================
 *
 * WHY A SEPARATE FILE FROM actions.ts?
 *   actions.ts handles vault mutations (feed, delete) that need revalidatePath.
 *   This file handles chat queries which don't modify any data.
 *
 *   Keeping them separate makes the code easier to navigate:
 *   - actions.ts → "things that change data"
 *   - actions-query.ts → "things that read data"
 *
 * WHY NOT JUST FETCH FROM THE CLIENT COMPONENT?
 *   Because the API_URL environment variable is server-only.
 *   Client Components can't access it. Server Actions CAN.
 *   So this action acts as a proxy:
 *
 *   Chat (browser) → queryVaultAction (Next.js server) → Backend API
 */

"use server";

import { askJarvis } from "./lib/api";
import type { Source } from "./lib/types";

interface QueryResult {
  success: boolean;
  answer: string;
  sources: Source[];
  message: string;
}

/**
 * Server Action: Ask a question about your vault content.
 *
 * @param question - The user's question
 * @returns QueryResult with the AI answer and sources
 */
export async function queryVaultAction(question: string): Promise<QueryResult> {
  try {
    const result = await askJarvis(question);
    return {
      success: true,
      answer: result.answer,
      sources: result.sources || [],
      message: "",
    };
  } catch (error) {
    return {
      success: false,
      answer: "",
      sources: [],
      message:
        error instanceof Error
          ? error.message
          : "Failed to query vault. Is the backend running?",
    };
  }
}
