/** 999 → "999", 24100 → "24.1k", 1200000 → "1.2M". */
export function formatViewers(n: number): string {
  const short = (v: number, unit: string) => `${v.toFixed(1).replace(/\.0$/, "")}${unit}`;
  if (n >= 1_000_000) return short(n / 1_000_000, "M");
  if (n >= 1000) return short(n / 1000, "k");
  return String(n);
}
