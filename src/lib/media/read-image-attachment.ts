import type { ChatAttachment } from "@/stores/studio-store";

export const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
] as const;

export const ACCEPTED_IMAGE_ACCEPT =
  "image/png,image/jpeg,image/jpg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif";

export const MAX_ATTACHMENTS = 4;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3 MB

export function isAcceptedImageFile(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  if (ACCEPTED_IMAGE_TYPES.includes(mime as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
    return true;
  }
  // some browsers omit type — fall back to extension
  return /\.(png|jpe?g|webp|gif)$/i.test(file.name);
}

function loadImageDims(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = dataUrl;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export type MediaReadResult =
  | { ok: true; attachment: ChatAttachment }
  | { ok: false; reason: string };

export async function fileToChatAttachment(file: File): Promise<MediaReadResult> {
  if (!isAcceptedImageFile(file)) {
    return {
      ok: false,
      reason: `${file.name}: only PNG, JPEG, WebP, GIF`,
    };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      reason: `${file.name}: max ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB`,
    };
  }
  try {
    const dataUrl = await readFileAsDataUrl(file);
    if (!dataUrl.startsWith("data:image/")) {
      return { ok: false, reason: `${file.name}: invalid image data` };
    }
    const dims = await loadImageDims(dataUrl);
    const mime =
      file.type ||
      (dataUrl.match(/^data:([^;]+);/)?.[1] ?? "image/png");
    return {
      ok: true,
      attachment: {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name || "image",
        mime,
        size: file.size,
        dataUrl,
        width: dims.width || undefined,
        height: dims.height || undefined,
      },
    };
  } catch {
    return { ok: false, reason: `${file.name}: read failed` };
  }
}

export async function filesToAttachments(
  files: FileList | File[],
  existingCount: number,
): Promise<{ attachments: ChatAttachment[]; errors: string[] }> {
  const list = Array.from(files);
  const room = Math.max(0, MAX_ATTACHMENTS - existingCount);
  const errors: string[] = [];
  if (list.length > room) {
    errors.push(`Max ${MAX_ATTACHMENTS} images — took first ${room}`);
  }
  const slice = list.slice(0, room);
  const attachments: ChatAttachment[] = [];
  for (const f of slice) {
    const r = await fileToChatAttachment(f);
    if (r.ok) attachments.push(r.attachment);
    else errors.push(r.reason);
  }
  return { attachments, errors };
}
