import type { Env } from "../types";

const LIVE_BASE = "https://pay.pesapal.com/v3";

type PesapalTokenResponse = {
  token?: string;
  expiryDate?: string;
  error?: unknown;
};

type SubmitOrderResponse = {
  order_tracking_id?: string;
  merchant_reference?: string;
  redirect_url?: string;
  error?: unknown;
};

type TransactionStatusResponse = {
  payment_status_description?: string;
  status_code?: number;
  amount?: number;
  currency?: string;
  subscription_transaction_info?: Record<string, unknown>;
};

let cachedToken: { token: string; expiresAt: number } | null = null;

function baseUrl(env: Env) {
  return env.PESAPAL_ENVIRONMENT === "sandbox"
    ? "https://cybqa.pesapal.com/pesapalv3"
    : LIVE_BASE;
}

export async function getPesapalToken(env: Env): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token;
  }

  const key = env.PESAPAL_CONSUMER_KEY;
  const secret = env.PESAPAL_CONSUMER_SECRET;
  if (!key || !secret) {
    throw new Error("Pesapal credentials not configured");
  }

  const res = await fetch(`${baseUrl(env)}/api/Auth/RequestToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ consumer_key: key, consumer_secret: secret }),
  });

  const data = (await res.json()) as PesapalTokenResponse;
  if (!res.ok || !data.token) {
    throw new Error(`Pesapal auth failed: ${JSON.stringify(data)}`);
  }

  cachedToken = {
    token: data.token,
    expiresAt: data.expiryDate ? new Date(data.expiryDate).getTime() : now + 4 * 60_000,
  };

  return data.token;
}

function formatPesapalDate(unixSeconds: number) {
  const d = new Date(unixSeconds * 1000);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

export async function submitSubscriptionOrder(
  env: Env,
  input: {
    tenantId: string;
    accountNumber: string;
    amountUgx: number;
    description: string;
    adminEmail: string;
    adminPhone?: string;
    billingStartUnix: number;
    callbackUrl: string;
  }
) {
  const token = await getPesapalToken(env);
  const notificationId = env.PESAPAL_IPN_NOTIFICATION_ID;
  if (!notificationId) {
    throw new Error("PESAPAL_IPN_NOTIFICATION_ID not configured");
  }

  const endDate = formatPesapalDate(input.billingStartUnix + 365 * 24 * 60 * 60);

  const body = {
    id: `order-${input.tenantId}-${Date.now()}`,
    currency: "UGX",
    amount: input.amountUgx,
    description: input.description,
    callback_url: input.callbackUrl,
    notification_id: notificationId,
    billing_address: {
      email_address: input.adminEmail,
      phone_number: input.adminPhone ?? "+256700000000",
      country_code: "UG",
    },
    account_number: input.accountNumber,
    subscription_details: {
      start_date: formatPesapalDate(input.billingStartUnix),
      end_date: endDate,
      frequency: "MONTHLY",
    },
  };

  const res = await fetch(`${baseUrl(env)}/api/Transactions/SubmitOrderRequest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as SubmitOrderResponse;
  if (!res.ok || !data.redirect_url) {
    throw new Error(`Pesapal SubmitOrder failed: ${JSON.stringify(data)}`);
  }

  return data;
}

export async function getTransactionStatus(env: Env, orderTrackingId: string) {
  const token = await getPesapalToken(env);
  const url = new URL(`${baseUrl(env)}/api/Transactions/GetTransactionStatus`);
  url.searchParams.set("orderTrackingId", orderTrackingId);

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  const data = (await res.json()) as TransactionStatusResponse;
  if (!res.ok) {
    throw new Error(`Pesapal status check failed: ${JSON.stringify(data)}`);
  }

  return data;
}

export function isPaymentCompleted(status: TransactionStatusResponse) {
  const desc = (status.payment_status_description ?? "").toLowerCase();
  return desc.includes("completed") || status.status_code === 1;
}
