/**
 * Hooks Barrel Export
 *
 * Central export for all custom hooks.
 * Sprint 226: Mobile UX improvements
 */

// Mobile/Device Detection
export { useMobileDetect, useIsMobile, useIsTouchDevice, useOrientation, useBreakpoint } from "./useMobileDetect";

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
export {
  useHapticFeedback,
  useTouchHaptic,
  useHapticButton,
  useFormHaptics,
  useGestureHaptics,
} from "./useHapticFeedback";

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

// Connection/Latency
export {
  useConnectionSpeed,
  useAdaptiveAnimationSpeed,
  useReducedDataMode,
  useImageQuality,
} from "./useConnectionSpeed";

// Focus Management
export {
  useFocusTrap,
  useFocusOnMount,
  useFocusWithin,
  useFocusCycle,
} from "./useFocusTrap";

// Media Queries
export {
  useMediaQuery,
  useIsSmall,
  useIsMedium,
  useIsLarge,
  useIsXLarge,
  useIs2XLarge,
  useIsMobileOrSmaller,
  useIsTabletOrSmaller,
  usePrefersColorScheme,
  usePrefersReducedMotion,
  usePrefersContrast,
  useOrientationQuery,
  usePointerType,
  useCanHover,
  useDisplayMode,
  useHighDPI,
  useBreakpoints,
  useHasSafeAreas,
} from "./useMediaQuery";

// Click Outside
export {
  useClickOutside,
  useClickOutsideCallback,
  useClickOutsideMultiple,
  useDismissible,
  useIsOutside,
} from "./useClickOutside";

// Portals
export {
  usePortal,
  useLayer,
  useContainerPortal,
  Portal,
} from "./usePortal";

// Timers
export {
  useTimeout,
  useInterval,
  useCountdown,
  useStopwatch,
  useDebouncedFlag,
  useDelayedRender,
  useAnimationFrame,
} from "./useTimeout";

// Long Press
export {
  useLongPress,
  useIsLongPressed,
  useLongPressCallback,
} from "./useLongPress";

// Clipboard
export {
  useClipboard,
  useCopyToClipboard,
  useCopyButton,
  useShare,
} from "./useClipboard";

// Device Capabilities
export {
  useDeviceCapabilities,
  useRenderingSettings,
  usePerformanceTier,
  useShouldReduceEffects,
} from "./useDeviceCapabilities";

// Frame Rate / Performance
export {
  useFrameRate,
  useAdaptiveQuality,
  useFrameThrottle,
} from "./useFrameRate";

// Page Visibility
export {
  useVisibility,
  useIsVisible,
  useVisibleCallback,
  useVisibleValue,
  useVisibleInterval,
  useVisibleAnimationFrame,
} from "./useVisibility";

// Wake Lock (Screen Sleep Prevention)
export {
  useWakeLock,
  useAutoWakeLock,
  useCallWakeLock,
  useBatteryAwareWakeLock,
} from "./useWakeLock";

// Avatar Performance (Unified)
export {
  useAvatarPerformance,
  useAvatarRenderSettings,
  useAvatarAnimationLoop,
  useShouldRenderAvatar,
  type RenderingSettings,
} from "./useAvatarPerformance";

// Avatar State Management
export {
  useAvatarState,
  useAvatarSpeaking,
  useAvatarMoodTransition,
  useAvatarIdleAnimations,
  type AvatarActivity,
  type AvatarMood,
  type AvatarAttention,
} from "./useAvatarState";

// Latency Optimization
export {
  useLatencyOptimizer,
  useRequestTiming,
  useAdaptiveRetry,
  useLatencyAwarePrefetch,
} from "./useLatencyOptimizer";

// Avatar Expressions
export {
  useAvatarExpressions,
  useLipSyncVisemes,
  useExpressionGaze,
  EXPRESSION_PRESETS,
  type ExpressionBlendShape,
  type BlendShapeValues,
  type ExpressionPreset,
} from "./useAvatarExpressions";

// Lip Sync
export {
  useLipSync,
  useSimpleLipSync,
  useVisemeSequence,
  VISEME_BLEND_SHAPES,
  PHONEME_TO_VISEME,
  type Viseme,
  type VisemeEvent,
} from "./useLipSync";

// Audio Visualization
export {
  useAudioVisualization,
  useAudioLevel,
  useVoiceActivity,
  useSpectrumBars,
} from "./useAudioVisualization";

// Avatar Gestures
export {
  useAvatarGestures,
  useConversationalGestures,
  GESTURE_ANIMATIONS,
  type GestureType,
  type GestureAnimation,
  type GestureKeyframe,
} from "./useAvatarGestures";

// Avatar Breathing
export {
  useAvatarBreathing,
  useBreathingIntensity,
  useActivityBreathing,
  useBreathingTransform,
  PATTERN_CONFIGS,
  type BreathingPattern,
} from "./useAvatarBreathing";

// Avatar Eye Tracking
export {
  useAvatarEyeTracking,
  useCursorFollowingEyes,
  useConversationGaze,
  useEyeGazeTransform,
  type GazeTarget,
} from "./useAvatarEyeTracking";

// Avatar Idle Variation
export {
  useAvatarIdleVariation,
  useIdleMovement,
  useIdleTransform,
  BEHAVIOR_ANIMATIONS,
  type IdleBehavior,
} from "./useAvatarIdleVariation";

// Mobile Avatar Optimizer (Sprint 232)
export {
  useMobileAvatarOptimizer,
  useIsMobileOptimized,
  useMobileAnimationInterval,
  useMobileTouchSettings,
  useMobileAvatarFeatures,
  type MobileQualityTier,
  type MobileAvatarSettings,
  type MobileAvatarMetrics,
  type MobileAvatarControls,
  type MobileAvatarOptimization,
} from "./useMobileAvatarOptimizer";

// Animation Batcher (Sprint 232)
export {
  useAnimationBatcher,
  useBatchedAnimation,
  useGlobalAnimationBatcher,
  type AnimationPriority,
  type BatchedAnimationState,
  type BatchedAnimationControls,
} from "./useAnimationBatcher";

// Touch Avatar Interaction (Sprint 232)
export {
  useTouchAvatarInteraction,
  useTouchEyeTracking,
  useAvatarTap,
  type TouchGesture,
  type TouchPosition,
  type TouchState,
  type TouchCallbacks,
  type TouchConfig,
} from "./useTouchAvatarInteraction";

// Mobile Audio Optimizer (Sprint 440)
export {
  useMobileAudioOptimizer,
  useMobileAudioQuality,
  useMobileAudioBufferConfig,
  useMobileAudioProcessingConfig,
  useOptimizedAudioConstraints,
  type AudioQuality,
  type ConnectionQuality,
  type AudioBufferConfig,
  type AudioProcessingConfig,
  type AudioLatencyMetrics,
  type AudioOptimizerControls,
  type MobileAudioOptimizerResult,
} from "./useMobileAudioOptimizer";

// Connection-Aware Streaming (Sprint 440)
export {
  useConnectionAwareStreaming,
  useWebSocketConnectionState,
  useWebSocketQualityScore,
  type ConnectionState,
  type StreamingQuality,
  type ConnectionMetrics,
  type StreamingConfig,
  type StreamingControls,
  type ConnectionAwareStreamingResult,
} from "./useConnectionAwareStreaming";

// Offline Resilience (Sprint 510)
export {
  useOfflineResilience,
  useIsOffline,
  useConnectionStability,
  useOfflineQueue,
  type ConnectionState as OfflineConnectionState,
  type MessagePriority,
  type QueuedMessage,
  type CachedState,
  type OfflineMetrics,
  type OfflineConfig,
  type OfflineControls,
  type FlushResult,
  type UseOfflineResilienceResult,
} from "./useOfflineResilience";

// Smart Prefetch (Sprint 510)
export {
  useSmartPrefetch,
  useImagePrefetch,
  useAudioPrefetch,
  useCriticalPrefetch,
  type ResourceType,
  type PrefetchPriority,
  type PrefetchStatus,
  type PrefetchResource,
  type PrefetchMetrics,
  type PrefetchConfig,
  type PrefetchControls,
  type UseSmartPrefetchResult,
} from "./useSmartPrefetch";
