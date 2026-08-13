/**
 * "Surprise me" pin picker (§4 D1) — the exploration equivalent of Wikipedia's
 * Random Article. Prefers a "good" pin (one that's been upvoted) so the dice tends
 * to land on something worth seeing, falling back to any pin. Pure so the selection
 * is unit-tested with a seeded RNG (surprise.test.ts).
 */
export function pickSurprisePin<T extends { vote_count: number }>(
  pins: T[],
  rand: () => number = Math.random,
): T | null {
  if (pins.length === 0) return null
  const good = pins.filter((p) => p.vote_count >= 1)
  const pool = good.length > 0 ? good : pins
  return pool[Math.floor(rand() * pool.length)] ?? null
}
