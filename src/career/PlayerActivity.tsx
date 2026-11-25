import { useEffect, useRef, useState } from "react";
import { playerActivities } from "../domain/playerActivities";
import type { Career } from "../types/career";
import type {
  PlayerActivityId,
  PlayerActivityRequest,
  PlayerActivityResponse,
  PlayerActivityStatus,
} from "../types/player-activity";
import { api } from "./api";

export function PlayerActivity({
  careerId,
  date,
  dayLoading,
  disabled,
  onBusy,
  onCompleted,
}: {
  careerId: string;
  date: string;
  dayLoading: boolean;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onCompleted: (career: Career) => void;
}) {
  const path = `careers/${careerId}/daily-invitations/player-activity`;
  const [status, setStatus] = useState<PlayerActivityStatus>();
  const [playerId, setPlayerId] = useState("");
  const [activityId, setActivityId] = useState<PlayerActivityId>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<PlayerActivityRequest | null>(null);

  useEffect(() => {
    if (dayLoading) return;
    let active = true;
    void api<PlayerActivityStatus>(path)
      .then((next) => {
        if (active) {
          setStatus(next);
          setError("");
        }
      })
      .catch((failure: Error) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [path, dayLoading]);

  async function invite() {
    if (disabled || saving || !playerId || !activityId) return;
    const prior = request.current;
    const body = prior?.playerId === playerId && prior.activityId === activityId
      ? prior
      : { requestId: crypto.randomUUID(), expectedDate: date, playerId, activityId };
    request.current = body;
    setSaving(true);
    onBusy(true);
    setError("");
    try {
      const { career, result } = await api<PlayerActivityResponse>(path, body);
      setStatus({ kind: "completed", result });
      onCompleted(career);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The invite could not be saved.");
    } finally {
      setSaving(false);
      onBusy(false);
    }
  }

  if (status?.kind === "completed") {
    const { result } = status;
    const activity = playerActivities.find((item) => item.id === result.activityId)!;
    const reward = activity.identity
      ? activity.reward
      : `+${result.followersGained.toLocaleString()} followers`;
    return (
      <div className="space-y-1" role="status">
        <p className="font-semibold text-slate-100">{activity.title}</p>
        <p className="text-sm text-muted">Completed with {result.playerName}</p>
        <p className="text-sm text-gold">+1 affinity · {reward}</p>
      </div>
    );
  }

  if (status?.kind !== "available")
    return <p className="text-sm text-muted" role={error ? "alert" : undefined}>{error || "Free day"}</p>;

  return (
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void invite(); }}>
      <fieldset disabled={disabled || saving} className="space-y-4">
        <legend className="mb-2 font-semibold text-slate-100">Invite a player</legend>
        <label className="block text-sm text-muted">
          Network player
          <select
            className="mt-1 block w-full bg-cream px-3 py-2 text-slate-100 ring-1 ring-inset ring-white/20 focus:ring-gold"
            value={playerId}
            onChange={(event) => setPlayerId(event.target.value)}
          >
            <option value="">Choose a player</option>
            {status.players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}{player.role === "teammate" ? " (teammate)" : ""}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="space-y-1">
          <legend className="mb-1 text-sm text-muted">Activity</legend>
          {playerActivities.map((activity) => (
            <label key={activity.id} className="flex cursor-pointer items-start gap-2 px-2 py-2 text-sm hover:bg-white/5 has-checked:bg-white/10">
              <input
                className="mt-1 accent-gold"
                type="radio"
                name="player-activity"
                checked={activityId === activity.id}
                onChange={() => setActivityId(activity.id)}
              />
              <span>
                <span className="block font-semibold text-slate-100">{activity.title}</span>
                <span className="block text-muted">{activity.description}</span>
                <span className="text-gold">{activity.reward}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="text-sm text-muted">Every activity gives +1 affinity with the invited player.</p>
        <button type="submit" className="ai-primary rounded-none" disabled={!playerId || !activityId}>
          {saving ? "Saving invite…" : "Send invite"}
        </button>
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    </form>
  );
}
