import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AddressBookForm } from "@/components/account/AddressBookForm";

export default async function NewAddressPage() {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/account/addresses/new");

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">Add an address</h1>
      <AddressBookForm />
    </div>
  );
}
