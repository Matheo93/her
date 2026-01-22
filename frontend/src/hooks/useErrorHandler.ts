"use client";

/**
 * useErrorHandler - Centralized Error Management
 *
 * Provides user-friendly error messages and automatic retry logic
 * for common error scenarios in the EVA interface.
 *
 * Sprint 134: Error handling improvements
 */

import { useState, useCallback, useRef } from "react";

export type ErrorCategory =
  | "network"
  | "audio"
  | "permission"
  | "websocket"
  | "api"
  | "unknown";

export interface ErrorInfo {
  id: string;
  category: ErrorCategory;
  message: string; // User-friendly message
  technicalMessage?: string; // For logging
  retryable: boolean;
  retryCount: number;
  maxRetries: number;
  timestamp: number;
}

// User-friendly error messages in French
const ERROR_MESSAGES: Record<ErrorCategory, Record<string, string>> = {
  network: {
    offline: "Connexion internet perdue. Vérifiez votre connexion.",
    timeout: "La réponse prend trop de temps. Réessayez.",
    generic: "Problème de connexion. Réessayez dans un moment.",
  },
  audio: {
    playback: "Impossible de lire l'audio. Vérifiez le volume.",
    microphone: "Impossible d'accéder au microphone.",
    context: "Erreur audio. Cliquez n'importe où pour réactiver.",
    generic: "Problème audio temporaire.",
  },
  permission: {
    microphone: "Autorisez l'accès au microphone pour parler.",
    notification: "Activez les notifications pour rester connecté.",
    generic: "Permission requise pour continuer.",
  },
  websocket: {
    closed: "Connexion interrompue. Reconnexion en cours...",
    error: "Erreur de connexion. Reconnexion automatique...",
    maxRetries: "Impossible de se connecter. Rafraîchissez la page.",
    generic: "Connexion instable.",
  },
  api: {
    rateLimit: "Trop de messages. Patientez un instant.",
    serverError: "Eva a besoin d'un moment. Réessayez.",
    notFound: "Service temporairement indisponible.",
    generic: "Erreur de service. Réessayez.",
  },
  unknown: {
    generic: "Une erreur est survenue. Réessayez.",
  },
};

// Retry configuration per category
const RETRY_CONFIG: Record<ErrorCategory, { maxRetries: number; baseDelay: number }> = {
  network: { maxRetries: 3, baseDelay: 2000 },
  audio: { maxRetries: 2, baseDelay: 500 },
  permission: { maxRetries: 0, baseDelay: 0 }, // Don't auto-retry permissions
  websocket: { maxRetries: 5, baseDelay: 1000 },
  api: { maxRetries: 3, baseDelay: 1500 },
  unknown: { maxRetries: 1, baseDelay: 1000 },
};

export interface ErrorHandlerResult {
  // Current errors
  errors: ErrorInfo[];
  latestError: ErrorInfo | null;

  // Methods
  handleError: (
    category: ErrorCategory,
    subType?: string,
    technicalMessage?: string
  ) => ErrorInfo;
  clearError: (id: string) => void;
  clearAll: () => void;
  retry: (error: ErrorInfo, retryFn: () => Promise<void>) => Promise<boolean>;

  // Toast management
  showToast: (message: string, duration?: number) => void;
  toastMessage: string | null;
}

export function useErrorHandler(): ErrorHandlerResult {
  const [errors, setErrors] = useState<ErrorInfo[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Generate unique error ID
  const generateId = useCallback(() => {
    return `err-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }, []);

  // Get user-friendly message
  const getMessage = useCallback(
    (category: ErrorCategory, subType?: string): string => {
      const messages = ERROR_MESSAGES[category];
      if (subType && messages[subType]) {
        return messages[subType];
      }
      return messages.generic || ERROR_MESSAGES.unknown.generic;
    },
    []
  );

  // Handle new error
  const handleError = useCallback(
    (
      category: ErrorCategory,
      subType?: string,
      technicalMessage?: string
    ): ErrorInfo => {
      const config = RETRY_CONFIG[category];
      const error: ErrorInfo = {
        id: generateId(),
        category,
        message: getMessage(category, subType),
        technicalMessage,
        retryable: config.maxRetries > 0,
        retryCount: 0,
        maxRetries: config.maxRetries,
        timestamp: Date.now(),
      };

      setErrors((prev) => {
        // Remove duplicate errors of same category
        const filtered = prev.filter((e) => e.category !== category);
        return [...filtered, error];
      });

      // Log technical details
      if (process.env.NODE_ENV === "development") {
        console.error(`[ERROR ${category}/${subType}]`, technicalMessage || error.message);
      }

      return error;
    },
    [generateId, getMessage]
  );

  // Clear specific error
  const clearError = useCallback((id: string) => {
    setErrors((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // Clear all errors
  const clearAll = useCallback(() => {
    setErrors([]);
  }, []);

  // Retry with exponential backoff
  const retry = useCallback(
    async (error: ErrorInfo, retryFn: () => Promise<void>): Promise<boolean> => {
      if (error.retryCount >= error.maxRetries) {
        return false;
      }

      const config = RETRY_CONFIG[error.category];
      const delay = config.baseDelay * Math.pow(1.5, error.retryCount);

      // Update retry count
      setErrors((prev) =>
        prev.map((e) =>
          e.id === error.id ? { ...e, retryCount: e.retryCount + 1 } : e
        )
      );

      await new Promise((resolve) => setTimeout(resolve, delay));

      try {
        await retryFn();
        clearError(error.id);
        return true;
      } catch {
        return false;
      }
    },
    [clearError]
  );

  // Show toast message
  const showToast = useCallback((message: string, duration: number = 4000) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }

    setToastMessage(message);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, duration);
  }, []);

  // Get latest error
  const latestError = errors.length > 0 ? errors[errors.length - 1] : null;

  return {
    errors,
    latestError,
    handleError,
    clearError,
    clearAll,
    retry,
    showToast,
    toastMessage,
  };
}

/**
 * Categorize an error from its message or type
 */
export function categorizeError(error: Error | string): {
  category: ErrorCategory;
  subType: string;
} {
  const message = typeof error === "string" ? error : error.message;
  const lower = message.toLowerCase();

  if (lower.includes("network") || lower.includes("fetch") || lower.includes("offline")) {
    return { category: "network", subType: "generic" };
  }

  if (lower.includes("audio") || lower.includes("play") || lower.includes("sound")) {
    return { category: "audio", subType: "generic" };
  }

  if (lower.includes("permission") || lower.includes("denied") || lower.includes("blocked")) {
    return { category: "permission", subType: "generic" };
  }

  if (lower.includes("websocket") || lower.includes("connection") || lower.includes("socket")) {
    return { category: "websocket", subType: "generic" };
  }

  if (lower.includes("api") || lower.includes("server") || lower.includes("500")) {
    return { category: "api", subType: "generic" };
  }

  return { category: "unknown", subType: "generic" };
}
