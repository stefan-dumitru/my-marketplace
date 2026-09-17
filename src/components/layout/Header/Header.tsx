"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type Props = {
  isAuthenticated: boolean;
};

export function Header({ isAuthenticated }: Props) {
  const [open, setOpen] = useState(false);
  const accountHref = isAuthenticated ? "/account" : "/auth/login";
  const accountLabel = isAuthenticated ? "Account" : "Log in";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-semibold text-foreground">
          My Marketplace
        </Link>

        {/* Desktop nav: >1024px per ui-guidelines.md breakpoints */}
        <nav className="hidden items-center gap-2 lg:flex">
          <Link href={accountHref} className={buttonVariants({ variant: "ghost" })}>
            {accountLabel}
          </Link>
          {!isAuthenticated && (
            <Link href="/auth/register" className={buttonVariants()}>
              Sign up
            </Link>
          )}
        </nav>

        {/* Mobile/tablet nav: <1024px, hamburger trigger */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={<Button variant="ghost" size="icon" className="lg:hidden" />}
          >
            <Menu />
            <span className="sr-only">Open menu</span>
          </SheetTrigger>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-2 px-4">
              <Link
                href={accountHref}
                onClick={() => setOpen(false)}
                className={buttonVariants({ variant: "outline", className: "justify-start" })}
              >
                {accountLabel}
              </Link>
              {!isAuthenticated && (
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
    </header>
  );
}
