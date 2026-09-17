import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ResendVerificationButton } from "@/components/auth/ResendVerificationButton";
import { verifyEmailAction } from "./actions";

type Props = {
  searchParams: Promise<{ email?: string; token?: string }>;
};

export default async function VerifyEmailPage({ searchParams }: Props) {
  const { email, token } = await searchParams;

  if (!email || !token) {
    return (
      <VerifyEmailLayout>
        <p className="text-destructive">This verification link is missing information.</p>
      </VerifyEmailLayout>
    );
  }

  const verified = await verifyEmailAction(email, token);

  if (verified) {
    return (
      <VerifyEmailLayout>
        <p className="font-medium">Email verified</p>
        <p className="text-sm text-muted-foreground">
          You can now check out and apply to become a seller.
        </p>
        <Link href="/account" className={buttonVariants({ className: "w-fit" })}>
          Go to your account
        </Link>
      </VerifyEmailLayout>
    );
  }

  return (
    <VerifyEmailLayout>
      <p className="text-destructive">This link is invalid or has expired.</p>
      <ResendVerificationButton email={email} />
    </VerifyEmailLayout>
  );
}

function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-3 px-4 py-16">
      {children}
    </div>
  );
}
