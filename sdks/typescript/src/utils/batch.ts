/**
 * Batch operation utilities
 *
 * Provides helpers for running batch operations with partial failure handling
 * using Promise.allSettled semantics.
 */

/**
 * Result of a single item in a batch operation
 */
export interface BatchItemResult<T> {
  /** Index of the item in the original array */
  index: number;
  /** Whether this item succeeded */
  success: boolean;
  /** The result if successful */
  data?: T;
  /** The error if failed */
  error?: string;
}

/**
 * Aggregated result of a batch operation
 */
export interface BatchResult<T> {
  /** Individual results for each item */
  results: BatchItemResult<T>[];
  /** Number of successful items */
  successCount: number;
  /** Number of failed items */
  failureCount: number;
  /** Total items processed */
  totalCount: number;
  /** Whether all items succeeded */
  allSucceeded: boolean;
}

/**
 * Process items in batch with partial failure handling.
 *
 * Uses Promise.allSettled internally so that one failure doesn't stop
 * other items from processing.
 *
 * @param items - Array of items to process
 * @param processor - Function to process each item
 * @returns Aggregated batch result with individual item results
 *
 * @example
 * ```typescript
 * const result = await batchProcess(
 *   [1, 2, 3],
 *   async (num) => {
 *     if (num === 2) throw new Error('Simulated failure');
 *     return num * 2;
 *   }
 * );
 *
 * console.log(result.successCount); // 2
 * console.log(result.failureCount); // 1
 * console.log(result.results[0].data); // 2
 * console.log(result.results[1].error); // 'Simulated failure'
 * ```
 */
export async function batchProcess<TInput, TOutput>(
  items: TInput[],
  processor: (item: TInput, index: number) => Promise<TOutput>
): Promise<BatchResult<TOutput>> {
  const settlements = await Promise.allSettled(
    items.map((item, index) => processor(item, index))
  );

  const results: BatchItemResult<TOutput>[] = settlements.map((settlement, index) => {
    if (settlement.status === 'fulfilled') {
      return {
        index,
        success: true,
        data: settlement.value,
      };
    } else {
      return {
        index,
        success: false,
        error: settlement.reason?.message || String(settlement.reason),
      };
    }
  });

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.length - successCount;

  return {
    results,
    successCount,
    failureCount,
    totalCount: results.length,
    allSucceeded: failureCount === 0,
  };
}

/**
 * Process items in batch with concurrency limit.
 *
 * Like batchProcess but limits how many items are processed concurrently.
 * Useful for rate-limited APIs or resource-constrained environments.
 *
 * @param items - Array of items to process
 * @param processor - Function to process each item
 * @param concurrency - Maximum concurrent operations (default: 10)
 * @returns Aggregated batch result with individual item results
 *
 * @example
 * ```typescript
 * const result = await batchProcessWithConcurrency(
 *   urls,
 *   async (url) => fetch(url).then(r => r.json()),
 *   5 // Only 5 concurrent requests at a time
 * );
 * ```
 */
export async function batchProcessWithConcurrency<TInput, TOutput>(
  items: TInput[],
  processor: (item: TInput, index: number) => Promise<TOutput>,
  concurrency: number = 10
): Promise<BatchResult<TOutput>> {
  const results: BatchItemResult<TOutput>[] = new Array(items.length);
  let currentIndex = 0;

  async function processNext(): Promise<void> {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      const item = items[index];

      try {
        const data = await processor(item, index);
        results[index] = { index, success: true, data };
      } catch (error) {
        results[index] = {
          index,
          success: false,
          error: (error as Error).message || String(error),
        };
      }
    }
  }

  // Start workers up to concurrency limit
  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(() => processNext());

  await Promise.all(workers);

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.length - successCount;

  return {
    results,
    successCount,
    failureCount,
    totalCount: results.length,
    allSucceeded: failureCount === 0,
  };
}
