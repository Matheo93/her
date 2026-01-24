/**
 * Tests for useVoiceWarmth hook - Sprint 533
 *
 * Tests voice parameter calculation based on warmth level, emotion, and context.
 */

import { renderHook, act } from "@testing-library/react";
import {
  useVoiceWarmth,
  applyVoiceWarmthToText,
  getEdgeTTSParams,
  type VoiceWarmthParams,
} from "../useVoiceWarmth";
import type { WarmthLevel, EmotionalWarmthState } from "../useEmotionalWarmth";

// Default options for testing
import type { ReunionVoiceBoost } from "../useVoiceWarmth";

const createDefaultOptions = (): {
  warmthLevel: WarmthLevel;
  warmthNumeric: number;
  voiceHints: {
    softnessLevel: number;
    paceAdjustment: number;
    pitchVariance: number;
    breathiness: number;
  };
  currentEmotion: string;
  emotionalIntensity: number;
  isListening: boolean;
  isSpeaking: boolean;
  isIdle: boolean;
  isProactive: boolean;
  enabled: boolean;
  reunionVoiceBoost?: ReunionVoiceBoost;
} => ({
  warmthLevel: "neutral" as WarmthLevel,
  warmthNumeric: 0,
  voiceHints: {
    softnessLevel: 0,
    paceAdjustment: 0,
    pitchVariance: 0,
    breathiness: 0,
  },
  currentEmotion: "neutral",
  emotionalIntensity: 0.5,
  isListening: false,
  isSpeaking: false,
  isIdle: true,
  isProactive: false,
  enabled: true,
});

describe("useVoiceWarmth", () => {
  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe("initialization", () => {
    it("should initialize with default state when disabled", () => {
      const options = createDefaultOptions();
      options.enabled = false;

      const { result } = renderHook(() => useVoiceWarmth(options));

      expect(result.current.mode).toBe("default");
      expect(result.current.params.rate).toBe(1.0);
      expect(result.current.params.pitch).toBe(0);
      expect(result.current.shouldSpeakSoft).toBe(false);
    });

    it("should initialize with default mode for neutral warmth", () => {
      const options = createDefaultOptions();

      const { result } = renderHook(() => useVoiceWarmth(options));

      expect(result.current.mode).toBe("default");
      expect(result.current.description).toBe("Voice naturelle");
    });

    it("should have valid default params", () => {
      const options = createDefaultOptions();

      const { result } = renderHook(() => useVoiceWarmth(options));

      expect(result.current.params.rate).toBeGreaterThanOrEqual(0.5);
      expect(result.current.params.rate).toBeLessThanOrEqual(2.0);
      expect(result.current.params.volume).toBeGreaterThanOrEqual(0);
      expect(result.current.params.volume).toBeLessThanOrEqual(1);
    });
  });

  // ============================================================================
  // Warmth Level Tests
  // ============================================================================

  describe("warmth levels", () => {
    it("should return warm mode for warmthNumeric > 0.4", () => {
      const options = createDefaultOptions();
      options.warmthNumeric = 0.5;

      const { result } = renderHook(() => useVoiceWarmth(options));

      expect(result.current.mode).toBe("warm");
    });

    it("should return intimate mode for intimate warmth level", () => {
      const options = createDefaultOptions();
      options.warmthLevel = "intimate";

      const { result } = renderHook(() => useVoiceWarmth(options));

      expect(result.current.mode).toBe("intimate");
      expect(result.current.shouldSpeakSoft).toBe(true);
    });

    it("should return protective mode for protective warmth level", () => {
      const options = createDefaultOptions();
      options.warmthLevel = "protective";

      const { result } = renderHook(() => useVoiceWarmth(options));

      expect(result.current.mode).toBe("protective");
      expect(result.current.shouldSpeakSoft).toBe(true);
    });

    it("should adjust rate for affectionate warmth", () => {
      const options = createDefaultOptions();
      options.warmthLevel = "affectionate";

      const { result } = renderHook(() => useVoiceWarmth(options));

      // Affectionate should have slower rate
      expect(result.current.params.rate).toBeLessThan(1.0);
    });

    it("should add breathiness for intimate warmth", () => {
      const options = createDefaultOptions();
      options.warmthLevel = "intimate";

      const { result } = renderHook(() => useVoiceWarmth(options));

      expect(result.current.params.breathiness).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Emotion Tests
  // ============================================================================

  describe("emotions", () => {
    it("should return excited mode for high intensity joy", () => {
      const options = createDefaultOptions();
      options.currentEmotion = "joy";
      options.emotionalIntensity = 0.8;

      const { result } = renderHook(() => useVoiceWarmth(options));

      expect(result.current.mode).toBe("excited");
    });

    it("should return excited mode for high intensity excitement", () => {
      const options = createDefaultOptions();
      options.currentEmotion = "excitement";
      options.emotionalIntensity = 0.7;

      const { result } = renderHook(() => useVoiceWarmth(options));

      expect(result.current.mode).toBe("excited");
    });

    it("should not adjust for low intensity emotions", () => {
      const options = createDefaultOptions();
      options.currentEmotion = "joy";
      options.emotionalIntensity = 0.2;

      const { result } = renderHook(() => useVoiceWarmth(options));

      // Should be default since intensity is below threshold
      expect(result.current.mode).toBe("default");
    });

    it("should lower pitch for sadness emotion", () => {
      const options = createDefaultOptions();
      options.currentEmotion = "sadness";
      options.emotionalIntensity = 0.6;

      const { result } = renderHook(() => useVoiceWarmth(options));

      // Sadness should have lower pitch
      expect(result.current.params.pitch).toBeLessThan(0);
    });

    it("should slow rate for tenderness emotion", () => {
      const options = createDefaultOptions();
      options.currentEmotion = "tenderness";
      options.emotionalIntensity = 0.6;

      const { result } = renderHook(() => useVoiceWarmth(options));

      expect(result.current.params.rate).toBeLessThan(1.0);
    });
  });

  // ============================================================================
  // Proactive Message Tests
  // ============================================================================

  describe("proactive messages", () => {
    it("should enable soft speaking for proactive messages", () => {
      const options = createDefaultOptions();
      options.isProactive = true;

      const { result } = renderHook(() => useVoiceWarmth(options));

      expect(result.current.shouldSpeakSoft).toBe(true);
    });

    it("should limit rate for proactive messages", () => {
      const options = createDefaultOptions();
      options.isProactive = true;
      options.currentEmotion = "joy"; // Would normally speed up
      options.emotionalIntensity = 0.8;

      const { result } = renderHook(() => useVoiceWarmth(options));

      // Note: Hook uses smoothing (factor 0.1) so initial rate won't be at target
      // After first render: 1.0 + (0.9 - 1.0) * 0.1 = 0.99
      // The rate is being limited and trending toward 0.9
      expect(result.current.params.rate).toBeLessThanOrEqual(1.0);
      expect(result.current.params.rate).toBeLessThan(1.1); // Would be >1.1 without limiting
    });

    it("should add breathiness for proactive messages", () => {
      const options = createDefaultOptions();
      options.isProactive = true;

      const { result } = renderHook(() => useVoiceWarmth(options));

      expect(result.current.params.breathiness).toBeGreaterThanOrEqual(0.2);
    });
  });

  // ============================================================================
  // Reunion Voice Boost Tests
  // ============================================================================

  describe("reunion voice boost", () => {
    it("should apply rate adjustment from reunion boost", () => {
      const options = createDefaultOptions();
      options.reunionVoiceBoost = {
        rateAdjustment: -0.1,
        pitchAdjustment: -2,
        volumeAdjustment: 0.95,
        breathinessBoost: 0.15,
      };

      const { result } = renderHook(() => useVoiceWarmth(options));

      // Rate should be reduced
      expect(result.current.params.rate).toBeLessThan(1.0);
    });

    it("should apply pitch adjustment from reunion boost", () => {
      const options = createDefaultOptions();
      options.reunionVoiceBoost = {
        rateAdjustment: 0,
        pitchAdjustment: -3,
        volumeAdjustment: 1,
        breathinessBoost: 0,
      };

      const { result } = renderHook(() => useVoiceWarmth(options));

      expect(result.current.params.pitch).toBeLessThan(0);
    });

    it("should enable soft start for reunion", () => {
      const options = createDefaultOptions();
      options.reunionVoiceBoost = {
        rateAdjustment: 0,
        pitchAdjustment: 0,
        volumeAdjustment: 1,
        breathinessBoost: 0,
      };

      const { result } = renderHook(() => useVoiceWarmth(options));

      expect(result.current.params.softStart).toBe(true);
    });
  });

  // ============================================================================
  // Voice Hints Tests
  // ============================================================================

  describe("voice hints", () => {
    it("should apply breathiness from voice hints", () => {
      const options = createDefaultOptions();
      options.voiceHints = {
        breathiness: 0.5,
        paceAdjustment: 0,
        pitchVariance: 0,
        softnessLevel: 0,
      };

      const { result } = renderHook(() => useVoiceWarmth(options));

      expect(result.current.params.breathiness).toBeGreaterThanOrEqual(0.5);
    });

    it("should apply pace adjustment from voice hints", () => {
      const options = createDefaultOptions();
      options.voiceHints = {
        breathiness: 0,
        paceAdjustment: -0.1, // 10% slower
        pitchVariance: 0,
        softnessLevel: 0,
      };

      const { result } = renderHook(() => useVoiceWarmth(options));

      expect(result.current.params.rate).toBeLessThan(1.0);
    });
  });

  // ============================================================================
  // Delta Calculation Tests
  // ============================================================================

  describe("delta calculations", () => {
    it("should calculate correct rate change delta", () => {
      const options = createDefaultOptions();
      options.warmthLevel = "intimate"; // Will slow down rate

      const { result } = renderHook(() => useVoiceWarmth(options));

      expect(result.current.delta.rateChange).toBeLessThan(0);
    });

    it("should have zero delta for default state", () => {
      const options = createDefaultOptions();
      options.enabled = false;

      const { result } = renderHook(() => useVoiceWarmth(options));

      expect(result.current.delta.rateChange).toBe(0);
      expect(result.current.delta.pitchChange).toBe(0);
    });
  });

  // ============================================================================
  // Description Tests
  // ============================================================================

  describe("descriptions", () => {
    it("should return 'Voice naturelle' for default mode", () => {
      const options = createDefaultOptions();

      const { result } = renderHook(() => useVoiceWarmth(options));

      expect(result.current.description).toBe("Voice naturelle");
    });

    it("should return 'Voice intime et proche' for intimate mode", () => {
      const options = createDefaultOptions();
      options.warmthLevel = "intimate";

      const { result } = renderHook(() => useVoiceWarmth(options));

      expect(result.current.description).toBe("Voice intime et proche");
    });

    it("should return 'Voice réconfortante' for protective mode", () => {
      const options = createDefaultOptions();
      options.warmthLevel = "protective";

      const { result } = renderHook(() => useVoiceWarmth(options));

      expect(result.current.description).toBe("Voice réconfortante");
    });
  });
});

// ============================================================================
// applyVoiceWarmthToText Tests
// ============================================================================

describe("applyVoiceWarmthToText", () => {
  it("should return text unchanged with default params", () => {
    const params: VoiceWarmthParams = {
      rate: 1.0,
      pitch: 0,
      volume: 0.9,
      breathiness: 0,
      emphasis: 0.5,
      addBreaths: true,
      addPauses: false,
      addHesitations: false,
      softStart: false,
      voiceStyle: "normal",
    };

    const result = applyVoiceWarmthToText("Hello world", params);

    expect(result).toBe("Hello world");
  });

  it("should add pauses when breathiness is high", () => {
    const params: VoiceWarmthParams = {
      rate: 1.0,
      pitch: 0,
      volume: 0.9,
      breathiness: 0.5,
      emphasis: 0.5,
      addBreaths: true,
      addPauses: true,
      addHesitations: false,
      softStart: false,
      voiceStyle: "normal",
    };

    const result = applyVoiceWarmthToText("First sentence. Second sentence.", params);

    // Should have longer pauses
    expect(result).toContain("...");
  });

  it("should handle empty text", () => {
    const params: VoiceWarmthParams = {
      rate: 1.0,
      pitch: 0,
      volume: 0.9,
      breathiness: 0,
      emphasis: 0.5,
      addBreaths: false,
      addPauses: false,
      addHesitations: false,
      softStart: false,
      voiceStyle: "normal",
    };

    const result = applyVoiceWarmthToText("", params);

    expect(result).toBe("");
  });
});

// ============================================================================
// getEdgeTTSParams Tests
// ============================================================================

describe("getEdgeTTSParams", () => {
  it("should return positive percentage for rate > 1", () => {
    const params: VoiceWarmthParams = {
      rate: 1.1,
      pitch: 0,
      volume: 0.9,
      breathiness: 0,
      emphasis: 0.5,
      addBreaths: true,
      addPauses: true,
      addHesitations: false,
      softStart: false,
      voiceStyle: "normal",
    };

    const result = getEdgeTTSParams(params);

    expect(result.rate).toBe("+10%");
  });

  it("should return negative percentage for rate < 1", () => {
    const params: VoiceWarmthParams = {
      rate: 0.85,
      pitch: 0,
      volume: 0.9,
      breathiness: 0,
      emphasis: 0.5,
      addBreaths: true,
      addPauses: true,
      addHesitations: false,
      softStart: false,
      voiceStyle: "normal",
    };

    const result = getEdgeTTSParams(params);

    expect(result.rate).toBe("-15%");
  });

  it("should return positive Hz for positive pitch", () => {
    const params: VoiceWarmthParams = {
      rate: 1.0,
      pitch: 5,
      volume: 0.9,
      breathiness: 0,
      emphasis: 0.5,
      addBreaths: true,
      addPauses: true,
      addHesitations: false,
      softStart: false,
      voiceStyle: "normal",
    };

    const result = getEdgeTTSParams(params);

    expect(result.pitch).toBe("+5Hz");
  });

  it("should return negative Hz for negative pitch", () => {
    const params: VoiceWarmthParams = {
      rate: 1.0,
      pitch: -3,
      volume: 0.9,
      breathiness: 0,
      emphasis: 0.5,
      addBreaths: true,
      addPauses: true,
      addHesitations: false,
      softStart: false,
      voiceStyle: "normal",
    };

    const result = getEdgeTTSParams(params);

    expect(result.pitch).toBe("-3Hz");
  });

  it("should return +0% for rate = 1", () => {
    const params: VoiceWarmthParams = {
      rate: 1.0,
      pitch: 0,
      volume: 0.9,
      breathiness: 0,
      emphasis: 0.5,
      addBreaths: true,
      addPauses: true,
      addHesitations: false,
      softStart: false,
      voiceStyle: "normal",
    };

    const result = getEdgeTTSParams(params);

    expect(result.rate).toBe("+0%");
    expect(result.pitch).toBe("+0Hz");
  });
});
