// Email delivery via Resend. Without RESEND_API_KEY the send is skipped and the
// caller is told, so the reset flow degrades to "ask your coach" rather than
// silently failing.
const RESEND_URL = "https://api.resend.com/emails";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

type SendResult = { ok: boolean; error?: string };

async function send(to: string, subject: string, html: string): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "Email is not configured on this server." };
  }
  const from = process.env.RESEND_FROM || "Healthy Futures <onboarding@resend.dev>";

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return { ok: false, error: body.message || `Resend returned ${res.status}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function sendPasswordResetEmail(
  to: string,
  code: string,
  minutesValid: number
): Promise<SendResult> {
  // A short code the student types back into the app, rather than a deep link —
  // links break when the app isn't installed on the device reading the email.
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111827;">
      <h2 style="margin-bottom: 8px;">Reset your Healthy Futures password</h2>
      <p style="margin: 0 0 16px;">Enter this code in the app to choose a new password:</p>
      <div style="background:#F2F7F3; border:1px solid #D6E3DA; border-radius:12px; padding:18px; text-align:center; margin-bottom:16px;">
        <span style="font-size:30px; letter-spacing:6px; font-weight:bold; color:#123626;">${code}</span>
      </div>
      <p style="margin: 0 0 12px; color:#5B6C61; font-size:14px;">
        The code expires in ${minutesValid} minutes and can only be used once.
      </p>
      <p style="margin: 0; color:#5B6C61; font-size:14px;">
        If you didn't ask to reset your password, you can ignore this email — nothing has changed.
      </p>
    </div>
  `;
  return send(to, "Your Healthy Futures reset code", html);
}
