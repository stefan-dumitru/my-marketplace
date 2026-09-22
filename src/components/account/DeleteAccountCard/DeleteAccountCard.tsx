"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteAccountAction } from "@/app/(storefront)/account/actions";

type Props = {
  email: string;
};

export function DeleteAccountCard({ email }: Props) {
  const [confirmEmail, setConfirmEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const matches = confirmEmail.trim().toLowerCase() === email.toLowerCase();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);
    setFormError(null);
    const result = await deleteAccountAction(confirmEmail);
    if (result.ok) {
      // The account is already closed server-side; this just clears the now-stale cookie
      // immediately instead of waiting for the next request to reject it.
      await signOut({ callbackUrl: "/" });
      return;
    }
    setIsPending(false);
    setFormError(result.formError);
  };

  return (
    <Card className="flex flex-col gap-4 border-destructive/30 bg-destructive/5 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Delete account</h2>
        <p className="text-sm text-muted-foreground">
          This closes your account and permanently erases your personal details — your name, email,
          phone number, saved addresses and notifications. It can&apos;t be undone.
        </p>
        <p className="text-sm text-muted-foreground">
          Past orders and invoices are kept, but with your personal details removed from them, because
          tax law requires us to retain financial records.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <Label htmlFor="confirmEmail">Type {email} to confirm</Label>
        <Input
          id="confirmEmail"
          value={confirmEmail}
          onChange={(e) => setConfirmEmail(e.target.value)}
          placeholder={email}
          autoComplete="off"
          aria-invalid={!!formError}
        />
        {formError && (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        )}
        <Button type="submit" variant="destructive" disabled={!matches || isPending} className="w-fit">
          {isPending ? "Deleting…" : "Delete my account"}
        </Button>
      </form>
    </Card>
  );
}
