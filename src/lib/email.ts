import "server-only";
import { Resend } from "resend";
import { logger } from "@/lib/logger";
import { inngest } from "@/lib/inngest";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

/**
 * Sends via Resend when RESEND_API_KEY is configured. In development with no key, logs the
 * rendered email (including any links it contains) to the console instead, so registration/
 * verification work end-to-end without a live Resend account. In production with no key, throws
 * rather than silently dropping the send — a swallowed verification email is a support ticket
 * waiting to happen, not a graceful degradation. See security.md > Data Protection: this only
 * ever logs the email body itself (which the user is about to receive anyway), never unrelated
 * PII.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  if (resend) {
    const from = process.env.EMAIL_FROM;
    if (!from) throw new Error("EMAIL_FROM is not configured.");
    const { error } = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    if (error) {
      logger.error({ err: error, to: input.to }, "Resend email send failed");
      throw new Error("Failed to send email.");
    }
    return;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "RESEND_API_KEY is not configured — refusing to silently drop an email in production."
    );
  }

  logger.info(
    { to: input.to, subject: input.subject, text: input.text },
    "[dev email fallback] RESEND_API_KEY not set — logging email instead of sending"
  );
}

/**
 * Per operations.md > External Integrations: "if the email provider is down, the underlying
 * action still completes — the email send is queued and retried via the background job system
 * rather than blocking or failing the action it's attached to." Every call site that used to call
 * sendEmail() directly (a single synchronous attempt, best-effort .catch()'d) now enqueues this
 * event instead — the actual send happens in inngest/functions.ts's sendQueuedEmailFunction,
 * which gets 3 retries with backoff for free. The enqueue itself is fast/local (Inngest's own
 * ingest endpoint), so callers can await it without materially adding to request latency.
 */
export function queueEmail(input: SendEmailInput) {
  return inngest.send({ name: "email/send.requested", data: input });
}
