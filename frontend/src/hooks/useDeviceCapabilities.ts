"use client";

/**
 * useDeviceCapabilities - Device Performance Detection
 *
 * Detects device GPU, CPU, and memory capabilities for adaptive rendering.
 * Adjusts animation complexity and quality based on device performance.
 *
 * Sprint 230: Avatar UX and mobile latency improvements
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useMobileDetect } from "./useMobileDetect";
import { useNetworkStatus } from "./useNetworkStatus";

interface DeviceCapabilities {
  // Performance tier
  tier: "high" | "medium" | "low";

  // GPU info
  gpu: {
    renderer: string | null;
    vendor: string | null;
    isHighPerformance: boolean;
    supportsWebGL2: boolean;
  };

  // Memory info (if available)
  memory: {
    deviceMemory: number | null; // GB
    isLowMemory: boolean;
  };

  // CPU info
  cpu: {
    cores: number;
    isLowPower: boolean;
  };

  // Battery status
  battery: {
    level: number | null;
    charging: boolean;
    isLowBattery: boolean;
  };

  // Recommended settings
  settings: RenderingSettings;

  // Force a specific tier
  forceTier: (tier: "high" | "medium" | "low" | null) => void;
}

interface RenderingSettings {
  // Animation frame rate target
  targetFPS: 30 | 60;

  // Complexity level for animations
  animationComplexity: "full" | "reduced" | "minimal";

  // Whether to use GPU-accelerated effects
  useGPUEffects: boolean;

  // Whether to use blur effects
  useBlur: boolean;

  // Shadow quality
  shadowQuality: "high" | "medium" | "low" | "none";

  // Texture resolution multiplier
  textureScale: 0.5 | 0.75 | 1;

  // Whether to enable smooth animations
  smoothAnimations: boolean;

  // Avatar detail level
  avatarDetail: "full" | "simplified" | "minimal";

  // Particle effects
  enableParticles: boolean;

  // Reflection/SSS effects
  enableAdvancedLighting: boolean;
}

// Known low-end GPUs
const LOW_END_GPUS = [
  "intel hd graphics",
  "intel uhd graphics",
  "mali-",
  "adreno 3",
  "adreno 4",
  "powervr",
  "tegra",
  "videocore",
];

// Known high-end GPUs
const HIGH_END_GPUS = [
  "nvidia geforce rtx",
  "nvidia geforce gtx 10",
  "nvidia geforce gtx 16",
  "amd radeon rx 5",
  "amd radeon rx 6",
  "apple m1",
  "apple m2",
  "apple m3",
  "apple gpu",
  "adreno 6",
  "adreno 7",
];

export function useDeviceCapabilities(): DeviceCapabilities {
  const { isMobile, isIOS, isAndroid } = useMobileDetect();
  const { isSlowConnection, saveData } = useNetworkStatus();

  const [forcedTier, setForcedTier] = useState<"high" | "medium" | "low" | null>(null);
  const [gpuInfo, setGpuInfo] = useState<DeviceCapabilities["gpu"]>({
    renderer: null,
    vendor: null,
    isHighPerformance: false,
    supportsWebGL2: false,
  });
  const [memoryInfo, setMemoryInfo] = useState<DeviceCapabilities["memory"]>({
    deviceMemory: null,
    isLowMemory: false,
  });
  const [cpuInfo, setCpuInfo] = useState<DeviceCapabilities["cpu"]>({
    cores: 4,
    isLowPower: false,
  });
  const [batteryInfo, setBatteryInfo] = useState<DeviceCapabilities["battery"]>({
    level: null,
    charging: true,
    isLowBattery: false,
  });

  // Detect GPU capabilities
  useEffect(() => {
    if (typeof document === "undefined") return;

    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");

      if (gl) {
        const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
        let renderer = "unknown";
        let vendor = "unknown";

        if (debugInfo) {
          renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "unknown";
          vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || "unknown";
        }

        const rendererLower = renderer.toLowerCase();
        const isHighPerformance = HIGH_END_GPUS.some((gpu) =>
          rendererLower.includes(gpu)
        );
        const isLowEnd = LOW_END_GPUS.some((gpu) =>
          rendererLower.includes(gpu)
        );

        setGpuInfo({
          renderer,
          vendor,
          isHighPerformance: isHighPerformance && !isLowEnd,
          supportsWebGL2: !!canvas.getContext("webgl2"),
        });
      }
    } catch {
      // WebGL not available
    }
  }, []);

  // Detect memory
  useEffect(() => {
    if (typeof navigator === "undefined") return;

    const nav = navigator as Navigator & { deviceMemory?: number };
    const deviceMemory = nav.deviceMemory ?? null;

    setMemoryInfo({
      deviceMemory,
      isLowMemory: deviceMemory !== null && deviceMemory <= 4,
    });
  }, []);

  // Detect CPU
  useEffect(() => {
    if (typeof navigator === "undefined") return;

    const cores = navigator.hardwareConcurrency || 4;
    setCpuInfo({
      cores,
      isLowPower: cores <= 4,
    });
  }, []);

  // Monitor battery
  useEffect(() => {
    if (typeof navigator === "undefined") return;

    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{
        level: number;
        charging: boolean;
        addEventListener: (event: string, handler: () => void) => void;
        removeEventListener: (event: string, handler: () => void) => void;
      }>;
    };

    if (nav.getBattery) {
      nav.getBattery().then((battery) => {
        const updateBattery = () => {
          setBatteryInfo({
            level: battery.level,
            charging: battery.charging,
            isLowBattery: battery.level < 0.2 && !battery.charging,
          });
        };

        updateBattery();
        battery.addEventListener("levelchange", updateBattery);
        battery.addEventListener("chargingchange", updateBattery);

        return () => {
          battery.removeEventListener("levelchange", updateBattery);
          battery.removeEventListener("chargingchange", updateBattery);
        };
      });
    }
  }, []);

  // Calculate performance tier
  const calculateTier = useCallback((): "high" | "medium" | "low" => {
    if (forcedTier) return forcedTier;

    let score = 0;

    // GPU score
    if (gpuInfo.isHighPerformance) score += 3;
    else if (gpuInfo.supportsWebGL2) score += 2;
    else score += 1;

    // Memory score
    if (memoryInfo.deviceMemory !== null) {
      if (memoryInfo.deviceMemory >= 8) score += 3;
      else if (memoryInfo.deviceMemory >= 4) score += 2;
      else score += 1;
    } else {
      score += 2; // Assume medium if unknown
    }

    // CPU score
    if (cpuInfo.cores >= 8) score += 3;
    else if (cpuInfo.cores >= 4) score += 2;
    else score += 1;

    // Penalties
    if (isMobile) score -= 1;
    if (batteryInfo.isLowBattery) score -= 2;
    if (isSlowConnection) score -= 1;
    if (saveData) score -= 2;

    if (score >= 8) return "high";
    if (score >= 5) return "medium";
    return "low";
  }, [
    forcedTier,
    gpuInfo,
    memoryInfo,
    cpuInfo,
    isMobile,
    batteryInfo.isLowBattery,
    isSlowConnection,
    saveData,
  ]);

  // Generate settings based on tier
  const generateSettings = useCallback(
    (tier: "high" | "medium" | "low"): RenderingSettings => {
      switch (tier) {
        case "high":
          return {
            targetFPS: 60,
            animationComplexity: "full",
            useGPUEffects: true,
            useBlur: true,
            shadowQuality: "high",
            textureScale: 1,
            smoothAnimations: true,
            avatarDetail: "full",
            enableParticles: true,
            enableAdvancedLighting: true,
          };
        case "medium":
          return {
            targetFPS: 60,
            animationComplexity: "reduced",
            useGPUEffects: true,
            useBlur: false,
            shadowQuality: "medium",
            textureScale: 0.75,
            smoothAnimations: true,
            avatarDetail: "simplified",
            enableParticles: false,
            enableAdvancedLighting: false,
          };
        case "low":
          return {
            targetFPS: 30,
            animationComplexity: "minimal",
            useGPUEffects: false,
            useBlur: false,
            shadowQuality: "none",
            textureScale: 0.5,
            smoothAnimations: false,
            avatarDetail: "minimal",
            enableParticles: false,
            enableAdvancedLighting: false,
          };
      }
    },
    []
  );

  const tier = calculateTier();

  return {
    tier,
    gpu: gpuInfo,
    memory: memoryInfo,
    cpu: cpuInfo,
    battery: batteryInfo,
    settings: generateSettings(tier),
    forceTier: setForcedTier,
  };
}

/**
 * Simple hook to get just the rendering settings
 */
export function useRenderingSettings(): RenderingSettings {
  const { settings } = useDeviceCapabilities();
  return settings;
}

/**
 * Hook to get performance tier only
 */
export function usePerformanceTier(): "high" | "medium" | "low" {
  const { tier } = useDeviceCapabilities();
  return tier;
}

/**
 * Hook to check if device should use reduced effects
 */
export function useShouldReduceEffects(): boolean {
  const { tier, battery } = useDeviceCapabilities();
  return tier === "low" || battery.isLowBattery;
}
