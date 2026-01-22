"use client";

/**
 * useConversationSummary - Persistent Conversation Context
 *
 * Maintains a rolling summary of conversations that persists
 * across sessions. This gives EVA context about past interactions
 * without storing full transcripts.
 *
 * Stored data (privacy-conscious):
 * - Topic summaries (not full text)
 * - Emotional patterns
 * - Key facts shared
 * - Relationship milestones
 *
 * Sprint 131: Conversation memory enhancement
 */

import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "eva_conversation_summary";
const MAX_TOPICS = 20;
const MAX_FACTS = 15;

// A topic that was discussed
export interface ConversationTopic {
  id: string;
  category: "personal" | "work" | "hobby" | "emotion" | "question" | "general";
  summary: string; // Short summary (max 100 chars)
  timestamp: number;
  emotionalTone: string;
  importance: number; // 0-1
}

// A fact learned about the user
export interface UserFact {
  id: string;
  type: "preference" | "info" | "feeling" | "goal" | "relationship";
  content: string; // Short fact (max 80 chars)
  timestamp: number;
  confidence: number; // 0-1
}

// Relationship milestone
export interface RelationshipMilestone {
  id: string;
  type: "first_meeting" | "deep_conversation" | "shared_laugh" | "comfort_given" | "trust_shown";
  timestamp: number;
  description: string;
}

// Full conversation summary
export interface ConversationSummaryData {
  // Meta
  userId: string;
  firstConversation: number;
  lastConversation: number;
  totalConversations: number;

  // Topics discussed
  recentTopics: ConversationTopic[];

  // Facts about user
  userFacts: UserFact[];

  // Relationship progress
  milestones: RelationshipMilestone[];

  // Emotional history
  emotionalSummary: {
    predominantMood: string;
    moodStability: number;
    vulnerabilityLevel: number; // How much they've opened up
    joyMoments: number;
  };

  // Conversation style
  stylePreferences: {
    prefersHumor: boolean;
    prefersDeep: boolean;
    prefersQuick: boolean;
    languageFormality: "casual" | "mixed" | "formal";
  };
}

export interface ConversationSummaryState {
  // Data
  summary: ConversationSummaryData | null;
  isLoading: boolean;

  // Methods
  addTopic: (topic: Omit<ConversationTopic, "id">) => void;
  addFact: (fact: Omit<UserFact, "id">) => void;
  addMilestone: (milestone: Omit<RelationshipMilestone, "id">) => void;
  updateEmotional: (update: Partial<ConversationSummaryData["emotionalSummary"]>) => void;
  updateStyle: (update: Partial<ConversationSummaryData["stylePreferences"]>) => void;
  startNewConversation: () => void;
  clear: () => void;

  // Getters
  getContextForEva: () => string;
  getRecentTopicsSummary: () => string;
}

function getDefaultSummary(userId: string): ConversationSummaryData {
  return {
    userId,
    firstConversation: Date.now(),
    lastConversation: Date.now(),
    totalConversations: 1,
    recentTopics: [],
    userFacts: [],
    milestones: [],
    emotionalSummary: {
      predominantMood: "neutral",
      moodStability: 0.5,
      vulnerabilityLevel: 0,
      joyMoments: 0,
    },
    stylePreferences: {
      prefersHumor: true,
      prefersDeep: false,
      prefersQuick: false,
      languageFormality: "casual",
    },
  };
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useConversationSummary(userId: string = "default"): ConversationSummaryState {
  const [summary, setSummary] = useState<ConversationSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY}_${userId}`);
      if (stored) {
        const parsed = JSON.parse(stored) as ConversationSummaryData;
        setSummary(parsed);
      } else {
        setSummary(getDefaultSummary(userId));
      }
    } catch {
      setSummary(getDefaultSummary(userId));
    }
    setIsLoading(false);
  }, [userId]);

  // Save to localStorage (debounced)
  const save = useCallback((data: ConversationSummaryData) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(data));
      } catch {
        // Storage full or unavailable
      }
    }, 1000);
  }, [userId]);

  // Add topic
  const addTopic = useCallback((topic: Omit<ConversationTopic, "id">) => {
    setSummary((prev) => {
      if (!prev) return prev;

      const newTopic: ConversationTopic = {
        ...topic,
        id: generateId(),
        summary: topic.summary.slice(0, 100), // Enforce max length
      };

      const updatedTopics = [newTopic, ...prev.recentTopics].slice(0, MAX_TOPICS);

      const updated = {
        ...prev,
        recentTopics: updatedTopics,
        lastConversation: Date.now(),
      };

      save(updated);
      return updated;
    });
  }, [save]);

  // Add fact
  const addFact = useCallback((fact: Omit<UserFact, "id">) => {
    setSummary((prev) => {
      if (!prev) return prev;

      // Check for duplicate similar facts
      const isDuplicate = prev.userFacts.some(
        (f) => f.content.toLowerCase().includes(fact.content.toLowerCase().slice(0, 20))
      );

      if (isDuplicate) return prev;

      const newFact: UserFact = {
        ...fact,
        id: generateId(),
        content: fact.content.slice(0, 80),
      };

      const updatedFacts = [newFact, ...prev.userFacts].slice(0, MAX_FACTS);

      const updated = {
        ...prev,
        userFacts: updatedFacts,
      };

      save(updated);
      return updated;
    });
  }, [save]);

  // Add milestone
  const addMilestone = useCallback((milestone: Omit<RelationshipMilestone, "id">) => {
    setSummary((prev) => {
      if (!prev) return prev;

      // Check if this type of milestone already exists
      const hasType = prev.milestones.some((m) => m.type === milestone.type);
      if (hasType) return prev;

      const newMilestone: RelationshipMilestone = {
        ...milestone,
        id: generateId(),
      };

      const updated = {
        ...prev,
        milestones: [...prev.milestones, newMilestone],
      };

      save(updated);
      return updated;
    });
  }, [save]);

  // Update emotional summary
  const updateEmotional = useCallback((update: Partial<ConversationSummaryData["emotionalSummary"]>) => {
    setSummary((prev) => {
      if (!prev) return prev;

      const updated = {
        ...prev,
        emotionalSummary: {
          ...prev.emotionalSummary,
          ...update,
        },
      };

      save(updated);
      return updated;
    });
  }, [save]);

  // Update style preferences
  const updateStyle = useCallback((update: Partial<ConversationSummaryData["stylePreferences"]>) => {
    setSummary((prev) => {
      if (!prev) return prev;

      const updated = {
        ...prev,
        stylePreferences: {
          ...prev.stylePreferences,
          ...update,
        },
      };

      save(updated);
      return updated;
    });
  }, [save]);

  // Start new conversation
  const startNewConversation = useCallback(() => {
    setSummary((prev) => {
      if (!prev) return prev;

      const updated = {
        ...prev,
        totalConversations: prev.totalConversations + 1,
        lastConversation: Date.now(),
      };

      save(updated);
      return updated;
    });
  }, [save]);

  // Clear all data
  const clear = useCallback(() => {
    try {
      localStorage.removeItem(`${STORAGE_KEY}_${userId}`);
    } catch {
      // Ignore
    }
    setSummary(getDefaultSummary(userId));
  }, [userId]);

  // Get context string for EVA
  const getContextForEva = useCallback((): string => {
    if (!summary) return "";

    const parts: string[] = [];

    // Add relationship duration
    const daysTogether = Math.floor((Date.now() - summary.firstConversation) / (1000 * 60 * 60 * 24));
    if (daysTogether > 0) {
      parts.push(`Nous nous connaissons depuis ${daysTogether} jour${daysTogether > 1 ? "s" : ""}.`);
    }

    // Add conversation count
    if (summary.totalConversations > 1) {
      parts.push(`C'est notre ${summary.totalConversations}e conversation.`);
    }

    // Add recent facts
    const recentFacts = summary.userFacts.slice(0, 3);
    if (recentFacts.length > 0) {
      parts.push(`Ce que je sais: ${recentFacts.map((f) => f.content).join(", ")}.`);
    }

    // Add emotional context
    if (summary.emotionalSummary.vulnerabilityLevel > 0.5) {
      parts.push("Il/elle s'est ouvert(e) à moi.");
    }

    // Add milestones
    if (summary.milestones.length > 0) {
      const recent = summary.milestones[summary.milestones.length - 1];
      parts.push(`Moment important: ${recent.description}.`);
    }

    return parts.join(" ");
  }, [summary]);

  // Get recent topics summary
  const getRecentTopicsSummary = useCallback((): string => {
    if (!summary || summary.recentTopics.length === 0) return "";

    const topics = summary.recentTopics.slice(0, 5);
    return topics.map((t) => t.summary).join("; ");
  }, [summary]);

  return {
    summary,
    isLoading,
    addTopic,
    addFact,
    addMilestone,
    updateEmotional,
    updateStyle,
    startNewConversation,
    clear,
    getContextForEva,
    getRecentTopicsSummary,
  };
}
