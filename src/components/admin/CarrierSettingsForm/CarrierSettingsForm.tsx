"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import type { CarrierConfig } from "@/generated/prisma/client";
import { updateCarrierSettingsAction } from "./actions";

const carrierSettingsSchema = z.object({
  apiUsername: z.string().min(1, "API username is required"),
  apiPassword: z.string().min(1, "API password is required"),
});

type CarrierSettingsInput = z.infer<typeof carrierSettingsSchema>;

type Props = {
  carrier: "fancourier";
  environment: "test" | "production";
  initialConfig?: CarrierConfig | null;
};

export function CarrierSettingsForm({ carrier, environment, initialConfig }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm<CarrierSettingsInput>({
    resolver: zodResolver(carrierSettingsSchema),
    defaultValues: {
      apiUsername: initialConfig?.apiUsername ?? "",
      apiPassword: initialConfig?.apiPassword ?? "",
    },
  });

  const onSubmit = (data: CarrierSettingsInput) => {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updateCarrierSettingsAction({
        carrier,
        environment,
        apiUsername: data.apiUsername,
        apiPassword: data.apiPassword,
        configId: initialConfig?.id,
      });
      if (result.ok) {
        setSuccess(true);
        form.reset(data);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="apiUsername"
          render={({ field }) => (
            <FormItem>
              <FormLabel>API Username</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Your FanCourier API username" type="text" disabled={isPending} />
              </FormControl>
              <FormDescription>From your FanCourier business account</FormDescription>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="apiPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>API Password</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Your FanCourier API password" type="password" disabled={isPending} />
              </FormControl>
              <FormDescription>Encrypted at rest, never exposed to the frontend</FormDescription>
            </FormItem>
          )}
        />

        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && (
          <p className="text-sm text-green-600">Settings saved successfully. Credentials are now {initialConfig?.isActive ? "active" : "pending verification"}.</p>
        )}

        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : initialConfig ? "Update Settings" : "Add Settings"}
        </Button>
      </form>
    </Form>
  );
}
