// Bedrock US-profile list prices per million tokens (rebuild plan §6.0). Cache reads bill at 0.1x
// input and cache writes at 1.25x, Anthropic's standard multipliers.
const PRICES = [
  [/sonnet-5-5/, { input: 2.2, output: 11 }],
  [/haiku-5-5/, { input: 0.11, output: 0.55 }],
];

export function costOf(usage) {
  let usd = 0;
  for (const u of usage) {
    const price = PRICES.find(([pattern]) => pattern.test(u.model))?.[1];
    if (!price) throw new Error(`eval: no price for ${u.model}`);
    usd += (u.input * price.input + u.output * price.output + u.cacheRead * price.input * 0.1 + u.cacheWrite * price.input * 1.25) / 1e6;
  }
  return Math.round(usd * 1e5) / 1e5;
}

export function totals(usage) {
  const sum = (k) => usage.reduce((n, u) => n + (u[k] ?? 0), 0);
  return { calls: usage.length, inputTokens: sum("input"), outputTokens: sum("output"), cacheReadTokens: sum("cacheRead"), cacheWriteTokens: sum("cacheWrite"), costUsd: costOf(usage) };
}
