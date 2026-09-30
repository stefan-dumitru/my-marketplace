import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthSessionProvider } from "@/components/providers/AuthSessionProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "My Marketplace",
  description: "A multi-vendor marketplace.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // next-themes injects its own inline anti-flash-of-wrong-theme script into <head> — without a
  // nonce, proxy.ts's strict CSP blocks it outright (confirmed: showed up as a CSP violation +
  // errors-in-console/best-practices Lighthouse failure on every single page). Same per-request
  // nonce TurnstileWidget already reads off this header — see proxy.ts's x-nonce comment.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider nonce={nonce}>
          <AuthSessionProvider>{children}</AuthSessionProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
