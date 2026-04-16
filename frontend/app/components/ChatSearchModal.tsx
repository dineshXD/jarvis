/**
 * ChatSearchModal.tsx — Chat History Search Modal
 * ==================================================
 *
 * A centered overlay modal (like ChatGPT's search) that shows:
 * - Search input at the top
 * - "New chat" button
 * - Conversation list grouped by time period
 * - Click to load a conversation
 * - Delete (×) button on each conversation
 *
 * Triggered by:
 * - Button in the chat header
 * - Ctrl+K / Cmd+K keyboard shortcut
 *
 * WHY "use client"?
 *   1. useState for search input
 *   2. useEffect for keyboard shortcut listener
 *   3. onClick handlers for conversation selection
 *   4. Refs for focus management
 */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  chatStorage,
  type Conversation,
  type GroupedConversations,
} from "../lib/chat-storage";

interface ChatSearchModalProps {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Callback when user selects a conversation */
  onSelectConversation: (conversation: Conversation) => void;
  /** Callback when user clicks "New chat" */
  onNewChat: () => void;
  /** ID of the currently active conversation (to highlight it) */
  activeConversationId?: string;
}

export default function ChatSearchModal({
  isOpen,
  onClose,
  onSelectConversation,
  onNewChat,
  activeConversationId,
}: ChatSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [groups, setGroups] = useState<GroupedConversations[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load conversations when modal opens or search changes
  const loadConversations = useCallback(() => {
    if (searchQuery.trim()) {
      // When searching, show flat list (no grouping)
      const results = chatStorage.searchConversations(searchQuery);
      if (results.length > 0) {
        setGroups([{ label: "Search Results", conversations: results }]);
      } else {
        setGroups([]);
      }
    } else {
      setGroups(chatStorage.getGroupedConversations());
    }
  }, [searchQuery]);

  useEffect(() => {
    if (isOpen) {
      loadConversations();
      // Focus the search input when modal opens
      // setTimeout because the modal needs to render first
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, loadConversations]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  function handleDelete(e: React.MouseEvent, convId: string) {
    e.stopPropagation(); // Don't trigger the conversation selection
    chatStorage.deleteConversation(convId);
    loadConversations(); // Refresh the list
  }

  function handleNewChat() {
    onNewChat();
    onClose();
    setSearchQuery("");
  }

  function handleSelect(conv: Conversation) {
    onSelectConversation(conv);
    onClose();
    setSearchQuery("");
  }

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop — clicking it closes the modal */}
      <div className="modal-backdrop" onClick={onClose} />

      {/* Modal */}
      <div className="modal-container">
        {/* Search Input */}
        <div className="modal-search">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="modal-search-input"
          />
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* Conversation List */}
        <div className="modal-list">
          {/* New Chat Button */}
          <button className="modal-new-chat" onClick={handleNewChat}>
            <span className="modal-new-chat-icon">✎</span>
            New chat
          </button>

          {/* Grouped Conversations */}
          {groups.map((group) => (
            <div key={group.label} className="modal-group">
              <div className="modal-group-label">{group.label}</div>
              {group.conversations.map((conv) => (
                <button
                  key={conv.id}
                  className={`modal-conversation ${
                    conv.id === activeConversationId ? "active" : ""
                  }`}
                  onClick={() => handleSelect(conv)}
                >
                  <span className="modal-conv-icon">○</span>
                  <span className="modal-conv-title">{conv.title}</span>
                  <span
                    className="modal-conv-delete"
                    onClick={(e) => handleDelete(e, conv.id)}
                    title="Delete conversation"
                  >
                    ×
                  </span>
                </button>
              ))}
            </div>
          ))}

          {/* Empty State */}
          {groups.length === 0 && (
            <div className="modal-empty">
              {searchQuery
                ? "No conversations found"
                : "No chat history yet"}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
