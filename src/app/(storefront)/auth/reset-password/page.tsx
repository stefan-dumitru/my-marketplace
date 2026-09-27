import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

type Props = {
  searchParams: Promise<{ email?: string; token?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { email, token } = await searchParams;

  if (!email || !token) {
    return (
      <ResetPasswordLayout>
        <p className="text-destructive">This reset link is missing information.</p>
        <Link href="/auth/forgot-password" className="text-primary underline-offset-4 hover:underline">
          Request a new link
        </Link>
      </ResetPasswordLayout>
    );
  }

  // The token itself is only checked (and consumed) on actual submit, in resetPasswordAction —
  // rendering the form here doesn't spend it, so a page reload/prefetch can't burn a valid link.
  return (
    <ResetPasswordLayout>
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      <ResetPasswordForm email={email} token={token} />
    </ResetPasswordLayout>
  );
}

function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-4 py-16">
      {children}
    </div>
  );
}
