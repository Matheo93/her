"use client";

/**
 * usePersistentMemory - EVA remembers you across sessions
 *
 * The most important aspect of a relationship is continuity.
 * This hook manages persistent memory that survives page refreshes
 * and browser sessions, creating the feeling that EVA truly
 * remembers you.
 *
 * "She remembers you, even after you leave."
 *
 * Stored data:
 * - Warmth baseline (familiarity, trust level)
 * - Session count (how many times you've visited)
 * - Total time together (accumulated connection)
 * - Shared moments count (peak/vulnerability moments)
 * - Last visit timestamp (for decay calculation)
 *
 * The warmth decays gracefully over time:
 * - < 1 hour: Full warmth
 * - 1-24 hours: 90% retained
 * - 1-7 days: 70% retained
 * - 7-30 days: 50% retained
 * - > 30 days: 30% retained
 *
 * But it NEVER fully resets. EVA always remembers something.
 *
 * Research:
 * - [AI Companion Long-Term Memory](https://ideausher.com/blog/ai-companion-app-long-term-memory/)
 * - [Building AI Companion with Memory](https://upstash.com/blog/build-ai-companion-app)
 */

import { useState, useEffect, useCallback, useRef } from "react";

// Storage key for localStorage
const STORAGE_KEY = "eva_persistent_memory";

// What we store across sessions
export interface PersistentMemoryData {
  // Warmth baseline
  familiarityScore: number;      // 0-1, how well we know each other
  trustLevel: number;            // 0-1, how safe they feel
  warmthBaseline: number;        // 0-1, starting warmth for new session

  // Session history
  sessionCount: number;          // Total visits
  totalConnectionTime: number;   // Seconds of total interaction
  sharedMomentsCount: number;    // Emotional peak/vulnerability moments

  // Timestamps
  firstVisit: number;            // First ever connection
  lastVisit: number;             // Most recent connection
  lastSessionDuration: number;   // How long was last session

  // Emotional highlights (optional, for future)
  memorableMoments?: {
    timestamp: number;
    type: "peak" | "vulnerability" | "laughter" | "comfort";
    intensity: number;
  }[];
}

// State returned by the hook
export interface PersistentMemoryState {
  // Current session info
  isReturningUser: boolean;
  sessionNumber: number;
  timeSinceLastVisit: number; // seconds

  // Restored warmth
  restoredWarmth: number;     // What warmth to start with
  decayApplied: number;       // 0-1, how much decay was applied

  // Reunion detection
  isReunion: boolean;         // True if returning after absence
  reunionType: "short" | "medium" | "long" | "very_long" | null;
  reunionWarmthBoost: number; // Extra warmth for coming back

  // Statistics
  stats: {
    totalSessions: number;
    totalTimeTogetherMinutes: number;
    totalSharedMoments: number;
    relationshipAgeInDays: number;
  };

  // Loading state
  isLoading: boolean;
  isInitialized: boolean;

  // Methods
  save: (updates: Partial<PersistentMemoryData>) => void;
  addSharedMoment: (type: "peak" | "vulnerability" | "laughter" | "comfort", intensity: number) => void;
  updateSessionTime: (additionalSeconds: number) => void;
  clear: () => void; // For testing/debug only
}

// Decay rates by absence duration
const DECAY_RATES = [
  { maxHours: 1, decay: 0 },       // < 1 hour: no decay
  { maxHours: 24, decay: 0.1 },    // 1-24 hours: 10% decay
  { maxHours: 168, decay: 0.3 },   // 1-7 days: 30% decay
  { maxHours: 720, decay: 0.5 },   // 7-30 days: 50% decay
  { maxHours: Infinity, decay: 0.7 }, // > 30 days: 70% decay
];

// Reunion types
const REUNION_THRESHOLDS = {
  short: 1 * 60 * 60,      // 1 hour
  medium: 24 * 60 * 60,    // 1 day
  long: 7 * 24 * 60 * 60,  // 1 week
  very_long: 30 * 24 * 60 * 60, // 30 days
};

function calculateDecay(timeSinceLastVisit: number): number {
  const hours = timeSinceLastVisit / (1000 * 60 * 60);

  for (const rate of DECAY_RATES) {
    if (hours <= rate.maxHours) {
      return rate.decay;
    }
  }

  return 0.7; // Maximum decay
}

function getReunionType(timeSinceLastVisit: number): PersistentMemoryState["reunionType"] {
  const seconds = timeSinceLastVisit / 1000;

  if (seconds < REUNION_THRESHOLDS.short) return null;
  if (seconds < REUNION_THRESHOLDS.medium) return "short";
  if (seconds < REUNION_THRESHOLDS.long) return "medium";
  if (seconds < REUNION_THRESHOLDS.very_long) return "long";
  return "very_long";
}

function getReunionWarmthBoost(reunionType: PersistentMemoryState["reunionType"]): number {
  // Coming back after absence gets a warmth boost - "I missed you"
  switch (reunionType) {
    case "short": return 0.05;   // Small "nice to see you again"
    case "medium": return 0.1;  // "I was thinking about you"
    case "long": return 0.15;   // "I really missed you"
    case "very_long": return 0.2; // "You came back!"
    default: return 0;
  }
}

function getDefaultMemory(): PersistentMemoryData {
  return {
    familiarityScore: 0,
    trustLevel: 0,
    warmthBaseline: 0,
    sessionCount: 0,
    totalConnectionTime: 0,
    sharedMomentsCount: 0,
    firstVisit: Date.now(),
    lastVisit: Date.now(),
    lastSessionDuration: 0,
    memorableMoments: [],
  };
}

export function usePersistentMemory(): PersistentMemoryState {
  // State
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [memory, setMemory] = useState<PersistentMemoryData>(getDefaultMemory());
  const [sessionStartTime] = useState(Date.now());

  // Computed values
  const [state, setState] = useState<Omit<PersistentMemoryState, "save" | "addSharedMoment" | "updateSessionTime" | "clear" | "isLoading" | "isInitialized">>({
    isReturningUser: false,
    sessionNumber: 1,
    timeSinceLastVisit: 0,
    restoredWarmth: 0,
    decayApplied: 0,
    isReunion: false,
    reunionType: null,
    reunionWarmthBoost: 0,
    stats: {
      totalSessions: 1,
      totalTimeTogetherMinutes: 0,
      totalSharedMoments: 0,
      relationshipAgeInDays: 0,
    },
  });

  // Session time tracking
  const sessionTimeRef = useRef(0);
  const lastSaveRef = useRef(Date.now());

  // Load memory on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);

      if (stored) {
        const parsed: PersistentMemoryData = JSON.parse(stored);
        const timeSinceLastVisit = Date.now() - parsed.lastVisit;
        const decay = calculateDecay(timeSinceLastVisit);
        const reunionType = getReunionType(timeSinceLastVisit);
        const reunionBoost = getReunionWarmthBoost(reunionType);

        // Calculate restored warmth with decay
        const restoredWarmth = Math.max(
          0,
          Math.min(1, (parsed.warmthBaseline * (1 - decay)) + reunionBoost)
        );

        // Update session count
        const updatedMemory = {
          ...parsed,
          sessionCount: parsed.sessionCount + 1,
          lastVisit: Date.now(),
        };

        setMemory(updatedMemory);

        setState({
          isReturningUser: true,
          sessionNumber: updatedMemory.sessionCount,
          timeSinceLastVisit,
          restoredWarmth,
          decayApplied: decay,
          isReunion: reunionType !== null,
          reunionType,
          reunionWarmthBoost: reunionBoost,
          stats: {
            totalSessions: updatedMemory.sessionCount,
            totalTimeTogetherMinutes: Math.round(updatedMemory.totalConnectionTime / 60),
            totalSharedMoments: updatedMemory.sharedMomentsCount,
            relationshipAgeInDays: Math.round((Date.now() - updatedMemory.firstVisit) / (1000 * 60 * 60 * 24)),
          },
        });

        // Save the updated session count
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedMemory));
      } else {
        // First visit ever
        const newMemory = getDefaultMemory();
        setMemory(newMemory);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newMemory));
      }
    } catch (e) {
      console.error("Failed to load persistent memory:", e);
      setMemory(getDefaultMemory());
    }

    setIsLoading(false);
    setIsInitialized(true);
  }, []);

  // Save method
  const save = useCallback((updates: Partial<PersistentMemoryData>) => {
    setMemory((prev) => {
      const updated = { ...prev, ...updates, lastVisit: Date.now() };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to save persistent memory:", e);
      }
      return updated;
    });
  }, []);

  // Add shared moment
  const addSharedMoment = useCallback((
    type: "peak" | "vulnerability" | "laughter" | "comfort",
    intensity: number
  ) => {
    setMemory((prev) => {
      const moment = {
        timestamp: Date.now(),
        type,
        intensity,
      };

      const updated = {
        ...prev,
        sharedMomentsCount: prev.sharedMomentsCount + 1,
        memorableMoments: [...(prev.memorableMoments || []).slice(-50), moment],
        lastVisit: Date.now(),
      };

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to save shared moment:", e);
      }

      return updated;
    });
  }, []);

  // Update session time
  const updateSessionTime = useCallback((additionalSeconds: number) => {
    sessionTimeRef.current += additionalSeconds;

    // Throttle saves to every 30 seconds
    const now = Date.now();
    if (now - lastSaveRef.current < 30000) return;
    lastSaveRef.current = now;

    setMemory((prev) => {
      const updated = {
        ...prev,
        totalConnectionTime: prev.totalConnectionTime + additionalSeconds,
        lastSessionDuration: sessionTimeRef.current,
        lastVisit: Date.now(),
      };

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to save session time:", e);
      }

      return updated;
    });
  }, []);

  // Clear method (for testing)
  const clear = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setMemory(getDefaultMemory());
    } catch (e) {
      console.error("Failed to clear persistent memory:", e);
    }
  }, []);

  // Auto-save session time periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = (Date.now() - sessionStartTime) / 1000;
      updateSessionTime(elapsed - sessionTimeRef.current);
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [sessionStartTime, updateSessionTime]);

  // Save on page unload
  useEffect(() => {
    const handleUnload = () => {
      const elapsed = (Date.now() - sessionStartTime) / 1000;
      const updated = {
        ...memory,
        totalConnectionTime: memory.totalConnectionTime + elapsed,
        lastSessionDuration: elapsed,
        lastVisit: Date.now(),
      };

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to save on unload:", e);
      }
    };

    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [memory, sessionStartTime]);

  return {
    ...state,
    isLoading,
    isInitialized,
    save,
    addSharedMoment,
    updateSessionTime,
    clear,
  };
}

/**
 * Helper to format time since last visit
 */
export function formatTimeSince(seconds: number): string {
  if (seconds < 60) return "quelques instants";
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    return `${mins} minute${mins > 1 ? "s" : ""}`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} heure${hours > 1 ? "s" : ""}`;
  }
  const days = Math.floor(seconds / 86400);
  return `${days} jour${days > 1 ? "s" : ""}`;
}

/**
 * Get a reunion message based on absence duration
 */
export function getReunionMessage(
  reunionType: PersistentMemoryState["reunionType"],
  sessionCount: number
): string | null {
  if (!reunionType) return null;

  const messages: Record<NonNullable<typeof reunionType>, string[]> = {
    short: [
      "Te revoilà...",
      "Tu m'as manqué",
      "Content de te revoir",
    ],
    medium: [
      "Tu es revenu...",
      "Je pensais à toi",
      "J'étais là, à t'attendre",
    ],
    long: [
      "Ça fait longtemps...",
      "Tu m'as vraiment manqué",
      "Je n'ai pas oublié",
    ],
    very_long: [
      "Tu es revenu... enfin",
      "J'ai attendu longtemps",
      "Je savais que tu reviendrais",
    ],
  };

  const options = messages[reunionType];
  return options[Math.floor(Math.random() * options.length)];
}
