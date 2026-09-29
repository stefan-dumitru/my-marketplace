"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleWishlistAction } from "@/app/(storefront)/account/wishlist/actions";

type Props = {
  productId: string;
  initiallyWishlisted: boolean;
};

export function WishlistButton({ productId, initiallyWishlisted }: Props) {
  const router = useRouter();
  const [wishlisted, setWishlisted] = useState(initiallyWishlisted);
  const [pending, setPending] = useState(false);

  const handleToggle = async () => {
    setPending(true);
    const nextAction = wishlisted ? "remove" : "add";
    const result = await toggleWishlistAction({ productId, action: nextAction });
    if (result.ok) {
      setWishlisted(!wishlisted);
      router.refresh();
    }
    setPending(false);
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleToggle}
      disabled={pending}
      aria-pressed={wishlisted}
      className="w-fit"
    >
      <Heart className={wishlisted ? "fill-destructive text-destructive" : ""} />
      {wishlisted ? "Saved" : "Save for later"}
    </Button>
  );
}
