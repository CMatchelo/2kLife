import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { modernTeams, teamLogo, teamName } from "../domain/teams";
import type {
  BasketballNetwork,
  BasketballNetworkPlayer,
  NetworkPlayerRole,
} from "../types/basketball-network";
import type { Career } from "../types/career";
import { api } from "./api";

const emptyNetwork: BasketballNetwork = {
  teams: [],
  players: [],
  teammates: [],
};

function ConfirmRemove({
  label,
  saving,
  error,
  onCancel,
  onConfirm,
}: {
  label: string;
  saving: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current!;
    node.showModal();
    return () => node.close();
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className="ai-dialog rounded-2xl border border-divider bg-butter text-ink"
      aria-labelledby="network-remove-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onCancel();
      }}
    >
      <div className="space-y-5 p-6">
        <h3 id="network-remove-title" className="text-2xl font-bold">
          Remove {label}?
        </h3>
        <p>
          This removes {label} from the active basketball network. Adding this
          person again later will start the relationship at zero.
        </p>
        {error && (
          <p role="alert" className="text-court-red">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="cursor-pointer rounded-lg bg-court-red px-4 py-2 font-semibold text-white disabled:cursor-wait disabled:opacity-50"
            disabled={saving}
            onClick={onConfirm}
          >
            {saving ? "Removing…" : "Remove"}
          </button>
          <button
            type="button"
            className="ai-secondary"
            disabled={saving}
            onClick={onCancel}
          >
            Keep
          </button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}

function PersonEditor({
  person,
  currentTeamId,
  teams,
  saving,
  error,
  onCancel,
  onSave,
}: {
  person: BasketballNetworkPlayer;
  currentTeamId: string;
  teams: Career["teams"];
  saving: boolean;
  error: string;
  onCancel: () => void;
  onSave: (name: string, teamId?: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(person.name);
  const [teamId, setTeamId] = useState(person.teamId);
  useEffect(() => {
    const node = ref.current!;
    node.showModal();
    return () => node.close();
  }, []);
  const teammate = person.role === "teammate";
  return createPortal(
    <dialog
      ref={ref}
      className="ai-dialog rounded-2xl border border-divider bg-butter text-ink"
      aria-labelledby="network-person-edit-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onCancel();
      }}
    >
      <form
        className="space-y-5 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(name, teammate ? undefined : teamId);
        }}
      >
        <h3 id="network-person-edit-title" className="text-2xl font-bold">
          Edit {teammate ? "teammate" : "player"}
        </h3>
        <fieldset disabled={saving} className="space-y-4">
          <label className="career-field">
            <span>{teammate ? "Teammate" : "Player"} name</span>
            <input
              value={name}
              maxLength={100}
              required
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {teammate ? (
            <div>
              <span className="block text-sm font-bold">Current team</span>
              <p className="mt-1 rounded-lg border border-divider bg-cream p-3">
                {teamName(teams, currentTeamId)}
              </p>
            </div>
          ) : (
            <label className="career-field">
              <span>Current NBA team</span>
              <select
                value={teamId}
                required
                onChange={(event) => setTeamId(event.target.value)}
              >
                {modernTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="text-court-red">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            className="ai-primary"
            disabled={saving || !name.trim() || (!teammate && !teamId)}
          >
            {saving ? "Saving…" : `Save ${teammate ? "teammate" : "player"}`}
          </button>
          <button
            type="button"
            className="ai-secondary"
            disabled={saving}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}

const relationship = (value: number) => value.toFixed(1);

function NetworkTeamName({ teams, id }: { teams: Career["teams"]; id: string }) {
  const logo = teamLogo(id);
  return (
    <span className="flex items-center gap-2">
      {logo && <img src={logo} alt="" className="size-7 shrink-0 object-contain" />}
      <span>{teamName(teams, id)}</span>
    </span>
  );
}

function PeopleTable({
  people,
  role,
  teams,
  saving,
  onEdit,
  onRemove,
}: {
  people: BasketballNetworkPlayer[];
  role: NetworkPlayerRole;
  teams: Career["teams"];
  saving: boolean;
  onEdit: (person: BasketballNetworkPlayer) => void;
  onRemove: (person: BasketballNetworkPlayer) => void;
}) {
  if (!people.length) return <p className="py-3 text-sm text-muted">No {role}s added.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="history-table [&_tbody_:is(th,td)]:border-b-0">
        <thead>
          <tr>
            <th scope="col">{role === "player" ? "Player" : "Teammate"}</th>
            {role === "player" && <th scope="col">Team</th>}
            <th scope="col" className="text-right">Relationship</th>
            <th scope="col" className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {people.map((person) => (
            <tr key={person.id}>
              <th scope="row">{person.name}</th>
              {role === "player" && <td><NetworkTeamName teams={teams} id={person.teamId} /></td>}
              <td className="text-right font-bold">{relationship(person.affinity)}</td>
              <td>
                <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                  <button type="button" className="season-details" disabled={saving}
                    aria-label={`Edit ${person.name}`} onClick={() => onEdit(person)}>
                    Edit
                  </button>
                  <button type="button" className="season-details text-red-300" disabled={saving}
                    aria-label={`Remove ${person.name}`} onClick={() => onRemove(person)}>
                    Remove
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BasketballNetworkSettings({
  career,
}: {
  career: Career | null;
}) {
  const [network, setNetwork] = useState(emptyNetwork);
  const [loading, setLoading] = useState(!!career);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [teamId, setTeamId] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [playerTeamId, setPlayerTeamId] = useState("");
  const [teammateName, setTeammateName] = useState("");
  const [editing, setEditing] = useState<BasketballNetworkPlayer | null>(null);
  const [removing, setRemoving] = useState<BasketballNetworkPlayer | null>(
    null,
  );
  const lock = useRef(false);

  useEffect(() => {
    if (!career) {
      setNetwork(emptyNetwork);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    void api<BasketballNetwork>(`careers/${career.id}/basketball-network`)
      .then((value) => {
        if (active) setNetwork(value);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load the basketball network.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [career]);

  async function mutate(
    path: string,
    body?: unknown,
    method?: "POST" | "DELETE",
  ) {
    if (!career || lock.current) return false;
    lock.current = true;
    setSaving(true);
    setError("");
    try {
      setNetwork(
        await api<BasketballNetwork>(
          `careers/${career.id}/basketball-network/${path}`,
          body,
          method,
        ),
      );
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The basketball network could not be updated. Retry.",
      );
      return false;
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  if (!career)
    return (
      <section
        className="career-card dashboard-card"
        aria-labelledby="basketball-network-title"
      >
        <h2 id="basketball-network-title" className="text-2xl font-bold">
          Basketball Network
        </h2>
        <p className="mt-3 text-muted">
          Open a career before configuring its Basketball Network.
        </p>
      </section>
    );

  const selectedTeams = network.teams.filter((team) => team.selected);
  const displayTeams = [
    ...career.teams,
    ...modernTeams.filter(
      (team) => !career.teams.some((item) => item.id === team.id),
    ),
  ];
  const selectedTeamIds = new Set(selectedTeams.map((team) => team.teamId));
  const teamLimit = selectedTeams.length >= 5;
  const playerLimit = network.players.length >= 3;
  const teammateLimit = network.teammates.length >= 3;
  const openEditor = (person: BasketballNetworkPlayer) => {
    setError("");
    setEditing(person);
  };
  const openRemove = (person: BasketballNetworkPlayer) => {
    setError("");
    setRemoving(person);
  };

  return (
    <section aria-labelledby="basketball-network-title" className="network-screen">
      <h2 id="basketball-network-title" className="mb-5 text-3xl font-extrabold">Basketball Network</h2>
      {loading && <p role="status">Loading basketball network.</p>}
      {error && !editing && !removing && <p className="mb-4 text-red-300" role="alert">{error}</p>}
      {!loading && (
        <div className="grid items-start gap-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <section className="min-w-0 space-y-3" aria-labelledby="network-teams-title">
            <div className="season-heading border-b-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 id="network-teams-title">Teams</h3>
              <p className="text-xs font-semibold text-muted">{selectedTeams.length} / 5 selected</p>
            </div>
            <div className="overflow-x-auto">
              <table className="history-table [&_tbody_:is(th,td)]:border-b-0">
                <thead>
                  <tr>
                    <th scope="col">Team</th>
                    <th scope="col" className="text-right">Relationship</th>
                    <th scope="col" className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {[...network.teams].sort((a, b) => Number(b.current) - Number(a.current)).map((team) => (
                    <tr key={team.teamId}>
                      <th scope="row">
                        <NetworkTeamName teams={displayTeams} id={team.teamId} />
                        {team.current && <span className="mt-1 block text-xs font-normal text-muted">Current team</span>}
                      </th>
                      <td className="text-right font-bold">{relationship(team.affinity)}</td>
                      <td className="text-right">
                        {team.selected && (
                          <button
                            type="button"
                            className="season-details text-red-300"
                            aria-label={`Remove ${teamName(displayTeams, team.teamId)}`}
                            disabled={saving}
                            onClick={() => void mutate(`teams/${team.teamId}`, undefined, "DELETE")}
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted">Your current team is tracked automatically. Selecting it also includes it in your five-team list.</p>
            <form
              className="mt-4 flex min-w-0 flex-wrap items-end gap-3"
              onSubmit={async (event) => {
                event.preventDefault();
                if (await mutate("teams", { teamId })) setTeamId("");
              }}
            >
              <label className="career-field w-full sm:min-w-56 sm:flex-1">
                <span>NBA team</span>
                <select
                  value={teamId}
                  disabled={saving || teamLimit}
                  required
                  onChange={(event) => setTeamId(event.target.value)}
                >
                  <option value="">Select a team</option>
                  {modernTeams.map((team) => (
                    <option
                      key={team.id}
                      value={team.id}
                      disabled={selectedTeamIds.has(team.id)}
                    >
                      {team.name}
                      {selectedTeamIds.has(team.id) ? " (selected)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="ai-primary w-full sm:w-auto"
                disabled={saving || teamLimit || !teamId}
              >
                {saving ? "Saving…" : "Add team"}
              </button>
            </form>
          </section>
          <div className="min-w-0 space-y-9 lg:border-l lg:border-divider lg:pl-6">
            <section className="space-y-3" aria-labelledby="network-players-title">
              <div className="season-heading border-b-2 flex flex-wrap items-baseline justify-between gap-2">
                <h3 id="network-players-title">Players</h3>
                <p className="text-xs font-semibold text-muted">{network.players.length} / 3</p>
              </div>
              {network.players.length > 3 && (
                <p className="text-sm text-gold">Remove players until fewer than three remain to add another.</p>
              )}
              <PeopleTable people={network.players} role="player" teams={displayTeams}
                saving={saving} onEdit={openEditor} onRemove={openRemove} />
              <form
                className="mt-4 grid gap-3 sm:grid-cols-2"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (
                    await mutate("players", {
                      name: playerName,
                      teamId: playerTeamId,
                    })
                  ) {
                    setPlayerName("");
                    setPlayerTeamId("");
                  }
                }}
              >
                <label className="career-field">
                  <span>Player name</span>
                  <input
                    value={playerName}
                    maxLength={100}
                    disabled={saving || playerLimit}
                    required
                    onChange={(event) => setPlayerName(event.target.value)}
                  />
                </label>
                <label className="career-field">
                  <span>Current NBA team</span>
                  <select
                    value={playerTeamId}
                    disabled={saving || playerLimit}
                    required
                    onChange={(event) => setPlayerTeamId(event.target.value)}
                  >
                    <option value="">Select a team</option>
                    {modernTeams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="ai-primary sm:col-span-2 sm:justify-self-start"
                  disabled={
                    saving || playerLimit || !playerName.trim() || !playerTeamId
                  }
                >
                  {saving ? "Saving…" : "Add player"}
                </button>
              </form>
            </section>
            <section className="space-y-3" aria-labelledby="network-teammates-title">
              <div className="season-heading border-b-2 flex flex-wrap items-baseline justify-between gap-2">
                <h3 id="network-teammates-title">Teammates</h3>
                <p className="text-xs font-semibold text-muted">{network.teammates.length} / 3</p>
              </div>
              <p className="text-sm text-muted">{teamName(displayTeams, career.profile.currentTeamId)}</p>
              <PeopleTable people={network.teammates} role="teammate" teams={displayTeams}
                saving={saving} onEdit={openEditor} onRemove={openRemove} />
              <form
                className="mt-4 space-y-3"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (await mutate("teammates", { name: teammateName }))
                    setTeammateName("");
                }}
              >
                <label className="career-field">
                  <span>Teammate name</span>
                  <input
                    value={teammateName}
                    maxLength={100}
                    disabled={saving || teammateLimit}
                    required
                    onChange={(event) => setTeammateName(event.target.value)}
                  />
                </label>
                <button
                  className="ai-primary"
                  disabled={saving || teammateLimit || !teammateName.trim()}
                >
                  {saving ? "Saving…" : "Add teammate"}
                </button>
              </form>
            </section>
          </div>
        </div>
      )}
      {editing && (
        <PersonEditor
          person={editing}
          currentTeamId={career.profile.currentTeamId}
          teams={displayTeams}
          saving={saving}
          error={error}
          onCancel={() => {
            setEditing(null);
            setError("");
          }}
          onSave={async (name, editedTeamId) => {
            const path =
              editing.role === "player"
                ? `players/${editing.id}`
                : `teammates/${editing.id}`;
            const body =
              editing.role === "player"
                ? { name, teamId: editedTeamId }
                : { name };
            if (await mutate(path, body)) setEditing(null);
          }}
        />
      )}
      {removing && (
        <ConfirmRemove
          label={removing.name}
          saving={saving}
          error={error}
          onCancel={() => {
            setRemoving(null);
            setError("");
          }}
          onConfirm={async () => {
            const path =
              removing.role === "player"
                ? `players/${removing.id}`
                : `teammates/${removing.id}`;
            if (await mutate(path, undefined, "DELETE")) setRemoving(null);
          }}
        />
      )}
    </section>
  );
}
