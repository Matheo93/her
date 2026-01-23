/**
 * useMobileFrameScheduler - Intelligent frame scheduling for mobile performance
 *
 * Sprint 1589 - Optimizes animation frame execution based on device capabilities,
 * battery state, and current workload for smooth performance.
 *
 * Features:
 * - Priority-based task scheduling
 * - Adaptive frame rate targeting
 * - Frame budget management
 * - Task batching and coalescing
 * - Performance monitoring
 * - Thermal throttling integration
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// Priority levels
export type TaskPriority =
  | "critical" // Must run every frame
  | "high" // Important, but can skip frames
  | "normal" // Standard priority
  | "low" // Can be deferred
  | "idle"; // Only when idle

export type FramePhase =
  | "input" // Handle input events
  | "animation" // Run animations
  | "render" // Render updates
  | "idle"; // Background tasks

export interface ScheduledTask {
  id: string;
  priority: TaskPriority;
  callback: (deltaTime: number, frameInfo: FrameInfo) => void;
  maxSkipFrames: number;
  framesSinceRun: number;
  averageRunTime: number;
  enabled: boolean;
}

export interface FrameInfo {
  frameNumber: number;
  timestamp: number;
  deltaTime: number;
  fps: number;
  targetFps: number;
  budget: number;
  budgetUsed: number;
  budgetRemaining: number;
  phase: FramePhase;
  isDroppedFrame: boolean;
}

export interface SchedulerState {
  isRunning: boolean;
  currentFps: number;
  targetFps: number;
  frameBudget: number;
  budgetUtilization: number;
  activeTaskCount: number;
  pendingTaskCount: number;
  droppedFrames: number;
  frameNumber: number;
}

export interface SchedulerMetrics {
  totalFrames: number;
  droppedFrames: number;
  averageFps: number;
  minFps: number;
  maxFps: number;
  averageBudgetUsage: number;
  taskExecutions: number;
  deferredTasks: number;
}

export interface SchedulerConfig {
  enabled: boolean;
  targetFps: number;
  minFps: number;
  frameBudgetMs: number;
  adaptiveFrameRate: boolean;
  batterySaver: boolean;
  batterySaverFps: number;
  thermalThrottling: boolean;
  thermalThrottleFps: number;
  taskCoalescing: boolean;
  maxDeferredFrames: number;
}

export interface SchedulerControls {
  start: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  scheduleTask: (
    id: string,
    callback: (deltaTime: number, frameInfo: FrameInfo) => void,
    priority?: TaskPriority,
    maxSkipFrames?: number
  ) => void;
  unscheduleTask: (id: string) => void;
  enableTask: (id: string) => void;
  disableTask: (id: string) => void;
  setTargetFps: (fps: number) => void;
  runOnce: (callback: () => void, priority?: TaskPriority) => void;
  updateConfig: (config: Partial<SchedulerConfig>) => void;
  getTaskInfo: (id: string) => ScheduledTask | undefined;
}

export interface UseMobileFrameSchedulerResult {
  state: SchedulerState;
  metrics: SchedulerMetrics;
  controls: SchedulerControls;
  config: SchedulerConfig;
  frameInfo: FrameInfo | null;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  enabled: true,
  targetFps: 60,
  minFps: 24,
  frameBudgetMs: 16.67, // 60fps budget
  adaptiveFrameRate: true,
  batterySaver: true,
  batterySaverFps: 30,
  thermalThrottling: true,
  thermalThrottleFps: 30,
  taskCoalescing: true,
  maxDeferredFrames: 3,
};

// Priority weights for scheduling
const PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  critical: 100,
  high: 75,
  normal: 50,
  low: 25,
  idle: 10,
};

// Max skip frames by priority
const DEFAULT_MAX_SKIP: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 5,
  idle: 10,
};

function generateId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function useMobileFrameScheduler(
  initialConfig: Partial<SchedulerConfig> = {}
): UseMobileFrameSchedulerResult {
  const [config, setConfig] = useState<SchedulerConfig>({
    ...DEFAULT_CONFIG,
    ...initialConfig,
  });

  const [state, setState] = useState<SchedulerState>({
    isRunning: false,
    currentFps: 60,
    targetFps: config.targetFps,
    frameBudget: config.frameBudgetMs,
    budgetUtilization: 0,
    activeTaskCount: 0,
    pendingTaskCount: 0,
    droppedFrames: 0,
    frameNumber: 0,
  });

  const [metrics, setMetrics] = useState<SchedulerMetrics>({
    totalFrames: 0,
    droppedFrames: 0,
    averageFps: 60,
    minFps: 60,
    maxFps: 60,
    averageBudgetUsage: 0,
    taskExecutions: 0,
    deferredTasks: 0,
  });

  const [frameInfo, setFrameInfo] = useState<FrameInfo | null>(null);

  // Refs
  const animationRef = useRef<number | null>(null);
  const tasksRef = useRef<Map<string, ScheduledTask>>(new Map());
  const oneTimeTasksRef = useRef<Array<{ callback: () => void; priority: TaskPriority }>>([]);
  const isPausedRef = useRef(false);
  const lastFrameTimeRef = useRef(0);
  const frameCountRef = useRef(0);
  const fpsHistoryRef = useRef<number[]>([]);
  const budgetHistoryRef = useRef<number[]>([]);
  const effectiveTargetFpsRef = useRef(config.targetFps);
  const isLowBatteryRef = useRef(false);
  const isThermalThrottledRef = useRef(false);

  // Calculate effective target FPS
  const updateEffectiveTargetFps = useCallback(() => {
    let targetFps = config.targetFps;

    if (config.batterySaver && isLowBatteryRef.current) {
      targetFps = Math.min(targetFps, config.batterySaverFps);
    }

    if (config.thermalThrottling && isThermalThrottledRef.current) {
      targetFps = Math.min(targetFps, config.thermalThrottleFps);
    }

    effectiveTargetFpsRef.current = Math.max(config.minFps, targetFps);
  }, [config]);

  // Monitor battery
  useEffect(() => {
    if (!config.batterySaver) return;

    const checkBattery = async () => {
      try {
        // @ts-ignore - Battery API
        const battery = await navigator.getBattery?.();
        if (battery) {
          const update = () => {
            isLowBatteryRef.current = battery.level < 0.2 && !battery.charging;
            updateEffectiveTargetFps();
          };
          update();
          battery.addEventListener("levelchange", update);
          battery.addEventListener("chargingchange", update);
          return () => {
            battery.removeEventListener("levelchange", update);
            battery.removeEventListener("chargingchange", update);
          };
        }
      } catch {
        // Battery API not available
      }
    };
    checkBattery();
  }, [config.batterySaver, updateEffectiveTargetFps]);

  // Sort tasks by priority for execution order
  const getSortedTasks = useCallback((): ScheduledTask[] => {
    const tasks = Array.from(tasksRef.current.values()).filter((t) => t.enabled);
    return tasks.sort(
      (a, b) => PRIORITY_WEIGHTS[b.priority] - PRIORITY_WEIGHTS[a.priority]
    );
  }, []);

  // Main frame loop
  const frameLoop = useCallback(
    (timestamp: number) => {
      if (!state.isRunning || isPausedRef.current) {
        animationRef.current = requestAnimationFrame(frameLoop);
        return;
      }

      const deltaTime = timestamp - lastFrameTimeRef.current;
      const targetFrameTime = 1000 / effectiveTargetFpsRef.current;

      // Skip if too soon (frame limiting)
      if (deltaTime < targetFrameTime * 0.9) {
        animationRef.current = requestAnimationFrame(frameLoop);
        return;
      }

      lastFrameTimeRef.current = timestamp;
      frameCountRef.current++;

      const frameStart = performance.now();
      const frameBudget = 1000 / effectiveTargetFpsRef.current;
      let budgetUsed = 0;
      let taskExecutions = 0;
      let deferredTasks = 0;

      const currentFrameInfo: FrameInfo = {
        frameNumber: frameCountRef.current,
        timestamp,
        deltaTime,
        fps: 1000 / deltaTime,
        targetFps: effectiveTargetFpsRef.current,
        budget: frameBudget,
        budgetUsed: 0,
        budgetRemaining: frameBudget,
        phase: "input",
        isDroppedFrame: deltaTime > frameBudget * 1.5,
      };

      // Execute one-time tasks first
      const oneTimeTasks = [...oneTimeTasksRef.current];
      oneTimeTasksRef.current = [];

      for (const task of oneTimeTasks) {
        if (budgetUsed < frameBudget * 0.8) {
          const taskStart = performance.now();
          try {
            task.callback();
          } catch (e) {
            console.error("Task error:", e);
          }
          budgetUsed += performance.now() - taskStart;
          taskExecutions++;
        } else {
          // Defer to next frame
          oneTimeTasksRef.current.push(task);
          deferredTasks++;
        }
      }

      // Execute scheduled tasks
      const sortedTasks = getSortedTasks();
      currentFrameInfo.phase = "animation";

      for (const task of sortedTasks) {
        const shouldRun =
          task.priority === "critical" ||
          task.framesSinceRun >= task.maxSkipFrames ||
          budgetUsed < frameBudget * 0.7;

        if (shouldRun) {
          const taskStart = performance.now();
          try {
            task.callback(deltaTime, currentFrameInfo);
          } catch (e) {
            console.error("Task error:", e);
          }
          const taskTime = performance.now() - taskStart;

          // Update task stats
          task.averageRunTime = task.averageRunTime * 0.9 + taskTime * 0.1;
          task.framesSinceRun = 0;
          budgetUsed += taskTime;
          taskExecutions++;
        } else {
          task.framesSinceRun++;
          deferredTasks++;
        }

        // Check budget
        if (budgetUsed > frameBudget * 0.9 && task.priority !== "critical") {
          break;
        }
      }

      // Update frame info
      currentFrameInfo.budgetUsed = budgetUsed;
      currentFrameInfo.budgetRemaining = Math.max(0, frameBudget - budgetUsed);
      currentFrameInfo.phase = "render";

      setFrameInfo(currentFrameInfo);

      // Update FPS history
      const currentFps = 1000 / deltaTime;
      fpsHistoryRef.current.push(currentFps);
      if (fpsHistoryRef.current.length > 60) {
        fpsHistoryRef.current.shift();
      }

      // Update budget history
      const budgetUtilization = (budgetUsed / frameBudget) * 100;
      budgetHistoryRef.current.push(budgetUtilization);
      if (budgetHistoryRef.current.length > 60) {
        budgetHistoryRef.current.shift();
      }

      // Adaptive frame rate
      if (config.adaptiveFrameRate) {
        const avgBudget =
          budgetHistoryRef.current.reduce((a, b) => a + b, 0) /
          budgetHistoryRef.current.length;

        if (avgBudget > 90 && effectiveTargetFpsRef.current > config.minFps) {
          effectiveTargetFpsRef.current = Math.max(
            config.minFps,
            effectiveTargetFpsRef.current - 5
          );
        } else if (avgBudget < 60 && effectiveTargetFpsRef.current < config.targetFps) {
          effectiveTargetFpsRef.current = Math.min(
            config.targetFps,
            effectiveTargetFpsRef.current + 5
          );
        }
      }

      // Update state
      setState((prev) => ({
        ...prev,
        currentFps: currentFps,
        targetFps: effectiveTargetFpsRef.current,
        frameBudget: frameBudget,
        budgetUtilization,
        activeTaskCount: sortedTasks.length,
        pendingTaskCount: oneTimeTasksRef.current.length,
        droppedFrames: prev.droppedFrames + (currentFrameInfo.isDroppedFrame ? 1 : 0),
        frameNumber: frameCountRef.current,
      }));

      // Update metrics
      setMetrics((prev) => ({
        ...prev,
        totalFrames: prev.totalFrames + 1,
        droppedFrames: prev.droppedFrames + (currentFrameInfo.isDroppedFrame ? 1 : 0),
        averageFps:
          fpsHistoryRef.current.reduce((a, b) => a + b, 0) /
          fpsHistoryRef.current.length,
        minFps: Math.min(...fpsHistoryRef.current),
        maxFps: Math.max(...fpsHistoryRef.current),
        averageBudgetUsage:
          budgetHistoryRef.current.reduce((a, b) => a + b, 0) /
          budgetHistoryRef.current.length,
        taskExecutions: prev.taskExecutions + taskExecutions,
        deferredTasks: prev.deferredTasks + deferredTasks,
      }));

      animationRef.current = requestAnimationFrame(frameLoop);
    },
    [state.isRunning, config.adaptiveFrameRate, config.minFps, config.targetFps, getSortedTasks]
  );

  // Controls
  const start = useCallback(() => {
    if (state.isRunning) return;

    lastFrameTimeRef.current = performance.now();
    setState((prev) => ({ ...prev, isRunning: true }));
    animationRef.current = requestAnimationFrame(frameLoop);
  }, [state.isRunning, frameLoop]);

  const stop = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    setState((prev) => ({ ...prev, isRunning: false }));
  }, []);

  const pause = useCallback(() => {
    isPausedRef.current = true;
  }, []);

  const resume = useCallback(() => {
    isPausedRef.current = false;
    lastFrameTimeRef.current = performance.now();
  }, []);

  const scheduleTask = useCallback(
    (
      id: string,
      callback: (deltaTime: number, frameInfo: FrameInfo) => void,
      priority: TaskPriority = "normal",
      maxSkipFrames?: number
    ) => {
      tasksRef.current.set(id, {
        id,
        priority,
        callback,
        maxSkipFrames: maxSkipFrames ?? DEFAULT_MAX_SKIP[priority],
        framesSinceRun: 0,
        averageRunTime: 0,
        enabled: true,
      });
    },
    []
  );

  const unscheduleTask = useCallback((id: string) => {
    tasksRef.current.delete(id);
  }, []);

  const enableTask = useCallback((id: string) => {
    const task = tasksRef.current.get(id);
    if (task) {
      task.enabled = true;
    }
  }, []);

  const disableTask = useCallback((id: string) => {
    const task = tasksRef.current.get(id);
    if (task) {
      task.enabled = false;
    }
  }, []);

  const setTargetFps = useCallback(
    (fps: number) => {
      setConfig((prev) => ({
        ...prev,
        targetFps: Math.max(prev.minFps, Math.min(120, fps)),
      }));
      effectiveTargetFpsRef.current = fps;
    },
    []
  );

  const runOnce = useCallback((callback: () => void, priority: TaskPriority = "normal") => {
    oneTimeTasksRef.current.push({ callback, priority });
  }, []);

  const updateConfig = useCallback((updates: Partial<SchedulerConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  const getTaskInfo = useCallback((id: string): ScheduledTask | undefined => {
    return tasksRef.current.get(id);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const controls: SchedulerControls = useMemo(
    () => ({
      start,
      stop,
      pause,
      resume,
      scheduleTask,
      unscheduleTask,
      enableTask,
      disableTask,
      setTargetFps,
      runOnce,
      updateConfig,
      getTaskInfo,
    }),
    [
      start,
      stop,
      pause,
      resume,
      scheduleTask,
      unscheduleTask,
      enableTask,
      disableTask,
      setTargetFps,
      runOnce,
      updateConfig,
      getTaskInfo,
    ]
  );

  return {
    state,
    metrics,
    controls,
    config,
    frameInfo,
  };
}

// Sub-hook: Simple FPS monitor
export function useFpsMonitor(): { fps: number; targetFps: number } {
  const { state } = useMobileFrameScheduler();
  return { fps: state.currentFps, targetFps: state.targetFps };
}

// Sub-hook: Schedule a callback
export function useScheduledCallback(
  callback: (deltaTime: number) => void,
  priority: TaskPriority = "normal",
  enabled: boolean = true
): void {
  const { controls } = useMobileFrameScheduler();
  const idRef = useRef(generateId());

  useEffect(() => {
    const id = idRef.current;

    if (enabled) {
      controls.scheduleTask(id, (dt) => callback(dt), priority);
    }

    return () => {
      controls.unscheduleTask(id);
    };
  }, [callback, priority, enabled, controls]);
}

export default useMobileFrameScheduler;
