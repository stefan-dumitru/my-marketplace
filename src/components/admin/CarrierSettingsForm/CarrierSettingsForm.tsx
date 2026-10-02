"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateCarrierSettingsAction } from "./actions";

type Props = {
  carrier: "fancourier";
  environment: "test" | "production";
  initialConfig?: { apiUsername: string; isActive: boolean } | null;
};

export function CarrierSettingsForm({ carrier, environment, initialConfig }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [apiUsername, setApiUsername] = useState(initialConfig?.apiUsername ?? "");
  const [apiPassword, setApiPassword] = useState("");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updateCarrierSettingsAction({
        carrier,
        environment,
        apiUsername,
        apiPassword,
      });
      if (result.ok) {
        setSuccess(true);
        setApiPassword("");
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label htmlFor={`username-${environment}`}>API Username</Label>
        <Input
          id={`username-${environment}`}
          value={apiUsername}
          onChange={(e) => setApiUsername(e.target.value)}
          placeholder="Your FanCourier API username"
          type="text"
          disabled={isPending}
          required
        />
        <p className="text-xs text-muted-foreground">From your FanCourier business account</p>
      </div>

      <div>
        <Label htmlFor={`password-${environment}`}>API Password</Label>
        <Input
          id={`password-${environment}`}
          value={apiPassword}
          onChange={(e) => setApiPassword(e.target.value)}
          placeholder={initialConfig ? "Leave blank to keep current password" : "Your FanCourier API password"}
          type="password"
          disabled={isPending}
          required={!initialConfig}
        />
        <p className="text-xs text-muted-foreground">Encrypted at rest, never sent back to the browser</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && (
        <p className="text-sm text-green-600">
          Credentials verified and saved.
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Saving..." : initialConfig ? "Update Settings" : "Add Settings"}
      </Button>
    </form>
  );
}
