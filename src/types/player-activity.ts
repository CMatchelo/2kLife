import type { playerActivities } from "../domain/playerActivities.ts";
import type { BasketballNetworkPlayer } from "./basketball-network.ts";
import type { Career } from "./career.ts";

export type PlayerActivityId = (typeof playerActivities)[number]["id"];

export type PlayerActivityRequest = {
  requestId: string;
  expectedDate: string;
  playerId: string;
  activityId: PlayerActivityId;
};

export type PlayerActivityResult = {
  date: string;
  playerName: string;
  activityId: PlayerActivityId;
  followersGained: number;
};

export type PlayerActivityStatus =
  | { kind: "unavailable" }
  | { kind: "available"; players: Pick<BasketballNetworkPlayer, "id" | "name" | "role">[] }
  | { kind: "completed"; result: PlayerActivityResult };

export type PlayerActivityResponse = {
  career: Career;
  result: PlayerActivityResult;
};
