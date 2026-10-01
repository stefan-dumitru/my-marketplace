import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSearchConfigured } from "@/lib/search";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/server/data/rate-limit";
import { suggestProducts, type SearchSuggestions } from "@/server/services/search-service";

const querySchema = z.object({ q: z.string().trim().min(2).max(64) });

const EMPTY: SearchSuggestions = { products: [], categories: [], brands: [] };

// Public, unauthenticated and hit on every (debounced) keystroke — so it's rate-limited per IP
// (CLAUDE.md: rate-limit expensive endpoints) and never returns anything the storefront doesn't
// already show publicly. Any failure degrades to "no suggestions", never an error the buyer sees.
export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({ q: request.nextUrl.searchParams.get("q") ?? "" });
  if (!parsed.success || !isSearchConfigured()) return NextResponse.json(EMPTY);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateLimit = await checkRateLimit(`search-suggest:${ip}`, { limit: 120, windowSeconds: 60 });
  if (!rateLimit.allowed) {
    return NextResponse.json(EMPTY, {
      status: 429,
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 60) },
    });
  }

  try {
    return NextResponse.json(await suggestProducts(parsed.data.q));
  } catch (err) {
    logger.warn({ err }, "search suggestions unavailable");
    return NextResponse.json(EMPTY);
  }
}
