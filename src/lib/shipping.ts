import { SHIPPING_FEE_PER_SELLER } from "@/lib/constants";
import { toCents } from "@/lib/coupons";

/** Shipping the buyer pays for a cart/order spanning this many sellers (one flat fee each). */
export function shippingCentsForSellerCount(sellerCount: number) {
  return sellerCount * toCents(SHIPPING_FEE_PER_SELLER);
}
