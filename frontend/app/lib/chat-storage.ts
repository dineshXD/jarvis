/**
 * chat-storage.ts — Chat History Persistence Layer
 * ===================================================
 *
 * WHAT IS THIS?
 *   This module handles saving, loading, and searching chat conversations.
 *   Currently uses localStorage (browser storage), but designed with
 *   the Strategy Pattern so you can swap to a backend API later.
 *
 * SYSTEM DESIGN — WHY localStorage?
 *   We evaluated 4 options (see implementation_plan.md):
 *   1. localStorage — simple, zero backend changes, 5-10MB limit
 *   2. IndexedDB — async, larger storage, complex API
 *   3. Backend DB — unlimited, cross-device, needs API + auth
 *   4. ChromaDB — wrong tool (vector DB, not general storage)
 *
 *   For a personal tool with small data, localStorage is the right choice.
 *   The code is structured so switching to a backend is easy later.
 *
 * THE STRATEGY PATTERN:
 *   We define WHAT operations we need (save, load, search, delete),
 *   then implement HOW using localStorage. If you later want a backend:
 *
 *   TODAY:    ChatStorage → uses localStorage
 *   TOMORROW: ChatStorage → uses fetch("http://api/conversations")
 *
 *   The chat page doesn't care which one it uses — it just calls
 *   chatStorage.save(conversation). The implementation is swappable.
 *
 *   In Spring Boot, this would be:
 *     interface ChatRepository { void save(Conversation c); }
 *     class LocalChatRepository implements ChatRepository { ... }
 *     class JpaChatRepository implements ChatRepository { ... }
 *     @Qualifier("local") @Autowired ChatRepository repo;
 *
 * WHAT IS localStorage?
 *   A key-value store in the browser. Data persists across page reloads
 *   and browser restarts, but is cleared when the user clears browser data.
 *
 *   API:
 *     localStorage.setItem("key", "value")  // save
 *     localStorage.getItem("key")           // load → "value" or null
 *     localStorage.removeItem("key")        // delete
 *
 *   Limitations:
 *   - Only stores strings (must JSON.stringify objects)
 *   - 5-10MB per origin (plenty for chat history)
 *   - Synchronous API (blocks main thread, but fine for small data)
 *   - Same-origin only (can't access from different domains)
 */

// ── Types ────────────────────────────────────────────────────

import type { ChatMessage } from "./types";

/**
 * A single chat conversation.
 *
 * Each conversation has:
 * - A unique ID (UUID) for identification
 * - A title (auto-generated from the first user message)
 * - An array of messages (user + bot)
 * - Timestamps for sorting and grouping
 */
export interface Conversation {
  /** Unique identifier (UUID v4) */
  id: string;

  /** Title — auto-generated from first user message, truncated to 50 chars */
  title: string;

  /** All messages in this conversation */
  messages: ChatMessage[];

  /** When this conversation was created (Unix timestamp in ms) */
  createdAt: number;

  /** When the last message was added (Unix timestamp in ms) */
  updatedAt: number;
}

/**
 * Conversations grouped by time period for display.
 * Matches the ChatGPT-style grouping: "Previous 7 Days", "Previous 30 Days", "Older"
 */
export interface GroupedConversations {
  label: string;
  conversations: Conversation[];
}

// ── Constants ────────────────────────────────────────────────

/** localStorage key where all conversations are stored */
const STORAGE_KEY = "jarvis_chat_history";

/** Maximum conversations to keep (auto-delete oldest when exceeded) */
const MAX_CONVERSATIONS = 100;

// ── Helper Functions ─────────────────────────────────────────

/**
 * Generate a UUID v4.
 *
 * WHY NOT JUST USE Date.now()?
 *   Date.now() returns milliseconds since epoch. If two conversations
 *   are created in the same millisecond (unlikely but possible),
 *   they'd have the same ID → data corruption.
 *
 *   UUID v4 uses random bytes → collision probability is astronomically low.
 *   crypto.randomUUID() is available in all modern browsers.
 */
function generateId(): string {
  // crypto.randomUUID() is the modern way.
  // Fallback for older environments.
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: simple random string
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Generate a conversation title from the first user message.
 * Truncates to 50 characters and adds "..." if longer.
 *
 * ChatGPT does the same thing — the sidebar title is derived
 * from your first message.
 */
function generateTitle(firstMessage: string): string {
  const cleaned = firstMessage.trim();
  if (cleaned.length <= 50) return cleaned;
  return cleaned.substring(0, 47) + "...";
}

// ── ChatStorage Class ────────────────────────────────────────

/**
 * Chat history persistence using localStorage.
 *
 * All methods are synchronous (localStorage is sync),
 * but the interface uses the same method signatures you'd
 * use with an async API — making migration to backend easy.
 *
 * USAGE:
 *   import { chatStorage } from "./chat-storage";
 *   const convos = chatStorage.listConversations();
 *   chatStorage.saveConversation(convo);
 */
class ChatStorage {
  /**
   * Load all conversations from localStorage.
   * Returns an empty array if nothing is stored.
   */
  private loadAll(): Conversation[] {
    if (typeof window === "undefined") return []; // SSR guard
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as Conversation[];
    } catch {
      // If JSON is corrupted, start fresh rather than crashing
      console.error("Failed to parse chat history, resetting...");
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }
  }

  /**
   * Save all conversations to localStorage.
   * Enforces the MAX_CONVERSATIONS limit by removing oldest.
   */
  private saveAll(conversations: Conversation[]): void {
    if (typeof window === "undefined") return; // SSR guard
    // Sort by most recent first
    conversations.sort((a, b) => b.updatedAt - a.updatedAt);
    // Trim to max limit
    const trimmed = conversations.slice(0, MAX_CONVERSATIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  }

  /**
   * List all conversations, sorted by most recent first.
   */
  listConversations(): Conversation[] {
    return this.loadAll().sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Get a single conversation by ID.
   * Returns null if not found.
   */
  getConversation(id: string): Conversation | null {
    const all = this.loadAll();
    return all.find((c) => c.id === id) || null;
  }

  /**
   * Create a new empty conversation.
   * Returns the created conversation with a generated ID.
   */
  createConversation(): Conversation {
    const now = Date.now();
    const conversation: Conversation = {
      id: generateId(),
      title: "New chat",
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    const all = this.loadAll();
    all.push(conversation);
    this.saveAll(all);
    return conversation;
  }

  /**
   * Save (create or update) a conversation.
   *
   * If the conversation already exists (same ID), it's replaced.
   * If it's new, it's added to the list.
   *
   * Auto-generates the title from the first user message
   * if the title is still "New chat".
   */
  saveConversation(conversation: Conversation): void {
    // Auto-generate title from first user message
    if (conversation.title === "New chat") {
      const firstUserMsg = conversation.messages.find((m) => m.role === "user");
      if (firstUserMsg) {
        conversation.title = generateTitle(firstUserMsg.content);
      }
    }

    conversation.updatedAt = Date.now();

    const all = this.loadAll();
    const existingIndex = all.findIndex((c) => c.id === conversation.id);
    if (existingIndex >= 0) {
      all[existingIndex] = conversation;
    } else {
      all.push(conversation);
    }
    this.saveAll(all);
  }

  /**
   * Delete a conversation by ID.
   */
  deleteConversation(id: string): void {
    const all = this.loadAll();
    const filtered = all.filter((c) => c.id !== id);
    this.saveAll(filtered);
  }

  /**
   * Search conversations by title or message content.
   * Case-insensitive substring search.
   *
   * This is O(n*m) where n=conversations, m=messages per conversation.
   * Fine for 100 conversations. For 10,000+ you'd need full-text search
   * (like PostgreSQL tsvector or Elasticsearch).
   */
  searchConversations(query: string): Conversation[] {
    if (!query.trim()) return this.listConversations();

    const q = query.trim().toLowerCase();
    const all = this.loadAll();

    return all.filter((conv) => {
      // Search in title
      if (conv.title.toLowerCase().includes(q)) return true;
      // Search in messages
      return conv.messages.some((msg) =>
        msg.content.toLowerCase().includes(q)
      );
    }).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Group conversations by time period.
   * Returns groups like "Today", "Previous 7 Days", "Previous 30 Days", "Older".
   *
   * This matches the ChatGPT sidebar grouping pattern.
   */
  getGroupedConversations(): GroupedConversations[] {
    const all = this.listConversations();
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const sevenDays = 7 * oneDay;
    const thirtyDays = 30 * oneDay;

    const groups: Record<string, Conversation[]> = {
      Today: [],
      "Previous 7 Days": [],
      "Previous 30 Days": [],
      Older: [],
    };

    for (const conv of all) {
      const age = now - conv.updatedAt;
      if (age < oneDay) {
        groups["Today"].push(conv);
      } else if (age < sevenDays) {
        groups["Previous 7 Days"].push(conv);
      } else if (age < thirtyDays) {
        groups["Previous 30 Days"].push(conv);
      } else {
        groups["Older"].push(conv);
      }
    }

    // Only return groups that have conversations
    return Object.entries(groups)
      .filter(([, convos]) => convos.length > 0)
      .map(([label, conversations]) => ({ label, conversations }));
  }
}

// ── Singleton Export ──────────────────────────────────────────
// One instance for the entire app.
// Usage: import { chatStorage } from "./chat-storage";
export const chatStorage = new ChatStorage();
