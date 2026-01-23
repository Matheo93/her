/**
 * useMobileRenderQueue - Sprint 229
 *
 * Manages a priority-based render queue optimized for mobile devices.
 * Ensures smooth animations by scheduling renders within frame budgets
 * and prioritizing user-facing updates.
 *
 * Features:
 * - Priority-based render scheduling
 * - Frame budget management
 * - Render coalescing for efficiency
 * - Deadline-driven execution
 * - Idle-time utilization
 * - Visibility-aware scheduling
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Render priority levels
 */
export type RenderPriority =
  | "critical" // User input response, must be immediate
  | "high" // Animations, must complete within frame
  | "normal" // Standard UI updates
  | "low" // Background updates
  | "idle"; // Only during idle time

/**
 * Render task definition
 */
export interface RenderTask {
  id: string;
  priority: RenderPriority;
  callback: () => void;
  deadline: number;
  estimatedDuration: number;
  createdAt: number;
  coalesceKey?: string;
  abortController?: AbortController;
}

/**
 * Frame budget allocation
 */
export interface FrameBudget {
  totalMs: number;
  usedMs: number;
  remainingMs: number;
  criticalReserve: number;
}

/**
 * Queue configuration
 */
export interface QueueConfig {
  /** Target frame time in ms (default: 16.67) */
  targetFrameTimeMs: number;
  /** Reserve budget for critical tasks (default: 4) */
  criticalReserveMs: number;
  /** Maximum queue size (default: 100) */
  maxQueueSize: number;
  /** Enable render coalescing (default: true) */
  enableCoalescing: boolean;
  /** Enable idle time execution (default: true) */
  enableIdleExecution: boolean;
  /** Idle callback timeout (default: 50) */
  idleTimeoutMs: number;
  /** Enable visibility-aware scheduling (default: true) */
  visibilityAware: boolean;
  /** Stale task timeout (default: 1000) */
  staleTaskTimeoutMs: number;
}

/**
 * Queue metrics
 */
export interface QueueMetrics {
  tasksProcessed: number;
  tasksDropped: number;
  coalescedTasks: number;
  averageWaitTime: number;
  averageExecutionTime: number;
  budgetOverruns: number;
  idleTasksProcessed: number;
}

/**
 * Queue state
 */
export interface QueueState {
  isProcessing: boolean;
  queueLength: number;
  currentBudget: FrameBudget;
  metrics: QueueMetrics;
  isPageVisible: boolean;
}

/**
 * Queue controls
 */
export interface QueueControls {
  /** Schedule a render task */
  schedule: (
    callback: () => void,
    options?: {
      priority?: RenderPriority;
      deadline?: number;
      estimatedDuration?: number;
      coalesceKey?: string;
    }
  ) => string;
  /** Cancel a scheduled task */
  cancel: (taskId: string) => boolean;
  /** Cancel all tasks with coalesce key */
  cancelByKey: (coalesceKey: string) => number;
  /** Flush all pending tasks */
  flush: () => void;
  /** Clear the queue */
  clear: () => void;
  /** Pause processing */
  pause: () => void;
  /** Resume processing */
  resume: () => void;
  /** Get task by ID */
  getTask: (taskId: string) => RenderTask | undefined;
}

/**
 * Hook return type
 */
export interface UseMobileRenderQueueResult {
  state: QueueState;
  controls: QueueControls;
}

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_CONFIG: QueueConfig = {
  targetFrameTimeMs: 16.67,
  criticalReserveMs: 4,
  maxQueueSize: 100,
  enableCoalescing: true,
  enableIdleExecution: true,
  idleTimeoutMs: 50,
  visibilityAware: true,
  staleTaskTimeoutMs: 1000,
};

const DEFAULT_BUDGET: FrameBudget = {
  totalMs: 16.67,
  usedMs: 0,
  remainingMs: 16.67,
  criticalReserve: 4,
};

const DEFAULT_METRICS: QueueMetrics = {
  tasksProcessed: 0,
  tasksDropped: 0,
  coalescedTasks: 0,
  averageWaitTime: 0,
  averageExecutionTime: 0,
  budgetOverruns: 0,
  idleTasksProcessed: 0,
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate unique task ID
 */
function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get priority order (lower is higher priority)
 */
function getPriorityOrder(priority: RenderPriority): number {
  const order: Record<RenderPriority, number> = {
    critical: 0,
    high: 1,
    normal: 2,
    low: 3,
    idle: 4,
  };
  return order[priority];
}

/**
 * Sort tasks by priority and deadline
 */
function sortTasks(tasks: RenderTask[]): RenderTask[] {
  return [...tasks].sort((a, b) => {
    // First by priority
    const priorityDiff = getPriorityOrder(a.priority) - getPriorityOrder(b.priority);
    if (priorityDiff !== 0) return priorityDiff;

    // Then by deadline
    return a.deadline - b.deadline;
  });
}

/**
 * Check if task is stale
 */
function isStaleTask(task: RenderTask, timeout: number): boolean {
  return performance.now() - task.createdAt > timeout;
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Hook that manages a priority-based render queue for mobile
 */
export function useMobileRenderQueue(
  config: Partial<QueueConfig> = {}
): UseMobileRenderQueueResult {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  );

  // State
  const [isProcessing, setIsProcessing] = useState(false);
  const [queueLength, setQueueLength] = useState(0);
  const [currentBudget, setCurrentBudget] = useState<FrameBudget>(DEFAULT_BUDGET);
  const [metrics, setMetrics] = useState<QueueMetrics>(DEFAULT_METRICS);
  const [isPageVisible, setIsPageVisible] = useState(true);

  // Refs
  const queueRef = useRef<RenderTask[]>([]);
  const rafIdRef = useRef<number | null>(null);
  const idleCallbackIdRef = useRef<number | null>(null);
  const isPausedRef = useRef(false);
  const frameStartTimeRef = useRef(0);
  const waitTimesRef = useRef<number[]>([]);
  const executionTimesRef = useRef<number[]>([]);

  /**
   * Update budget state
   */
  const updateBudget = useCallback(
    (usedMs: number) => {
      setCurrentBudget((prev) => ({
        ...prev,
        usedMs: prev.usedMs + usedMs,
        remainingMs: Math.max(0, prev.totalMs - prev.usedMs - usedMs),
      }));
    },
    []
  );

  /**
   * Reset budget for new frame
   */
  const resetBudget = useCallback(() => {
    setCurrentBudget({
      totalMs: mergedConfig.targetFrameTimeMs,
      usedMs: 0,
      remainingMs: mergedConfig.targetFrameTimeMs,
      criticalReserve: mergedConfig.criticalReserveMs,
    });
  }, [mergedConfig.targetFrameTimeMs, mergedConfig.criticalReserveMs]);

  /**
   * Execute a single task
   */
  const executeTask = useCallback(
    (task: RenderTask): number => {
      const startTime = performance.now();

      try {
        task.callback();
      } catch (error) {
        console.error("Render task error:", error);
      }

      const duration = performance.now() - startTime;

      // Track execution time
      executionTimesRef.current.push(duration);
      if (executionTimesRef.current.length > 100) {
        executionTimesRef.current.shift();
      }

      // Track wait time
      const waitTime = startTime - task.createdAt;
      waitTimesRef.current.push(waitTime);
      if (waitTimesRef.current.length > 100) {
        waitTimesRef.current.shift();
      }

      return duration;
    },
    []
  );

  /**
   * Process queue within frame budget
   */
  const processQueue = useCallback(() => {
    if (isPausedRef.current) return;

    const queue = queueRef.current;
    if (queue.length === 0) {
      setIsProcessing(false);
      return;
    }

    setIsProcessing(true);
    frameStartTimeRef.current = performance.now();
    resetBudget();

    // Sort by priority
    const sortedQueue = sortTasks(queue);
    const processed: string[] = [];
    let budgetUsed = 0;
    let overrun = false;

    for (const task of sortedQueue) {
      // Check if task is stale
      if (isStaleTask(task, mergedConfig.staleTaskTimeoutMs)) {
        processed.push(task.id);
        setMetrics((prev) => ({
          ...prev,
          tasksDropped: prev.tasksDropped + 1,
        }));
        continue;
      }

      // Check budget
      const remainingBudget =
        mergedConfig.targetFrameTimeMs - budgetUsed - mergedConfig.criticalReserveMs;

      // Always execute critical tasks
      if (task.priority === "critical") {
        const duration = executeTask(task);
        budgetUsed += duration;
        processed.push(task.id);
        continue;
      }

      // Check if we have budget for this task
      if (
        task.estimatedDuration > remainingBudget &&
        task.priority !== "high"
      ) {
        // Skip non-critical tasks if over budget
        if (budgetUsed > mergedConfig.targetFrameTimeMs) {
          overrun = true;
        }
        continue;
      }

      // Execute task
      const duration = executeTask(task);
      budgetUsed += duration;
      processed.push(task.id);

      // Check if we exceeded budget
      if (budgetUsed >= mergedConfig.targetFrameTimeMs - mergedConfig.criticalReserveMs) {
        break;
      }
    }

    // Remove processed tasks
    queueRef.current = queue.filter((t) => !processed.includes(t.id));
    setQueueLength(queueRef.current.length);

    // Update metrics
    setMetrics((prev) => ({
      ...prev,
      tasksProcessed: prev.tasksProcessed + processed.length,
      budgetOverruns: prev.budgetOverruns + (overrun ? 1 : 0),
      averageWaitTime:
        waitTimesRef.current.reduce((a, b) => a + b, 0) /
        (waitTimesRef.current.length || 1),
      averageExecutionTime:
        executionTimesRef.current.reduce((a, b) => a + b, 0) /
        (executionTimesRef.current.length || 1),
    }));

    updateBudget(budgetUsed);

    // Schedule next frame if queue not empty
    if (queueRef.current.length > 0) {
      rafIdRef.current = requestAnimationFrame(processQueue);
    } else {
      setIsProcessing(false);
    }
  }, [
    mergedConfig,
    resetBudget,
    executeTask,
    updateBudget,
  ]);

  /**
   * Process idle tasks
   */
  const processIdleTasks = useCallback(
    (deadline: IdleDeadline) => {
      if (isPausedRef.current) return;

      const queue = queueRef.current;
      const idleTasks = queue.filter((t) => t.priority === "idle");

      if (idleTasks.length === 0) return;

      const processed: string[] = [];

      for (const task of idleTasks) {
        if (deadline.timeRemaining() <= 0) break;

        // Check if stale
        if (isStaleTask(task, mergedConfig.staleTaskTimeoutMs)) {
          processed.push(task.id);
          continue;
        }

        // Execute if we have time
        if (deadline.timeRemaining() >= task.estimatedDuration) {
          executeTask(task);
          processed.push(task.id);

          setMetrics((prev) => ({
            ...prev,
            idleTasksProcessed: prev.idleTasksProcessed + 1,
          }));
        }
      }

      // Remove processed
      queueRef.current = queue.filter((t) => !processed.includes(t.id));
      setQueueLength(queueRef.current.length);

      // Schedule next idle callback if more idle tasks
      const remainingIdleTasks = queueRef.current.filter(
        (t) => t.priority === "idle"
      );
      if (remainingIdleTasks.length > 0 && mergedConfig.enableIdleExecution) {
        idleCallbackIdRef.current = requestIdleCallback(processIdleTasks, {
          timeout: mergedConfig.idleTimeoutMs,
        });
      }
    },
    [mergedConfig, executeTask]
  );

  /**
   * Schedule a render task
   */
  const schedule = useCallback(
    (
      callback: () => void,
      options: {
        priority?: RenderPriority;
        deadline?: number;
        estimatedDuration?: number;
        coalesceKey?: string;
      } = {}
    ): string => {
      const queue = queueRef.current;
      const priority = options.priority ?? "normal";
      const now = performance.now();

      // Handle coalescing
      if (mergedConfig.enableCoalescing && options.coalesceKey) {
        const existingIndex = queue.findIndex(
          (t) => t.coalesceKey === options.coalesceKey
        );

        if (existingIndex !== -1) {
          // Replace existing task
          const existingTask = queue[existingIndex];
          queue[existingIndex] = {
            ...existingTask,
            callback,
            deadline: options.deadline ?? existingTask.deadline,
            estimatedDuration:
              options.estimatedDuration ?? existingTask.estimatedDuration,
          };

          setMetrics((prev) => ({
            ...prev,
            coalescedTasks: prev.coalescedTasks + 1,
          }));

          return existingTask.id;
        }
      }

      // Check queue size
      if (queue.length >= mergedConfig.maxQueueSize) {
        // Remove oldest low-priority task
        const lowPriorityIndex = queue.findIndex(
          (t) => t.priority === "low" || t.priority === "idle"
        );

        if (lowPriorityIndex !== -1) {
          queue.splice(lowPriorityIndex, 1);
          setMetrics((prev) => ({
            ...prev,
            tasksDropped: prev.tasksDropped + 1,
          }));
        } else if (priority !== "critical" && priority !== "high") {
          // Don't add if queue is full and task isn't high priority
          return "";
        }
      }

      // Create task
      const task: RenderTask = {
        id: generateTaskId(),
        priority,
        callback,
        deadline: options.deadline ?? now + mergedConfig.targetFrameTimeMs * 2,
        estimatedDuration: options.estimatedDuration ?? 1,
        createdAt: now,
        coalesceKey: options.coalesceKey,
      };

      queue.push(task);
      setQueueLength(queue.length);

      // Start processing if not already
      if (!isProcessing && !isPausedRef.current) {
        if (priority === "idle" && mergedConfig.enableIdleExecution) {
          if (idleCallbackIdRef.current === null) {
            idleCallbackIdRef.current = requestIdleCallback(processIdleTasks, {
              timeout: mergedConfig.idleTimeoutMs,
            });
          }
        } else {
          if (rafIdRef.current === null) {
            rafIdRef.current = requestAnimationFrame(processQueue);
          }
        }
      }

      return task.id;
    },
    [mergedConfig, isProcessing, processQueue, processIdleTasks]
  );

  /**
   * Cancel a scheduled task
   */
  const cancel = useCallback((taskId: string): boolean => {
    const queue = queueRef.current;
    const index = queue.findIndex((t) => t.id === taskId);

    if (index !== -1) {
      queue.splice(index, 1);
      setQueueLength(queue.length);
      return true;
    }

    return false;
  }, []);

  /**
   * Cancel all tasks with coalesce key
   */
  const cancelByKey = useCallback((coalesceKey: string): number => {
    const queue = queueRef.current;
    const originalLength = queue.length;

    queueRef.current = queue.filter((t) => t.coalesceKey !== coalesceKey);
    setQueueLength(queueRef.current.length);

    return originalLength - queueRef.current.length;
  }, []);

  /**
   * Flush all pending tasks
   */
  const flush = useCallback(() => {
    const queue = queueRef.current;

    for (const task of queue) {
      try {
        task.callback();
      } catch (error) {
        console.error("Flush task error:", error);
      }
    }

    queueRef.current = [];
    setQueueLength(0);
    setIsProcessing(false);
  }, []);

  /**
   * Clear the queue
   */
  const clear = useCallback(() => {
    queueRef.current = [];
    setQueueLength(0);
    setIsProcessing(false);

    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    if (idleCallbackIdRef.current) {
      cancelIdleCallback(idleCallbackIdRef.current);
      idleCallbackIdRef.current = null;
    }
  }, []);

  /**
   * Pause processing
   */
  const pause = useCallback(() => {
    isPausedRef.current = true;
    setIsProcessing(false);
  }, []);

  /**
   * Resume processing
   */
  const resume = useCallback(() => {
    isPausedRef.current = false;

    if (queueRef.current.length > 0) {
      rafIdRef.current = requestAnimationFrame(processQueue);
    }
  }, [processQueue]);

  /**
   * Get task by ID
   */
  const getTask = useCallback((taskId: string): RenderTask | undefined => {
    return queueRef.current.find((t) => t.id === taskId);
  }, []);

  // Handle page visibility
  useEffect(() => {
    if (!mergedConfig.visibilityAware) return;

    const handleVisibilityChange = () => {
      const visible = document.visibilityState === "visible";
      setIsPageVisible(visible);

      if (visible) {
        resume();
      } else {
        pause();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [mergedConfig.visibilityAware, pause, resume]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      if (idleCallbackIdRef.current) {
        cancelIdleCallback(idleCallbackIdRef.current);
      }
    };
  }, []);

  // Build state object
  const state: QueueState = useMemo(
    () => ({
      isProcessing,
      queueLength,
      currentBudget,
      metrics,
      isPageVisible,
    }),
    [isProcessing, queueLength, currentBudget, metrics, isPageVisible]
  );

  // Build controls object
  const controls: QueueControls = useMemo(
    () => ({
      schedule,
      cancel,
      cancelByKey,
      flush,
      clear,
      pause,
      resume,
      getTask,
    }),
    [schedule, cancel, cancelByKey, flush, clear, pause, resume, getTask]
  );

  return {
    state,
    controls,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Simple hook for scheduling render callbacks
 */
export function useRenderScheduler(): (
  callback: () => void,
  priority?: RenderPriority
) => void {
  const { controls } = useMobileRenderQueue();

  return useCallback(
    (callback: () => void, priority: RenderPriority = "normal") => {
      controls.schedule(callback, { priority });
    },
    [controls]
  );
}

/**
 * Hook for coalesced updates
 */
export function useCoalescedRender(
  coalesceKey: string
): (callback: () => void) => void {
  const { controls } = useMobileRenderQueue({ enableCoalescing: true });

  return useCallback(
    (callback: () => void) => {
      controls.schedule(callback, { coalesceKey, priority: "normal" });
    },
    [controls, coalesceKey]
  );
}

// ============================================================================
// Exports
// ============================================================================

export default useMobileRenderQueue;
