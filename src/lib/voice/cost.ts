// ElevenLabs cost estimation.
//
// Prices are the published US-dollar rates on the ElevenLabs subscription
// tiers at time of writing. They're strict upper bounds — actual invoiced
// cost may be lower depending on plan overage rules and shared caching
// across tenants — but they're accurate enough for spend visibility and
// soft-cap enforcement.
//
// Values are in *thousandths of a cent* (mils) internally so the arithmetic
// stays in integers, then rounded UP to whole cents at the boundary.
// Rounding UP means we never under-report spend — better for caps.

/** Prices in $ per 1M chars (TTS) or per hour (STT). */
const TTS_USD_PER_1M_CHARS: Record<string, number> = {
  eleven_flash_v2_5: 5,
  eleven_flash_v2: 5,
  eleven_multilingual_v2: 15,
  eleven_multilingual_v1: 15,
  eleven_turbo_v2: 5,
};
const TTS_FALLBACK_USD_PER_1M_CHARS = 15; // safer over-estimate

const STT_USD_PER_HOUR: Record<string, number> = {
  scribe_v1: 0.4,
};
const STT_FALLBACK_USD_PER_HOUR = 0.4;

// Rough audio bitrate for opus/webm at MediaRecorder defaults. Used to
// convert blob byte count → seconds when the actual duration isn't
// available server-side. 32 kbps ≈ 4 KB/s.
const OPUS_BYTES_PER_SECOND = 4000;

export function estimateTtsCostCents(chars: number, model: string): number {
  if (chars <= 0) return 0;
  const pricePerMillion =
    TTS_USD_PER_1M_CHARS[model] ?? TTS_FALLBACK_USD_PER_1M_CHARS;
  // dollars → cents: * 100. Per million chars: / 1_000_000.
  // Combined factor: * 100 / 1_000_000 = * 0.0001
  const cents = (chars * pricePerMillion) / 10_000;
  return Math.max(1, Math.ceil(cents));
}

/**
 * Estimate STT cost from an audio blob's byte count. Precision is
 * limited by the assumed bitrate — good enough for spend visibility;
 * don't reconcile invoices against it.
 */
export function estimateSttCostCentsFromBytes(
  bytes: number,
  model: string,
): number {
  if (bytes <= 0) return 0;
  const seconds = bytes / OPUS_BYTES_PER_SECOND;
  const hourlyUsd = STT_USD_PER_HOUR[model] ?? STT_FALLBACK_USD_PER_HOUR;
  // hourlyUsd * (seconds / 3600) * 100 cents
  const cents = (hourlyUsd * seconds * 100) / 3600;
  return Math.max(1, Math.ceil(cents));
}

/**
 * Convert a cost in whole cents to a display-friendly $x.yy string.
 * Used by the super-admin tile.
 */
export function formatCentsAsUsd(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}`;
}
