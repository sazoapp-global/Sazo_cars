// Which files people may send (D-147). Pictures are kept as JPEG or PNG; other picture types are turned into
// JPEG on the way in. Documents may also be PDF. Safe to import in pages (no server-only code).

export const IMAGE_TYPES = ['image/jpeg', 'image/png'];
/** Other picture types people may pick (WebP, GIF, AVIF, TIFF, HEIC). They become JPEG before sending. */
export const CONVERTED_TYPES = ['image/webp', 'image/gif', 'image/avif', 'image/tiff', 'image/heic', 'image/heif'];
/** For a file input's accept list. */
export const PICTURE_ACCEPT = [...IMAGE_TYPES, ...CONVERTED_TYPES].join(',');
