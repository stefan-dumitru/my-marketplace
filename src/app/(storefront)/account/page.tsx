import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { LogoutButton } from "@/components/auth/LogoutButton";

export default async function AccountPage() {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/account");

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Your account</h1>
      <Card className="flex flex-col gap-2 p-6 text-sm">
        <Row label="Name" value={session.user.name ?? "—"} />
        <Row label="Email" value={session.user.email ?? "—"} />
        <Row label="Role" value={session.user.role} />
        <Row
          label="Email verified"
          value={session.user.emailVerifiedAt ? "Yes" : "No — required before checkout"}
        />
      </Card>
      <Link href="/account/addresses" className={buttonVariants({ variant: "outline" })}>
        Manage addresses
      </Link>
      <LogoutButton />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
