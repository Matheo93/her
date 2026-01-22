"use client";

/**
 * NetworkStatusIndicator - Mobile-optimized network status display
 *
 * Shows connection status, network quality, and offline warnings.
 * Designed for mobile UX with touch-friendly interactions.
 *
 * Sprint 226: Mobile UX improvements
 */

import { useState, useEffect, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useMobileDetect } from "@/hooks/useMobileDetect";

interface NetworkStatusIndicatorProps {
  onStatusChange?: (isOnline: boolean, isSlowConnection: boolean) => void;
  showDetails?: boolean;
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

export const NetworkStatusIndicator = memo(function NetworkStatusIndicator({
  onStatusChange,
  showDetails = false,
  position = "top-right",
}: NetworkStatusIndicatorProps) {
  const network = useNetworkStatus();
  const { isMobile } = useMobileDetect();
  const [showBanner, setShowBanner] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  // Notify parent of status changes
  useEffect(() => {
    onStatusChange?.(network.isOnline, network.isSlowConnection);
  }, [network.isOnline, network.isSlowConnection, onStatusChange]);

  // Show banner when going offline or reconnecting
  useEffect(() => {
    if (!network.isOnline) {
      setShowBanner(true);
      setWasOffline(true);
    } else if (wasOffline && network.isOnline) {
      // Show reconnected message briefly
      setShowBanner(true);
      const timer = setTimeout(() => {
        setShowBanner(false);
        setWasOffline(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [network.isOnline, wasOffline]);

  // Show slow connection warning
  useEffect(() => {
    if (network.isSlowConnection && network.isOnline) {
      setShowBanner(true);
      const timer = setTimeout(() => setShowBanner(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [network.isSlowConnection, network.isOnline]);

  const dismissBanner = useCallback(() => {
    setShowBanner(false);
  }, []);

  // Position classes
  const positionClasses: Record<string, string> = {
    "top-left": "top-4 left-4",
    "top-right": "top-4 right-4",
    "bottom-left": "bottom-4 left-4",
    "bottom-right": "bottom-4 right-4",
  };

  // Get connection quality indicator
  const getConnectionQuality = (): {
    label: string;
    color: string;
    icon: string;
  } => {
    if (!network.isOnline) {
      return { label: "Hors ligne", color: "#ef4444", icon: "offline" };
    }
    if (network.isSlowConnection) {
      return { label: "Connexion lente", color: "#f59e0b", icon: "slow" };
    }
    if (network.connectionType === "wifi" || network.connectionType === "ethernet") {
      return { label: "Excellente", color: "#22c55e", icon: "excellent" };
    }
    if (network.connectionType === "4g") {
      return { label: "Bonne", color: "#22c55e", icon: "good" };
    }
    if (network.connectionType === "3g") {
      return { label: "Moyenne", color: "#f59e0b", icon: "medium" };
    }
    return { label: "Connecté", color: "#22c55e", icon: "good" };
  };

  const quality = getConnectionQuality();

  return (
    <>
      {/* Connection indicator dot */}
      {showDetails && (
        <div
          className={`fixed ${positionClasses[position]} z-50 flex items-center gap-2`}
          style={{
            padding: isMobile ? "8px 12px" : "6px 10px",
            borderRadius: "20px",
            backgroundColor: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(8px)",
          }}
        >
          <motion.div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: quality.color }}
            animate={{
              scale: network.isOnline ? [1, 1.2, 1] : 1,
              opacity: network.isOnline ? 1 : 0.5,
            }}
            transition={{
              repeat: network.isOnline ? Infinity : 0,
              duration: 2,
              ease: "easeInOut",
            }}
          />
          <span
            className="text-xs font-medium"
            style={{ color: "white" }}
          >
            {quality.label}
          </span>
          {network.rtt !== null && (
            <span
              className="text-xs opacity-60"
              style={{ color: "white" }}
            >
              {network.rtt}ms
            </span>
          )}
        </div>
      )}

      {/* Full-width banner for important status changes */}
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed top-0 left-0 right-0 z-50"
            style={{
              backgroundColor: network.isOnline
                ? wasOffline
                  ? "#22c55e"
                  : network.isSlowConnection
                  ? "#f59e0b"
                  : "#22c55e"
                : "#ef4444",
              padding: isMobile ? "16px 20px" : "12px 20px",
              paddingTop: isMobile ? "calc(16px + env(safe-area-inset-top))" : "12px",
            }}
            onClick={dismissBanner}
            role="alert"
            aria-live="polite"
          >
            <div className="flex items-center justify-center gap-3 max-w-screen-md mx-auto">
              {/* Icon */}
              <div className="flex-shrink-0">
                {!network.isOnline ? (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                  >
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
                    <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
                    <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
                    <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
                    <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                    <line x1="12" y1="20" x2="12.01" y2="20" />
                  </svg>
                ) : wasOffline ? (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                  >
                    <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                    <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                    <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                    <circle cx="12" cy="20" r="1" fill="white" />
                  </svg>
                ) : (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                )}
              </div>

              {/* Message */}
              <span
                className="text-sm font-medium"
                style={{ color: "white" }}
              >
                {!network.isOnline
                  ? "Pas de connexion internet"
                  : wasOffline
                  ? "Connexion rétablie"
                  : network.isSlowConnection
                  ? "Connexion lente - réponses peuvent être plus lentes"
                  : "Connecté"}
              </span>

              {/* Dismiss button */}
              {network.isOnline && (
                <button
                  onClick={dismissBanner}
                  className="flex-shrink-0 p-1 rounded-full hover:bg-white/20 transition-colors"
                  style={{ touchAction: "manipulation" }}
                  aria-label="Fermer"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>

            {/* Network details for debugging (dev only) */}
            {process.env.NODE_ENV === "development" && network.downlink !== null && (
              <div
                className="text-xs text-center mt-1 opacity-70"
                style={{ color: "white" }}
              >
                {network.connectionType} | {network.downlink} Mbps | {network.rtt}ms RTT
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});
