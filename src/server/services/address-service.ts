import "server-only";
import { addressBookSchema, type AddressBookInput } from "@/lib/validations/address";
import {
  createAddressForUser,
  deleteAddressForUser,
  getAddressForUser,
  listAddressesForUser,
  updateAddressForUser,
} from "@/server/data/addresses";

export type CreateAddressResult =
  | { ok: true }
  | { ok: false; fieldErrors?: Partial<Record<keyof AddressBookInput, string>>; formError?: string };

export type UpdateAddressResult =
  | { ok: true }
  | { ok: false; fieldErrors?: Partial<Record<keyof AddressBookInput, string>>; formError?: string };

export type DeleteAddressResult = { ok: true } | { ok: false; formError: string };

export function getAddressesForAccount(userId: string) {
  return listAddressesForUser(userId);
}

export function getAddressForEdit(userId: string, addressId: string) {
  return getAddressForUser(userId, addressId);
}

export async function createAddress(userId: string, input: AddressBookInput): Promise<CreateAddressResult> {
  const parsed = addressBookSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, formError: "Please fix the errors above and try again." };
  }
  const { label, recipientName, line1, line2, city, county, postalCode, phone, isDefault } = parsed.data;

  await createAddressForUser(userId, {
    label: label || null,
    recipientName,
    line1,
    line2: line2 || null,
    city,
    county,
    postalCode,
    phone,
    isDefault,
  });

  return { ok: true };
}

export async function updateAddress(
  userId: string,
  addressId: string,
  input: AddressBookInput
): Promise<UpdateAddressResult> {
  const parsed = addressBookSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, formError: "Please fix the errors above and try again." };
  }
  const { label, recipientName, line1, line2, city, county, postalCode, phone, isDefault } = parsed.data;

  const updated = await updateAddressForUser(userId, addressId, {
    label: label || null,
    recipientName,
    line1,
    line2: line2 || null,
    city,
    county,
    postalCode,
    phone,
    isDefault,
  });

  if (!updated) {
    return { ok: false, formError: "Address not found." };
  }
  return { ok: true };
}

export async function deleteAddress(userId: string, addressId: string): Promise<DeleteAddressResult> {
  const deleted = await deleteAddressForUser(userId, addressId);
  if (!deleted) {
    return { ok: false, formError: "Address not found." };
  }
  return { ok: true };
}
