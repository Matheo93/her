"use client";

/**
 * Conversation List - Sprint 594
 *
 * Display conversation history with:
 * - Session grouping by date
 * - Preview of last message
 * - Delete/export actions
 * - Search/filter
 * - HER-themed styling
 */

import React, { memo, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface Conversation {
  id: string;
  title?: string;
  lastMessage: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  emotion?: string;
}

interface ConversationListProps {
  /** List of conversations */
  conversations: Conversation[];
  /** Currently selected conversation ID */
  selectedId?: string;
  /** Callback when conversation selected */
  onSelect?: (id: string) => void;
  /** Callback when conversation deleted */
  onDelete?: (id: string) => void;
  /** Callback when conversation exported */
  onExport?: (id: string) => void;
  /** Whether list is loading */
  isLoading?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Format relative time
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) {
    return new Date(timestamp).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
    });
  }
  if (days > 0) return `Il y a ${days}j`;
  if (hours > 0) return `Il y a ${hours}h`;
  if (minutes > 0) return `Il y a ${minutes}m`;
  return "À l'instant";
}

/**
 * Group conversations by date
 */
function groupByDate(conversations: Conversation[]): Map<string, Conversation[]> {
  const groups = new Map<string, Conversation[]>();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const weekAgo = today - 7 * 86400000;

  for (const conv of conversations) {
    let group: string;
    if (conv.updatedAt >= today) {
      group = "Aujourd'hui";
    } else if (conv.updatedAt >= yesterday) {
      group = "Hier";
    } else if (conv.updatedAt >= weekAgo) {
      group = "Cette semaine";
    } else {
      group = "Plus ancien";
    }

    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group)!.push(conv);
  }

  return groups;
}

/**
 * Icons
 */
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const ExportIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const MessageIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

/**
 * Single Conversation Item
 */
const ConversationItem = memo(function ConversationItem({
  conversation,
  isSelected,
  onSelect,
  onDelete,
  onExport,
  colors,
}: {
  conversation: Conversation;
  isSelected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  onExport?: () => void;
  colors: any;
}) {
  const [showActions, setShowActions] = useState(false);

  const title = conversation.title || `Conversation ${conversation.id.slice(0, 8)}`;
  const preview = conversation.lastMessage.length > 50
    ? conversation.lastMessage.slice(0, 50) + "..."
    : conversation.lastMessage;

  return (
    <motion.div
      className="relative group"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
    >
      <motion.button
        className="w-full text-left p-3 rounded-xl transition-colors"
        style={{
          backgroundColor: isSelected ? `${colors.coral}15` : "transparent",
          borderLeft: isSelected ? `3px solid ${colors.coral}` : "3px solid transparent",
        }}
        onClick={onSelect}
        whileHover={{ backgroundColor: `${colors.cream}` }}
        whileTap={{ scale: 0.98 }}
      >
        {/* Title row */}
        <div className="flex items-center justify-between mb-1">
          <span
            className="text-sm font-medium truncate"
            style={{ color: colors.textPrimary }}
          >
            {title}
          </span>
          <span
            className="text-xs flex-shrink-0 ml-2"
            style={{ color: colors.textMuted }}
          >
            {formatRelativeTime(conversation.updatedAt)}
          </span>
        </div>

        {/* Preview */}
        <p
          className="text-xs truncate"
          style={{ color: colors.textSecondary }}
        >
          {preview}
        </p>

        {/* Message count */}
        <div
          className="flex items-center gap-1 mt-1"
          style={{ color: colors.textMuted }}
        >
          <MessageIcon />
          <span className="text-xs">{conversation.messageCount} messages</span>
        </div>
      </motion.button>

      {/* Action buttons */}
      <AnimatePresence>
        {showActions && (onDelete || onExport) && (
          <motion.div
            className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
          >
            {onExport && (
              <motion.button
                className="p-1.5 rounded-lg"
                style={{
                  backgroundColor: colors.warmWhite,
                  color: colors.textSecondary,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onExport();
                }}
                whileHover={{ scale: 1.1, color: colors.coral }}
                whileTap={{ scale: 0.9 }}
                title="Exporter"
              >
                <ExportIcon />
              </motion.button>
            )}
            {onDelete && (
              <motion.button
                className="p-1.5 rounded-lg"
                style={{
                  backgroundColor: colors.warmWhite,
                  color: colors.textSecondary,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                whileHover={{ scale: 1.1, color: colors.error }}
                whileTap={{ scale: 0.9 }}
                title="Supprimer"
              >
                <TrashIcon />
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

/**
 * Loading skeleton
 */
const LoadingSkeleton = memo(function LoadingSkeleton({ colors }: { colors: any }) {
  return (
    <div className="space-y-2 p-2">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="p-3 rounded-xl animate-pulse"
          style={{ backgroundColor: colors.cream }}
        >
          <div
            className="h-4 rounded w-3/4 mb-2"
            style={{ backgroundColor: colors.warmWhite }}
          />
          <div
            className="h-3 rounded w-full"
            style={{ backgroundColor: colors.warmWhite }}
          />
        </div>
      ))}
    </div>
  );
});

/**
 * Empty state
 */
const EmptyState = memo(function EmptyState({ colors }: { colors: any }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: `${colors.coral}15` }}
      >
        <MessageIcon />
      </div>
      <p className="text-sm" style={{ color: colors.textSecondary }}>
        Pas encore de conversations
      </p>
      <p className="text-xs mt-1" style={{ color: colors.textMuted }}>
        Commencez à discuter avec EVA
      </p>
    </div>
  );
});

/**
 * Main Conversation List
 */
export const ConversationList = memo(function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onDelete,
  onExport,
  isLoading = false,
  className = "",
}: ConversationListProps) {
  const { colors } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");

  // Filter conversations
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;

    const query = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        c.title?.toLowerCase().includes(query) ||
        c.lastMessage.toLowerCase().includes(query)
    );
  }, [conversations, searchQuery]);

  // Group by date
  const groupedConversations = useMemo(
    () => groupByDate(filteredConversations),
    [filteredConversations]
  );

  if (isLoading) {
    return (
      <div className={className}>
        <LoadingSkeleton colors={colors} />
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Search */}
      <div className="p-3 border-b" style={{ borderColor: colors.cream }}>
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ backgroundColor: colors.cream }}
        >
          <SearchIcon />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher..."
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: colors.textPrimary }}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2">
        {filteredConversations.length === 0 ? (
          <EmptyState colors={colors} />
        ) : (
          <div className="space-y-4">
            {Array.from(groupedConversations.entries()).map(([group, convs]) => (
              <div key={group}>
                {/* Group header */}
                <div
                  className="text-xs font-medium px-2 py-1 sticky top-0"
                  style={{
                    color: colors.textMuted,
                    backgroundColor: colors.warmWhite,
                  }}
                >
                  {group}
                </div>

                {/* Conversations */}
                <div className="space-y-1">
                  <AnimatePresence>
                    {convs.map((conv) => (
                      <ConversationItem
                        key={conv.id}
                        conversation={conv}
                        isSelected={conv.id === selectedId}
                        onSelect={() => onSelect?.(conv.id)}
                        onDelete={onDelete ? () => onDelete(conv.id) : undefined}
                        onExport={onExport ? () => onExport(conv.id) : undefined}
                        colors={colors}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export default ConversationList;
