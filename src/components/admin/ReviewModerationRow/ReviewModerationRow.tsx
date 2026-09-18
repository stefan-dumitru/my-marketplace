"use client";

import { useFormStatus } from "react-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { approveReviewAction, rejectReviewAction } from "@/app/(admin)/admin/reviews/actions";

type Props = {
  review: {
    id: string;
    rating: number;
    title: string;
    body: string;
    createdAt: Date;
    product: { name: string; slug: string };
    buyer: { name: string; email: string };
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

export function ReviewModerationRow({ review }: Props) {
  return (
    <Card className="flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1">
        <p className="font-medium">
          {review.product.name} · {review.rating} / 5
        </p>
        <p className="text-muted-foreground">
          {review.buyer.name} · {review.buyer.email}
        </p>
        <p className="font-medium">{review.title}</p>
        <p className="text-muted-foreground">{review.body}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(review.createdAt).toLocaleString("ro-RO")}
        </p>
      </div>
      <div className="flex gap-2">
        <form action={async () => { await approveReviewAction(review.id); }}>
          <SubmitButton variant="default">Approve</SubmitButton>
        </form>
        <form action={async () => { await rejectReviewAction(review.id); }}>
          <SubmitButton variant="outline">Reject</SubmitButton>
        </form>
      </div>
    </Card>
  );
}
