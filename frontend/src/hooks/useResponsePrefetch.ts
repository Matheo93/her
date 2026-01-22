"use client";

/**
 * useResponsePrefetch - Intelligent Response Prefetching
 *
 * Reduces perceived latency by prefetching common responses
 * and their TTS audio before the user sends a message.
 *
 * The hook monitors:
 * - User typing patterns to predict likely messages
 * - Time of day for greeting prefetch
 * - Session state for relevant responses
 *
 * Cache is stored in memory and auto-expires after 5 minutes.
 *
 * Sprint 127: Latency optimization
 */

import { useRef, useEffect, useCallback } from "react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

// Common greetings to prefetch based on time of day
const GREETING_PREFETCH: Record<string, string[]> = {
  morning: ["bonjour", "salut", "hey"],
  afternoon: ["salut", "coucou", "hey"],
  evening: ["bonsoir", "salut", "hey"],
  night: ["bonsoir", "salut"],
};

// Common short messages to prefetch
const COMMON_MESSAGES = [
  "ca va",
  "merci",
  "oui",
  "non",
  "ok",
];

interface CacheEntry {
  text: string;
  audio: ArrayBuffer;
  emotion: string;
  timestamp: number;
}

interface PrefetchState {
  cache: Map<string, CacheEntry>;
  pendingFetches: Set<string>;
  lastPrefetchTime: number;
}

interface UseResponsePrefetchOptions {
  enabled?: boolean;
  sessionId?: string;
  maxCacheSize?: number;
  cacheExpiry?: number; // ms
}

export interface ResponsePrefetchResult {
  // Get a cached response if available
  getCached: (message: string) => CacheEntry | null;

  // Manually prefetch specific messages
  prefetch: (messages: string[]) => Promise<void>;

  // Clear cache
  clearCache: () => void;

  // Cache stats
  cacheSize: number;
  hitRate: number;
}

export function useResponsePrefetch({
  enabled = true,
  sessionId = "default",
  maxCacheSize = 20,
  cacheExpiry = 5 * 60 * 1000, // 5 minutes
}: UseResponsePrefetchOptions = {}): ResponsePrefetchResult {
  const stateRef = useRef<PrefetchState>({
    cache: new Map(),
    pendingFetches: new Set(),
    lastPrefetchTime: 0,
  });

  const statsRef = useRef({ hits: 0, misses: 0 });

  // Normalize message for cache key
  const normalizeKey = useCallback((message: string): string => {
    return message.trim().toLowerCase().replace(/[!?.]+$/, "");
  }, []);

  // Get time of day
  const getTimeOfDay = useCallback((): string => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "morning";
    if (hour >= 12 && hour < 17) return "afternoon";
    if (hour >= 17 && hour < 21) return "evening";
    return "night";
  }, []);

  // Fetch and cache a response
  const fetchAndCache = useCallback(
    async (message: string): Promise<CacheEntry | null> => {
      const key = normalizeKey(message);
      const state = stateRef.current;

      // Skip if already fetching
      if (state.pendingFetches.has(key)) return null;

      state.pendingFetches.add(key);

      try {
        const response = await fetch(`${BACKEND_URL}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            session_id: sessionId,
            prefetch: true, // Signal backend this is a prefetch
          }),
        });

        if (!response.ok) {
          state.pendingFetches.delete(key);
          return null;
        }

        const data = await response.json();

        // If response has audio, cache it
        if (data.audio) {
          // Decode base64 audio
          const binaryString = atob(data.audio);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          const entry: CacheEntry = {
            text: data.response || data.text || "",
            audio: bytes.buffer,
            emotion: data.emotion || "neutral",
            timestamp: Date.now(),
          };

          // Evict old entries if cache is full
          if (state.cache.size >= maxCacheSize) {
            const oldest = Array.from(state.cache.entries()).sort(
              (a, b) => a[1].timestamp - b[1].timestamp
            )[0];
            if (oldest) state.cache.delete(oldest[0]);
          }

          state.cache.set(key, entry);
          state.pendingFetches.delete(key);
          return entry;
        }
      } catch {
        // Silently fail prefetch
      }

      state.pendingFetches.delete(key);
      return null;
    },
    [normalizeKey, sessionId, maxCacheSize]
  );

  // Get cached response
  const getCached = useCallback(
    (message: string): CacheEntry | null => {
      const key = normalizeKey(message);
      const state = stateRef.current;
      const entry = state.cache.get(key);

      if (entry) {
        // Check expiry
        if (Date.now() - entry.timestamp > cacheExpiry) {
          state.cache.delete(key);
          statsRef.current.misses++;
          return null;
        }
        statsRef.current.hits++;
        return entry;
      }

      statsRef.current.misses++;
      return null;
    },
    [normalizeKey, cacheExpiry]
  );

  // Prefetch specific messages
  const prefetch = useCallback(
    async (messages: string[]): Promise<void> => {
      const promises = messages.map((msg) => {
        const key = normalizeKey(msg);
        // Skip if already cached or fetching
        if (
          stateRef.current.cache.has(key) ||
          stateRef.current.pendingFetches.has(key)
        ) {
          return Promise.resolve();
        }
        return fetchAndCache(msg);
      });

      await Promise.all(promises);
    },
    [normalizeKey, fetchAndCache]
  );

  // Clear cache
  const clearCache = useCallback(() => {
    stateRef.current.cache.clear();
    stateRef.current.pendingFetches.clear();
    statsRef.current = { hits: 0, misses: 0 };
  }, []);

  // Initial prefetch on mount
  useEffect(() => {
    if (!enabled) return;

    // Prefetch greetings based on time of day
    const timeOfDay = getTimeOfDay();
    const greetings = GREETING_PREFETCH[timeOfDay] || GREETING_PREFETCH.afternoon;

    // Delay initial prefetch to not block page load
    const timeout = setTimeout(() => {
      prefetch([...greetings, ...COMMON_MESSAGES.slice(0, 3)]);
      stateRef.current.lastPrefetchTime = Date.now();
    }, 2000);

    return () => clearTimeout(timeout);
  }, [enabled, getTimeOfDay, prefetch]);

  // Periodic cache cleanup
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      const state = stateRef.current;
      const now = Date.now();

      // Remove expired entries
      for (const [key, entry] of state.cache.entries()) {
        if (now - entry.timestamp > cacheExpiry) {
          state.cache.delete(key);
        }
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [enabled, cacheExpiry]);

  // Calculate hit rate
  const { hits, misses } = statsRef.current;
  const hitRate = hits + misses > 0 ? hits / (hits + misses) : 0;

  return {
    getCached,
    prefetch,
    clearCache,
    cacheSize: stateRef.current.cache.size,
    hitRate,
  };
}

/**
 * Predict likely next messages based on input
 */
export function predictLikelyMessages(
  currentInput: string,
  conversationHistory: string[]
): string[] {
  const input = currentInput.trim().toLowerCase();
  const predictions: string[] = [];

  // If typing a greeting
  if (input.startsWith("sal") || input.startsWith("bon") || input.startsWith("hey")) {
    predictions.push("salut", "bonjour", "bonsoir");
  }

  // If typing yes/no
  if (input.startsWith("ou") || input.startsWith("no")) {
    predictions.push("oui", "non", "ok");
  }

  // If asking a question
  if (input.includes("?") || input.startsWith("c'est") || input.startsWith("tu")) {
    predictions.push("ca va", "tu fais quoi");
  }

  // Based on conversation length
  if (conversationHistory.length > 5) {
    predictions.push("merci", "bye", "a plus");
  }

  return [...new Set(predictions)].slice(0, 5);
}
