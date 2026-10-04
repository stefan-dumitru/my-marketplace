export function normalizeName(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(judetul|jud|municipiul|mun|orasul|comuna|sector\s*\d)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const COUNTY_ALIASES: Record<string, string> = { bucharest: "bucuresti" };

/** Finds the FAN Courier list entry matching a buyer-typed name (diacritics/prefix tolerant). */
export function matchName(candidates: string[], input: string, aliases: Record<string, string> = {}): string | null {
  let wanted = normalizeName(input);
  wanted = aliases[wanted] ?? wanted;
  if (!wanted) return null;

  const exact = candidates.filter((c) => normalizeName(c) === wanted);
  if (exact.length >= 1) return exact[0];

  const prefix = candidates.filter((c) => normalizeName(c).startsWith(wanted + " "));
  return prefix.length === 1 ? prefix[0] : null;
}

export const matchCounty = (counties: string[], input: string) => matchName(counties, input, COUNTY_ALIASES);
