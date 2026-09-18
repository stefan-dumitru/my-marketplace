import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getAddressesForAccount } from "@/server/services/address-service";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { AddressRow } from "@/components/account/AddressRow";

export default async function AddressesPage() {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/account/addresses");

  const addresses = await getAddressesForAccount(session.user.id);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your addresses</h1>
        <Link href="/account/addresses/new" className={buttonVariants()}>
          Add address
        </Link>
      </div>

      {addresses.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">You haven&apos;t saved any addresses yet.</Card>
      ) : (
        <div className="flex flex-col gap-3">
          {addresses.map((address) => (
            <AddressRow key={address.id} address={address} />
          ))}
        </div>
      )}
    </div>
  );
}
