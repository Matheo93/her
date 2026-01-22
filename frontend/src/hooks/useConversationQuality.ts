"use client";

/**
 * useConversationQuality - Conversation Quality Analytics
 *
 * Tracks and analyzes conversation quality metrics for improving
 * the EVA experience. Provides insights into:
 * - Turn-taking balance
 * - Response relevance (based on follow-ups)
 * - Engagement level
 * - Conversation flow
 *
 * Sprint 140: Conversation quality metrics
 */

import { useState, useCallback, useRef, useMemo } from "react";

export interface ConversationTurn {
  role: "user" | "assistant";
  length: number; // Character count
  duration: number; // Milliseconds to produce
  timestamp: number;
  followedByQuestion: boolean; // Did user ask a follow-up?
  emotion?: string;
}

export interface QualityMetrics {
  // Turn balance
  userTurnCount: number;
  assistantTurnCount: number;
  turnBalance: number; // 0-1, 0.5 is perfect balance

  // Response quality indicators
  avgUserLength: number;
  avgAssistantLength: number;
  followUpRate: number; // 0-1, higher = more engaged

  // Timing
  avgResponseTime: number; // ms
  avgUserPauseTime: number; // ms between turns

  // Engagement
  engagementScore: number; // 0-100
  conversationFlow: "healthy" | "one-sided" | "sparse" | "rapid";

  // Overall
  qualityScore: number; // 0-100
}

export interface ConversationQualityResult {
  metrics: QualityMetrics;
  recordUserTurn: (length: number, duration: number, emotion?: string) => void;
  recordAssistantTurn: (length: number, duration: number) => void;
  markFollowUp: () => void;
  reset: () => void;
  getInsight: () => string;
}

const HISTORY_SIZE = 50;

function getDefaultMetrics(): QualityMetrics {
  return {
    userTurnCount: 0,
    assistantTurnCount: 0,
    turnBalance: 0.5,
    avgUserLength: 0,
    avgAssistantLength: 0,
    followUpRate: 0,
    avgResponseTime: 0,
    avgUserPauseTime: 0,
    engagementScore: 50,
    conversationFlow: "healthy",
    qualityScore: 50,
  };
}

export function useConversationQuality(): ConversationQualityResult {
  const [metrics, setMetrics] = useState<QualityMetrics>(getDefaultMetrics());
  const turnsRef = useRef<ConversationTurn[]>([]);
  const lastTurnTimeRef = useRef<number>(Date.now());

  // Record user turn
  const recordUserTurn = useCallback(
    (length: number, duration: number, emotion?: string) => {
      const now = Date.now();
      const pauseTime = now - lastTurnTimeRef.current;

      const turn: ConversationTurn = {
        role: "user",
        length,
        duration,
        timestamp: now,
        followedByQuestion: false,
        emotion,
      };

      turnsRef.current.push(turn);
      if (turnsRef.current.length > HISTORY_SIZE) {
        turnsRef.current.shift();
      }

      lastTurnTimeRef.current = now;
      recalculateMetrics(pauseTime);
    },
    []
  );

  // Record assistant turn
  const recordAssistantTurn = useCallback((length: number, duration: number) => {
    const now = Date.now();
    const responseTime = now - lastTurnTimeRef.current;

    const turn: ConversationTurn = {
      role: "assistant",
      length,
      duration,
      timestamp: now,
      followedByQuestion: false,
    };

    turnsRef.current.push(turn);
    if (turnsRef.current.length > HISTORY_SIZE) {
      turnsRef.current.shift();
    }

    lastTurnTimeRef.current = now;
    recalculateMetrics(responseTime);
  }, []);

  // Mark the last assistant turn as followed by a question
  const markFollowUp = useCallback(() => {
    const turns = turnsRef.current;
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i].role === "assistant") {
        turns[i].followedByQuestion = true;
        break;
      }
    }
    recalculateMetrics(0);
  }, []);

  // Reset metrics
  const reset = useCallback(() => {
    turnsRef.current = [];
    lastTurnTimeRef.current = Date.now();
    setMetrics(getDefaultMetrics());
  }, []);

  // Recalculate all metrics
  const recalculateMetrics = useCallback((latestTiming: number) => {
    const turns = turnsRef.current;
    if (turns.length === 0) return;

    const userTurns = turns.filter((t) => t.role === "user");
    const assistantTurns = turns.filter((t) => t.role === "assistant");

    // Turn counts and balance
    const userCount = userTurns.length;
    const assistantCount = assistantTurns.length;
    const total = userCount + assistantCount;
    const balance = total > 0 ? Math.min(userCount, assistantCount) / Math.max(userCount, assistantCount) : 0.5;

    // Average lengths
    const avgUserLen = userCount > 0
      ? userTurns.reduce((sum, t) => sum + t.length, 0) / userCount
      : 0;
    const avgAssistantLen = assistantCount > 0
      ? assistantTurns.reduce((sum, t) => sum + t.length, 0) / assistantCount
      : 0;

    // Follow-up rate (indicates engagement)
    const followUps = assistantTurns.filter((t) => t.followedByQuestion).length;
    const followUpRate = assistantCount > 0 ? followUps / assistantCount : 0;

    // Timing averages
    const responseTimes: number[] = [];
    const pauseTimes: number[] = [];
    for (let i = 1; i < turns.length; i++) {
      const timeDiff = turns[i].timestamp - turns[i - 1].timestamp;
      if (turns[i].role === "assistant") {
        responseTimes.push(timeDiff);
      } else {
        pauseTimes.push(timeDiff);
      }
    }

    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;
    const avgUserPause = pauseTimes.length > 0
      ? pauseTimes.reduce((a, b) => a + b, 0) / pauseTimes.length
      : 0;

    // Determine conversation flow
    let flow: "healthy" | "one-sided" | "sparse" | "rapid" = "healthy";
    if (balance < 0.3) {
      flow = "one-sided";
    } else if (avgUserPause > 30000) {
      flow = "sparse";
    } else if (avgUserPause < 1000 && avgResponseTime < 500) {
      flow = "rapid";
    }

    // Calculate engagement score (0-100)
    let engagement = 50;
    engagement += followUpRate * 30; // Follow-ups indicate interest
    engagement += Math.min(avgUserLen / 100, 1) * 10; // Longer messages = more invested
    engagement += balance * 10; // Good balance indicates back-and-forth
    if (flow === "one-sided") engagement -= 20;
    if (flow === "sparse") engagement -= 15;
    engagement = Math.max(0, Math.min(100, engagement));

    // Calculate overall quality score (0-100)
    let quality = 50;
    quality += balance * 20; // Turn balance
    quality += followUpRate * 25; // Engagement via follow-ups
    quality += Math.min(avgAssistantLen / 200, 1) * 15; // Substantive responses
    if (avgResponseTime > 0 && avgResponseTime < 2000) {
      quality += 10; // Fast responses
    } else if (avgResponseTime > 5000) {
      quality -= 10; // Slow responses
    }
    if (flow === "healthy") quality += 10;
    quality = Math.max(0, Math.min(100, Math.round(quality)));

    setMetrics({
      userTurnCount: userCount,
      assistantTurnCount: assistantCount,
      turnBalance: balance,
      avgUserLength: Math.round(avgUserLen),
      avgAssistantLength: Math.round(avgAssistantLen),
      followUpRate,
      avgResponseTime: Math.round(avgResponseTime),
      avgUserPauseTime: Math.round(avgUserPause),
      engagementScore: Math.round(engagement),
      conversationFlow: flow,
      qualityScore: quality,
    });
  }, []);

  // Get human-readable insight
  const getInsight = useCallback((): string => {
    const m = metrics;

    if (m.userTurnCount < 3) {
      return "Conversation vient de commencer";
    }

    if (m.qualityScore >= 80) {
      return "Conversation fluide et engagée";
    }

    if (m.conversationFlow === "one-sided") {
      if (m.userTurnCount > m.assistantTurnCount * 2) {
        return "Utilisateur très actif, Eva pourrait développer";
      }
      return "Eva parle beaucoup, laisser plus d'espace";
    }

    if (m.conversationFlow === "sparse") {
      return "Longues pauses - sujet à approfondir?";
    }

    if (m.conversationFlow === "rapid") {
      return "Échange rapide - bon rythme";
    }

    if (m.followUpRate > 0.5) {
      return "Bonne curiosité de l'utilisateur";
    }

    if (m.engagementScore < 40) {
      return "Engagement faible - varier les sujets?";
    }

    return "Conversation normale";
  }, [metrics]);

  return {
    metrics,
    recordUserTurn,
    recordAssistantTurn,
    markFollowUp,
    reset,
    getInsight,
  };
}
