"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { generateLabelAction } from "./actions";

const generateLabelSchema = z.object({
  sellerOrderId: z.string(),
  recipientName: z.string().min(1, "Recipient name is required"),
  recipientPhone: z.string().min(1, "Phone number is required"),
  recipientAddress: z.string().min(1, "Address is required"),
  recipientCity: z.string().min(1, "City is required"),
  recipientCounty: z.string().min(1, "County is required"),
  recipientPostalCode: z.string().min(1, "Postal code is required"),
  pieces: z.number().int().min(1).default(1),
  weight: z.number().positive().default(0.5),
  instructions: z.string().optional(),
});

type FormInput = z.infer<typeof generateLabelSchema>;

type Props = {
  sellerOrderId: string;
  defaultRecipientName?: string;
  defaultRecipientPhone?: string;
  defaultRecipientAddress?: string;
  defaultRecipientCity?: string;
  defaultRecipientCounty?: string;
  defaultRecipientPostalCode?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function GenerateShippingLabelForm({
  sellerOrderId,
  defaultRecipientName,
  defaultRecipientPhone,
  defaultRecipientAddress,
  defaultRecipientCity,
  defaultRecipientCounty,
  defaultRecipientPostalCode,
  open,
  onOpenChange,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [labelUrl, setLabelUrl] = useState<string | null>(null);
  const [trackingNumber, setTrackingNumber] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormInput>({
    resolver: zodResolver(generateLabelSchema),
    defaultValues: {
      sellerOrderId,
      recipientName: defaultRecipientName ?? "",
      recipientPhone: defaultRecipientPhone ?? "",
      recipientAddress: defaultRecipientAddress ?? "",
      recipientCity: defaultRecipientCity ?? "",
      recipientCounty: defaultRecipientCounty ?? "",
      recipientPostalCode: defaultRecipientPostalCode ?? "",
      pieces: 1,
      weight: 0.5,
      instructions: "",
    },
  });

  const onSubmit = (data: FormInput) => {
    setError(null);
    setSuccess(false);
    setLabelUrl(null);
    setTrackingNumber(null);

    startTransition(async () => {
      const result = await generateLabelAction(data);
      if (result.ok) {
        setSuccess(true);
        setTrackingNumber(result.trackingNumber);
        setLabelUrl(result.labelUrl);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate Shipping Label</DialogTitle>
          <DialogDescription>Enter the recipient details to generate a FanCourier shipping label.</DialogDescription>
        </DialogHeader>

        {success && labelUrl && trackingNumber ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-green-50 p-4 text-sm text-green-700">
              <p className="font-semibold">Label generated successfully!</p>
              <p className="mt-1">Tracking number: <code className="bg-green-100 px-1 py-0.5 font-mono">{trackingNumber}</code></p>
            </div>
            <a
              href={labelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block w-full rounded-lg bg-blue-600 px-4 py-2 text-center text-white hover:bg-blue-700"
            >
              Download PDF Label
            </a>
            <Button
              onClick={() => {
                onOpenChange(false);
                form.reset();
                setSuccess(false);
                setLabelUrl(null);
                setTrackingNumber(null);
              }}
              variant="outline"
              className="w-full"
            >
              Close
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="recipientName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recipient Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Full name" disabled={isPending} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="recipientPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="07XX XXX XXXX" disabled={isPending} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="recipientAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Street and number" disabled={isPending} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="recipientCity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="City" disabled={isPending} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="recipientCounty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>County</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="County" disabled={isPending} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="recipientPostalCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Postal Code</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="XXXXXX" disabled={isPending} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="pieces"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Number of Pieces</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          min="1"
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormDescription>Parcels in this shipment</FormDescription>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="weight"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Weight (kg)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          min="0.1"
                          step="0.1"
                          onChange={(e) => field.onChange(parseFloat(e.target.value))}
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormDescription>Total weight</FormDescription>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="instructions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Special Instructions</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="E.g., ring doorbell, leave at gate, etc."
                        disabled={isPending}
                        rows={3}
                      />
                    </FormControl>
                    <FormDescription>Optional delivery instructions</FormDescription>
                  </FormItem>
                )}
              />

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex gap-3">
                <Button
                  type="submit"
                  disabled={isPending}
                  className="flex-1"
                >
                  {isPending ? "Generating..." : "Generate Label"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isPending}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
