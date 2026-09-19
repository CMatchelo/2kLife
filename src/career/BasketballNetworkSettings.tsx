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
  const empty =
    role === "player"
      ? "No players have been added to your basketball network."
      : "No teammates have been added to your basketball network.";
  if (!people.length)
    return <p className="mt-5 rounded-lg bg-cream p-4 text-sm">{empty}</p>;
  return (
    <div className="mt-5 min-w-0">
      <div className="space-y-3 sm:hidden">
        {people.map((person) => (
          <article
            key={person.id}
            className="rounded-lg border border-divider/70 bg-cream p-3 text-sm"
          >
            <dl className="grid min-w-0 grid-cols-[minmax(0,0.8fr)_minmax(0,1.35fr)_auto] gap-3">
              <div className="min-w-0">
                <dt className="text-xs font-bold uppercase tracking-wide text-muted">
                  {role === "player" ? "Player" : "Teammate"}
                </dt>
                <dd className="mt-1 break-words font-semibold">
                  {person.name}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs font-bold uppercase tracking-wide text-muted">
                  Team
                </dt>
                <dd className="mt-1 break-words">
                  {teamName(teams, person.teamId)}{" "}
                  <span className="text-muted">({person.teamId})</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-muted">
                  Relationship
                </dt>
                <dd className="mt-1 font-bold">{person.affinity}</dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-divider/70 pt-3">
              <button
                type="button"
                className="ai-secondary"
                disabled={saving}
                onClick={() => onEdit(person)}
              >
                Edit
              </button>
              <button
                type="button"
                className="ai-secondary text-court-red"
                disabled={saving}
                onClick={() => onRemove(person)}
              >
                Remove
              </button>
            </div>
          </article>
        ))}
      </div>
      <table className="hidden w-full text-left text-sm sm:table">
        <thead>
          <tr className="border-b border-divider">
            <th className="p-2">{role === "player" ? "Player" : "Teammate"}</th>
            <th className="p-2">Current team</th>
            <th className="p-2">Relationship</th>
            <th className="p-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {people.map((person) => (
            <tr key={person.id} className="border-b border-divider/70">
              <td className="p-2 font-semibold">{person.name}</td>
              <td className="p-2">
                {teamName(teams, person.teamId)}{" "}
                <span className="text-muted">({person.teamId})</span>
              </td>
              <td className="p-2 font-bold">{person.affinity}</td>
              <td className="p-2">
                <span className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="ai-secondary"
                    disabled={saving}
                    onClick={() => onEdit(person)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="ai-secondary text-court-red"
                    disabled={saving}
                    onClick={() => onRemove(person)}
                  >
                    Remove
                  </button>
                </span>
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
    <section
      className="career-card dashboard-card"
      aria-labelledby="basketball-network-title"
    >
      <h2 id="basketball-network-title" className="text-2xl font-bold">
        Basketball Network
      </h2>
      <p className="supporting-detail mt-2">
        Choose the teams and players who are closest to your career. They will
        be used in future events, relationships, contract discussions, and trade
        stories.
      </p>
      <p className="supporting-detail mt-2">
        For now, this section has no gameplay effect. In the future, these
        relationships will influence trades and contract negotiations.
      </p>
      {loading && (
        <p className="mt-5" role="status">
          Loading basketball network…
        </p>
      )}
      {error && !editing && !removing && (
        <p
          className="mt-5 rounded-lg border border-court-red/30 p-3 text-court-red"
          role="alert"
        >
          {error}
        </p>
      )}
      {!loading && (
        <div className="mt-6 space-y-6">
          <section
            className="min-w-0 rounded-xl border border-divider p-4"
            aria-labelledby="network-teams-title"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 id="network-teams-title" className="text-xl font-bold">
                  Teams
                </h3>
                <p className="text-sm text-muted">
                  {selectedTeams.length} of 5 teams selected · current team does
                  not use a slot
                </p>
              </div>
              {teamLimit && (
                <strong className="text-sm text-court-red">
                  Team limit reached
                </strong>
              )}
            </div>
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
            <div className="mt-5 min-w-0">
              <div className="space-y-3 sm:hidden">
                {network.teams.map((team) => {
                  const logo = teamLogo(team.teamId);
                  return (
                    <article
                      key={team.teamId}
                      className="rounded-lg border border-divider/70 bg-cream p-3 text-sm"
                    >
                      <dl className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3">
                        <div className="min-w-0">
                          <dt className="text-xs font-bold uppercase tracking-wide text-muted">
                            Team
                          </dt>
                          <dd className="mt-1 flex min-w-0 items-center gap-2 font-semibold">
                            {logo && (
                              <img
                                src={logo}
                                alt=""
                                className="h-7 w-7 shrink-0 object-contain"
                              />
                            )}
                            <span className="min-w-0 break-words">
                              {teamName(displayTeams, team.teamId)}{" "}
                              <span className="text-muted">
                                ({team.teamId})
                              </span>
                            </span>
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-bold uppercase tracking-wide text-muted">
                            Relationship
                          </dt>
                          <dd className="mt-1 font-bold">{team.affinity}</dd>
                        </div>
                      </dl>
                      {team.selected && (
                        <div className="mt-3 border-t border-divider/70 pt-3">
                          <button
                            type="button"
                            className="ai-secondary text-court-red"
                            disabled={saving}
                            onClick={() =>
                              void mutate(
                                `teams/${team.teamId}`,
                                undefined,
                                "DELETE",
                              )
                            }
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
              <table className="hidden w-full text-left text-sm sm:table">
                <thead>
                  <tr className="border-b border-divider">
                    <th className="p-2">Team</th>
                    <th className="p-2">Relationship</th>
                    <th className="p-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {network.teams.map((team) => {
                    const logo = teamLogo(team.teamId);
                    return (
                      <tr
                        key={team.teamId}
                        className="border-b border-divider/70"
                      >
                        <td className="p-2">
                          <span className="flex items-center gap-2">
                            {logo && (
                              <img
                                src={logo}
                                alt=""
                                className="h-7 w-7 object-contain"
                              />
                            )}
                            <span>
                              {teamName(displayTeams, team.teamId)}{" "}
                              <span className="text-muted">
                                ({team.teamId})
                              </span>
                            </span>
                          </span>
                        </td>
                        <td className="p-2 font-bold">{team.affinity}</td>
                        <td className="p-2 text-right">
                          {team.selected && (
                            <button
                              type="button"
                              className="ai-secondary text-court-red"
                              disabled={saving}
                              onClick={() =>
                                void mutate(
                                  `teams/${team.teamId}`,
                                  undefined,
                                  "DELETE",
                                )
                              }
                            >
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <div className="grid min-w-0 gap-6 lg:grid-cols-2">
            <section
              className="min-w-0 rounded-xl border border-divider p-4"
              aria-labelledby="network-players-title"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 id="network-players-title" className="text-xl font-bold">
                    Players
                  </h3>
                  <p className="text-sm text-muted">
                    {network.players.length} of 3 players added
                  </p>
                </div>
                {playerLimit && (
                  <strong className="text-sm text-court-red">
                    Player limit reached
                  </strong>
                )}
              </div>
              <p className="mt-2 text-sm text-muted">
                Add up to three players from around the league who are connected
                to your career.
              </p>
              {network.players.length > 3 && (
                <p className="mt-3 rounded-lg border border-court-red/30 p-3 text-sm text-court-red">
                  This career has more than three saved players from an earlier
                  version. You can keep and edit them, but you must reduce the
                  list before adding another.
                </p>
              )}
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
              <PeopleTable
                people={network.players}
                role="player"
                teams={displayTeams}
                saving={saving}
                onEdit={openEditor}
                onRemove={openRemove}
              />
            </section>
            <section
              className="min-w-0 rounded-xl border border-divider p-4"
              aria-labelledby="network-teammates-title"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3
                    id="network-teammates-title"
                    className="text-xl font-bold"
                  >
                    Teammates
                  </h3>
                  <p className="text-sm text-muted">
                    {network.teammates.length} of 3 teammates added
                  </p>
                </div>
                {teammateLimit && (
                  <strong className="text-sm text-court-red">
                    Teammate limit reached
                  </strong>
                )}
              </div>
              <p className="mt-2 text-sm text-muted">
                Add up to three teammates from your current roster. Their team
                is linked automatically to your current team.
              </p>
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
                <div>
                  <span className="block text-sm font-bold">Current team</span>
                  <p className="mt-1 rounded-lg border border-divider bg-cream p-3">
                    {teamName(displayTeams, career.profile.currentTeamId)}
                  </p>
                </div>
                <button
                  className="ai-primary"
                  disabled={saving || teammateLimit || !teammateName.trim()}
                >
                  {saving ? "Saving…" : "Add teammate"}
                </button>
              </form>
              <PeopleTable
                people={network.teammates}
                role="teammate"
                teams={displayTeams}
                saving={saving}
                onEdit={openEditor}
                onRemove={openRemove}
              />
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
