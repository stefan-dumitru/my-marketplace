import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAddressForEdit } from "@/server/services/address-service";
import { AddressBookForm } from "@/components/account/AddressBookForm";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditAddressPage({ params }: Props) {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/account/addresses");

  const { id } = await params;
  const address = await getAddressForEdit(session.user.id, id);
  if (!address) notFound();

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">Edit address</h1>
      <AddressBookForm
        mode="edit"
        initialValues={{
          id: address.id,
          label: address.label ?? "",
          recipientName: address.recipientName,
          line1: address.line1,
          line2: address.line2 ?? "",
          city: address.city,
          county: address.county,
          postalCode: address.postalCode,
          phone: address.phone,
          isDefault: address.isDefault,
        }}
      />
    </div>
  );
}
