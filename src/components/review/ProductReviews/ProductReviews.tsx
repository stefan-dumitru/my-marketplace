import { Card } from "@/components/ui/card";

type Props = {
  summary: { average: number | null; count: number };
  reviews: {
    id: string;
    rating: number;
    title: string;
    body: string;
    createdAt: Date;
    buyer: { name: string };
  }[];
};

export function ProductReviews({ summary, reviews }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">
        Reviews
        {summary.count > 0 && (
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {summary.average!.toFixed(1)} / 5 · {summary.count} review{summary.count === 1 ? "" : "s"}
          </span>
        )}
      </h2>

      {reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reviews yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {reviews.map((review) => (
            <Card key={review.id} className="flex flex-col gap-1 p-4 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-medium">{review.title}</p>
                <p className="text-muted-foreground">{review.rating} / 5</p>
              </div>
              <p className="text-muted-foreground">{review.body}</p>
              <p className="text-xs text-muted-foreground">
                {review.buyer.name} · {new Date(review.createdAt).toLocaleDateString("ro-RO")}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
