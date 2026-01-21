"use client";

/**
 * useHerStatus - Monitor HER backend systems status
 *
 * Fetches /her/status to display the state of all HER subsystems:
 * - Memory system
 * - TTS availability
 * - LLM connection
 * - Emotional processing
 *
 * Polls periodically to keep status up-to-date.
 */

import { useState, useEffect, useCallback, useRef } from "react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

// HER subsystem status
export interface HerSubsystemStatus {
  name: string;
  available: boolean;
  details?: string;
}

// Full HER status response
export interface HerStatusResponse {
  available: boolean;
  message?: string;
  memory_system?: {
    available: boolean;
    users_count?: number;
  };
  emotional_tts?: {
    available: boolean;
    current_emotion?: string;
  };
  backchannel?: {
    available: boolean;
  };
  proactive?: {
    available: boolean;
  };
}

// Hook state
export interface HerStatusState {
  // Connection state
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
  lastUpdated: Date | null;

  // Status data
  available: boolean;
  subsystems: HerSubsystemStatus[];

  // Aggregated health
  healthScore: number; // 0-1, percentage of systems available

  // Methods
  refresh: () => Promise<void>;
}

interface UseHerStatusOptions {
  // Polling interval in ms (default: 30000 = 30s)
  pollInterval?: number;
  // Enable polling (default: true)
  enablePolling?: boolean;
  // API key for authentication
  apiKey?: string;
}

export function useHerStatus({
  pollInterval = 30000,
  enablePolling = true,
  apiKey,
}: UseHerStatusOptions = {}): HerStatusState {
  // State
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [statusData, setStatusData] = useState<HerStatusResponse | null>(null);

  // Refs for cleanup
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch status from backend
  const fetchStatus = useCallback(async () => {
    // Abort previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (apiKey) {
        headers["X-API-Key"] = apiKey;
      }

      const response = await fetch(`${BACKEND_URL}/her/status`, {
        method: "GET",
        headers,
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: HerStatusResponse = await response.json();

      setStatusData(data);
      setIsConnected(true);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // Request was aborted, ignore
        return;
      }

      setIsConnected(false);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [apiKey]);

  // Compute subsystems from status data
  const computeSubsystems = useCallback((data: HerStatusResponse | null): HerSubsystemStatus[] => {
    if (!data) {
      return [];
    }

    const subsystems: HerSubsystemStatus[] = [
      {
        name: "HER Core",
        available: data.available,
        details: data.message,
      },
    ];

    if (data.memory_system) {
      subsystems.push({
        name: "Memory System",
        available: data.memory_system.available,
        details: data.memory_system.users_count !== undefined
          ? `${data.memory_system.users_count} users tracked`
          : undefined,
      });
    }

    if (data.emotional_tts) {
      subsystems.push({
        name: "Emotional TTS",
        available: data.emotional_tts.available,
        details: data.emotional_tts.current_emotion
          ? `Current: ${data.emotional_tts.current_emotion}`
          : undefined,
      });
    }

    if (data.backchannel) {
      subsystems.push({
        name: "Backchannel",
        available: data.backchannel.available,
      });
    }

    if (data.proactive) {
      subsystems.push({
        name: "Proactive Care",
        available: data.proactive.available,
      });
    }

    return subsystems;
  }, []);

  // Compute health score
  const computeHealthScore = useCallback((subsystems: HerSubsystemStatus[]): number => {
    if (subsystems.length === 0) {
      return 0;
    }

    const availableCount = subsystems.filter((s) => s.available).length;
    return availableCount / subsystems.length;
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchStatus();

    // Cleanup on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchStatus]);

  // Set up polling
  useEffect(() => {
    if (!enablePolling) {
      return;
    }

    pollIntervalRef.current = setInterval(() => {
      fetchStatus();
    }, pollInterval);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [enablePolling, pollInterval, fetchStatus]);

  // Compute derived state
  const subsystems = computeSubsystems(statusData);
  const healthScore = computeHealthScore(subsystems);

  return {
    isLoading,
    isConnected,
    error,
    lastUpdated,
    available: statusData?.available ?? false,
    subsystems,
    healthScore,
    refresh: fetchStatus,
  };
}
