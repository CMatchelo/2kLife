import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CareerStore } from "./careers.ts";
import {
  BasketballNetworkService,
  migrateBasketballNetwork,
} from "./basketball-network.ts";
import { scheduledGame } from "../src/domain/career.ts";
import type { CareerDraft } from "../src/types/career.ts";

const teams = [
  { id: "LAL", name: "Los Angeles Lakers", source: "modern" as const },
  { id: "BOS", name: "Boston Celtics", source: "modern" as const },
  { id: "GSW", name: "Golden State Warriors", source: "modern" as const },
];

function draft(saveName = "Network career"): CareerDraft {
  return {
    requestId: randomUUID(),
    saveName,
    player: {
      name: "Test Player",
      position: "PG",
      age: 20,
      heightCm: 190,
      weightKg: 85,
      currentTeamId: "LAL",
      draft: { undrafted: true, year: 2026 },
    },
    season: { era: "Modern", year: "2026-27" },
    teams,
    teamsConfirmed: true,
    games: [
      scheduledGame({
        date: "2026-10-15",
        teamId: "LAL",
        opponentId: "BOS",
        location: "home",
        category: "regularSeason",
        countsTowardRegularSeason: true,
      }),
    ],
    coverage: [],
    unresolved: [],
  };
}

test("external players and teammates use separate three-person limits and shared normalized names", () => {
  const store = new CareerStore(":memory:");
  try {
    const career = store.create(draft());
    let network = store.basketballNetwork.addPlayer(career.id, {
      name: "  LeBron   James ",
      teamId: "LAL",
      affinity: 99,
    });
    assert.equal(network.players[0].affinity, 0);
    assert.equal(network.players[0].normalizedName, "lebron james");
    assert.equal(network.players[0].role, "player");
    assert.throws(
      () =>
        store.basketballNetwork.addTeammate(career.id, {
          name: "LEBRON JAMES",
        }),
      /already exists/,
    );

    network = store.basketballNetwork.addTeammate(career.id, {
      name: "Austin Reaves",
      affinity: 50,
    });
    assert.equal(network.teammates[0].affinity, 0);
    assert.equal(network.teammates[0].teamId, "LAL");
    assert.throws(
      () =>
        store.basketballNetwork.addTeammate(career.id, {
          name: "Wrong Team",
          teamId: "BOS",
        }),
      /current team/,
    );
    const teammate = network.teammates[0];
    assert.throws(
      () =>
        store.basketballNetwork.updateTeammate(career.id, teammate.id, {
          name: "Austin Reaves",
          teamId: "BOS",
        }),
      /controlled/,
    );
    network = store.basketballNetwork.updateTeammate(career.id, teammate.id, {
      name: "Austin Reaves Jr.",
    });
    assert.equal(network.teammates[0].teamId, "LAL");
    store.basketballNetwork.addPlayer(career.id, {
      name: "Player Two",
      teamId: "BOS",
    });
    store.basketballNetwork.addPlayer(career.id, {
      name: "Player Three",
      teamId: "GSW",
    });
    assert.throws(
      () =>
        store.basketballNetwork.addPlayer(career.id, {
          name: "Player Four",
          teamId: "BOS",
        }),
      /three active players/,
    );
    store.basketballNetwork.addTeammate(career.id, { name: "Teammate Two" });
    store.basketballNetwork.addTeammate(career.id, { name: "Teammate Three" });
    assert.throws(
      () =>
        store.basketballNetwork.addTeammate(career.id, {
          name: "Teammate Four",
        }),
      /three active teammates/,
    );

    const player = store.basketballNetwork.get(career.id).players[0];
    store.basketballNetwork.adjustNetworkPlayerAffinity(
      career.id,
      player.id,
      4,
      "test:player",
    );
    network = store.basketballNetwork.updatePlayer(career.id, player.id, {
      name: "LeBron Raymone James",
      teamId: "BOS",
      affinity: -100,
    });
    assert.equal(
      network.players.find((item) => item.id === player.id)!.teamId,
      "BOS",
    );
    assert.equal(
      network.players.find((item) => item.id === player.id)!.affinity,
      4,
    );
  } finally {
    store.close();
  }
});

test("team changes archive teammates and archived teammates reactivate as external players with preserved identity and affinity", () => {
  const store = new CareerStore(":memory:");
  try {
    const career = store.create(draft());
    let teammate = store.basketballNetwork.addTeammate(career.id, {
      name: "Former Teammate",
    }).teammates[0];
    store.basketballNetwork.adjustNetworkPlayerAffinity(
      career.id,
      teammate.id,
      -7,
      "test:teammate",
    );
    teammate = store.basketballNetwork.get(career.id).teammates[0];
    store.changeCurrentTeam(career.id, { teamId: "BOS" });
    assert.equal(store.basketballNetwork.get(career.id).teammates.length, 0);
    const archived = store.basketballNetwork.archivedTeammates(career.id)[0];
    assert.equal(archived.id, teammate.id);
    assert.equal(archived.teamId, "LAL");
    assert.equal(archived.affinity, -7);
    assert.equal(archived.inactiveReason, "team_change");
    assert.equal(archived.createdAt, teammate.createdAt);
    assert.equal(archived.updatedAt, teammate.updatedAt);

    let network = store.basketballNetwork.addPlayer(career.id, {
      name: "FORMER   TEAMMATE",
      teamId: "GSW",
    });
    const reactivated = network.players[0];
    assert.equal(reactivated.id, teammate.id);
    assert.equal(reactivated.affinity, -7);
    assert.equal(reactivated.role, "player");
    store.basketballNetwork.removePerson(career.id, reactivated.id, "player");
    network = store.basketballNetwork.addPlayer(career.id, {
      name: "Former Teammate",
      teamId: "GSW",
    });
    assert.notEqual(network.players[0].id, reactivated.id);
    assert.equal(network.players[0].affinity, 0);
    teammate = store.basketballNetwork.addTeammate(career.id, {
      name: "New Teammate",
    }).teammates[0];
    assert.equal(teammate.teamId, "BOS");
  } finally {
    store.close();
  }
});

test("current-team affinity is independent of five selected slots, shared with selection, and restored on return", () => {
  const store = new CareerStore(":memory:");
  try {
    const career = store.create(draft());
    let network = store.basketballNetwork.get(career.id);
    assert.equal(network.teams.length, 1);
    assert.equal(network.teams[0].current, true);
    assert.equal(network.teams[0].selected, false);
    assert.equal(network.teams[0].affinity, 0);
    store.basketballNetwork.adjustNetworkTeamAffinity(
      career.id,
      "LAL",
      6,
      "test:lal",
    );
    network = store.basketballNetwork.addTeam(career.id, { teamId: "LAL" });
    assert.equal(
      network.teams.filter((team) => team.teamId === "LAL").length,
      1,
    );
    assert.equal(network.teams[0].affinity, 6);
    store.changeCurrentTeam(career.id, { teamId: "BOS" });
    assert.equal(
      store.basketballNetwork.get(career.id).teams.find((team) => team.current)!
        .affinity,
      0,
    );
    store.changeCurrentTeam(career.id, { teamId: "LAL" });
    assert.equal(
      store.basketballNetwork.get(career.id).teams.find((team) => team.current)!
        .affinity,
      6,
    );
  } finally {
    store.close();
  }
});

test("migration keeps four or five legacy players active while blocking additions", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE careers (id TEXT PRIMARY KEY);
      CREATE TABLE players (id TEXT PRIMARY KEY, career_id TEXT UNIQUE NOT NULL REFERENCES careers(id), data TEXT NOT NULL);
      INSERT INTO careers VALUES ('career');
      INSERT INTO players VALUES ('profile', 'career', '{"currentTeamId":"LAL"}');
      CREATE TABLE career_network_players (id TEXT PRIMARY KEY, career_id TEXT NOT NULL REFERENCES careers(id), name TEXT NOT NULL, normalized_name TEXT NOT NULL, team_id TEXT NOT NULL, affinity INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(career_id, normalized_name));
      CREATE TABLE career_network_teams (career_id TEXT NOT NULL REFERENCES careers(id), team_id TEXT NOT NULL, affinity INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(career_id, team_id));`);
    const insert = db.prepare(
      "INSERT INTO career_network_players VALUES (?, 'career', ?, ?, 'BOS', 0, '2026-01-01', '2026-01-01')",
    );
    for (let index = 1; index <= 5; index++)
      insert.run(`legacy-${index}`, `Legacy ${index}`, `legacy ${index}`);
    migrateBasketballNetwork(db);
    const service = new BasketballNetworkService(db);
    const network = service.get("career");
    assert.equal(network.players.length, 5);
    assert.ok(
      network.players.every(
        (player) => player.role === "player" && player.active,
      ),
    );
    assert.throws(
      () => service.addPlayer("career", { name: "Sixth", teamId: "BOS" }),
      /three active players/,
    );
    service.updatePlayer("career", network.players[0].id, {
      name: "Edited Legacy",
      teamId: "GSW",
    });
  } finally {
    db.close();
  }
});

test("network data remains isolated, persists after reload, and ignores direct affinity fields", async () => {
  const directory = await mkdtemp(join(tmpdir(), "2klife-network-test-"));
  const file = join(directory, "careers.sqlite");
  let store = new CareerStore(file);
  try {
    const first = store.create(draft("First"));
    const second = store.create(draft("Second"));
    const player = store.basketballNetwork.addPlayer(first.id, {
      name: "Persisted Player",
      teamId: "BOS",
      affinity: 999,
    }).players[0];
    assert.equal(player.affinity, 0);
    assert.equal(store.basketballNetwork.get(second.id).players.length, 0);
    assert.throws(
      () =>
        store.basketballNetwork.updatePlayer(second.id, player.id, {
          name: "Cross Career",
          teamId: "GSW",
        }),
      /not found/,
    );
    store.close();
    store = new CareerStore(file);
    assert.equal(
      store.basketballNetwork.get(first.id).players[0].id,
      player.id,
    );
    assert.equal(store.basketballNetwork.get(first.id).players[0].affinity, 0);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
