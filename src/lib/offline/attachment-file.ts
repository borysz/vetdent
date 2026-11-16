/**
 * What may be attached, and how a photo is prepared for storage. The same
 * limits are enforced by the storage bucket; checking here only spares the
 * user a failed upload later.
 */

export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type AllowedType = (typeof ALLOWED_TYPES)[number];

/** The bucket's limit per file. */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
/** A photo is scaled down to this on its longest side before it is stored (a tablet camera makes 4000+ px). */
export const MAX_IMAGE_SIDE = 2560;
export const THUMBNAIL_SIDE = 320;
export const JPEG_QUALITY = 0.85;

/** Translation keys under `attachments.fileErrors`. */
export type FileError = "type" | "size" | "empty";

export function isImage(type: string): boolean {
  return type.startsWith("image/");
}

export function checkFile(file: { type: string; size: number }): FileError | null {
  if (file.size === 0) return "empty";
  if (!(ALLOWED_TYPES as readonly string[]).includes(file.type)) return "type";
  if (file.size > MAX_FILE_BYTES) return "size";
  return null;
}

/** The size an image is drawn at: its longest side at most `max`, the proportions kept, never enlarged. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export interface PreparedFile {
  /** What is uploaded: the scaled JPEG for a photo, the file as it is for a PDF or when scaling is not possible. */
  blob: Blob;
  type: AllowedType;
  /** A small picture for lists and for working offline; `null` for a PDF. */
  thumbnail: Blob | null;
}

async function draw(source: Blob, side: number): Promise<Blob | null> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
  try {
    // The bitmap honours the camera's rotation (EXIF) in current browsers.
    const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
    const size = fitWithin(bitmap.width, bitmap.height, side);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  } catch {
    return null;
  }
}

/** Scales a photo down and makes its thumbnail. If the browser cannot, the original is kept. */
export async function prepareFile(file: File): Promise<PreparedFile> {
  if (!isImage(file.type)) return { blob: file, type: file.type as AllowedType, thumbnail: null };

  const scaled = await draw(file, MAX_IMAGE_SIDE);
  // Keep the original if scaling failed, or made it no smaller (an already small image).
  const useScaled = scaled !== null && scaled.size < file.size;
  const blob = useScaled ? scaled : file;
  const type = (useScaled ? "image/jpeg" : file.type) as AllowedType;
  const thumbnail = await draw(blob, THUMBNAIL_SIDE);
  return { blob, type, thumbnail };
}
