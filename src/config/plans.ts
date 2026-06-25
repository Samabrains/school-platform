export const PLANS = {
  starter: {
    id: "starter",
    name: "Starter",
    monthlyAmountUgx: 99_000,
    features: [
      "School website & news",
      "Parent hub & digital forms",
      "AI handbook chatbot",
      "30-day free trial",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyAmountUgx: 199_000,
    features: [
      "Everything in Starter",
      "Alumni portal",
      "Careers page",
      "Priority support",
    ],
  },
} as const;

export type PlanId = keyof typeof PLANS;

export function getPlan(planId: string) {
  return PLANS[planId as PlanId] ?? null;
}

export function formatUgx(amount: number) {
  return `UGX ${amount.toLocaleString("en-UG")}`;
}
