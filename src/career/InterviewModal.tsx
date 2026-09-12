import { createPortal } from "react-dom";
import AIConnection from "../AIConnection";
import { useEffect, useRef, useState } from "react";
import type { Career } from "../types/career";
import type { InterviewOffer } from "../types/interview";
import { api } from "./api";
export default function InterviewModal({
  offer,
  loading,
  generationError,
  onRetry,
  careerId,
  gameId,
  onSaved,
  onClose,
}: {
  offer: InterviewOffer | null;
  loading: boolean;
  generationError: string;
  onRetry: () => void;
  careerId: string;
  gameId: string;
  onSaved: (career: Career) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const [saving, setSaving] = useState(false);
  const [showConnection, setShowConnection] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Career | null>(null);
  useEffect(() => {
    const node = ref.current!;
    node.showModal();
    return () => node.close();
  }, []);
  const scores = result?.profile.identity.careerScores;
  const total = scores ? scores.star + scores.team + scores.fan : 0;
  return createPortal(
    <dialog
      ref={ref}
      className="interview-dialog rounded-2xl text-white"
      aria-labelledby="interview-title"
      onCancel={(event) => {
        event.preventDefault();
        if (result) onClose();
      }}
    >
      <div className="space-y-5 p-6">
        <h2 id="interview-title" className="text-2xl font-bold">
          Postgame interview
        </h2>
        <p className="text-lg leading-relaxed">
          {offer
            ? offer.question
            : "You enter the press room. A few reporters are already waiting, notebooks open and microphones ready. You take your seat as the room settles and the first question takes shape."}
        </p>
        {!offer && loading && (
          <p role="status" className="text-gold">
            A reporter is preparing the question…
          </p>
        )}
        {!offer && generationError && (
          <div className="space-y-3 rounded-lg bg-black/60 p-4">
            <p role="alert">{generationError}</p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="ai-primary"
                disabled={loading}
                onClick={onRetry}
              >
                Retry interview
              </button>
              <button
                type="button"
                className="ai-secondary text-ink"
                onClick={() => setShowConnection(!showConnection)}
              >
                AI connection
              </button>
            </div>
            {showConnection && (
              <div className="rounded-lg bg-butter p-3 text-ink">
                <AIConnection />
              </div>
            )}
          </div>
        )}
        {result ? (
          <>
            <h3 className="text-xl font-bold">Career identity</h3>
            {total ? (
              <dl className="grid grid-cols-3 gap-3">
                {(["star", "team", "fan"] as const).map((key) => (
                  <div key={key} className="rounded-lg bg-cream p-3 text-ink">
                    <dt className="capitalize">{key}</dt>
                    <dd className="text-xl font-bold">
                      {((100 * scores![key]) / total).toFixed(1)}%
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p>Not established.</p>
            )}
            <button type="button" className="ai-primary" onClick={onClose}>
              Close
            </button>
          </>
        ) : offer ? (
          <div className="space-y-3">
            {offer.answers.map((answer, choice) => (
              <button
                key={choice}
                type="button"
                disabled={saving}
                className="ai-secondary block w-full p-4 text-left text-ink"
                onClick={async () => {
                  if (lock.current) return;
                  lock.current = true;
                  setSaving(true);
                  setError("");
                  try {
                    const updated = await api<Career>(
                      `careers/${careerId}/games/${gameId}/interview/answer`,
                      { choice },
                    );
                    setResult(updated);
                    onSaved(updated);
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Could not save your answer. Please retry.",
                    );
                  } finally {
                    lock.current = false;
                    setSaving(false);
                  }
                }}
              >
                {answer}
              </button>
            ))}
          </div>
        ) : null}
        {saving && <p role="status">Saving your answer…</p>}
        {error && (
          <p role="alert" className="rounded-lg bg-black/70 p-3 text-white">
            {error}
          </p>
        )}
      </div>
    </dialog>,
    document.body,
  );
}
