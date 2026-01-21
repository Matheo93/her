"use client";

/**
 * useBackendMemory - Sync frontend memory with HER backend
 *
 * Fetches /her/memory/{user_id} to get context memories from the backend.
 * This allows EVA to remember conversations across sessions using the
 * server-side memory system instead of just localStorage.
 *
 * The backend memory includes:
 * - Conversation history
 * - User preferences learned
 * - Emotional patterns
 * - Important facts about the user
 */

import { useState, useEffect, useCallback, useRef } from "react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

// Memory item from backend
export interface MemoryItem {
  content: string;
  timestamp: number;
  type: "fact" | "preference" | "emotion" | "conversation";
  importance: number; // 0-1
  source?: string;
}

// Backend memory response
export interface BackendMemoryResponse {
  user_id: string;
  memories: MemoryItem[];
  context_summary?: string;
  last_interaction?: number;
  emotional_baseline?: {
    dominant_emotion: string;
    stability: number;
  };
}

// Hook state
export interface BackendMemoryState {
  // Loading state
  isLoading: boolean;
  error: string | null;
  lastFetched: Date | null;

  // Memory data
  memories: MemoryItem[];
  contextSummary: string | null;
  lastInteraction: Date | null;
  emotionalBaseline: {
    dominantEmotion: string;
    stability: number;
  } | null;

  // Methods
  fetchMemories: (query?: string) => Promise<void>;
  getRelevantMemories: (query: string) => Promise<MemoryItem[]>;
}

interface UseBackendMemoryOptions {
  userId: string;
  apiKey?: string;
  // Auto-fetch on mount (default: true)
  autoFetch?: boolean;
}

export function useBackendMemory({
  userId,
  apiKey,
  autoFetch = true,
}: UseBackendMemoryOptions): BackendMemoryState {
  // State
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [memoryData, setMemoryData] = useState<BackendMemoryResponse | null>(null);

  // Abort controller ref
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch memories from backend
  const fetchMemories = useCallback(async (query?: string) => {
    if (!userId) {
      setError("No user ID provided");
      return;
    }

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setIsLoading(true);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (apiKey) {
        headers["X-API-Key"] = apiKey;
      }

      const url = new URL(`${BACKEND_URL}/her/memory/${encodeURIComponent(userId)}`);
      if (query) {
        url.searchParams.set("query", query);
      }

      const response = await fetch(url.toString(), {
        method: "GET",
        headers,
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        if (response.status === 503) {
          // HER not available - this is expected when backend isn't fully initialized
          setMemoryData(null);
          setError(null);
          return;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: BackendMemoryResponse = await response.json();
      setMemoryData(data);
      setError(null);
      setLastFetched(new Date());
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }

      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [userId, apiKey]);

  // Get relevant memories for a specific query
  const getRelevantMemories = useCallback(async (query: string): Promise<MemoryItem[]> => {
    if (!userId) {
      return [];
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (apiKey) {
        headers["X-API-Key"] = apiKey;
      }

      const url = new URL(`${BACKEND_URL}/her/memory/${encodeURIComponent(userId)}`);
      url.searchParams.set("query", query);

      const response = await fetch(url.toString(), {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        return [];
      }

      const data: BackendMemoryResponse = await response.json();
      return data.memories || [];
    } catch {
      return [];
    }
  }, [userId, apiKey]);

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch && userId) {
      fetchMemories();
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [autoFetch, userId, fetchMemories]);

  // Compute derived state
  const memories = memoryData?.memories ?? [];
  const contextSummary = memoryData?.context_summary ?? null;
  const lastInteraction = memoryData?.last_interaction
    ? new Date(memoryData.last_interaction * 1000)
    : null;
  const emotionalBaseline = memoryData?.emotional_baseline
    ? {
        dominantEmotion: memoryData.emotional_baseline.dominant_emotion,
        stability: memoryData.emotional_baseline.stability,
      }
    : null;

  return {
    isLoading,
    error,
    lastFetched,
    memories,
    contextSummary,
    lastInteraction,
    emotionalBaseline,
    fetchMemories,
    getRelevantMemories,
  };
}

/**
 * Format a memory item for display
 */
export function formatMemoryItem(item: MemoryItem): string {
  const date = new Date(item.timestamp * 1000);
  const timeAgo = getTimeAgo(date);

  return `[${item.type}] ${item.content} (${timeAgo})`;
}

/**
 * Get human-readable time ago string
 */
function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}
