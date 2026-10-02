"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CarrierConfig } from "@/generated/prisma/client";
import { updateCarrierSettingsAction } from "./actions";

type Props = {
  carrier: "fancourier";
  environment: "test" | "production";
  initialConfig?: CarrierConfig | null;
};

export function CarrierSettingsForm({ carrier, environment, initialConfig }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [apiUsername, setApiUsername] = useState(initialConfig?.apiUsername ?? "");
  const [apiPassword, setApiPassword] = useState(initialConfig?.apiPassword ?? "");

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
        configId: initialConfig?.id,
      });
      if (result.ok) {
        setSuccess(true);
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
          placeholder="Your FanCourier API password"
          type="password"
          disabled={isPending}
          required
        />
        <p className="text-xs text-muted-foreground">Encrypted at rest, never exposed to the frontend</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && (
        <p className="text-sm text-green-600">
          Settings saved successfully. Credentials are now {initialConfig?.isActive ? "active" : "pending verification"}.
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Saving..." : initialConfig ? "Update Settings" : "Add Settings"}
      </Button>
    </form>
  );
}
