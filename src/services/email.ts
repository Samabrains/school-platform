import type { Env } from "../types";

export async function sendPlatformEmail(
  env: Env,
  input: {
    to: { email: string; name?: string }[];
    subject: string;
    htmlContent: string;
  }
) {
  const apiKey = env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn("[email mock]", input.subject, input.to);
    return { mocked: true };
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: {
        name: env.BREVO_SENDER_NAME ?? "SamaBrains School Platform",
        email: env.BREVO_SENDER_EMAIL ?? "noreply@samabrains.com",
      },
      to: input.to,
      subject: input.subject,
      htmlContent: input.htmlContent,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Brevo send failed: ${err}`);
  }

  return res.json();
}
