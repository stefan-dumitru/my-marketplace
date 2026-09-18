"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createAddress, deleteAddress, updateAddress } from "@/server/services/address-service";
import type { AddressBookInput } from "@/lib/validations/address";

export async function createAddressAction(input: AddressBookInput) {
  // Independently re-verified — this Action is its own entry point, not protected by the page
  // that rendered the form that called it.
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/account/addresses");

  const result = await createAddress(session.user.id, input);
  revalidatePath("/account/addresses");
  return result;
}

export async function updateAddressAction(addressId: string, input: AddressBookInput) {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/account/addresses");

  const result = await updateAddress(session.user.id, addressId, input);
  revalidatePath("/account/addresses");
  return result;
}

export async function deleteAddressAction(addressId: string) {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/account/addresses");

  const result = await deleteAddress(session.user.id, addressId);
  revalidatePath("/account/addresses");
  return result;
}
