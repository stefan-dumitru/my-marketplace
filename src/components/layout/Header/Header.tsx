"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, ShoppingCart } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { UserRole } from "@/generated/prisma/enums";

type Props = {
  user: { role: UserRole; cartItemCount: number } | null;
};

function roleNav(user: Props["user"]) {
  if (!user) return { href: "/auth/login", label: "Log in" };
  if (user.role === "seller") return { href: "/seller", label: "Seller Dashboard" };
  if (user.role === "admin") return { href: "/admin", label: "Admin" };
  return { href: "/sell", label: "Sell on My Marketplace" };
}

function CartLink({ count }: { count: number }) {
  return (
    <Link href="/cart" className="relative inline-flex" aria-label="Cart">
      <Button variant="ghost" size="icon">
        <ShoppingCart />
      </Button>
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-sale px-1 text-[10px] font-medium text-sale-foreground">
          {count}
        </span>
      )}
    </Link>
  );
}

export function Header({ user }: Props) {
  const [open, setOpen] = useState(false);
  const accountHref = user ? "/account" : "/auth/login";
  const accountLabel = user ? "Account" : "Log in";
  const secondary = user ? roleNav(user) : null;

  return (
    <header className="sticky top-0 z-40 bg-primary text-primary-foreground shadow-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-semibold text-primary-foreground">
            My Marketplace
          </Link>
          <Link
            href="/products"
            className="hidden text-sm text-primary-foreground/80 hover:text-primary-foreground lg:block"
          >
            Products
          </Link>
        </div>

        {/* Desktop nav: >1024px per ui-guidelines.md breakpoints */}
        <nav className="hidden items-center gap-2 lg:flex">
          {user && <CartLink count={user.cartItemCount} />}
          {secondary && (
            <Link href={secondary.href} className={buttonVariants({ variant: "ghost" })}>
              {secondary.label}
            </Link>
          )}
          <Link href={accountHref} className={buttonVariants({ variant: "ghost" })}>
            {accountLabel}
          </Link>
          {!user && (
            <Link href="/auth/register" className={buttonVariants({ variant: "secondary" })}>
              Sign up
            </Link>
          )}
        </nav>

        {/* Mobile/tablet nav: <1024px, hamburger trigger */}
        <div className="flex items-center gap-1 lg:hidden">
          {user && <CartLink count={user.cartItemCount} />}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" />}>
              <Menu />
              <span className="sr-only">Open menu</span>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-2 px-4">
                <Link
                  href="/products"
                  onClick={() => setOpen(false)}
                  className={buttonVariants({ variant: "outline", className: "justify-start" })}
                >
                  Products
                </Link>
                {secondary && (
                  <Link
                    href={secondary.href}
                    onClick={() => setOpen(false)}
                    className={buttonVariants({ variant: "outline", className: "justify-start" })}
                  >
                    {secondary.label}
                  </Link>
                )}
                <Link
                  href={accountHref}
                  onClick={() => setOpen(false)}
                  className={buttonVariants({ variant: "outline", className: "justify-start" })}
                >
                  {accountLabel}
                </Link>
                {!user && (
                  <Link
                    href="/auth/register"
                    onClick={() => setOpen(false)}
                    className={buttonVariants({ className: "justify-start" })}
                  >
                    Sign up
                  </Link>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
