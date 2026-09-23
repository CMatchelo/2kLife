import type { ImportImage } from "../src/types/career.ts";
import { ValidationError } from "./careers.ts";

export function parseBoxScoreImportRequest(raw: unknown): {
  provider: unknown;
  image: ImportImage;
} {
  const value = raw as { provider?: unknown; image?: ImportImage };
  const image = value?.image;
  if (
    !image ||
    !["image/png", "image/jpeg", "image/webp"].includes(image.mediaType) ||
    typeof image.data !== "string" ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)
  )
    throw new ValidationError("Choose a PNG, JPEG, or WebP image.");
  const buffer = Buffer.from(image.data, "base64");
  if (
    !buffer.length ||
    buffer.length > 4 * 1024 * 1024 ||
    buffer.toString("base64") !== image.data
  )
    throw new ValidationError("The image must be at most 4 MiB.");
  const valid =
    image.mediaType === "image/png"
      ? buffer
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : image.mediaType === "image/jpeg"
        ? buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
        : buffer.toString("ascii", 0, 4) === "RIFF" &&
          buffer.toString("ascii", 8, 12) === "WEBP";
  if (!valid)
    throw new ValidationError(
      "The image content does not match its file type.",
    );
  return { provider: value.provider, image };
}
