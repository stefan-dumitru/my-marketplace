import { NextRequest, NextResponse } from "next/server";

// Nonce-based CSP, following Next.js's own documented recipe for the App Router: the framework
// automatically applies this nonce to its own inline bootstrap/hydration scripts when it sees the
// x-nonce request header + a matching 'nonce-<value>' in the CSP response header — this is what
// makes script-src safe to lock down without 'unsafe-inline' (which provides no real XSS
// protection). style-src stays 'unsafe-inline' deliberately — see next.config.ts's neighbor
// comment / the plan doc: Base UI's runtime `style="..."` attributes aren't nonce-able (that's
// style-src-attr, which browsers can't meaningfully restrict without breaking any component
// library that sets inline styles), and this app has no custom <style> blocks to protect.
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data:",
    "font-src 'self'",
    // Product/category images are seller-supplied arbitrary HTTPS URLs rendered via plain <img>,
    // so img-src stays permissive for any HTTPS host rather than a fixed CDN allowlist.
    `connect-src 'self'${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Only in production — over plain http://localhost in dev, this directive can make Chrome
    // try to upgrade the page's own sub-resource requests to https and fail outright.
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Skip Next's own static assets and image optimizer — nothing there needs a per-request
    // nonce, and running middleware on every static file request is pure overhead.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
