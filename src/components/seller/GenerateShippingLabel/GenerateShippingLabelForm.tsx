"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { generateLabelAction } from "./actions";

type Props = {
  sellerOrderId: string;
  defaultRecipientName?: string;
  defaultRecipientPhone?: string;
  defaultRecipientAddress?: string;
  defaultRecipientCity?: string;
  defaultRecipientCounty?: string;
  defaultRecipientPostalCode?: string;
};

export function GenerateShippingLabelForm({
  sellerOrderId,
  defaultRecipientName,
  defaultRecipientPhone,
  defaultRecipientAddress,
  defaultRecipientCity,
  defaultRecipientCounty,
  defaultRecipientPostalCode,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [labelUrl, setLabelUrl] = useState<string | null>(null);
  const [trackingNumber, setTrackingNumber] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [recipientName, setRecipientName] = useState(defaultRecipientName ?? "");
  const [recipientPhone, setRecipientPhone] = useState(defaultRecipientPhone ?? "");
  const [recipientAddress, setRecipientAddress] = useState(defaultRecipientAddress ?? "");
  const [recipientCity, setRecipientCity] = useState(defaultRecipientCity ?? "");
  const [recipientCounty, setRecipientCounty] = useState(defaultRecipientCounty ?? "");
  const [recipientPostalCode, setRecipientPostalCode] = useState(defaultRecipientPostalCode ?? "");
  const [pieces, setPieces] = useState(1);
  const [weight, setWeight] = useState(0.5);
  const [instructions, setInstructions] = useState("");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLabelUrl(null);
    setTrackingNumber(null);

    startTransition(async () => {
      const result = await generateLabelAction({
        sellerOrderId,
        recipientName,
        recipientPhone,
        recipientAddress,
        recipientCity,
        recipientCounty,
        recipientPostalCode,
        pieces,
        weight,
        instructions: instructions || undefined,
      });
      if (result.ok) {
        setSuccess(true);
        setTrackingNumber(result.trackingNumber);
        setLabelUrl(result.labelUrl);
      } else {
        setError(result.error);
      }
    });
  };

  if (success && labelUrl && trackingNumber) {
    return (
      <Card className="space-y-4 p-6">
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-700">
          <p className="font-semibold">Label generated successfully!</p>
          <p className="mt-1">
            Tracking number: <code className="bg-green-100 px-1 py-0.5 font-mono">{trackingNumber}</code>
          </p>
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
            setSuccess(false);
            setLabelUrl(null);
            setTrackingNumber(null);
          }}
          variant="outline"
          className="w-full"
        >
          Close
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="recipientName">Recipient Name</Label>
          <Input
            id="recipientName"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            placeholder="Full name"
            disabled={isPending}
            required
          />
        </div>

        <div>
          <Label htmlFor="recipientPhone">Phone Number</Label>
          <Input
            id="recipientPhone"
            value={recipientPhone}
            onChange={(e) => setRecipientPhone(e.target.value)}
            placeholder="07XX XXX XXXX"
            disabled={isPending}
            required
          />
        </div>

        <div>
          <Label htmlFor="recipientAddress">Address</Label>
          <Input
            id="recipientAddress"
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            placeholder="Street and number"
            disabled={isPending}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="recipientCity">City</Label>
            <Input
              id="recipientCity"
              value={recipientCity}
              onChange={(e) => setRecipientCity(e.target.value)}
              placeholder="City"
              disabled={isPending}
              required
            />
          </div>

          <div>
            <Label htmlFor="recipientCounty">County</Label>
            <Input
              id="recipientCounty"
              value={recipientCounty}
              onChange={(e) => setRecipientCounty(e.target.value)}
              placeholder="County"
              disabled={isPending}
              required
            />
          </div>
        </div>

        <div>
          <Label htmlFor="recipientPostalCode">Postal Code</Label>
          <Input
            id="recipientPostalCode"
            value={recipientPostalCode}
            onChange={(e) => setRecipientPostalCode(e.target.value)}
            placeholder="XXXXXX"
            disabled={isPending}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="pieces">Pieces</Label>
            <Input
              id="pieces"
              type="number"
              value={pieces}
              onChange={(e) => setPieces(parseInt(e.target.value) || 1)}
              min="1"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">Parcels in this shipment</p>
          </div>

          <div>
            <Label htmlFor="weight">Weight (kg)</Label>
            <Input
              id="weight"
              type="number"
              value={weight}
              onChange={(e) => setWeight(parseFloat(e.target.value) || 0.5)}
              min="0.1"
              step="0.1"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">Total weight</p>
          </div>
        </div>

        <div>
          <Label htmlFor="instructions">Special Instructions</Label>
          <textarea
            id="instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="E.g., ring doorbell, leave at gate, etc."
            disabled={isPending}
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted-foreground">Optional delivery instructions</p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" disabled={isPending} className="flex-1">
            {isPending ? "Generating..." : "Generate Label"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
