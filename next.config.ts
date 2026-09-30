import type { NextConfig } from "next";

// Content-Security-Policy is set separately in src/middleware.ts — it needs a fresh nonce per
// request, which a static headers() rule here can't generate.
const staticSecurityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Demo/seed product images only — see prisma/scripts/seed-electronics.ts. Real seller
      // uploads never go here (see the pattern below).
      { protocol: "https", hostname: "images.unsplash.com" },
      // Real product images and seller logos (src/server/services/upload-service.ts) — any
      // store under this account resolves to a *.public.blob.vercel-storage.com subdomain.
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: staticSecurityHeaders,
      },
    ];
  },
};

export default nextConfig;
