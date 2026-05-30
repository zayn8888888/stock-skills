/** Maximum number of tasks that can run concurrently. */
const MAX_CONCURRENT = 2;

/** Per-task timeout: 10 minutes in milliseconds. */
const TASK_TIMEOUT_MS = 10 * 60 * 1000;

// ──────────────────── TaskRunner ────────────────────────────────────

/**
 * Manages concurrent background tasks with cancellation and timeout support.
 *
 * Each task is keyed by a runId and wrapped in an AbortController so it
 * can be cancelled individually. A semaphore limits concurrency to
 * `MAX_CONCURRENT` tasks.
 */
export class TaskRunner {
  private activeTasks = new Map<string, AbortController>();
  private runningCount = 0;
  private queue: Array<() => void> = [];

  /**
   * Enqueue a task for execution.
   *
   * If fewer than MAX_CONCURRENT tasks are running the task starts
   * immediately; otherwise it waits in a FIFO queue until a slot opens.
   *
   * @param runId  Unique identifier for this task (used for cancellation/lookup).
   * @param fn     Async function that receives an AbortSignal for cooperative cancellation.
   * @returns      Promise that resolves when the task completes (or rejects on error/timeout/cancellation).
   */
  enqueue(runId: string, fn: (signal: AbortSignal) => Promise<void>): Promise<void> {
    if (this.activeTasks.has(runId)) {
      return Promise.reject(new Error(`Task "${runId}" is already running`));
    }

    return new Promise<void>((resolve, reject) => {
      const startTask = () => {
        this.runningCount++;
        const controller = new AbortController();
        this.activeTasks.set(runId, controller);

        // Set up a 10-minute timeout
        const timeout = setTimeout(() => {
          controller.abort();
        }, TASK_TIMEOUT_MS);

        fn(controller.signal)
          .then(() => {
            clearTimeout(timeout);
            this.cleanup(runId);
            resolve();
          })
          .catch((err) => {
            clearTimeout(timeout);
            this.cleanup(runId);
            reject(err);
          })
          .finally(() => {
            this.runningCount--;
            // Start the next queued task if any
            const next = this.queue.shift();
            if (next) next();
          });
      };

      if (this.runningCount < MAX_CONCURRENT) {
        startTask();
      } else {
        this.queue.push(startTask);
      }
    });
  }

  /**
   * Cancel a running or queued task by its runId.
   *
   * @returns `true` if the task was found and cancelled, `false` otherwise.
   */
  cancel(runId: string): boolean {
    const controller = this.activeTasks.get(runId);
    if (!controller) return false;

    controller.abort();
    this.cleanup(runId);
    return true;
  }

  /**
   * Check whether a task with the given runId is currently running.
   */
  isRunning(runId: string): boolean {
    return this.activeTasks.has(runId);
  }

  /**
   * Return the number of currently running tasks.
   */
  get activeCount(): number {
    return this.runningCount;
  }

  // ── internal ──

  private cleanup(runId: string): void {
    this.activeTasks.delete(runId);
  }
}

/** Global singleton task runner. */
export const taskRunner = new TaskRunner();
