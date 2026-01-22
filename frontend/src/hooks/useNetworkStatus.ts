"use client";

/**
 * useNetworkStatus - Network Connectivity Detection
 *
 * Monitors network connectivity and connection quality.
 * Provides offline detection and connection type info.
 *
 * Sprint 226: Mobile latency improvements
 */

import { useState, useEffect, useCallback } from "react";

interface NetworkStatusResult {
  isOnline: boolean;
  wasOffline: boolean; // True if was offline since mount
  connectionType: "4g" | "3g" | "2g" | "slow-2g" | "wifi" | "ethernet" | "unknown";
  effectiveType: string | null;
  downlink: number | null; // Mbps
  rtt: number | null; // Round-trip time in ms
  saveData: boolean;
  isSlowConnection: boolean;
}

export function useNetworkStatus(): NetworkStatusResult {
  const [state, setState] = useState<NetworkStatusResult>({
    isOnline: true,
    wasOffline: false,
    connectionType: "unknown",
    effectiveType: null,
    downlink: null,
    rtt: null,
    saveData: false,
    isSlowConnection: false,
  });

  const updateNetworkInfo = useCallback(() => {
    if (typeof navigator === "undefined") return;

    const isOnline = navigator.onLine;
    const connection = (navigator as Navigator & {
      connection?: {
        effectiveType?: string;
        downlink?: number;
        rtt?: number;
        saveData?: boolean;
        type?: string;
      };
    }).connection;

    let connectionType: NetworkStatusResult["connectionType"] = "unknown";
    let effectiveType: string | null = null;
    let downlink: number | null = null;
    let rtt: number | null = null;
    let saveData = false;

    if (connection) {
      effectiveType = connection.effectiveType || null;
      downlink = connection.downlink || null;
      rtt = connection.rtt || null;
      saveData = connection.saveData || false;

      // Map connection type
      if (connection.type) {
        const type = connection.type.toLowerCase();
        if (type === "wifi") connectionType = "wifi";
        else if (type === "ethernet") connectionType = "ethernet";
        else if (type.includes("4g") || type === "cellular") connectionType = "4g";
        else if (type.includes("3g")) connectionType = "3g";
        else if (type.includes("2g")) connectionType = "2g";
      } else if (effectiveType) {
        connectionType = effectiveType as NetworkStatusResult["connectionType"];
      }
    }

    // Determine if connection is slow
    const isSlowConnection =
      !isOnline ||
      saveData ||
      effectiveType === "slow-2g" ||
      effectiveType === "2g" ||
      (rtt !== null && rtt > 500) ||
      (downlink !== null && downlink < 1);

    setState((prev) => ({
      isOnline,
      wasOffline: prev.wasOffline || !isOnline,
      connectionType,
      effectiveType,
      downlink,
      rtt,
      saveData,
      isSlowConnection,
    }));
  }, []);

  useEffect(() => {
    updateNetworkInfo();

    // Listen for online/offline events
    window.addEventListener("online", updateNetworkInfo);
    window.addEventListener("offline", updateNetworkInfo);

    // Listen for connection changes (if supported)
    const connection = (navigator as Navigator & {
      connection?: EventTarget;
    }).connection;

    if (connection) {
      connection.addEventListener("change", updateNetworkInfo);
    }

    return () => {
      window.removeEventListener("online", updateNetworkInfo);
      window.removeEventListener("offline", updateNetworkInfo);

      if (connection) {
        connection.removeEventListener("change", updateNetworkInfo);
      }
    };
  }, [updateNetworkInfo]);

  return state;
}

/**
 * Simple hook for online status only
 */
export function useIsOnline(): boolean {
  const { isOnline } = useNetworkStatus();
  return isOnline;
}

/**
 * Hook to check if connection is slow
 */
export function useIsSlowConnection(): boolean {
  const { isSlowConnection } = useNetworkStatus();
  return isSlowConnection;
}
