import { ForgotPasswordPageClient } from "@/components/auth/ForgotPasswordForm";
import { getTurnstileClientConfig } from "@/lib/turnstile";

export default async function ForgotPasswordPage() {
  const turnstile = await getTurnstileClientConfig();
  return <ForgotPasswordPageClient turnstile={turnstile} />;
}
