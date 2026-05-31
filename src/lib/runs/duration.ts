interface DurationSource {
  durationMs: number | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export function deriveDurationMs(source: DurationSource): number | null {
  if (source.durationMs !== null) return source.durationMs;
  if (!source.startedAt || !source.finishedAt) return null;

  const started = new Date(source.startedAt).getTime();
  const finished = new Date(source.finishedAt).getTime();

  if (!Number.isFinite(started) || !Number.isFinite(finished)) return null;
  return Math.max(0, finished - started);
}
