/** Compact dollar figure for dense list rows: 1_284_500 -> "$1.28M". */
export function formatCompactAmount(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1).replace(/\.?0+$/, "")}K`;
  return `$${n.toLocaleString()}`;
}

/** Full grouped figure: 1_284_500 -> "$1,284,500". */
export function formatFullAmount(n: number): string {
  return `$${n.toLocaleString()}`;
}

/**
 * Screen readers should say the whole number, not "one point two eight M".
 * Used for aria-label on abbreviated figures.
 */
export function spokenAmount(n: number): string {
  return `${n.toLocaleString()} dollars`;
}

export function isForgiven(loan: { forgiven_amount: number | null }): boolean {
  return (loan.forgiven_amount ?? 0) > 0;
}
