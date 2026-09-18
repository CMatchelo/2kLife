export type BasketballNetworkTeam = {
  careerId: string;
  teamId: string;
  affinity: number;
  selected: boolean;
  current: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NetworkPlayerRole = "player" | "teammate";

export type BasketballNetworkPlayer = {
  id: string;
  careerId: string;
  name: string;
  normalizedName: string;
  teamId: string;
  role: NetworkPlayerRole;
  affinity: number;
  active: boolean;
  inactiveReason: "removed" | "team_change" | null;
  createdAt: string;
  updatedAt: string;
};

export type BasketballNetwork = {
  teams: BasketballNetworkTeam[];
  players: BasketballNetworkPlayer[];
  teammates: BasketballNetworkPlayer[];
};
