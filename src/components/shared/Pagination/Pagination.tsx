import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

type Props = {
  page: number;
  hasNextPage: boolean;
  basePath: string;
  /** Other query params (e.g. `q`/`category`/`range`) that must survive the page change. */
  extraParams?: Record<string, string | undefined>;
  /** Query param key to use instead of "page" — for pages with more than one independent list. */
  paramName?: string;
};

function hrefFor(basePath: string, page: number, paramName: string, extraParams?: Props["extraParams"]) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(extraParams ?? {})) {
    if (value) params.set(key, value);
  }
  params.set(paramName, String(page));
  return `${basePath}?${params.toString()}`;
}

export function Pagination({ page, hasNextPage, basePath, extraParams, paramName = "page" }: Props) {
  if (page === 1 && !hasNextPage) return null;

  return (
    <div className="flex items-center justify-between gap-2">
      {page > 1 ? (
        <Link href={hrefFor(basePath, page - 1, paramName, extraParams)} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Previous
        </Link>
      ) : (
        <span />
      )}
      {hasNextPage ? (
        <Link href={hrefFor(basePath, page + 1, paramName, extraParams)} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Next
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}
