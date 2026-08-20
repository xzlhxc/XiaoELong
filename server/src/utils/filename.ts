const LATIN1_ONLY_PATTERN = /^[\u0000-\u00ff]*$/;

/**
 * Multer 1.x receives multipart header parameters as Latin-1. Browsers encode
 * File names as UTF-8, so restore those bytes without altering names that are
 * already valid Unicode or genuine Latin-1 text.
 */
export function normalizeUtf8Filename(value: string): string {
  if (!value || !LATIN1_ONLY_PATTERN.test(value)) {
    return value;
  }

  const decoded = Buffer.from(value, "latin1").toString("utf8");
  return decoded && !decoded.includes("\uFFFD") ? decoded : value;
}
