import { RecoveryWatcherError } from './errors.js';

export async function mapBoundedChunks<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
  options?: {
    shouldStop?: () => boolean;
  },
): Promise<{ completed: R[]; remaining: T[] }> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RecoveryWatcherError('Bounded concurrency must be a positive integer.', {
      code: 'configuration',
    });
  }
  const completed: R[] = [];
  let index = 0;
  while (index < items.length) {
    if (options?.shouldStop?.() === true) {
      return { completed, remaining: items.slice(index) };
    }
    const chunk = items.slice(index, index + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((item, offset) => mapper(item, index + offset)),
    );
    completed.push(...chunkResults);
    index += chunk.length;
  }
  return { completed, remaining: [] };
}
