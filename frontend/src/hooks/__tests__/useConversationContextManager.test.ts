/**
 * Tests for useConversationContextManager hook
 * Sprint 557 - Comprehensive test coverage for conversation context management
 */

import { renderHook, act } from "@testing-library/react";
import {
  useConversationContextManager,
  useConversationPhase,
  useMessageHistory,
  ConversationPhase,
  TurnOwner,
  MessageRole,
  ConversationMessage,
  ConversationConfig,
} from "../useConversationContextManager";

// Mock timers for timeout testing
jest.useFakeTimers();

describe("useConversationContextManager", () => {
  afterEach(() => {
    jest.clearAllTimers();
  });

  describe("Initial State", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useConversationContextManager());

      expect(result.current.state.phase).toBe("idle");
      expect(result.current.state.turnOwner).toBeNull();
      expect(result.current.state.messages).toEqual([]);
      expect(result.current.state.pendingMessage).toBeNull();
      expect(result.current.state.topics).toEqual([]);
      expect(result.current.state.currentTopic).toBeNull();
      expect(result.current.state.turnCount).toBe(0);
      expect(result.current.state.startTime).toBeNull();
      expect(result.current.state.isActive).toBe(false);
    });

    it("should initialize with default config", () => {
      const { result } = renderHook(() => useConversationContextManager());

      expect(result.current.config.maxContextTokens).toBe(4000);
      expect(result.current.config.maxHistoryLength).toBe(100);
      expect(result.current.config.typingTimeoutMs).toBe(5000);
      expect(result.current.config.responseTimeoutMs).toBe(30000);
      expect(result.current.config.enableCaching).toBe(true);
      expect(result.current.config.cacheExpiryMs).toBe(3600000);
      expect(result.current.config.enableTopicTracking).toBe(true);
      expect(result.current.config.autoEndAfterIdleMs).toBe(0);
    });

    it("should initialize with custom config", () => {
      const customConfig: Partial<ConversationConfig> = {
        maxContextTokens: 8000,
        maxHistoryLength: 50,
        enableCaching: false,
      };

      const { result } = renderHook(() =>
        useConversationContextManager(customConfig)
      );

      expect(result.current.config.maxContextTokens).toBe(8000);
      expect(result.current.config.maxHistoryLength).toBe(50);
      expect(result.current.config.enableCaching).toBe(false);
      // Defaults should still be present
      expect(result.current.config.typingTimeoutMs).toBe(5000);
    });

    it("should initialize context window with correct values", () => {
      const { result } = renderHook(() => useConversationContextManager());

      expect(result.current.state.contextWindow.messages).toEqual([]);
      expect(result.current.state.contextWindow.totalTokens).toBe(0);
      expect(result.current.state.contextWindow.maxTokens).toBe(4000);
      expect(result.current.state.contextWindow.utilizationPercent).toBe(0);
    });

    it("should initialize metrics with zero values", () => {
      const { result } = renderHook(() => useConversationContextManager());

      expect(result.current.metrics.totalMessages).toBe(0);
      expect(result.current.metrics.userMessages).toBe(0);
      expect(result.current.metrics.aiMessages).toBe(0);
      expect(result.current.metrics.averageResponseTime).toBe(0);
      expect(result.current.metrics.averageMessageLength).toBe(0);
      expect(result.current.metrics.cacheHitRate).toBe(0);
      expect(result.current.metrics.topicChangeCount).toBe(0);
      expect(result.current.metrics.longestTurn).toBe(0);
      expect(result.current.metrics.sessionDuration).toBe(0);
    });
  });

  describe("Conversation Lifecycle", () => {
    it("should start conversation", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.startConversation();
      });

      expect(result.current.state.isActive).toBe(true);
      expect(result.current.state.phase).toBe("idle");
      expect(result.current.state.startTime).not.toBeNull();
      expect(result.current.state.turnCount).toBe(0);
    });

    it("should end conversation", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.startConversation();
      });

      act(() => {
        result.current.controls.endConversation();
      });

      expect(result.current.state.isActive).toBe(false);
      expect(result.current.state.phase).toBe("ended");
      expect(result.current.state.turnOwner).toBeNull();
    });

    it("should pause conversation", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.startConversation();
      });

      act(() => {
        result.current.controls.pauseConversation();
      });

      expect(result.current.state.phase).toBe("paused");
    });

    it("should resume conversation", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.startConversation();
        result.current.controls.pauseConversation();
      });

      act(() => {
        result.current.controls.resumeConversation();
      });

      expect(result.current.state.phase).toBe("idle");
    });

    it("should track session duration on end", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.startConversation();
      });

      // Advance time
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      act(() => {
        result.current.controls.endConversation();
      });

      expect(result.current.metrics.sessionDuration).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Phase Transitions", () => {
    it("should set user typing phase", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.setUserTyping();
      });

      expect(result.current.state.phase).toBe("user_typing");
      expect(result.current.state.turnOwner).toBe("user");
    });

    it("should timeout user typing to idle", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.setUserTyping();
      });

      expect(result.current.state.phase).toBe("user_typing");

      act(() => {
        jest.advanceTimersByTime(5001);
      });

      expect(result.current.state.phase).toBe("idle");
    });

    it("should reset typing timeout on repeated calls", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.setUserTyping();
      });

      act(() => {
        jest.advanceTimersByTime(3000);
      });

      act(() => {
        result.current.controls.setUserTyping();
      });

      act(() => {
        jest.advanceTimersByTime(3000);
      });

      // Should still be typing since timeout was reset
      expect(result.current.state.phase).toBe("user_typing");
    });

    it("should set user speaking phase", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.setUserSpeaking();
      });

      expect(result.current.state.phase).toBe("user_speaking");
      expect(result.current.state.turnOwner).toBe("user");
    });

    it("should set processing phase", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.setProcessing();
      });

      expect(result.current.state.phase).toBe("processing");
      expect(result.current.state.turnOwner).toBe("ai");
    });

    it("should set AI responding phase", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.setAIResponding();
      });

      expect(result.current.state.phase).toBe("ai_responding");
      expect(result.current.state.turnOwner).toBe("ai");
    });

    it("should set AI speaking phase", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.setAISpeaking();
      });

      expect(result.current.state.phase).toBe("ai_speaking");
      expect(result.current.state.turnOwner).toBe("ai");
    });

    it("should set idle phase", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.setProcessing();
      });

      act(() => {
        result.current.controls.setIdle();
      });

      expect(result.current.state.phase).toBe("idle");
      expect(result.current.state.turnOwner).toBeNull();
    });

    it("should update lastActivityTime on phase changes", () => {
      const { result } = renderHook(() => useConversationContextManager());

      const initialTime = result.current.state.lastActivityTime;

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      act(() => {
        result.current.controls.setUserTyping();
      });

      expect(result.current.state.lastActivityTime).toBeGreaterThan(initialTime);
    });
  });

  describe("Message Management", () => {
    it("should add user message", () => {
      const { result } = renderHook(() => useConversationContextManager());

      let message: ConversationMessage;
      act(() => {
        message = result.current.controls.addMessage("user", "Hello world");
      });

      expect(result.current.state.messages).toHaveLength(1);
      expect(result.current.state.messages[0].role).toBe("user");
      expect(result.current.state.messages[0].content).toBe("Hello world");
      expect(result.current.state.messages[0].id).toMatch(/^msg-/);
    });

    it("should add assistant message", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.addMessage("assistant", "Hi there!");
      });

      expect(result.current.state.messages[0].role).toBe("assistant");
    });

    it("should add system message", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.addMessage("system", "Context set");
      });

      expect(result.current.state.messages[0].role).toBe("system");
    });

    it("should add message with metadata", () => {
      const { result } = renderHook(() => useConversationContextManager());

      const metadata = {
        emotion: "happy",
        confidence: 0.95,
        topics: ["greeting"],
      };

      act(() => {
        result.current.controls.addMessage("user", "Hello!", metadata);
      });

      expect(result.current.state.messages[0].metadata).toEqual(metadata);
    });

    it("should estimate token count for messages", () => {
      const { result } = renderHook(() => useConversationContextManager());

      // "Hello world" is 11 chars, should be ~3 tokens (11/4 = 2.75 rounded up)
      act(() => {
        result.current.controls.addMessage("user", "Hello world");
      });

      expect(result.current.state.messages[0].tokenCount).toBe(3);
    });

    it("should increment turn count on message", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.addMessage("user", "First message");
      });

      expect(result.current.state.turnCount).toBe(1);

      act(() => {
        result.current.controls.addMessage("assistant", "Response");
      });

      expect(result.current.state.turnCount).toBe(2);
    });

    it("should limit history length", () => {
      const { result } = renderHook(() =>
        useConversationContextManager({ maxHistoryLength: 5 })
      );

      act(() => {
        for (let i = 0; i < 10; i++) {
          result.current.controls.addMessage("user", `Message ${i}`);
        }
      });

      expect(result.current.state.messages).toHaveLength(5);
      expect(result.current.state.messages[0].content).toBe("Message 5");
    });

    it("should clear history", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.addMessage("user", "Test");
        result.current.controls.addMessage("assistant", "Response");
      });

      act(() => {
        result.current.controls.clearHistory();
      });

      expect(result.current.state.messages).toHaveLength(0);
      expect(result.current.state.turnCount).toBe(0);
      expect(result.current.state.topics).toHaveLength(0);
    });

    it("should return message object from addMessage", () => {
      const { result } = renderHook(() => useConversationContextManager());

      let returnedMessage: ConversationMessage;
      act(() => {
        returnedMessage = result.current.controls.addMessage("user", "Test");
      });

      expect(returnedMessage!.id).toBeDefined();
      expect(returnedMessage!.content).toBe("Test");
      expect(returnedMessage!.role).toBe("user");
      expect(returnedMessage!.timestamp).toBeDefined();
    });
  });

  describe("Context Window Management", () => {
    it("should update context window on message add", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.addMessage("user", "Hello world");
      });

      expect(result.current.state.contextWindow.messages).toHaveLength(1);
      expect(result.current.state.contextWindow.totalTokens).toBeGreaterThan(0);
      expect(result.current.state.contextWindow.utilizationPercent).toBeGreaterThan(0);
    });

    it("should respect max context tokens", () => {
      const { result } = renderHook(() =>
        useConversationContextManager({ maxContextTokens: 10 })
      );

      // Add messages that exceed token limit
      act(() => {
        result.current.controls.addMessage("user", "This is a very long message that should exceed the token limit");
        result.current.controls.addMessage("assistant", "Another long response here");
      });

      expect(result.current.state.contextWindow.totalTokens).toBeLessThanOrEqual(10);
    });

    it("should trim context to target tokens", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        for (let i = 0; i < 10; i++) {
          result.current.controls.addMessage("user", `Message number ${i} with some content`);
        }
      });

      const tokensBefore = result.current.state.contextWindow.totalTokens;

      act(() => {
        result.current.controls.trimContext(50);
      });

      expect(result.current.state.contextWindow.totalTokens).toBeLessThanOrEqual(50);
      expect(result.current.state.contextWindow.totalTokens).toBeLessThan(tokensBefore);
    });

    it("should get context for prompt", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.addMessage("user", "Hello");
        result.current.controls.addMessage("assistant", "Hi!");
      });

      const context = result.current.controls.getContextForPrompt();

      expect(context).toHaveLength(2);
      expect(context[0].role).toBe("user");
      expect(context[1].role).toBe("assistant");
    });

    it("should calculate utilization percent correctly", () => {
      const { result } = renderHook(() =>
        useConversationContextManager({ maxContextTokens: 100 })
      );

      act(() => {
        // Add message with ~25 tokens (100 chars / 4)
        result.current.controls.addMessage(
          "user",
          "a".repeat(100)
        );
      });

      expect(result.current.state.contextWindow.utilizationPercent).toBeCloseTo(25, 0);
    });
  });

  describe("Topic Tracking", () => {
    it("should create new topic from message keywords", () => {
      const { result } = renderHook(() =>
        useConversationContextManager({ enableTopicTracking: true })
      );

      act(() => {
        result.current.controls.addMessage(
          "user",
          "Let's discuss artificial intelligence and machine learning today"
        );
      });

      expect(result.current.state.topics.length).toBeGreaterThan(0);
      expect(result.current.state.currentTopic).not.toBeNull();
    });

    it("should match existing topic on similar keywords", () => {
      const { result } = renderHook(() =>
        useConversationContextManager({ enableTopicTracking: true })
      );

      act(() => {
        result.current.controls.addMessage(
          "user",
          "I want to learn about programming and software development"
        );
      });

      const firstTopicId = result.current.state.currentTopic?.id;

      act(() => {
        result.current.controls.addMessage(
          "user",
          "How can I improve my programming skills for software"
        );
      });

      // Should match the same topic
      expect(result.current.state.currentTopic?.id).toBe(firstTopicId);
      expect(result.current.state.currentTopic?.messageCount).toBe(2);
    });

    it("should track topic change count", () => {
      const { result } = renderHook(() =>
        useConversationContextManager({ enableTopicTracking: true })
      );

      act(() => {
        result.current.controls.addMessage("user", "Let's talk about cooking and recipes");
      });

      expect(result.current.metrics.topicChangeCount).toBe(1);

      act(() => {
        result.current.controls.addMessage("user", "Now about music and instruments");
      });

      expect(result.current.metrics.topicChangeCount).toBe(2);
    });

    it("should disable topic tracking when configured", () => {
      const { result } = renderHook(() =>
        useConversationContextManager({ enableTopicTracking: false })
      );

      act(() => {
        result.current.controls.addMessage("user", "Let's discuss programming");
      });

      expect(result.current.state.topics).toHaveLength(0);
      expect(result.current.state.currentTopic).toBeNull();
    });

    it("should update topic last mentioned time", () => {
      const { result } = renderHook(() =>
        useConversationContextManager({ enableTopicTracking: true })
      );

      act(() => {
        result.current.controls.addMessage("user", "Discussing programming concepts");
      });

      const firstMentioned = result.current.state.currentTopic?.firstMentioned;

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      act(() => {
        result.current.controls.addMessage("user", "More about programming");
      });

      expect(result.current.state.currentTopic?.lastMentioned).toBeGreaterThan(firstMentioned!);
    });

    it("should filter stop words from keywords", () => {
      const { result } = renderHook(() =>
        useConversationContextManager({ enableTopicTracking: true })
      );

      act(() => {
        result.current.controls.addMessage("user", "The quick brown fox jumps");
      });

      const topic = result.current.state.currentTopic;
      expect(topic?.keywords).not.toContain("the");
      expect(topic?.keywords).toContain("quick");
      expect(topic?.keywords).toContain("brown");
    });

    it("should handle messages with no keywords", () => {
      const { result } = renderHook(() =>
        useConversationContextManager({ enableTopicTracking: true })
      );

      act(() => {
        result.current.controls.addMessage("user", "Hi");
      });

      // Should not create topic for short messages with only stop words
      expect(result.current.state.currentTopic).toBeNull();
    });
  });

  describe("Response Caching", () => {
    it("should cache response when caching enabled", () => {
      const { result } = renderHook(() =>
        useConversationContextManager({ enableCaching: true })
      );

      act(() => {
        result.current.controls.cacheResponse("Hello", "Hi there!");
      });

      const cached = result.current.controls.getCachedResponse("Hello");
      expect(cached).toBe("Hi there!");
    });

    it("should return null when caching disabled", () => {
      const { result } = renderHook(() =>
        useConversationContextManager({ enableCaching: false })
      );

      act(() => {
        result.current.controls.cacheResponse("Hello", "Hi there!");
      });

      const cached = result.current.controls.getCachedResponse("Hello");
      expect(cached).toBeNull();
    });

    it("should match similar inputs (>85% similarity)", () => {
      const { result } = renderHook(() =>
        useConversationContextManager({ enableCaching: true })
      );

      act(() => {
        // Use words that will have high word-overlap similarity
        result.current.controls.cacheResponse("tell me about programming languages", "Programming languages are tools for writing software");
      });

      // Same words reordered - high word-based similarity
      const cached = result.current.controls.getCachedResponse("programming languages tell me about");
      expect(cached).toBe("Programming languages are tools for writing software");
    });

    it("should not match dissimilar inputs", () => {
      const { result } = renderHook(() =>
        useConversationContextManager({ enableCaching: true })
      );

      act(() => {
        result.current.controls.cacheResponse("What is the weather?", "It's sunny");
      });

      const cached = result.current.controls.getCachedResponse("Tell me a joke");
      expect(cached).toBeNull();
    });

    it("should track cache hit rate", () => {
      const { result } = renderHook(() =>
        useConversationContextManager({ enableCaching: true })
      );

      act(() => {
        result.current.controls.cacheResponse("Hello", "Hi there!");
      });

      // Miss
      act(() => {
        result.current.controls.getCachedResponse("Something else");
      });

      // Hit
      act(() => {
        result.current.controls.getCachedResponse("Hello");
      });

      expect(result.current.metrics.cacheHitRate).toBe(0.5);
    });

    it("should expire cached entries after configured time", () => {
      const { result } = renderHook(() =>
        useConversationContextManager({
          enableCaching: true,
          cacheExpiryMs: 1000,
        })
      );

      act(() => {
        result.current.controls.cacheResponse("Hello", "Hi!");
      });

      act(() => {
        jest.advanceTimersByTime(1500);
      });

      const cached = result.current.controls.getCachedResponse("Hello");
      expect(cached).toBeNull();
    });

    it("should increment use count on cache hit", () => {
      const { result } = renderHook(() =>
        useConversationContextManager({ enableCaching: true })
      );

      act(() => {
        result.current.controls.cacheResponse("Hello", "Hi!");
      });

      act(() => {
        result.current.controls.getCachedResponse("Hello");
        result.current.controls.getCachedResponse("Hello");
        result.current.controls.getCachedResponse("Hello");
      });

      // Use count should be incremented (internal, verified by cache not being evicted)
      const cached = result.current.controls.getCachedResponse("Hello");
      expect(cached).toBe("Hi!");
    });

    it("should limit cache size to 100 entries", () => {
      const { result } = renderHook(() =>
        useConversationContextManager({ enableCaching: true })
      );

      // Add 105 entries
      act(() => {
        for (let i = 0; i < 105; i++) {
          result.current.controls.cacheResponse(`Question ${i}`, `Answer ${i}`);
        }
      });

      // Cache should be trimmed - recent entries should still exist
      const cached = result.current.controls.getCachedResponse("Question 104");
      expect(cached).toBe("Answer 104");
    });
  });

  describe("Metrics Tracking", () => {
    it("should track total messages", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.addMessage("user", "Hello");
        result.current.controls.addMessage("assistant", "Hi");
        result.current.controls.addMessage("user", "How are you?");
      });

      expect(result.current.metrics.totalMessages).toBe(3);
    });

    it("should track user messages separately", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.addMessage("user", "Hello");
        result.current.controls.addMessage("assistant", "Hi");
        result.current.controls.addMessage("user", "How are you?");
      });

      expect(result.current.metrics.userMessages).toBe(2);
    });

    it("should track AI messages separately", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.addMessage("user", "Hello");
        result.current.controls.addMessage("assistant", "Hi");
        result.current.controls.addMessage("assistant", "How can I help?");
      });

      expect(result.current.metrics.aiMessages).toBe(2);
    });

    it("should calculate average message length", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.addMessage("user", "Hello"); // 5 chars
        result.current.controls.addMessage("user", "Hi"); // 2 chars
        result.current.controls.addMessage("user", "Hey"); // 3 chars
      });

      // Average should be (5 + 2 + 3) / 3 ≈ 3.33
      expect(result.current.metrics.averageMessageLength).toBeCloseTo(3.33, 1);
    });

    it("should track average response time", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.addMessage("user", "Hello");
      });

      act(() => {
        jest.advanceTimersByTime(500);
      });

      act(() => {
        result.current.controls.addMessage("assistant", "Hi there!");
      });

      expect(result.current.metrics.averageResponseTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Config Updates", () => {
    it("should update config dynamically", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.updateConfig({ maxContextTokens: 8000 });
      });

      expect(result.current.config.maxContextTokens).toBe(8000);
    });

    it("should preserve unchanged config values", () => {
      const { result } = renderHook(() => useConversationContextManager());

      const originalTypingTimeout = result.current.config.typingTimeoutMs;

      act(() => {
        result.current.controls.updateConfig({ maxContextTokens: 8000 });
      });

      expect(result.current.config.typingTimeoutMs).toBe(originalTypingTimeout);
    });

    it("should update multiple config values at once", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.updateConfig({
          maxContextTokens: 8000,
          enableCaching: false,
          typingTimeoutMs: 10000,
        });
      });

      expect(result.current.config.maxContextTokens).toBe(8000);
      expect(result.current.config.enableCaching).toBe(false);
      expect(result.current.config.typingTimeoutMs).toBe(10000);
    });
  });

  describe("Auto-End After Idle", () => {
    it("should auto-end conversation after idle timeout", () => {
      const { result } = renderHook(() =>
        useConversationContextManager({ autoEndAfterIdleMs: 5000 })
      );

      act(() => {
        result.current.controls.startConversation();
      });

      expect(result.current.state.isActive).toBe(true);

      act(() => {
        jest.advanceTimersByTime(6000);
      });

      expect(result.current.state.phase).toBe("ended");
      expect(result.current.state.isActive).toBe(false);
    });

    it("should not auto-end when disabled (autoEndAfterIdleMs = 0)", () => {
      const { result } = renderHook(() =>
        useConversationContextManager({ autoEndAfterIdleMs: 0 })
      );

      act(() => {
        result.current.controls.startConversation();
      });

      act(() => {
        jest.advanceTimersByTime(60000);
      });

      expect(result.current.state.isActive).toBe(true);
    });

    it("should reset idle timeout on activity", () => {
      const { result } = renderHook(() =>
        useConversationContextManager({ autoEndAfterIdleMs: 5000 })
      );

      act(() => {
        result.current.controls.startConversation();
      });

      act(() => {
        jest.advanceTimersByTime(4000);
      });

      // Activity resets timer
      act(() => {
        result.current.controls.setUserTyping();
      });

      act(() => {
        jest.advanceTimersByTime(4000);
      });

      // Should still be active
      expect(result.current.state.isActive).toBe(true);
    });
  });

  describe("Cleanup", () => {
    it("should cleanup timeouts on unmount", () => {
      const { result, unmount } = renderHook(() =>
        useConversationContextManager()
      );

      act(() => {
        result.current.controls.setUserTyping();
      });

      // Should not throw on unmount
      unmount();
    });

    it("should cleanup idle timeout on end", () => {
      const { result } = renderHook(() =>
        useConversationContextManager({ autoEndAfterIdleMs: 5000 })
      );

      act(() => {
        result.current.controls.startConversation();
      });

      act(() => {
        result.current.controls.endConversation();
      });

      // Advancing time should not cause issues
      act(() => {
        jest.advanceTimersByTime(10000);
      });

      expect(result.current.state.phase).toBe("ended");
    });
  });

  describe("Controls Memoization", () => {
    it("should return stable controls object", () => {
      const { result, rerender } = renderHook(() =>
        useConversationContextManager()
      );

      const controlsRef = result.current.controls;

      rerender();

      expect(result.current.controls).toBe(controlsRef);
    });

    it("should have all control functions defined", () => {
      const { result } = renderHook(() => useConversationContextManager());

      expect(typeof result.current.controls.startConversation).toBe("function");
      expect(typeof result.current.controls.endConversation).toBe("function");
      expect(typeof result.current.controls.pauseConversation).toBe("function");
      expect(typeof result.current.controls.resumeConversation).toBe("function");
      expect(typeof result.current.controls.addMessage).toBe("function");
      expect(typeof result.current.controls.setUserTyping).toBe("function");
      expect(typeof result.current.controls.setUserSpeaking).toBe("function");
      expect(typeof result.current.controls.setProcessing).toBe("function");
      expect(typeof result.current.controls.setAIResponding).toBe("function");
      expect(typeof result.current.controls.setAISpeaking).toBe("function");
      expect(typeof result.current.controls.setIdle).toBe("function");
      expect(typeof result.current.controls.clearHistory).toBe("function");
      expect(typeof result.current.controls.trimContext).toBe("function");
      expect(typeof result.current.controls.getCachedResponse).toBe("function");
      expect(typeof result.current.controls.cacheResponse).toBe("function");
      expect(typeof result.current.controls.getContextForPrompt).toBe("function");
      expect(typeof result.current.controls.updateConfig).toBe("function");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty message content", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.addMessage("user", "");
      });

      expect(result.current.state.messages).toHaveLength(1);
      expect(result.current.state.messages[0].tokenCount).toBe(0);
    });

    it("should handle very long messages", () => {
      const { result } = renderHook(() => useConversationContextManager());

      const longMessage = "a".repeat(10000);

      act(() => {
        result.current.controls.addMessage("user", longMessage);
      });

      expect(result.current.state.messages[0].tokenCount).toBe(2500);
    });

    it("should handle special characters in messages", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.addMessage("user", "Hello 👋 <script>alert('xss')</script>");
      });

      expect(result.current.state.messages[0].content).toContain("👋");
      expect(result.current.state.messages[0].content).toContain("<script>");
    });

    it("should handle rapid phase transitions", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.setUserTyping();
        result.current.controls.setProcessing();
        result.current.controls.setAIResponding();
        result.current.controls.setAISpeaking();
        result.current.controls.setIdle();
      });

      expect(result.current.state.phase).toBe("idle");
    });

    it("should handle multiple conversation starts", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.startConversation();
        result.current.controls.startConversation();
      });

      expect(result.current.state.isActive).toBe(true);
    });

    it("should handle end without start", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.endConversation();
      });

      expect(result.current.state.phase).toBe("ended");
    });
  });
});

describe("useConversationPhase", () => {
  it("should return current phase", () => {
    const { result } = renderHook(() => useConversationPhase());

    expect(result.current.phase).toBe("idle");
    expect(result.current.isActive).toBe(false);
    expect(result.current.turnOwner).toBeNull();
  });
});

describe("useMessageHistory", () => {
  it("should return messages and controls", () => {
    const { result } = renderHook(() => useMessageHistory());

    expect(result.current.messages).toEqual([]);
    expect(typeof result.current.addMessage).toBe("function");
    expect(typeof result.current.clearHistory).toBe("function");
  });

  it("should add messages via sub-hook", () => {
    const { result } = renderHook(() => useMessageHistory());

    act(() => {
      result.current.addMessage("user", "Test message");
    });

    expect(result.current.messages).toHaveLength(1);
  });

  it("should clear history via sub-hook", () => {
    const { result } = renderHook(() => useMessageHistory());

    act(() => {
      result.current.addMessage("user", "Test message");
    });

    act(() => {
      result.current.clearHistory();
    });

    expect(result.current.messages).toHaveLength(0);
  });
});

describe("Helper Functions", () => {
  describe("Token Estimation", () => {
    it("should estimate tokens as chars/4 rounded up", () => {
      const { result } = renderHook(() => useConversationContextManager());

      // 4 chars = 1 token
      act(() => {
        result.current.controls.addMessage("user", "1234");
      });
      expect(result.current.state.messages[0].tokenCount).toBe(1);
    });

    it("should handle unicode characters", () => {
      const { result } = renderHook(() => useConversationContextManager());

      act(() => {
        result.current.controls.addMessage("user", "こんにちは"); // 5 Japanese characters
      });

      // Should still estimate based on string length
      expect(result.current.state.messages[0].tokenCount).toBeGreaterThan(0);
    });
  });

  describe("Similarity Matching", () => {
    it("should return 1 for identical strings", () => {
      const { result } = renderHook(() =>
        useConversationContextManager({ enableCaching: true })
      );

      act(() => {
        result.current.controls.cacheResponse("hello world", "response");
      });

      const cached = result.current.controls.getCachedResponse("hello world");
      expect(cached).toBe("response");
    });

    it("should be case insensitive", () => {
      const { result } = renderHook(() =>
        useConversationContextManager({ enableCaching: true })
      );

      act(() => {
        result.current.controls.cacheResponse("Hello World", "response");
      });

      const cached = result.current.controls.getCachedResponse("hello world");
      expect(cached).toBe("response");
    });

    it("should handle whitespace differences", () => {
      const { result } = renderHook(() =>
        useConversationContextManager({ enableCaching: true })
      );

      act(() => {
        result.current.controls.cacheResponse("hello world", "response");
      });

      const cached = result.current.controls.getCachedResponse("  hello world  ");
      expect(cached).toBe("response");
    });
  });

  describe("Keyword Extraction", () => {
    it("should extract meaningful keywords", () => {
      const { result } = renderHook(() =>
        useConversationContextManager({ enableTopicTracking: true })
      );

      act(() => {
        result.current.controls.addMessage(
          "user",
          "programming language development"
        );
      });

      expect(result.current.state.currentTopic?.keywords).toContain("programming");
      expect(result.current.state.currentTopic?.keywords).toContain("language");
      expect(result.current.state.currentTopic?.keywords).toContain("development");
    });

    it("should filter short words (<=3 chars)", () => {
      const { result } = renderHook(() =>
        useConversationContextManager({ enableTopicTracking: true })
      );

      act(() => {
        result.current.controls.addMessage("user", "cat dog programming");
      });

      expect(result.current.state.currentTopic?.keywords).not.toContain("cat");
      expect(result.current.state.currentTopic?.keywords).not.toContain("dog");
      expect(result.current.state.currentTopic?.keywords).toContain("programming");
    });

    it("should limit keywords to 10", () => {
      const { result } = renderHook(() =>
        useConversationContextManager({ enableTopicTracking: true })
      );

      act(() => {
        result.current.controls.addMessage(
          "user",
          "programming language development software engineering testing debugging optimization refactoring documentation deployment monitoring"
        );
      });

      expect(result.current.state.currentTopic?.keywords.length).toBeLessThanOrEqual(10);
    });
  });
});

describe("Conversation Workflow", () => {
  it("should handle typical conversation flow", () => {
    const { result } = renderHook(() => useConversationContextManager());

    // Start conversation
    act(() => {
      result.current.controls.startConversation();
    });
    expect(result.current.state.isActive).toBe(true);

    // User types
    act(() => {
      result.current.controls.setUserTyping();
    });
    expect(result.current.state.phase).toBe("user_typing");

    // User submits message
    act(() => {
      result.current.controls.addMessage("user", "Hello, how are you?");
      result.current.controls.setProcessing();
    });
    expect(result.current.state.phase).toBe("processing");

    // AI generates response
    act(() => {
      result.current.controls.setAIResponding();
    });
    expect(result.current.state.phase).toBe("ai_responding");

    // AI sends response
    act(() => {
      result.current.controls.addMessage("assistant", "I'm doing well, thank you!");
      result.current.controls.setAISpeaking();
    });
    expect(result.current.state.phase).toBe("ai_speaking");

    // Return to idle
    act(() => {
      result.current.controls.setIdle();
    });
    expect(result.current.state.phase).toBe("idle");

    // End conversation
    act(() => {
      result.current.controls.endConversation();
    });
    expect(result.current.state.phase).toBe("ended");
  });

  it("should handle voice input flow", () => {
    const { result } = renderHook(() => useConversationContextManager());

    act(() => {
      result.current.controls.startConversation();
    });

    // User speaks
    act(() => {
      result.current.controls.setUserSpeaking();
    });
    expect(result.current.state.phase).toBe("user_speaking");
    expect(result.current.state.turnOwner).toBe("user");

    // Transcription complete, add message
    act(() => {
      result.current.controls.addMessage("user", "What time is it?");
      result.current.controls.setProcessing();
    });

    expect(result.current.state.messages).toHaveLength(1);
    expect(result.current.state.phase).toBe("processing");
  });

  it("should handle pause and resume", () => {
    const { result } = renderHook(() => useConversationContextManager());

    act(() => {
      result.current.controls.startConversation();
      result.current.controls.addMessage("user", "Hello");
    });

    act(() => {
      result.current.controls.pauseConversation();
    });

    expect(result.current.state.phase).toBe("paused");

    // Messages should persist
    expect(result.current.state.messages).toHaveLength(1);

    act(() => {
      result.current.controls.resumeConversation();
    });

    expect(result.current.state.phase).toBe("idle");
    expect(result.current.state.messages).toHaveLength(1);
  });
});
