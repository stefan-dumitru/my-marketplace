"use client";

import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { deleteAddressAction, updateAddressAction } from "@/app/(storefront)/account/addresses/actions";

type Props = {
  address: {
    id: string;
    label: string | null;
    recipientName: string;
    line1: string;
    line2: string | null;
    city: string;
    county: string;
    postalCode: string;
    phone: string;
    isDefault: boolean;
  };
};

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? "Working…" : children}
    </Button>
  );
}

export function AddressRow({ address }: Props) {
  return (
    <Card className="flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">
          {address.label ? `${address.label} — ` : ""}
          {address.recipientName}
          {address.isDefault && <span className="ml-2 text-xs text-emerald-600">Default</span>}
        </p>
        <p className="text-muted-foreground">
          {address.line1}
          {address.line2 ? `, ${address.line2}` : ""}
          <br />
          {address.city}, {address.county} {address.postalCode}
          <br />
          {address.phone}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {!address.isDefault && (
          <form
            action={async () => {
              await updateAddressAction(address.id, {
                label: address.label ?? "",
                recipientName: address.recipientName,
                line1: address.line1,
                line2: address.line2 ?? "",
                city: address.city,
                county: address.county,
                postalCode: address.postalCode,
                phone: address.phone,
                isDefault: true,
              });
            }}
          >
            <SubmitButton>Set as default</SubmitButton>
          </form>
        )}
        <Link href={`/account/addresses/${address.id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Edit
        </Link>
        <form
          action={async () => {
            await deleteAddressAction(address.id);
          }}
        >
          <SubmitButton>Delete</SubmitButton>
        </form>
      </div>
    </Card>
  );
}
