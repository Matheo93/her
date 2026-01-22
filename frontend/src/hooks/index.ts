/**
 * Hooks Barrel Export
 *
 * Central export for all custom hooks.
 * Sprint 226: Mobile UX improvements
 */

// Mobile/Device Detection
export { useMobileDetect, useIsMobile, useIsTouchDevice } from "./useMobileDetect";

// Network Status
export { useNetworkStatus, useIsOnline, useIsSlowConnection } from "./useNetworkStatus";

// Debounce/Throttle
export { useDebounce, useDebouncedCallback, useThrottle, useThrottledCallback } from "./useDebounce";

// Storage
export {
  useLocalStorage,
  useSessionStorage,
  usePrevious,
  useValueChanged,
  useIsFirstRender,
} from "./useLocalStorage";

// Viewport/Keyboard
export { useKeyboard, useWindowSize, useScrollPosition, useInView } from "./useKeyboard";

// Touch Gestures
export { useTouchGestures, useSwipe, usePullToRefresh } from "./useTouchGestures";

// HER Core Hooks
export { usePersistentMemory } from "./usePersistentMemory";
export { useEmotionalWarmth } from "./useEmotionalWarmth";
export { useVoiceWarmth } from "./useVoiceWarmth";
export { useHerStatus } from "./useHerStatus";
export { useBackendMemory } from "./useBackendMemory";
export { useBackchannel, shouldTriggerBackchannel } from "./useBackchannel";
export { useDarkMode } from "./useDarkMode";
export { useReducedMotion } from "./useReducedMotion";

// Performance
export { usePerformanceMetrics } from "./usePerformanceMetrics";
export { useAudioSmoothing } from "./useAudioSmoothing";
export { useResponsePrefetch } from "./useResponsePrefetch";

// Error Handling
export { useErrorHandler } from "./useErrorHandler";

// Conversation
export { useConversationSummary } from "./useConversationSummary";
export { useConversationQuality } from "./useConversationQuality";

// Haptic
export { useHapticFeedback } from "./useHapticFeedback";

// Voice/Audio
export { useVoiceIntimacy } from "./useVoiceIntimacy";
export { useVisemeWebSocket } from "./useVisemeWebSocket";
export { useProsodyMirroring } from "./useProsodyMirroring";
export { usePresenceSound } from "./usePresenceSound";

// Emotional
export { useEmotionalMemory } from "./useEmotionalMemory";
export { useEyeContact } from "./useEyeContact";
export { useListeningIntensity } from "./useListeningIntensity";

// Presence
export { useSharedSilence } from "./useSharedSilence";
export { useProactivePresence } from "./useProactivePresence";
export { useAnticipation } from "./useAnticipation";
export { useBackchanneling } from "./useBackchanneling";
