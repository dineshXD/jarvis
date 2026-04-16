/**
 * Chat Page — Ask Your Vault (Client Component)
 * ================================================
 *
 * UPDATED WITH:
 * 1. Chat history persistence (localStorage via chat-storage.ts)
 * 2. Conversation switching (load previous conversations)
 * 3. "New chat" button
 * 4. Search modal (Ctrl+K or button to open)
 * 5. Auto-save after every message
 *
 * HOW PERSISTENCE WORKS:
 *   1. On page load: Create a new conversation or load the most recent one
 *   2. After each message: Save the conversation to localStorage
 *   3. When modal opens: Show all conversations from localStorage
 *   4. When user selects a conversation: Load its messages into state
 *   5. When user clicks "New chat": Clear messages, create new conversation
 *
 * KEYBOARD SHORTCUTS:
 *   Ctrl+K / Cmd+K → Open search modal (same as ChatGPT, VSCode)
 */
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import type { ChatMessage, Source } from "../lib/types";
import { chatStorage, type Conversation } from "../lib/chat-storage";
import { queryVaultAction } from "../actions-query";
import ChatSearchModal from "../components/ChatSearchModal";

/** The default welcome message shown at the start of every conversation. */
const WELCOME_MESSAGE: ChatMessage = {
  role: "bot",
  content:
    "Hello. I can answer questions about anything you've saved in your vault. What would you like to know?",
};

export default function Chat() {
  // ── State ──────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Track the current conversation for saving/loading
  const [currentConversation, setCurrentConversation] =
    useState<Conversation | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Initialize: Load most recent conversation ──────────────
  useEffect(() => {
    const conversations = chatStorage.listConversations();
    if (conversations.length > 0) {
      // Load the most recent conversation
      const latest = conversations[0];
      setCurrentConversation(latest);
      // If the conversation has messages, show them
      // Otherwise show the welcome message
      if (latest.messages.length > 0) {
        setMessages(latest.messages);
      }
    } else {
      // First time: create a new conversation
      const newConv = chatStorage.createConversation();
      setCurrentConversation(newConv);
    }
  }, []);

  // ── Auto-scroll to bottom on new messages ──────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Keyboard shortcut: Ctrl+K to open search modal ─────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault(); // Prevent browser's default Ctrl+K behavior
        setIsModalOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ── Save conversation after messages change ────────────────
  // We use useCallback to memoize this so it doesn't cause
  // infinite re-renders when used in useEffect.
  const saveCurrentConversation = useCallback(
    (msgs: ChatMessage[]) => {
      if (!currentConversation) return;
      // Don't save if only the welcome message exists
      const hasUserMessages = msgs.some((m) => m.role === "user");
      if (!hasUserMessages) return;

      const updated: Conversation = {
        ...currentConversation,
        messages: msgs,
        updatedAt: Date.now(),
      };
      chatStorage.saveConversation(updated);
      setCurrentConversation(updated);
    },
    [currentConversation]
  );

  // ── Handle message submission ──────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userQuestion = input.trim();
    const userMsg: ChatMessage = { role: "user", content: userQuestion };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    // Save immediately with user message
    saveCurrentConversation(newMessages);

    try {
      const result = await queryVaultAction(userQuestion);
      const botMsg: ChatMessage = result.success
        ? { role: "bot", content: result.answer, sources: result.sources }
        : {
            role: "bot",
            content:
              result.message || "Sorry, something went wrong. Please try again.",
          };

      const finalMessages = [...newMessages, botMsg];
      setMessages(finalMessages);
      // Save again with bot response
      saveCurrentConversation(finalMessages);
    } catch {
      const errorMsg: ChatMessage = {
        role: "bot",
        content: "Unable to connect to the server. Make sure the backend is running.",
      };
      const finalMessages = [...newMessages, errorMsg];
      setMessages(finalMessages);
      saveCurrentConversation(finalMessages);
    } finally {
      setIsLoading(false);
    }
  }

  // ── Handle "New Chat" ──────────────────────────────────────
  function handleNewChat() {
    const newConv = chatStorage.createConversation();
    setCurrentConversation(newConv);
    setMessages([WELCOME_MESSAGE]);
  }

  // ── Handle conversation selection from modal ───────────────
  function handleSelectConversation(conv: Conversation) {
    setCurrentConversation(conv);
    setMessages(
      conv.messages.length > 0 ? conv.messages : [WELCOME_MESSAGE]
    );
  }

  return (
    <div className="chat-container">
      <header className="chat-header">
        <h1>Ask your vault</h1>
        <div className="chat-header-actions">
          <button
            className="chat-history-btn"
            onClick={handleNewChat}
            title="New chat"
          >
            ✎ New
          </button>
          <button
            className="chat-history-btn"
            onClick={() => setIsModalOpen(true)}
            title="Search chats (Ctrl+K)"
          >
            ⌕ History
          </button>
        </div>
      </header>

      <div className="chat-messages">
        {messages.map((msg, index) => (
          <div key={index} className={`chat-message ${msg.role}`}>
            <div className="message-content">{msg.content}</div>

            {msg.role === "bot" && msg.sources && msg.sources.length > 0 && (
              <div className="message-sources">
                <div className="sources-label">Sources</div>
                {msg.sources.map((source: Source, sIdx: number) => {
                  let displayName = source.url;
                  try {
                    displayName = new URL(source.url).hostname;
                  } catch {
                    // Use raw URL if parsing fails
                  }

                  return (
                    <Link
                      key={sIdx}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="source-link"
                    >
                      {displayName}
                      {source.fed_at ? ` — ${source.fed_at}` : ""}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="chat-message bot">
            <div className="message-content message-loading">
              <span className="loading-dot" />
              <span className="loading-dot" />
              <span className="loading-dot" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="chat-input-area">
        <form className="chat-input-group" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Ask a question..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="chat-input"
            disabled={isLoading}
          />
          <button
            type="submit"
            className="chat-send"
            disabled={isLoading || !input.trim()}
          >
            {isLoading ? "..." : "Ask"}
          </button>
        </form>
      </div>

      {/* Search Modal */}
      <ChatSearchModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        activeConversationId={currentConversation?.id}
      />
    </div>
  );
}
