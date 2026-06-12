// HeyGen / LiveAvatar avatar ids are short opaque strings — sometimes
// UUIDs, sometimes catalogue names like "Anna_public_3_20240108". We
// can't positively validate the shape (the catalogue keeps growing),
// so we only reject the shapes that we KNOW are wrong: URLs and
// values containing whitespace.

export function isValidHeygenAvatarId(
  value: string | null | undefined,
): boolean {
  if (!value) return false;
  const v = value.trim();
  if (!v) return false;
  if (/^https?:\/\//i.test(v)) return false;
  if (v.startsWith("s3://")) return false;
  if (/\s/.test(v)) return false;
  return true;
}

export const HEYGEN_AVATAR_ID_ERROR =
  "HeyGen Avatar ID should be the short id from app.liveavatar.com (e.g. 'Anna_public_3_20240108' or a UUID) — not a URL or s3:// URI.";
