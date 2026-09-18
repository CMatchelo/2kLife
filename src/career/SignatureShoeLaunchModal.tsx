import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  SIGNATURE_SHOE_IMAGE_MAX_BYTES,
  SIGNATURE_SHOE_IMAGE_MAX_DIMENSION,
  SIGNATURE_SHOE_IMAGE_TYPES,
  SIGNATURE_SHOE_NAME_MAX_LENGTH,
} from "../domain/signatureShoes";
import type { ImportImage } from "../types/career";
import type { SignatureShoe } from "../types/signature-shoe";
import { api } from "./api";

export default function SignatureShoeLaunchModal({
  careerId,
  shoe,
  onLaunched,
}: {
  careerId: string;
  shoe: SignatureShoe;
  onLaunched: (shoe: SignatureShoe) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const requestId = useRef(crypto.randomUUID());
  const [name, setName] = useState("");
  const [image, setImage] = useState<
    (ImportImage & { preview: string; name: string }) | null
  >(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function choose(file?: File) {
    if (!file) {
      setImage(null);
      return;
    }
    try {
      if (
        !SIGNATURE_SHOE_IMAGE_TYPES.includes(
          file.type as (typeof SIGNATURE_SHOE_IMAGE_TYPES)[number],
        ) ||
        file.size > SIGNATURE_SHOE_IMAGE_MAX_BYTES
      )
        throw new Error(
          "Choose a PNG, JPEG, or WebP image no larger than 4 MiB.",
        );
      const preview = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error("The image could not be read."));
        reader.readAsDataURL(file);
      });
      await new Promise<void>((resolve, reject) => {
        const element = new Image();
        element.onload = () =>
          element.width <= SIGNATURE_SHOE_IMAGE_MAX_DIMENSION &&
          element.height <= SIGNATURE_SHOE_IMAGE_MAX_DIMENSION
            ? resolve()
            : reject(new Error("Images must be at most 8000 × 8000 pixels."));
        element.onerror = () => reject(new Error("Invalid image file."));
        element.src = preview;
      });
      setImage({
        mediaType: file.type as ImportImage["mediaType"],
        data: preview.split(",")[1],
        preview,
        name: file.name,
      });
      setError("");
    } catch (cause) {
      setImage(null);
      setError(
        cause instanceof Error ? cause.message : "Could not read the image.",
      );
    }
  }

  async function launch() {
    if (saving) return;
    if (!name.trim()) {
      setError("Enter a name for the signature shoe.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const launched = await api<SignatureShoe>(
        `careers/${careerId}/signature-shoes/${shoe.id}/launch`,
        {
          requestId: requestId.current,
          name,
          image: image
            ? { mediaType: image.mediaType, data: image.data }
            : null,
        },
      );
      onLaunched(launched);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The shoe could not be launched. Retry.",
      );
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <dialog
      ref={dialog}
      className="ai-dialog rounded-2xl border-2 border-gold bg-[#0d161f] text-white"
      aria-labelledby="shoe-launch-title"
      onCancel={(event) => event.preventDefault()}
    >
      <div className="space-y-5 p-6 sm:p-8">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-court-red">
            {shoe.brandName}
          </p>
          <h2 id="shoe-launch-title" className="text-2xl font-black text-gold">
            Signature Shoe {shoe.slot}
          </h2>
        </div>
        <p className="leading-relaxed text-slate-200">
          For the best experience, upload an image of a shoe you created for
          this brand inside NBA 2K.
        </p>
        <label className="block font-bold">
          Shoe name
          <input
            className="mt-2 w-full rounded-lg border border-slate-500 bg-white p-3 text-ink"
            maxLength={SIGNATURE_SHOE_NAME_MAX_LENGTH}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            required
          />
        </label>
        <label className="block font-bold">
          Shoe image{" "}
          <span className="font-normal text-slate-400">(optional)</span>
          <input
            className="mt-2 block w-full text-sm"
            type="file"
            accept={SIGNATURE_SHOE_IMAGE_TYPES.join(",")}
            onChange={(event) => void choose(event.target.files?.[0])}
          />
        </label>
        {image && (
          <figure className="rounded-xl border border-slate-600 bg-slate-950 p-3">
            <img
              className="mx-auto max-h-64 rounded-lg object-contain"
              src={image.preview}
              alt={`Preview of ${image.name}`}
            />
            <figcaption className="mt-2 text-center text-sm text-slate-300">
              {image.name}
            </figcaption>
          </figure>
        )}
        {error && (
          <p className="rounded-lg bg-red-950/70 p-3 text-red-100" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          className="ai-primary w-full"
          disabled={saving}
          onClick={() => void launch()}
        >
          {saving ? "Launching…" : "Launch signature shoe"}
        </button>
        <p className="text-center text-xs text-slate-400">
          This launch must be completed before the shoe can generate sales.
        </p>
      </div>
    </dialog>,
    document.body,
  );
}
