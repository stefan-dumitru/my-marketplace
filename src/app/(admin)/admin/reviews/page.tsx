import { listPendingReviewsForAdmin } from "@/server/services/review-service";
import { ReviewModerationRow } from "@/components/admin/ReviewModerationRow";
import { Card } from "@/components/ui/card";

export default async function AdminReviewsPage() {
  const reviews = await listPendingReviewsForAdmin();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Pending reviews</h1>

      {reviews.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No pending reviews.</Card>
      ) : (
        <div className="flex flex-col gap-3">
          {reviews.map((review) => (
            <ReviewModerationRow key={review.id} review={review} />
          ))}
        </div>
      )}
    </div>
  );
}
