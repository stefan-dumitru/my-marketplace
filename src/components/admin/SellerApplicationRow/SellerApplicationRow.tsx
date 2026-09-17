"use client";

import { useFormStatus } from "react-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { approveSellerAction, rejectSellerAction } from "@/app/(admin)/admin/sellers/actions";

type Props = {
  application: {
    id: string;
    storeName: string;
    businessRegistrationNumber: string;
    appliedAt: Date;
    user: { name: string; email: string };
  };
};

function SubmitButton({ variant, children }: { variant: "default" | "outline"; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size="sm" disabled={pending}>
      {pending ? "Working…" : children}
    </Button>
  );
}

export function SellerApplicationRow({ application }: Props) {
  return (
    <Card className="flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">{application.storeName}</p>
        <p className="text-muted-foreground">
          {application.user.name} · {application.user.email}
        </p>
        <p className="text-muted-foreground">Reg. no. {application.businessRegistrationNumber}</p>
      </div>
      <div className="flex gap-2">
        <form action={async () => { await approveSellerAction(application.id); }}>
          <SubmitButton variant="default">Approve</SubmitButton>
        </form>
        <form action={async () => { await rejectSellerAction(application.id); }}>
          <SubmitButton variant="outline">Reject</SubmitButton>
        </form>
      </div>
    </Card>
  );
}
