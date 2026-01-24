/**
 * Branch Coverage Tests for useMobileAudioOptimizer
 * Sprint 752 - Avatar UX Mobile Latency
 *
 * This file tests uncovered branches using jest.mock with factory functions.
 * Tests are organized by the branch conditions they cover.
 */

import { renderHook, act } from "@testing-library/react";

// Store mock values that can be changed per test
let mockIsOnline = true;
let mockRtt = 50;
let mockEffectiveType = "4g";
let mockSaveData = false;
let mockDeviceTier: "high" | "medium" | "low" = "high";
let mockIsLowBattery = false;
let mockIsMobile = true;
let mockIsIOS = false;
let mockIsAndroid = true;

// Mock dependencies with factory functions
jest.mock("../useMobileDetect", () => ({
  useMobileDetect: () => ({
    isMobile: mockIsMobile,
    isIOS: mockIsIOS,
    isAndroid: mockIsAndroid,
    isTablet: false,
    isTouchDevice: true,
  }),
}));

jest.mock("../useNetworkStatus", () => ({
  useNetworkStatus: () => ({
    isOnline: mockIsOnline,
    isSlowConnection: mockRtt > 100,
    rtt: mockRtt,
    effectiveType: mockEffectiveType,
    saveData: mockSaveData,
  }),
}));

jest.mock("../useLatencyOptimizer", () => ({
  useLatencyOptimizer: () => ({
    metrics: {
      averageLatency: mockRtt,
      samples: [],
    },
  }),
}));

jest.mock("../useDeviceCapabilities", () => ({
  useDeviceCapabilities: () => ({
    tier: mockDeviceTier,
    battery: {
      isLowBattery: mockIsLowBattery,
      level: mockIsLowBattery ? 0.1 : 0.8,
    },
    memory: {
      isLowMemory: false,
    },
  }),
}));

import { useMobileAudioOptimizer } from "../useMobileAudioOptimizer";

// Reset mock values before each test
beforeEach(() => {
  mockIsOnline = true;
  mockRtt = 50;
  mockEffectiveType = "4g";
  mockSaveData = false;
  mockDeviceTier = "high";
  mockIsLowBattery = false;
  mockIsMobile = true;
  mockIsIOS = false;
  mockIsAndroid = true;
});

// ============================================================================
// Connection Quality Branches (lines 330-333)
// ============================================================================

describe("Sprint 752 - connectionQuality excellent branch (line 330)", () => {
  it("should return excellent when rtt < 50 and 4g", () => {
    mockRtt = 30;
    mockEffectiveType = "4g";

    const { result } = renderHook(() => useMobileAudioOptimizer());
    expect(result.current.metrics.connectionQuality).toBe("excellent");
  });

  it("should return excellent when rtt is 49", () => {
    mockRtt = 49;
    mockEffectiveType = "4g";

    const { result } = renderHook(() => useMobileAudioOptimizer());
    expect(result.current.metrics.connectionQuality).toBe("excellent");
  });
});

describe("Sprint 752 - connectionQuality good branch (line 331)", () => {
  it("should return good when 50 <= rtt < 100", () => {
    mockRtt = 75;
    mockEffectiveType = "4g";

    const { result } = renderHook(() => useMobileAudioOptimizer());
    expect(result.current.metrics.connectionQuality).toBe("good");
  });

  it("should return good when rtt is exactly 50", () => {
    mockRtt = 50;
    mockEffectiveType = "4g";

    const { result } = renderHook(() => useMobileAudioOptimizer());
    expect(result.current.metrics.connectionQuality).toBe("good");
  });

  it("should return good when rtt is 99", () => {
    mockRtt = 99;
    mockEffectiveType = "4g";

    const { result } = renderHook(() => useMobileAudioOptimizer());
    expect(result.current.metrics.connectionQuality).toBe("good");
  });
});

describe("Sprint 752 - connectionQuality fair branch (line 332)", () => {
  it("should return fair when 100 <= rtt < 200", () => {
    mockRtt = 150;
    mockEffectiveType = "4g";

    const { result } = renderHook(() => useMobileAudioOptimizer());
    expect(result.current.metrics.connectionQuality).toBe("fair");
  });

  it("should return fair when effectiveType is 3g with rtt >= 100", () => {
    // The 3g check is OR'd with rtt < 200, so rtt must be >= 100 to reach 3g check
    mockRtt = 120;
    mockEffectiveType = "3g";

    const { result } = renderHook(() => useMobileAudioOptimizer());
    expect(result.current.metrics.connectionQuality).toBe("fair");
  });

  it("should return fair when rtt is exactly 100", () => {
    mockRtt = 100;
    mockEffectiveType = "4g";

    const { result } = renderHook(() => useMobileAudioOptimizer());
    expect(result.current.metrics.connectionQuality).toBe("fair");
  });
});

describe("Sprint 752 - connectionQuality poor branch (line 333)", () => {
  it("should return poor when rtt >= 200", () => {
    mockRtt = 250;
    mockEffectiveType = "4g";

    const { result } = renderHook(() => useMobileAudioOptimizer());
    expect(result.current.metrics.connectionQuality).toBe("poor");
  });

  it("should return poor when rtt is exactly 200", () => {
    mockRtt = 200;
    mockEffectiveType = "4g";

    const { result } = renderHook(() => useMobileAudioOptimizer());
    expect(result.current.metrics.connectionQuality).toBe("poor");
  });
});

// ============================================================================
// Device Tier Switch Cases (lines 343-353)
// ============================================================================

describe("Sprint 752 - deviceTier high case (line 344-346)", () => {
  it("should use medium quality for high tier mobile device", () => {
    mockDeviceTier = "high";
    mockIsMobile = true;
    mockRtt = 30; // excellent connection

    const { result } = renderHook(() => useMobileAudioOptimizer());
    expect(result.current.quality).toBe("medium");
  });

  it("should use high quality for high tier desktop device", () => {
    mockDeviceTier = "high";
    mockIsMobile = false;
    mockRtt = 30; // excellent connection

    const { result } = renderHook(() => useMobileAudioOptimizer());
    expect(result.current.quality).toBe("high");
  });
});

describe("Sprint 752 - deviceTier medium case (line 347-348)", () => {
  it("should use medium quality for medium tier device", () => {
    mockDeviceTier = "medium";
    mockRtt = 30; // excellent connection

    const { result } = renderHook(() => useMobileAudioOptimizer());
    expect(result.current.quality).toBe("medium");
  });
});

describe("Sprint 752 - deviceTier low/default case (lines 349-353)", () => {
  it("should use low quality for low tier device", () => {
    mockDeviceTier = "low";
    mockRtt = 30; // excellent connection

    const { result } = renderHook(() => useMobileAudioOptimizer());
    expect(result.current.quality).toBe("low");
  });
});

// ============================================================================
// Offline Network Branch (line 358)
// ============================================================================

describe("Sprint 752 - offline network branch (line 358)", () => {
  it("should return ultra-low quality when offline", () => {
    mockIsOnline = false;

    const { result } = renderHook(() => useMobileAudioOptimizer());
    expect(result.current.quality).toBe("ultra-low");
  });

  it("should have offline connection quality", () => {
    mockIsOnline = false;

    const { result } = renderHook(() => useMobileAudioOptimizer());
    expect(result.current.metrics.connectionQuality).toBe("offline");
  });
});

// ============================================================================
// Poor Connection Downgrade (line 362)
// ============================================================================

describe("Sprint 752 - poor connection downgrade (line 362)", () => {
  it("should downgrade high to low on poor connection", () => {
    mockDeviceTier = "high";
    mockIsMobile = false;
    mockRtt = 300; // poor connection

    const { result } = renderHook(() => useMobileAudioOptimizer());
    // high -> low (poor connection downgrades high by 2 levels)
    expect(result.current.quality).toBe("low");
  });

  it("should downgrade medium to ultra-low on poor connection", () => {
    mockDeviceTier = "medium";
    mockRtt = 300; // poor connection

    const { result } = renderHook(() => useMobileAudioOptimizer());
    // medium -> ultra-low (poor connection downgrades non-high to ultra-low)
    expect(result.current.quality).toBe("ultra-low");
  });

  it("should downgrade low to ultra-low on poor connection", () => {
    mockDeviceTier = "low";
    mockRtt = 300; // poor connection

    const { result } = renderHook(() => useMobileAudioOptimizer());
    // low -> ultra-low
    expect(result.current.quality).toBe("ultra-low");
  });
});

// ============================================================================
// Fair Connection Downgrade (line 364)
// ============================================================================

describe("Sprint 752 - fair connection downgrade (line 364)", () => {
  it("should downgrade high to medium on fair connection", () => {
    mockDeviceTier = "high";
    mockIsMobile = false;
    mockRtt = 150; // fair connection

    const { result } = renderHook(() => useMobileAudioOptimizer());
    // high -> medium on fair connection
    expect(result.current.quality).toBe("medium");
  });

  it("should downgrade medium to low on fair connection", () => {
    mockDeviceTier = "medium";
    mockRtt = 150; // fair connection

    const { result } = renderHook(() => useMobileAudioOptimizer());
    // medium -> low on fair connection
    expect(result.current.quality).toBe("low");
  });

  it("should keep low as low on fair connection", () => {
    mockDeviceTier = "low";
    mockRtt = 150; // fair connection

    const { result } = renderHook(() => useMobileAudioOptimizer());
    // low stays low
    expect(result.current.quality).toBe("low");
  });
});

// ============================================================================
// SaveData Downgrade (line 369)
// ============================================================================

describe("Sprint 752 - saveData downgrade (line 369)", () => {
  it("should downgrade high to medium with saveData", () => {
    mockDeviceTier = "high";
    mockIsMobile = false;
    mockSaveData = true;
    mockRtt = 30; // excellent connection

    const { result } = renderHook(() => useMobileAudioOptimizer());
    // high -> medium with saveData
    expect(result.current.quality).toBe("medium");
  });

  it("should downgrade medium to low with saveData", () => {
    mockDeviceTier = "medium";
    mockSaveData = true;
    mockRtt = 30; // excellent connection

    const { result } = renderHook(() => useMobileAudioOptimizer());
    // medium -> low with saveData
    expect(result.current.quality).toBe("low");
  });

  it("should downgrade low to ultra-low with saveData", () => {
    mockDeviceTier = "low";
    mockSaveData = true;
    mockRtt = 30; // excellent connection

    const { result } = renderHook(() => useMobileAudioOptimizer());
    // low -> ultra-low with saveData
    expect(result.current.quality).toBe("ultra-low");
  });
});

// ============================================================================
// Low Battery Downgrade (line 374)
// ============================================================================

describe("Sprint 752 - low battery downgrade (line 374)", () => {
  it("should downgrade high to medium with low battery", () => {
    mockDeviceTier = "high";
    mockIsMobile = false;
    mockIsLowBattery = true;
    mockRtt = 30; // excellent connection

    const { result } = renderHook(() => useMobileAudioOptimizer());
    // high -> medium with low battery
    expect(result.current.quality).toBe("medium");
  });

  it("should downgrade medium to low with low battery", () => {
    mockDeviceTier = "medium";
    mockIsLowBattery = true;
    mockRtt = 30; // excellent connection

    const { result } = renderHook(() => useMobileAudioOptimizer());
    // medium -> low with low battery
    expect(result.current.quality).toBe("low");
  });
});

// ============================================================================
// iOS Specific Constraints (line 526)
// ============================================================================

describe("Sprint 752 - iOS constraints (line 526)", () => {
  it("should force echoCancellation true for iOS", () => {
    mockIsIOS = true;
    mockIsAndroid = false;

    const { result } = renderHook(() => useMobileAudioOptimizer());

    const constraints = result.current.controls.getAudioConstraints();
    // iOS should force echoCancellation to true
    expect(constraints.echoCancellation).toBe(true);
  });

  it("should apply iOS settings even when ultra-low quality", () => {
    mockIsIOS = true;
    mockIsAndroid = false;

    const { result } = renderHook(() => useMobileAudioOptimizer());

    act(() => {
      result.current.controls.forceQuality("ultra-low");
    });

    const constraints = result.current.controls.getAudioConstraints();
    // iOS should still force echoCancellation to true
    expect(constraints.echoCancellation).toBe(true);
  });
});

// ============================================================================
// Buffer Underrun Quality Downgrade (lines 378-379)
// ============================================================================

describe("Sprint 752 - buffer underrun quality downgrade (lines 378-379)", () => {
  it("should downgrade from high after 5+ underruns in auto mode", () => {
    mockDeviceTier = "high";
    mockIsMobile = false;
    mockRtt = 30; // excellent connection

    const { result } = renderHook(() => useMobileAudioOptimizer());

    // Verify initial quality is high
    expect(result.current.quality).toBe("high");

    // Record 6 underruns
    act(() => {
      for (let i = 0; i < 6; i++) {
        result.current.controls.recordBufferEvent("underrun");
      }
    });

    // After 6 underruns (> 5), quality should downgrade
    // high -> medium based on the logic
    expect(result.current.quality).toBe("medium");
    expect(result.current.shouldReduceQuality).toBe(true);
  });

  it("should downgrade from medium after 5+ underruns in auto mode", () => {
    mockDeviceTier = "medium";
    mockRtt = 30; // excellent connection

    const { result } = renderHook(() => useMobileAudioOptimizer());

    // Verify initial quality is medium
    expect(result.current.quality).toBe("medium");

    // Record 6 underruns
    act(() => {
      for (let i = 0; i < 6; i++) {
        result.current.controls.recordBufferEvent("underrun");
      }
    });

    // After 6 underruns (> 5), quality should downgrade
    // medium -> low based on the logic
    expect(result.current.quality).toBe("low");
    expect(result.current.shouldReduceQuality).toBe(true);
  });
});

// ============================================================================
// Combined Conditions
// ============================================================================

describe("Sprint 752 - combined conditions", () => {
  it("should apply multiple downgrade conditions", () => {
    mockDeviceTier = "high";
    mockIsMobile = false;
    mockRtt = 150; // fair connection -> downgrades to medium
    mockSaveData = true; // -> downgrades to low
    mockIsLowBattery = true; // -> still low (already at low)

    const { result } = renderHook(() => useMobileAudioOptimizer());

    // fair connection: high -> medium
    // saveData: medium -> low
    // low battery: low -> low (already at low, just decrements)
    expect(["low", "ultra-low"]).toContain(result.current.quality);
  });

  it("should handle poor connection with save data", () => {
    mockDeviceTier = "high";
    mockIsMobile = false;
    mockRtt = 300; // poor connection -> high goes to low
    mockSaveData = true; // low -> ultra-low

    const { result } = renderHook(() => useMobileAudioOptimizer());

    // poor connection: high -> low
    // saveData: low -> ultra-low
    expect(result.current.quality).toBe("ultra-low");
  });
});

// ============================================================================
// Forced Quality Override
// ============================================================================

describe("Sprint 752 - forced quality override", () => {
  it("should ignore conditions when quality is forced", () => {
    mockDeviceTier = "low";
    mockRtt = 300; // poor connection
    mockSaveData = true;
    mockIsLowBattery = true;

    const { result } = renderHook(() => useMobileAudioOptimizer());

    // Without forcing, should be ultra-low due to all conditions
    expect(result.current.quality).toBe("ultra-low");

    // Force to high
    act(() => {
      result.current.controls.forceQuality("high");
    });

    // Should be high despite all conditions
    expect(result.current.quality).toBe("high");
  });
});
