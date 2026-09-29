import { RegisterPageClient } from "@/components/auth/RegisterForm";
import { getTurnstileClientConfig } from "@/lib/turnstile";
import { googleOAuthEnabled } from "@/lib/auth";

export default async function RegisterPage() {
  const turnstile = await getTurnstileClientConfig();
  return <RegisterPageClient turnstile={turnstile} googleEnabled={googleOAuthEnabled} />;
}
