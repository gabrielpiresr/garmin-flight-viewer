/** Shared concurrency limiter for chart tile image loads. */

const DEFAULT_CONCURRENCY = 5;

type QueueJob = {
  run: () => void;
};

let active = 0;
const pending: QueueJob[] = [];

function pump(): void {
  while (active < DEFAULT_CONCURRENCY && pending.length > 0) {
    const job = pending.shift();
    if (!job) return;
    active += 1;
    job.run();
  }
}

/** Release a slot after a tile finishes (load or error). */
export function releaseChartTileSlot(): void {
  active = Math.max(0, active - 1);
  pump();
}

/**
 * Schedule assigning `img.src`. Returns a cancel function if the tile is removed
 * before the slot opens.
 */
export function enqueueChartTileLoad(img: HTMLImageElement, url: string): () => void {
  let cancelled = false;
  let started = false;

  const start = () => {
    if (cancelled) {
      releaseChartTileSlot();
      return;
    }
    started = true;
    img.src = url;
  };

  pending.push({ run: start });
  pump();

  return () => {
    if (cancelled) return;
    cancelled = true;
    if (!started) {
      const idx = pending.findIndex((j) => j.run === start);
      if (idx >= 0) pending.splice(idx, 1);
    }
  };
}

export function resetChartTileQueueForTests(): void {
  pending.length = 0;
  active = 0;
}
