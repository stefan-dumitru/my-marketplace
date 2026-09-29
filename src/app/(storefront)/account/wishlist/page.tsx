import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { listWishlistForBuyer } from "@/server/services/wishlist-service";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { WishlistItemRow } from "@/components/account/WishlistItemRow";
import { Pagination } from "@/components/shared/Pagination";
import { parsePage } from "@/lib/pagination";

type Props = {
  searchParams: Promise<{ page?: string }>;
};

export default async function WishlistPage({ searchParams }: Props) {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/account/wishlist");

  const page = parsePage((await searchParams).page);
  const { items, hasNextPage } = await listWishlistForBuyer(session.user.id, page);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Your wishlist</h1>

      {items.length === 0 ? (
        <Card className="flex flex-col items-center gap-4 p-10 text-center text-sm text-muted-foreground">
          <p>You haven&apos;t saved anything yet.</p>
          <Link href="/products" className={buttonVariants()}>
            Browse products
          </Link>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <WishlistItemRow key={item.id} item={item} />
            ))}
          </div>
          <div className="mt-4">
            <Pagination page={page} hasNextPage={hasNextPage} basePath="/account/wishlist" />
          </div>
        </>
      )}
    </div>
  );
}
