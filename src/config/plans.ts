export const PLANS = {
  starter: {
    id: "starter",
    name: "Starter",
    monthlyAmountUgx: 99_000,
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyAmountUgx: 199_000,
  },
} as const;

export type PlanId = keyof typeof PLANS;

export function getPlan(planId: string) {
  return PLANS[planId as PlanId] ?? null;
}

export function formatUgx(amount: number) {
  return `UGX ${amount.toLocaleString("en-UG")}`;
}
