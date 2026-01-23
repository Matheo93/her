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
  useFrameRate as useBasicFrameRate,
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
  type ConnectionQuality as AudioConnectionQuality,
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

// Avatar Micro-Interactions (Sprint 511)
export {
  useAvatarMicroInteractions,
  useTypingAcknowledgment,
  usePauseCuriosity,
  useAttentionShift,
  useEmpathySignals,
  type MicroInteractionType,
  type InteractionIntensity,
  type MicroInteraction,
  type MicroInteractionTrigger,
  type MicroInteractionState,
  type MicroInteractionMetrics,
  type MicroInteractionConfig,
  type MicroInteractionControls,
  type UseAvatarMicroInteractionsResult,
} from "./useAvatarMicroInteractions";

// Predictive Latency (Sprint 511)
export {
  usePredictiveLatency,
  useTypingPrediction,
  useAdaptiveTimeout,
  usePrewarmedConnection,
  type UserAction,
  type PredictedAction,
  type BehaviorPattern,
  type LatencyMetrics,
  type PredictionMetrics,
  type PredictiveLatencyConfig,
  type PrefetchRequest,
  type ConnectionState as PredictiveConnectionState,
  type PredictiveLatencyState,
  type PredictiveLatencyControls,
  type UsePredictiveLatencyResult,
} from "./usePredictiveLatency";

// Mobile Render Optimizer (Sprint 511)
export {
  useMobileRenderOptimizer,
  useRenderOptimizationStyles,
  useAdaptiveCanvasSize,
  useFrameRateAwareAnimation,
  type RenderQuality,
  type GPUTier,
  type GPUInfo,
  type DeviceProfile,
  type RenderSettings,
  type FrameBudget,
  type RenderMetrics,
  type MobileRenderConfig,
  type RenderOptimizationHints,
  type MobileRenderControls,
  type UseMobileRenderOptimizerResult,
} from "./useMobileRenderOptimizer";

// Avatar Emotional Transitions (Sprint 512)
export {
  useAvatarEmotionalTransitions,
  useSentimentEmotions,
  useConversationEmotions,
  type EmotionType,
  type TransitionEasing,
  type EmotionBlendShapes,
  type TransitionConfig,
  type EmotionTransition,
  type MicroExpressionOverlay,
  type EmotionalMemory,
  type EmotionalTransitionState,
  type EmotionalTransitionMetrics,
  type EmotionalTransitionConfig,
  type EmotionalTransitionControls,
  type UseAvatarEmotionalTransitionsResult,
} from "./useAvatarEmotionalTransitions";

// Network Latency Monitor (Sprint 512)
export {
  useNetworkLatencyMonitor,
  useCurrentLatency,
  useNetworkAlerts,
  useAdaptiveNetworkSettings,
  type NetworkQuality,
  type ConnectionType,
  type LatencySample,
  type LatencyStats,
  type NetworkMetrics,
  type QualityAssessment,
  type RecommendedSettings,
  type LatencyAlert,
  type NetworkLatencyConfig,
  type NetworkLatencyControls,
  type UseNetworkLatencyMonitorResult,
} from "./useNetworkLatencyMonitor";

// Mobile Gesture Optimizer (Sprint 512)
export {
  useMobileGestureOptimizer,
  useTapGesture,
  useSwipeGesture,
  usePinchGesture,
  type GestureType as MobileGestureType,
  type GesturePhase,
  type TouchPoint,
  type GestureVelocity,
  type Gesture as MobileGesture,
  type GesturePrediction,
  type GestureFilter,
  type GestureOptimizerState,
  type GestureOptimizerMetrics,
  type GestureOptimizerConfig,
  type GestureCallbacks,
  type GestureOptimizerControls,
  type UseMobileGestureOptimizerResult,
} from "./useMobileGestureOptimizer";

// Avatar Attention System (Sprint 513)
export {
  useAvatarAttentionSystem,
  useUserFaceAttention,
  useConversationAttention,
  type AttentionTargetType,
  type AttentionPriority,
  type GazePattern,
  type AttentionTarget,
  type GazeState,
  type AttentionMetrics,
  type AttentionConfig,
  type AttentionSystemState,
  type AttentionControls,
  type UseAvatarAttentionSystemResult,
} from "./useAvatarAttentionSystem";

// Adaptive Streaming Quality (Sprint 513)
export {
  useAdaptiveStreamingQuality,
  useStreamingQuality,
  useBufferHealth,
  type StreamQualityLevel,
  type BufferHealth,
  type QualityTrend,
  type QualityProfile,
  type BufferState,
  type BandwidthEstimate as StreamBandwidthEstimate,
  type QualityTransition,
  type StreamingMetrics,
  type AdaptiveStreamingConfig,
  type AdaptiveStreamingState,
  type AdaptiveStreamingControls,
  type UseAdaptiveStreamingQualityResult,
} from "./useAdaptiveStreamingQuality";

// Mobile Memory Optimizer (Sprint 513)
export {
  useMobileMemoryOptimizer,
  useImageMemoryManager,
  useMemoryPressureAlert,
  type MemoryPressureLevel,
  type CacheEvictionStrategy,
  type ResourceType as MemoryResourceType,
  type ManagedResource,
  type MemoryStats,
  type MemoryBudget,
  type EvictionResult,
  type MemoryOptimizerConfig,
  type MemoryOptimizerState,
  type MemoryOptimizerControls,
  type UseMobileMemoryOptimizerResult,
} from "./useMobileMemoryOptimizer";

// Avatar Reactive Animations (Sprint 1586)
export {
  useAvatarReactiveAnimations,
  useConversationAnimations,
  type ReactiveAnimationType,
  type AnimationTrigger,
  type AnimationPhase,
  type AnimationKeyframe,
  type ReactiveAnimation,
  type AnimationState,
  type AnimationMetrics,
  type ReactiveAnimationConfig,
  type ReactiveAnimationControls,
  type UseAvatarReactiveAnimationsResult,
} from "./useAvatarReactiveAnimations";

// Input Latency Reducer (Sprint 1586)
export {
  useInputLatencyReducer,
  useOptimisticTextInput,
  useAutoSaveInput,
  type OptimisticUpdateStatus,
  type OptimisticUpdate,
  type PredictedInput,
  type RequestBatch,
  type LatencyStats as InputLatencyStats,
  type InputLatencyMetrics,
  type InputLatencyConfig,
  type InputLatencyState,
  type InputLatencyControls,
  type UseInputLatencyReducerResult,
} from "./useInputLatencyReducer";

// Mobile Battery Optimizer (Sprint 1586)
export {
  useMobileBatteryOptimizer,
  useBatteryLevel,
  useBatteryAwareFeature,
  type BatteryLevel,
  type PowerMode,
  type FeatureCategory,
  type BatteryState,
  type FeatureConfig,
  type PowerProfile,
  type BatteryMetrics,
  type BatteryOptimizerConfig,
  type BatteryOptimizerState,
  type BatteryOptimizerControls,
  type UseMobileBatteryOptimizerResult,
} from "./useMobileBatteryOptimizer";

// Avatar Breathing System (Sprint 1587)
export {
  useAvatarBreathingSystem,
  useBreathingKeyframe,
  useConversationBreathing,
  type BreathingPattern as AvatarBreathingPattern,
  type BreathingPhase,
  type BreathingKeyframe,
  type BreathingCycle,
  type BreathingState,
  type BreathingMetrics as AvatarBreathingMetrics,
  type BreathingConfig as AvatarBreathingConfig,
  type BreathingControls,
  type UseAvatarBreathingSystemResult,
} from "./useAvatarBreathingSystem";

// Voice Activity Detector (Sprint 1587)
export {
  useVoiceActivityDetector,
  useSpeechDetection,
  useAudioLevels,
  type VoiceActivityState,
  type AudioQuality as VADAudioQuality,
  type AudioLevels as VADAudioLevels,
  type VoiceActivityEvent,
  type SpeechSegment,
  type NoiseProfile,
  type VADState,
  type VADMetrics,
  type VADConfig,
  type VADControls,
  type UseVoiceActivityDetectorResult,
} from "./useVoiceActivityDetector";

// Mobile Thermal Manager (Sprint 1587)
export {
  useMobileThermalManager,
  useThermalState,
  useThermalAwareFeature,
  type ThermalState,
  type WorkloadType,
  type ThermalTrend,
  type ThermalReading,
  type WorkloadProfile,
  type ThermalBudget,
  type CooldownPeriod,
  type ThermalManagerState,
  type ThermalMetrics,
  type ThermalConfig,
  type ThermalControls,
  type UseMobileThermalManagerResult,
} from "./useMobileThermalManager";

// Avatar Lip Sync (Sprint 1588)
export {
  useAvatarLipSync,
  useMouthState,
  useVisemeWeights,
  phonemesToVisemes,
  type Viseme as AvatarViseme,
  type VisemeWeight,
  type VisemeFrame,
  type LipSyncState,
  type LipSyncMetrics,
  type LipSyncConfig,
  type LipSyncControls,
  type UseAvatarLipSyncResult,
} from "./useAvatarLipSync";

// Touch Feedback Optimizer (Sprint 1588)
export {
  useTouchFeedbackOptimizer,
  useHapticFeedback as useTouchHapticFeedback,
  useTouchRipple,
  type HapticPattern,
  type FeedbackType as TouchFeedbackType,
  type TouchPoint as FeedbackTouchPoint,
  type RippleEffect,
  type FeedbackEvent,
  type TouchFeedbackState,
  type FeedbackMetrics as TouchFeedbackMetrics,
  type TouchFeedbackConfig,
  type TouchFeedbackControls,
  type UseTouchFeedbackOptimizerResult,
} from "./useTouchFeedbackOptimizer";

// Mobile Network Recovery (Sprint 1588)
export {
  useMobileNetworkRecovery,
  useOnlineStatus,
  useOfflineQueue as useRecoveryQueue,
  type NetworkState as RecoveryNetworkState,
  type ConnectionType as NetworkConnectionType,
  type RecoveryStrategy,
  type QueuedRequest,
  type NetworkQuality as RecoveryNetworkQuality,
  type SyncState as NetworkSyncState,
  type RecoveryState,
  type RecoveryMetrics,
  type RecoveryConfig,
  type RecoveryControls,
  type UseMobileNetworkRecoveryResult,
} from "./useMobileNetworkRecovery";

// Avatar Blink Controller (Sprint 1589)
export {
  useAvatarBlinkController,
  useEyeClosure,
  useConversationBlink,
  type BlinkType,
  type BlinkPhase,
  type BlinkKeyframe,
  type BlinkAnimation,
  type BlinkState,
  type BlinkMetrics,
  type BlinkConfig,
  type BlinkControls,
  type UseAvatarBlinkControllerResult,
} from "./useAvatarBlinkController";

// Mobile Frame Scheduler (Sprint 1589)
export {
  useMobileFrameScheduler,
  useFpsMonitor,
  useScheduledCallback,
  type TaskPriority,
  type FramePhase,
  type ScheduledTask,
  type FrameInfo,
  type SchedulerState as FrameSchedulerState,
  type SchedulerMetrics as FrameSchedulerMetrics,
  type SchedulerConfig as FrameSchedulerConfig,
  type SchedulerControls as FrameSchedulerControls,
  type UseMobileFrameSchedulerResult,
} from "./useMobileFrameScheduler";

// Adaptive Audio Buffer (Sprint 1589)
export {
  useAdaptiveAudioBuffer,
  useBufferHealth as useAudioBufferHealth,
  useAdaptiveAudioStream,
  type BufferState as AudioBufferPlaybackState,
  type AudioStreamQuality,
  type BufferSegment,
  type BufferHealth as AudioBufferHealth,
  type AudioBufferState,
  type BufferMetrics as AudioBufferMetrics,
  type AudioBufferConfig as AdaptiveAudioBufferConfig,
  type AudioBufferControls,
  type UseAdaptiveAudioBufferResult,
} from "./useAdaptiveAudioBuffer";

// Avatar Head Tracking (Sprint 1590)
export {
  useAvatarHeadTracking,
  useHeadPose,
  useConversationHeadTracking,
  type HeadPose,
  type HeadGesture,
  type TrackingMode as HeadTrackingMode,
  type AttentionTarget as HeadAttentionTarget,
  type HeadTrackingState,
  type HeadTrackingMetrics,
  type HeadTrackingConfig,
  type HeadTrackingControls,
  type UseAvatarHeadTrackingResult,
} from "./useAvatarHeadTracking";

// Mobile Wake Lock (Sprint 1590)
export {
  useMobileWakeLock,
  useSimpleWakeLock,
  useConversationWakeLock,
  type WakeLockState,
  type WakeLockReason,
  type WakeLockSession,
  type WakeLockStatus,
  type WakeLockMetrics,
  type WakeLockConfig,
  type WakeLockControls,
  type UseMobileWakeLockResult,
} from "./useMobileWakeLock";

// Streaming Text Renderer (Sprint 1590)
export {
  useStreamingTextRenderer,
  useStreamingText,
  useTypewriter,
  type StreamingMode as TextStreamingMode,
  type StreamingState as TextStreamingState,
  type TextChunk,
  type StreamingProgress,
  type StreamingTextState,
  type StreamingMetrics as TextStreamingMetrics,
  type StreamingConfig as TextStreamingConfig,
  type StreamingControls as TextStreamingControls,
  type UseStreamingTextRendererResult,
} from "./useStreamingTextRenderer";

// Avatar Eyebrow Controller (Sprint 1591)
export {
  useAvatarEyebrowController,
  useEyebrowExpression,
  useEmotionSyncedEyebrows,
  type EyebrowExpression,
  type EyebrowSide,
  type EyebrowPose,
  type EyebrowKeyframe,
  type EyebrowAnimation,
  type EyebrowState,
  type EyebrowMetrics,
  type EyebrowConfig,
  type EyebrowControls,
  type UseAvatarEyebrowControllerResult,
} from "./useAvatarEyebrowController";

// Mobile Viewport Optimizer (Sprint 1591)
export {
  useMobileViewportOptimizer,
  useViewportDimensions,
  useKeyboardAwareHeight,
  useSafeAreaInsets,
  type ViewportOrientation,
  type KeyboardState as ViewportKeyboardState,
  type SafeAreaInsets,
  type ViewportDimensions,
  type ViewportState,
  type ViewportMetrics,
  type ViewportConfig,
  type ViewportControls,
  type UseMobileViewportOptimizerResult,
} from "./useMobileViewportOptimizer";

// Conversation Context Manager (Sprint 1591)
export {
  useConversationContextManager,
  useConversationPhase,
  useMessageHistory,
  type ConversationPhase,
  type TurnOwner,
  type MessageRole,
  type ConversationMessage,
  type ConversationTopic,
  type ContextWindow,
  type ConversationState as ConversationContextState,
  type ConversationMetrics as ConversationContextMetrics,
  type ConversationConfig,
  type CachedResponse,
  type ConversationControls,
  type UseConversationContextManagerResult,
} from "./useConversationContextManager";

// Avatar State Recovery (Sprint 515)
export {
  useAvatarStateRecovery,
  useAvatarStatePersistence,
  useConversationAvatarRecovery,
  type AvatarPose,
  type AvatarExpressionState,
  type AvatarAnimationState,
  type AvatarLookAtState,
  type RecoverableAvatarState,
  type RecoveryStatus as AvatarRecoveryStatus,
  type RecoveryResult as AvatarRecoveryResult,
  type StateCheckpoint as AvatarStateCheckpoint,
  type RecoveryMetrics as AvatarRecoveryMetrics,
  type RecoveryConfig as AvatarRecoveryConfig,
  type RecoveryControls as AvatarRecoveryControls,
  type RecoveryState as AvatarRecoveryState,
  type UseAvatarStateRecoveryResult,
} from "./useAvatarStateRecovery";

// Request Coalescer (Sprint 515)
export {
  useRequestCoalescer,
  useCoalescedRequest,
  useChatRequestCoalescer,
  type RequestPriority,
  type RequestStatus,
  type RequestConfig,
  type TrackedRequest,
  type RequestBatch as CoalescerRequestBatch,
  type CoalescedResponse,
  type BatchResponse,
  type CoalescerMetrics,
  type CoalescerConfig,
  type CoalescerControls,
  type CoalescerState,
  type UseRequestCoalescerResult,
} from "./useRequestCoalescer";

// Avatar Preloader (Sprint 515 Iteration 2)
export {
  useAvatarPreloader,
  useAvatarModelPreload,
  useAvatarAssetsPreload,
  type AssetType,
  type PreloadPriority,
  type AssetStatus,
  type NetworkQuality as PreloaderNetworkQuality,
  type PreloadAsset,
  type TrackedAsset as PreloadTrackedAsset,
  type PreloadProgress,
  type PreloadMetrics,
  type PreloaderConfig,
  type PreloaderControls,
  type PreloaderState,
  type UseAvatarPreloaderResult,
} from "./useAvatarPreloader";

// Mobile Latency Compensator (Sprint 515 Iteration 2)
export {
  useMobileLatencyCompensator,
  useOptimisticUpdate,
  useLatencyAwareLoading,
  type CompensationState as LatencyCompensationState,
  type LatencyLevel,
  type UIHint,
  type OptimisticUpdate as LatencyOptimisticUpdate,
  type LatencySample as CompensatorLatencySample,
  type LatencyPrediction,
  type CompensatorMetrics as MobileCompensatorMetrics,
  type CompensatorConfig as MobileCompensatorConfig,
  type CompensatorControls as MobileCompensatorControls,
  type CompensatorStateInfo,
  type UseMobileLatencyCompensatorResult,
} from "./useMobileLatencyCompensator";

// Mobile Avatar Latency Mitigator (Sprint 520)
export {
  useMobileAvatarLatencyMitigator,
  usePoseInterpolation,
  useTouchLatencyMeasurement,
  type AvatarPose as MitigatorAvatarPose,
  type LatencyPoint,
  type FrameTiming,
  type TouchLatency,
  type InterpolationMode,
  type MitigationStrategy,
  type PredictionConfidence,
  type MitigatorState,
  type MitigatorMetrics,
  type MitigatorConfig,
  type MitigatorControls,
  type UseMobileAvatarLatencyMitigatorResult,
} from "./useMobileAvatarLatencyMitigator";

// Touch Response Optimizer (Sprint 516)
export {
  useTouchResponseOptimizer,
  useOptimizedTouchHandler,
  useTouchFeedbackPosition,
  useTouchVelocity,
  type TouchPriority,
  type TouchEventType,
  type TrackedTouch,
  type OptimizedTouchEvent,
  type ImmediateFeedback,
  type ResponseTiming,
  type OptimizerState,
  type OptimizerMetrics,
  type OptimizerConfig,
  type OptimizerControls,
  type UseTouchResponseOptimizerResult,
} from "./useTouchResponseOptimizer";

// Render Pipeline Optimizer (Sprint 521)
export {
  useRenderPipelineOptimizer,
  useFrameBudget as usePipelineFrameBudget,
  useLODManager,
  useGPUInfo as usePipelineGPUInfo,
  type RenderPriority as PipelineRenderPriority,
  type LODLevel,
  type GPUTier as PipelineGPUTier,
  type RenderPass,
  type FrameBudget as PipelineFrameBudget,
  type GPUInfo as PipelineGPUInfo,
  type OcclusionHint,
  type PipelineMetrics as RenderPipelineMetrics,
  type PipelineState as RenderPipelineState,
  type PipelineConfig as RenderPipelineConfig,
  type PipelineControls as RenderPipelineControls,
  type UseRenderPipelineOptimizerResult,
} from "./useRenderPipelineOptimizer";

// Gesture Motion Predictor (Sprint 521)
export {
  useGestureMotionPredictor,
  useSimpleMotionPredictor,
  useGestureRecognition,
  useKalmanPosition,
  type Point2D,
  type MotionPoint,
  type PredictedPosition,
  type GestureType as MotionGestureType,
  type RecognizedGesture,
  type TrajectoryPoint,
  type PredictedTrajectory,
  type KalmanState,
  type PredictorMetrics,
  type PredictorState,
  type PredictorConfig,
  type PredictorControls,
  type UseGestureMotionPredictorResult,
} from "./useGestureMotionPredictor";

// Avatar Render Scheduler (Sprint 516 Iteration 2)
export {
  useAvatarRenderScheduler,
  useFrameBudget as useAvatarRenderFrameBudget,
  useRenderPriority,
  useAdaptiveFPS,
  type RenderPriority as AvatarRenderPriority,
  type RenderPhase as AvatarRenderPhase,
  type VisibilityState as AvatarVisibilityState,
  type ThrottleReason,
  type ScheduledRender,
  type FrameBudget as AvatarFrameBudget,
  type FrameStats as AvatarFrameStats,
  type SchedulerState as AvatarSchedulerState,
  type SchedulerMetrics as AvatarSchedulerMetrics,
  type SchedulerConfig as AvatarSchedulerConfig,
  type SchedulerControls as AvatarSchedulerControls,
  type UseAvatarRenderSchedulerResult,
} from "./useAvatarRenderScheduler";

// Mobile Input Pipeline (Sprint 516 Iteration 2)
export {
  useMobileInputPipeline,
  useGestureDetection,
  useInputPrediction,
  type InputType,
  type GestureType as InputGestureType,
  type InputPriority,
  type PipelineStage as InputPipelineStage,
  type RawInput,
  type ProcessedInput,
  type InputBuffer,
  type GestureState as InputGestureState,
  type PipelineState as InputPipelineState,
  type PipelineMetrics as InputPipelineMetrics,
  type PipelineConfig as InputPipelineConfig,
  type PipelineControls as InputPipelineControls,
  type UseMobileInputPipelineResult,
} from "./useMobileInputPipeline";

// Frame Interpolator (Sprint 524)
export {
  useFrameInterpolator,
  useValueInterpolator,
  useSubFrameProgress,
  useStutterDetection,
  type InterpolationMethod,
  type FrameData,
  type InterpolationPoint,
  type FrameTimingInfo,
  type MotionBlurConfig,
  type InterpolatorMetrics,
  type InterpolatorState,
  type InterpolatorConfig,
  type InterpolatorControls,
  type UseFrameInterpolatorResult,
} from "./useFrameInterpolator";

// Adaptive Render Quality (Sprint 524)
export {
  useAdaptiveRenderQuality,
  useQualityTier,
  useResolutionScale,
  usePerformanceScore,
  type QualityTier,
  type QualityFactor,
  type AdjustmentReason,
  type QualitySettings,
  type PerformanceSample,
  type DeviceConditions,
  type QualityAdjustment,
  type QualityMetrics,
  type QualityState,
  type QualityConfig,
  type QualityControls,
  type UseAdaptiveRenderQualityResult,
} from "./useAdaptiveRenderQuality";

// Avatar Animation Smoothing (Sprint 526)
export {
  useAvatarAnimationSmoothing,
  useSmoothedValue,
  usePoseBlending,
  useJankDetection,
  type SmoothingAlgorithm,
  type AnimationPriority as SmoothingAnimationPriority,
  type SmoothedValue,
  type BlendShapeWeights,
  type AvatarPose as SmoothingAvatarPose,
  type JankEvent,
  type QueuedAnimation,
  type SmoothingMetrics,
  type SmoothingState,
  type SmoothingConfig,
  type SmoothingControls,
  type BlendControls,
  type UseAvatarAnimationSmoothingResult,
} from "./useAvatarAnimationSmoothing";

// Network Latency Adapter (Sprint 526)
export {
  useNetworkLatencyAdapter,
  useConnectionQuality,
  useIsNetworkOnline,
  useConnectionHealth,
  useRecommendedQualityTier,
  type ConnectionQuality,
  type NetworkType,
  type LatencySample as NetworkLatencySample,
  type BandwidthEstimate as NetworkBandwidthEstimate,
  type ConnectionStats,
  type NetworkEvent,
  type AdaptationRecommendations,
  type AdapterMetrics,
  type AdapterState,
  type AdapterConfig,
  type AdapterControls,
  type UseNetworkLatencyAdapterResult,
} from "./useNetworkLatencyAdapter";

// Touch-to-Visual Bridge (Sprint 226)
export {
  useTouchToVisualBridge,
  useTouchTranslate,
  useTouchScale,
  useTouchOpacity,
  type TouchPoint as BridgeTouchPoint,
  type VisualState,
  type VisualPrediction,
  type BridgeConfig,
  type TouchToVisualMapper,
  type BridgeMetrics,
  type BridgeState,
  type BridgeControls,
  type UseTouchToVisualBridgeResult,
} from "./useTouchToVisualBridge";

// Mobile Render Predictor (Sprint 226)
export {
  useMobileRenderPredictor,
  useInteractionRecorder,
  useGpuCompositing,
  type InteractionType,
  type InteractionEvent,
  type InteractionPattern,
  type PredictedInteraction,
  type PreRenderFrame,
  type CacheEntry,
  type PredictorConfig as RenderPredictorConfig,
  type PredictorMetrics as RenderPredictorMetrics,
  type PredictorState as RenderPredictorState,
  type FrameRenderer,
  type PredictorControls as RenderPredictorControls,
  type UseMobileRenderPredictorResult,
} from "./useMobileRenderPredictor";

// Frame Latency Compensator (Sprint 227)
export {
  useFrameLatencyCompensator,
  useFrameTiming,
  useCompensatedPosition,
  type FrameTiming as LatencyFrameTiming,
  type CompensationState as FrameCompensationState,
  type CompensatedTransform,
  type CompensatorConfig as FrameCompensatorConfig,
  type CompensatorMetrics as FrameCompensatorMetrics,
  type CompensatorState as FrameCompensatorState,
  type CompensatorControls as FrameCompensatorControls,
  type UseFrameLatencyCompensatorResult,
} from "./useFrameLatencyCompensator";

// Touch Prediction Engine (Sprint 227)
export {
  useTouchPredictionEngine,
  useSimpleTouchPredictor,
  type TouchSample,
  type PredictedTouch,
  type PredictionAlgorithm,
  type AlgorithmMetrics,
  type KalmanFilterState,
  type PredictionEngineConfig,
  type EngineMetrics,
  type EngineState,
  type EngineControls,
  type UseTouchPredictionEngineResult,
} from "./useTouchPredictionEngine";

// Adaptive Frame Pacing (Sprint 228)
export {
  useAdaptiveFramePacing,
  useFrameRate as usePacingFrameRate,
  useJudderDetection,
  type TargetFrameRate,
  type PacingMode,
  type FrameDelivery,
  type JudderMetrics,
  type PacingConfig,
  type PacingMetrics,
  type PacingState,
  type FrameCallback as PacingFrameCallback,
  type PacingControls,
  type UseAdaptiveFramePacingResult,
} from "./useAdaptiveFramePacing";

// Touch Latency Reducer (Sprint 228)
export {
  useTouchLatencyReducer,
  useLowLatencyTouch,
  useTouchLatencyMetrics,
  type TimedTouchEvent,
  type LatencyBreakdown,
  type QueueEntry,
  type ReducerConfig,
  type ReducerMetrics,
  type ReducerState,
  type TouchEventHandler,
  type ReducerControls,
  type UseTouchLatencyReducerResult,
} from "./useTouchLatencyReducer";

// Visual Feedback Accelerator (Sprint 229)
export {
  useVisualFeedbackAccelerator,
  useAcceleratedTransform,
  useAcceleratedOpacity,
  type AcceleratedProperty,
  type TransformState,
  type FilterState,
  type AcceleratedStyle,
  type PartialAcceleratedStyle,
  type UpdateBatch,
  type AcceleratorConfig,
  type AcceleratorMetrics,
  type AcceleratorState,
  type AcceleratorControls,
  type UseVisualFeedbackAcceleratorResult,
} from "./useVisualFeedbackAccelerator";

// Mobile Render Queue (Sprint 229)
export {
  useMobileRenderQueue,
  useRenderScheduler,
  useCoalescedRender,
  type RenderPriority as QueueRenderPriority,
  type RenderTask,
  type FrameBudget as QueueFrameBudget,
  type QueueConfig,
  type QueueMetrics,
  type QueueState,
  type QueueControls,
  type UseMobileRenderQueueResult,
} from "./useMobileRenderQueue";

// Gesture Latency Bypasser (Sprint 230)
export {
  useGestureLatencyBypasser,
  usePanBypasser,
  usePinchBypasser,
  type BypassableGesture,
  type TimestampedTouch,
  type GestureVelocity as BypasserGestureVelocity,
  type PredictedEndState,
  type SnapPoint,
  type BypasserConfig,
  type BypasserMetrics,
  type GestureState as BypasserGestureState,
  type BypasserState,
  type StyleUpdater,
  type BypasserControls,
  type UseGestureLatencyBypasserResult,
} from "./useGestureLatencyBypasser";

// Mobile Animation Scheduler (Sprint 230)
export {
  useMobileAnimationScheduler,
  useScheduledAnimation,
  useStaggeredAnimation,
  EASING,
  type AnimationPriority as SchedulerAnimationPriority,
  type AnimationState as SchedulerAnimationState,
  type EasingFunction,
  type ScheduledAnimation,
  type AnimationGroup,
  type FrameBudgetInfo,
  type DeviceConditions as SchedulerDeviceConditions,
  type SchedulerConfig,
  type SchedulerMetrics,
  type SchedulerState,
  type AnimationOptions,
  type SchedulerControls,
  type UseMobileAnimationSchedulerResult,
} from "./useMobileAnimationScheduler";

// Avatar Gesture Response Accelerator (Sprint 533)
export {
  useAvatarGestureResponseAccelerator,
  useInstantAvatarFeedback,
  useGesturePrioritizedResponse,
  type GestureType as AcceleratorGestureType,
  type AvatarResponseType,
  type FeedbackMode,
  type DeviceCapability as AcceleratorDeviceCapability,
  type ResponsePriority,
  type Position as AcceleratorPosition,
  type Velocity as AcceleratorVelocity,
  type GestureInput,
  type GestureIntent,
  type PredictionInput,
  type ScheduledResponse,
  type InstantFeedback,
  type AcceleratorConfig as GestureAcceleratorConfig,
  type AcceleratorCallbacks,
  type AcceleratorState as GestureAcceleratorState,
  type AcceleratorMetrics as GestureAcceleratorMetrics,
  type AcceleratorControls as GestureAcceleratorControls,
  type UseAvatarGestureResponseAcceleratorResult,
} from "./useAvatarGestureResponseAccelerator";

// Avatar Touch Animation Sync (Sprint 533)
export {
  useAvatarTouchAnimationSync,
  useTouchAlignedAnimation,
  useAnimationFrameSync,
  type SyncMode as TouchAnimationSyncMode,
  type AnimationPriority as TouchAnimationPriority,
  type Position as TouchSyncPosition,
  type ScheduledAnimation as TouchScheduledAnimation,
  type SyncConfig as TouchAnimationSyncConfig,
  type SyncCallbacks as TouchAnimationSyncCallbacks,
  type SyncState as TouchAnimationSyncState,
  type SyncMetrics as TouchAnimationSyncMetrics,
  type SyncControls as TouchAnimationSyncControls,
} from "./useAvatarTouchAnimationSync";

// Avatar Pose Interpolator (Sprint 231)
export {
  useAvatarPoseInterpolator,
  usePoseTransition,
  useBlendShapeInterpolator,
  type Vector3,
  type Quaternion,
  type BlendShapeWeights as InterpolatorBlendShapeWeights,
  type AvatarPose as InterpolatorAvatarPose,
  type PoseKeyframe,
  type EasingType,
  type InterpolationMode as PoseInterpolationMode,
  type InterpolatorConfig as PoseInterpolatorConfig,
  type InterpolatorMetrics as PoseInterpolatorMetrics,
  type InterpolatorState as PoseInterpolatorState,
  type InterpolatorControls as PoseInterpolatorControls,
  type UseAvatarPoseInterpolatorResult,
} from "./useAvatarPoseInterpolator";

// Touch Response Predictor (Sprint 231)
export {
  useTouchResponsePredictor,
  useGesturePrediction,
  useTouchPositionPrediction,
  type Point2D as PredictorPoint2D,
  type TouchSample as PredictorTouchSample,
  type PredictedTouch as TouchPredictedTouch,
  type GestureIntent as PredictorGestureIntent,
  type IntentPrediction,
  type PrecomputedResponse,
  type KalmanState as TouchKalmanState,
  type PredictorConfig as TouchPredictorConfig,
  type PredictorMetrics as TouchPredictorMetrics,
  type PredictorState as TouchPredictorState,
  type PredictorControls as TouchPredictorControls,
  type UseTouchResponsePredictorResult,
} from "./useTouchResponsePredictor";

// Avatar Perceived Latency Reducer (Sprint 536)
export {
  useAvatarPerceivedLatencyReducer,
  useAnticipatoryAnimation,
  useProgressiveAvatarLoading,
  type AnticipationType,
  type LoadingPhase,
  type PerceivedLatencyConfig,
  type PerceivedLatencyCallbacks,
  type PerceivedLatencyState,
  type PerceivedLatencyMetrics,
  type AnticipationTransform,
  type MotionBlurStyles,
  type SkeletonStyles,
  type PerceivedLatencyControls,
} from "./useAvatarPerceivedLatencyReducer";

// Avatar Instant Feedback (Sprint 536)
export {
  useAvatarInstantFeedback,
  useTapFeedback,
  useSpeakFeedback,
  useOptimisticAvatarState,
  type FeedbackType,
  type FeedbackIntensity,
  type FeedbackPhase,
  type FeedbackPosition,
  type InstantFeedbackStyle,
  type PlaceholderExpression,
  type OptimisticState,
  type FeedbackConfig,
  type FeedbackCallbacks,
  type FeedbackState,
  type FeedbackMetrics,
  type FeedbackControls,
} from "./useAvatarInstantFeedback";

// Avatar Touch Momentum (Sprint 537)
export {
  useAvatarTouchMomentum,
  useVelocityTracker,
  useMomentumDecay,
  type Position as MomentumPosition,
  type Velocity,
  type Bounds,
  type MomentumConfig,
  type MomentumCallbacks,
  type MomentumState,
  type MomentumMetrics,
  type MomentumControls,
} from "./useAvatarTouchMomentum";

// Avatar Input Response Bridge (Sprint 536)
export {
  useAvatarInputResponseBridge,
  useInputQueue,
  useResponseInterpolator,
  type InputType as InputResponseBridgeInputType,
  type EasingType as InputResponseBridgeEasingType,
  type Position as InputResponseBridgePosition,
  type QueuedInput,
  type ImmediateFeedback as InputResponseBridgeImmediateFeedback,
  type BridgeConfig as InputResponseBridgeConfig,
  type BridgeCallbacks as InputResponseBridgeCallbacks,
  type BridgeState as InputResponseBridgeState,
  type BridgeMetrics as InputResponseBridgeMetrics,
  type BridgeControls as InputResponseBridgeControls,
} from "./useAvatarInputResponseBridge";

// Avatar Frame Budget (Sprint 538)
export {
  useAvatarFrameBudget,
  useWorkScheduler,
  useBudgetMonitor,
  type WorkItem,
  type QualitySuggestion,
  type BudgetConfig,
  type BudgetCallbacks,
  type BudgetState,
  type BudgetMetrics,
  type BudgetControls,
} from "./useAvatarFrameBudget";

// Avatar Mobile Optimizer (Sprint 539)
export {
  useAvatarMobileOptimizer,
  useTouchPrediction,
  useAdaptiveFrameRate,
  useDevicePerformance,
  useAnimationVisibility,
  type DevicePerformanceTier,
  type ThermalState as MobileOptimizerThermalState,
  type BatteryState as MobileOptimizerBatteryState,
  type TouchPrediction,
  type CoalescedEvent,
  type PerformanceConstraints,
  type MobileOptimizerConfig,
  type MobileOptimizerCallbacks,
  type MobileOptimizerState,
  type MobileOptimizerMetrics,
  type MobileOptimizerControls,
} from "./useAvatarMobileOptimizer";

// Avatar Low Latency Mode (Sprint 541)
export {
  useAvatarLowLatencyMode,
  useLowLatencyTouch as useAvatarLowLatencyTouch,
  useLatencyAdaptiveQuality,
  useLatencyMetrics as useAvatarLatencyMetrics,
  type LatencyMode,
  type InteractionState as LowLatencyInteractionState,
  type OptimizationLevel,
  type PredictionConfidence as LowLatencyPredictionConfidence,
  type TouchState as LowLatencyTouchState,
  type AnimationPreload,
  type QualitySettings as LowLatencyQualitySettings,
  type LatencyBudget,
  type LowLatencyConfig,
  type LowLatencyCallbacks,
  type LowLatencyState,
  type LowLatencyMetrics,
  type LowLatencyControls,
} from "./useAvatarLowLatencyMode";

// Avatar Render Timing (Sprint 542)
export {
  useAvatarRenderTiming,
  useFrameDeadline,
  useRenderPhaseTracker,
  useRenderQualityScale,
  useVSyncStatus,
  type RenderPhase,
  type VSyncAlignment,
  type DeadlineStatus,
  type RecoveryStrategy as RenderRecoveryStrategy,
  type FrameDeadline,
  type RenderPhaseTiming,
  type FrameStats,
  type RenderTimingConfig,
  type RenderTimingCallbacks,
  type RenderTimingState,
  type RenderTimingMetrics,
  type RenderTimingControls,
} from "./useAvatarRenderTiming";

// Avatar Touch Feedback Bridge (Sprint 543)
export {
  useAvatarTouchFeedbackBridge,
  useTouchFeedbackStyle,
  useAvatarPredictedState,
  useTouchFeedbackActive,
  useFeedbackLatency,
  type FeedbackType as TouchBridgeFeedbackType,
  type AvatarRegion,
  type GestureAction,
  type TransitionState as TouchBridgeTransitionState,
  type TouchPoint as TouchBridgeTouchPoint,
  type FeedbackStyle,
  type AvatarFeedback,
  type PredictedAvatarState,
  type TouchFeedbackConfig as TouchBridgeConfig,
  type TouchFeedbackCallbacks as TouchBridgeCallbacks,
  type TouchFeedbackState as TouchBridgeState,
  type TouchFeedbackMetrics as TouchBridgeMetrics,
  type TouchFeedbackControls as TouchBridgeControls,
} from "./useAvatarTouchFeedbackBridge";

// Avatar Gesture Predictor (Sprint 544)
export {
  useAvatarGesturePredictor,
  useGesturePrediction as useAvatarGesturePrediction,
  usePredictedGesture,
  usePredictionConfidence,
  usePredictorMetrics as useGesturePredictorMetrics,
  type PredictedGesture,
  type GesturePredictionConfidence,
  type PredictorMode,
  type TouchPoint as GesturePredictorTouchPoint,
  type TouchTrajectory,
  type GesturePrediction as AvatarGesturePrediction,
  type PredictorState as GesturePredictorState,
  type PredictorMetrics as GesturePredictorMetrics,
  type PredictorConfig as GesturePredictorConfig,
  type PredictorCallbacks as GesturePredictorCallbacks,
  type PredictorControls as GesturePredictorControls,
  type GesturePredictorResult,
} from "./useAvatarGesturePredictor";
