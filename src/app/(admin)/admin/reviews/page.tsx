import { listPendingReviewsForAdmin } from "@/server/services/review-service";
import { ReviewModerationRow } from "@/components/admin/ReviewModerationRow";
import { Card } from "@/components/ui/card";
import { Pagination } from "@/components/shared/Pagination";
import { parsePage } from "@/lib/pagination";

type Props = {
  searchParams: Promise<{ page?: string }>;
};

export default async function AdminReviewsPage({ searchParams }: Props) {
  const page = parsePage((await searchParams).page);
  const { reviews, hasNextPage } = await listPendingReviewsForAdmin(page);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Pending reviews</h1>

      {reviews.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No pending reviews.</Card>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {reviews.map((review) => (
              <ReviewModerationRow key={review.id} review={review} />
            ))}
          </div>
          <Pagination page={page} hasNextPage={hasNextPage} basePath="/admin/reviews" />
        </>
      )}
    </div>
  );
}
