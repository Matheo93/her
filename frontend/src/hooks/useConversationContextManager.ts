/**
 * useConversationContextManager - Conversation context and state management
 *
 * Sprint 1591 - Manages conversation flow, context tracking, turn management,
 * and intelligent caching for optimal AI conversation UX.
 *
 * Features:
 * - Message history management
 * - Turn-taking coordination
 * - Context window tracking
 * - Response caching
 * - Conversation state machine
 * - Topic tracking
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// Conversation states
export type ConversationPhase =
  | "idle" // No active conversation
  | "user_typing" // User is composing
  | "user_speaking" // Voice input active
  | "processing" // Waiting for AI response
  | "ai_responding" // AI is generating response
  | "ai_speaking" // TTS playing
  | "paused" // Conversation paused
  | "ended"; // Conversation ended

export type TurnOwner = "user" | "ai" | "system" | null;

export type MessageRole = "user" | "assistant" | "system";

export interface ConversationMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  tokenCount: number;
  metadata?: {
    emotion?: string;
    confidence?: number;
    responseTime?: number;
    cached?: boolean;
    topics?: string[];
  };
}

export interface ConversationTopic {
  id: string;
  name: string;
  firstMentioned: number;
  lastMentioned: number;
  messageCount: number;
  keywords: string[];
}

export interface ContextWindow {
  messages: ConversationMessage[];
  totalTokens: number;
  maxTokens: number;
  utilizationPercent: number;
}

export interface ConversationState {
  phase: ConversationPhase;
  turnOwner: TurnOwner;
  messages: ConversationMessage[];
  pendingMessage: string | null;
  contextWindow: ContextWindow;
  topics: ConversationTopic[];
  currentTopic: ConversationTopic | null;
  turnCount: number;
  startTime: number | null;
  lastActivityTime: number;
  isActive: boolean;
}

export interface ConversationMetrics {
  totalMessages: number;
  userMessages: number;
  aiMessages: number;
  averageResponseTime: number;
  averageMessageLength: number;
  cacheHitRate: number;
  topicChangeCount: number;
  longestTurn: number;
  sessionDuration: number;
}

export interface ConversationConfig {
  maxContextTokens: number;
  maxHistoryLength: number;
  typingTimeoutMs: number;
  responseTimeoutMs: number;
  enableCaching: boolean;
  cacheExpiryMs: number;
  enableTopicTracking: boolean;
  autoEndAfterIdleMs: number; // 0 = disabled
}

export interface CachedResponse {
  input: string;
  response: string;
  timestamp: number;
  useCount: number;
}

export interface ConversationControls {
  startConversation: () => void;
  endConversation: () => void;
  pauseConversation: () => void;
  resumeConversation: () => void;
  addMessage: (role: MessageRole, content: string, metadata?: ConversationMessage["metadata"]) => ConversationMessage;
  setUserTyping: () => void;
  setUserSpeaking: () => void;
  setProcessing: () => void;
  setAIResponding: () => void;
  setAISpeaking: () => void;
  setIdle: () => void;
  clearHistory: () => void;
  trimContext: (targetTokens: number) => void;
  getCachedResponse: (input: string) => string | null;
  cacheResponse: (input: string, response: string) => void;
  getContextForPrompt: () => ConversationMessage[];
  updateConfig: (config: Partial<ConversationConfig>) => void;
}

export interface UseConversationContextManagerResult {
  state: ConversationState;
  metrics: ConversationMetrics;
  controls: ConversationControls;
  config: ConversationConfig;
}

const DEFAULT_CONFIG: ConversationConfig = {
  maxContextTokens: 4000,
  maxHistoryLength: 100,
  typingTimeoutMs: 5000,
  responseTimeoutMs: 30000,
  enableCaching: true,
  cacheExpiryMs: 3600000, // 1 hour
  enableTopicTracking: true,
  autoEndAfterIdleMs: 0, // disabled
};

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Simple token estimation (4 chars ≈ 1 token)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Extract keywords for topic tracking
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "must", "shall",
    "can", "need", "dare", "ought", "used", "to", "of", "in",
    "for", "on", "with", "at", "by", "from", "up", "about",
    "into", "over", "after", "i", "you", "he", "she", "it",
    "we", "they", "what", "which", "who", "when", "where",
    "why", "how", "that", "this", "these", "those", "and",
    "but", "or", "nor", "so", "yet", "both", "either", "neither",
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !stopWords.has(word))
    .slice(0, 10);
}

// Simple string similarity for cache matching
function similarity(a: string, b: string): number {
  const aLower = a.toLowerCase().trim();
  const bLower = b.toLowerCase().trim();

  if (aLower === bLower) return 1;

  const aWords = new Set(aLower.split(/\s+/));
  const bWords = new Set(bLower.split(/\s+/));

  let intersection = 0;
  for (const word of aWords) {
    if (bWords.has(word)) intersection++;
  }

  const union = aWords.size + bWords.size - intersection;
  return intersection / union;
}

export function useConversationContextManager(
  initialConfig: Partial<ConversationConfig> = {}
): UseConversationContextManagerResult {
  const [config, setConfig] = useState<ConversationConfig>({
    ...DEFAULT_CONFIG,
    ...initialConfig,
  });

  const [state, setState] = useState<ConversationState>({
    phase: "idle",
    turnOwner: null,
    messages: [],
    pendingMessage: null,
    contextWindow: {
      messages: [],
      totalTokens: 0,
      maxTokens: config.maxContextTokens,
      utilizationPercent: 0,
    },
    topics: [],
    currentTopic: null,
    turnCount: 0,
    startTime: null,
    lastActivityTime: Date.now(),
    isActive: false,
  });

  const [metrics, setMetrics] = useState<ConversationMetrics>({
    totalMessages: 0,
    userMessages: 0,
    aiMessages: 0,
    averageResponseTime: 0,
    averageMessageLength: 0,
    cacheHitRate: 0,
    topicChangeCount: 0,
    longestTurn: 0,
    sessionDuration: 0,
  });

  // Refs
  const cacheRef = useRef<Map<string, CachedResponse>>(new Map());
  const responseTimesRef = useRef<number[]>([]);
  const cacheHitsRef = useRef(0);
  const cacheQueriesRef = useRef(0);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastUserMessageTimeRef = useRef<number>(0);

  // Update context window
  const updateContextWindow = useCallback(
    (messages: ConversationMessage[]) => {
      let totalTokens = 0;
      const contextMessages: ConversationMessage[] = [];

      // Add messages from most recent, respecting token limit
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (totalTokens + msg.tokenCount > config.maxContextTokens) break;
        totalTokens += msg.tokenCount;
        contextMessages.unshift(msg);
      }

      return {
        messages: contextMessages,
        totalTokens,
        maxTokens: config.maxContextTokens,
        utilizationPercent: (totalTokens / config.maxContextTokens) * 100,
      };
    },
    [config.maxContextTokens]
  );

  // Update topics
  const updateTopics = useCallback(
    (
      topics: ConversationTopic[],
      message: ConversationMessage
    ): { topics: ConversationTopic[]; currentTopic: ConversationTopic | null } => {
      if (!config.enableTopicTracking) {
        return { topics, currentTopic: null };
      }

      const keywords = extractKeywords(message.content);
      if (keywords.length === 0) {
        return { topics, currentTopic: topics[topics.length - 1] || null };
      }

      // Find matching topic
      let matchedTopic: ConversationTopic | null = null;
      let bestMatchScore = 0;

      for (const topic of topics) {
        const topicKeywords = new Set(topic.keywords);
        let matchCount = 0;
        for (const kw of keywords) {
          if (topicKeywords.has(kw)) matchCount++;
        }
        const score = matchCount / Math.max(keywords.length, topic.keywords.length);
        if (score > 0.3 && score > bestMatchScore) {
          bestMatchScore = score;
          matchedTopic = topic;
        }
      }

      const updatedTopics = [...topics];

      if (matchedTopic) {
        // Update existing topic
        const idx = updatedTopics.findIndex((t) => t.id === matchedTopic!.id);
        if (idx >= 0) {
          updatedTopics[idx] = {
            ...matchedTopic,
            lastMentioned: message.timestamp,
            messageCount: matchedTopic.messageCount + 1,
            keywords: [...new Set([...matchedTopic.keywords, ...keywords])].slice(0, 20),
          };
        }
        return { topics: updatedTopics, currentTopic: updatedTopics[idx] };
      } else {
        // Create new topic
        const newTopic: ConversationTopic = {
          id: `topic-${Date.now()}`,
          name: keywords.slice(0, 3).join(" "),
          firstMentioned: message.timestamp,
          lastMentioned: message.timestamp,
          messageCount: 1,
          keywords,
        };
        updatedTopics.push(newTopic);

        setMetrics((prev) => ({
          ...prev,
          topicChangeCount: prev.topicChangeCount + 1,
        }));

        return { topics: updatedTopics, currentTopic: newTopic };
      }
    },
    [config.enableTopicTracking]
  );

  // Start conversation
  const startConversation = useCallback(() => {
    setState((prev) => ({
      ...prev,
      phase: "idle",
      isActive: true,
      startTime: Date.now(),
      lastActivityTime: Date.now(),
      turnCount: 0,
    }));
  }, []);

  // End conversation
  const endConversation = useCallback(() => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);

    const duration = state.startTime ? Date.now() - state.startTime : 0;

    setMetrics((prev) => ({
      ...prev,
      sessionDuration: prev.sessionDuration + duration,
    }));

    setState((prev) => ({
      ...prev,
      phase: "ended",
      isActive: false,
      turnOwner: null,
    }));
  }, [state.startTime]);

  // Pause conversation
  const pauseConversation = useCallback(() => {
    setState((prev) => ({ ...prev, phase: "paused" }));
  }, []);

  // Resume conversation
  const resumeConversation = useCallback(() => {
    setState((prev) => ({
      ...prev,
      phase: "idle",
      lastActivityTime: Date.now(),
    }));
  }, []);

  // Add message
  const addMessage = useCallback(
    (
      role: MessageRole,
      content: string,
      metadata?: ConversationMessage["metadata"]
    ): ConversationMessage => {
      const tokenCount = estimateTokens(content);
      const message: ConversationMessage = {
        id: generateId(),
        role,
        content,
        timestamp: Date.now(),
        tokenCount,
        metadata,
      };

      setState((prev) => {
        const messages = [...prev.messages, message].slice(-config.maxHistoryLength);
        const contextWindow = updateContextWindow(messages);
        const { topics, currentTopic } = updateTopics(prev.topics, message);

        return {
          ...prev,
          messages,
          contextWindow,
          topics,
          currentTopic,
          turnCount: prev.turnCount + 1,
          lastActivityTime: Date.now(),
        };
      });

      // Update metrics
      setMetrics((prev) => {
        const totalMessages = prev.totalMessages + 1;
        const userMessages = role === "user" ? prev.userMessages + 1 : prev.userMessages;
        const aiMessages = role === "assistant" ? prev.aiMessages + 1 : prev.aiMessages;

        // Track response time for AI messages
        if (role === "assistant" && lastUserMessageTimeRef.current > 0) {
          const responseTime = Date.now() - lastUserMessageTimeRef.current;
          responseTimesRef.current.push(responseTime);
          if (responseTimesRef.current.length > 50) {
            responseTimesRef.current.shift();
          }
        }

        if (role === "user") {
          lastUserMessageTimeRef.current = Date.now();
        }

        const avgResponseTime =
          responseTimesRef.current.length > 0
            ? responseTimesRef.current.reduce((a, b) => a + b, 0) / responseTimesRef.current.length
            : 0;

        return {
          ...prev,
          totalMessages,
          userMessages,
          aiMessages,
          averageResponseTime: avgResponseTime,
          averageMessageLength:
            (prev.averageMessageLength * prev.totalMessages + content.length) / totalMessages,
        };
      });

      return message;
    },
    [config.maxHistoryLength, updateContextWindow, updateTopics]
  );

  // Phase setters
  const setUserTyping = useCallback(() => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    setState((prev) => ({
      ...prev,
      phase: "user_typing",
      turnOwner: "user",
      lastActivityTime: Date.now(),
    }));

    typingTimeoutRef.current = setTimeout(() => {
      setState((prev) =>
        prev.phase === "user_typing" ? { ...prev, phase: "idle" } : prev
      );
    }, config.typingTimeoutMs);
  }, [config.typingTimeoutMs]);

  const setUserSpeaking = useCallback(() => {
    setState((prev) => ({
      ...prev,
      phase: "user_speaking",
      turnOwner: "user",
      lastActivityTime: Date.now(),
    }));
  }, []);

  const setProcessing = useCallback(() => {
    setState((prev) => ({
      ...prev,
      phase: "processing",
      turnOwner: "ai",
      lastActivityTime: Date.now(),
    }));
  }, []);

  const setAIResponding = useCallback(() => {
    setState((prev) => ({
      ...prev,
      phase: "ai_responding",
      turnOwner: "ai",
      lastActivityTime: Date.now(),
    }));
  }, []);

  const setAISpeaking = useCallback(() => {
    setState((prev) => ({
      ...prev,
      phase: "ai_speaking",
      turnOwner: "ai",
      lastActivityTime: Date.now(),
    }));
  }, []);

  const setIdle = useCallback(() => {
    setState((prev) => ({
      ...prev,
      phase: "idle",
      turnOwner: null,
      lastActivityTime: Date.now(),
    }));
  }, []);

  // Clear history
  const clearHistory = useCallback(() => {
    setState((prev) => ({
      ...prev,
      messages: [],
      contextWindow: {
        messages: [],
        totalTokens: 0,
        maxTokens: config.maxContextTokens,
        utilizationPercent: 0,
      },
      topics: [],
      currentTopic: null,
      turnCount: 0,
    }));
  }, [config.maxContextTokens]);

  // Trim context
  const trimContext = useCallback(
    (targetTokens: number) => {
      setState((prev) => {
        let totalTokens = 0;
        const trimmedMessages: ConversationMessage[] = [];

        for (let i = prev.messages.length - 1; i >= 0; i--) {
          const msg = prev.messages[i];
          if (totalTokens + msg.tokenCount > targetTokens) break;
          totalTokens += msg.tokenCount;
          trimmedMessages.unshift(msg);
        }

        return {
          ...prev,
          messages: trimmedMessages,
          contextWindow: updateContextWindow(trimmedMessages),
        };
      });
    },
    [updateContextWindow]
  );

  // Get cached response
  const getCachedResponse = useCallback(
    (input: string): string | null => {
      if (!config.enableCaching) return null;

      cacheQueriesRef.current++;

      // Clean expired entries
      const now = Date.now();
      for (const [key, entry] of cacheRef.current.entries()) {
        if (now - entry.timestamp > config.cacheExpiryMs) {
          cacheRef.current.delete(key);
        }
      }

      // Find best match
      let bestMatch: CachedResponse | null = null;
      let bestScore = 0;

      for (const [_, entry] of cacheRef.current.entries()) {
        const score = similarity(input, entry.input);
        if (score > 0.85 && score > bestScore) {
          bestScore = score;
          bestMatch = entry;
        }
      }

      if (bestMatch) {
        cacheHitsRef.current++;
        bestMatch.useCount++;

        setMetrics((prev) => ({
          ...prev,
          cacheHitRate: cacheHitsRef.current / cacheQueriesRef.current,
        }));

        return bestMatch.response;
      }

      return null;
    },
    [config.enableCaching, config.cacheExpiryMs]
  );

  // Cache response
  const cacheResponse = useCallback(
    (input: string, response: string) => {
      if (!config.enableCaching) return;

      cacheRef.current.set(input.toLowerCase().trim(), {
        input,
        response,
        timestamp: Date.now(),
        useCount: 1,
      });

      // Limit cache size
      if (cacheRef.current.size > 100) {
        // Remove least used entries
        const entries = [...cacheRef.current.entries()].sort(
          (a, b) => a[1].useCount - b[1].useCount
        );
        for (let i = 0; i < 20; i++) {
          cacheRef.current.delete(entries[i][0]);
        }
      }
    },
    [config.enableCaching]
  );

  // Get context for prompt
  const getContextForPrompt = useCallback((): ConversationMessage[] => {
    return state.contextWindow.messages;
  }, [state.contextWindow.messages]);

  // Update config
  const updateConfig = useCallback((updates: Partial<ConversationConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  // Auto-end after idle
  useEffect(() => {
    if (!state.isActive || config.autoEndAfterIdleMs <= 0) return;

    if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);

    idleTimeoutRef.current = setTimeout(() => {
      if (state.phase === "idle") {
        endConversation();
      }
    }, config.autoEndAfterIdleMs);

    return () => {
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    };
  }, [state.lastActivityTime, state.isActive, state.phase, config.autoEndAfterIdleMs, endConversation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    };
  }, []);

  const controls: ConversationControls = useMemo(
    () => ({
      startConversation,
      endConversation,
      pauseConversation,
      resumeConversation,
      addMessage,
      setUserTyping,
      setUserSpeaking,
      setProcessing,
      setAIResponding,
      setAISpeaking,
      setIdle,
      clearHistory,
      trimContext,
      getCachedResponse,
      cacheResponse,
      getContextForPrompt,
      updateConfig,
    }),
    [
      startConversation,
      endConversation,
      pauseConversation,
      resumeConversation,
      addMessage,
      setUserTyping,
      setUserSpeaking,
      setProcessing,
      setAIResponding,
      setAISpeaking,
      setIdle,
      clearHistory,
      trimContext,
      getCachedResponse,
      cacheResponse,
      getContextForPrompt,
      updateConfig,
    ]
  );

  return {
    state,
    metrics,
    controls,
    config,
  };
}

// Sub-hook: Simple conversation state
export function useConversationPhase(): {
  phase: ConversationPhase;
  isActive: boolean;
  turnOwner: TurnOwner;
} {
  const { state } = useConversationContextManager();

  return {
    phase: state.phase,
    isActive: state.isActive,
    turnOwner: state.turnOwner,
  };
}

// Sub-hook: Message history
export function useMessageHistory(): {
  messages: ConversationMessage[];
  addMessage: (role: MessageRole, content: string) => ConversationMessage;
  clearHistory: () => void;
} {
  const { state, controls } = useConversationContextManager();

  return {
    messages: state.messages,
    addMessage: controls.addMessage,
    clearHistory: controls.clearHistory,
  };
}

export default useConversationContextManager;
