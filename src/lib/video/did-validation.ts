// D-ID's source_url accepts an https URL to an image, NOT a bare ID.
// Pasting a UUID (e.g. from /images upload) gets a cryptic 400 from
// upstream — validate here so the admin form and the drivers all reject
// the same wrong shapes with a useful message.
//
// Kept in its own file (not index.ts) so the per-provider driver modules
// can import it without forming a cycle through the driver registry.

export function isValidDidSourceUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  // D-ID's POST /images returns the upload as an s3://d-id-images-prod/…
  // URI — accepted upstream as source_url for /talks and /talks/streams.
  if (value.startsWith("s3://d-id-images-prod/")) return true;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname.length > 0;
  } catch {
    return false;
  }
}

export const DID_SOURCE_URL_ERROR =
  "D-ID Avatar ID must be either an https:// URL to a portrait image OR the s3://d-id-images-prod/… URI returned by D-ID's POST /images. Set it as the Default avatar ID at /admin/video-providers, or override per persona via persona.liveAvatarId.";
