function normName(value: string): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function canonicalizeName(name: string): string {
  const raw = String(name ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  const match = raw.match(/^([^,]+),\s*(.+)$/);
  if (!match) return raw;
  const last = String(match[1] || "").trim();
  const rest = String(match[2] || "").trim();
  if (!last || !rest) return raw;
  return `${rest} ${last}`.replace(/\s+/g, " ").trim();
}

function stripEllipsis(value: string): string {
  return String(value ?? "")
    .replace(/\u2026/g, "")
    .replace(/\.{3,}\s*$/g, "")
    .trim();
}

function canonicalizeForCompare(name: string): string {
  return normName(canonicalizeName(name));
}

// Fuzzy compare Canvas UI name vs CSV name, handling commas and truncated ellipsis
export function namesMatch(uiName: string, csvName: string): boolean {
  const uiCanon = canonicalizeForCompare(uiName);
  const csvCanon = canonicalizeForCompare(csvName);
  if (!uiCanon || !csvCanon) return false;
  if (uiCanon === csvCanon) return true;

  const uiRawCanon = canonicalizeName(uiName);
  const csvRawCanon = canonicalizeName(csvName);

  const uiHasEllipsis = /[\u2026]/.test(uiRawCanon) || /\.{3,}\s*$/.test(uiRawCanon);
  const uiStripped = normName(stripEllipsis(uiRawCanon));
  const csvNorm = normName(csvRawCanon);

  if (uiHasEllipsis) {
    if (uiStripped && csvNorm.startsWith(uiStripped)) return true;

    const uiTokens = uiStripped.split(" ").filter(Boolean);
    const csvTokens = csvNorm.split(" ").filter(Boolean);
    if (uiTokens.length && csvTokens.length && uiTokens.length <= csvTokens.length) {
      let ok = true;
      for (let i = 0; i < uiTokens.length; i += 1) {
        const ut = uiTokens[i];
        const ct = csvTokens[i] || "";
        if (i === uiTokens.length - 1) {
          if (!ct.startsWith(ut)) {
            ok = false;
            break;
          }
        } else if (ut !== ct) {
          ok = false;
          break;
        }
      }
      if (ok) return true;
    }
  }

  if (uiCanon.length >= 10 && csvCanon.startsWith(uiCanon)) return true;

  return false;
}
