import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getSellerProfileByUserId } from "@/server/data/seller-profiles";
import { SellerApplicationForm } from "@/components/seller/SellerApplicationForm";
import { Card } from "@/components/ui/card";

export default async function SellPage() {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/sell");

  const profile = await getSellerProfileByUserId(session.user.id);

  if (profile?.status === "approved") redirect("/seller");

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Sell on My Marketplace</h1>

      {!profile && (
        <>
          <p className="text-sm text-muted-foreground">
            Tell us a bit about your business. We review every application before you can start
            listing products.
          </p>
          <SellerApplicationForm />
        </>
      )}

      {profile?.status === "pending" && (
        <Card className="p-6 text-sm">
          <p className="font-medium">Application under review</p>
          <p className="mt-2 text-muted-foreground">
            We&apos;re reviewing your application for &quot;{profile.storeName}&quot;. We&apos;ll
            let you know as soon as a decision is made.
          </p>
        </Card>
      )}

      {profile?.status === "rejected" && (
        <Card className="p-6 text-sm">
          <p className="font-medium">Application not approved</p>
          <p className="mt-2 text-muted-foreground">
            Your application for &quot;{profile.storeName}&quot; wasn&apos;t approved. Contact
            support if you have questions.
          </p>
        </Card>
      )}

      {profile?.status === "suspended" && (
        <Card className="p-6 text-sm">
          <p className="font-medium">Seller account suspended</p>
          <p className="mt-2 text-muted-foreground">Contact support for next steps.</p>
        </Card>
      )}
    </div>
  );
}
