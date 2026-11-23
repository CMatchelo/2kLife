// Modern NBA home venues (2026–27) and two display colors per team.
// Venue reference: https://www.nba.com/news/all-30-nba-arenas-by-team
// Colors are UI swatches. Houston, Minnesota, and Utah use approximations.
const presentationByTeamId: ReadonlyMap<string, TeamPresentation> = new Map(
  ([
    ["ATL", "Atlanta", "State Farm Arena", "#E03A3E", "#C1D32F"],
    ["BOS", "Boston", "TD Garden", "#007A33", "#BA9653"],
    ["BKN", "Brooklyn", "Barclays Center", "#000000", "#FFFFFF"],
    ["CHA", "Charlotte", "Spectrum Center", "#1D1160", "#00788C"],
    ["CHI", "Chicago", "United Center", "#CE1141", "#000000"],
    ["CLE", "Cleveland", "Rocket Arena", "#860038", "#FDBB30"],
    ["DAL", "Dallas", "American Airlines Center", "#00538C", "#002B5E"],
    ["DEN", "Denver", "Ball Arena", "#0E2240", "#FEC524"],
    ["DET", "Detroit", "Little Caesars Arena", "#C8102E", "#1D42BA"],
    ["GSW", "San Francisco", "Chase Center", "#1D428A", "#FFC72C"],
    ["HOU", "Houston", "Toyota Center", "#CE1141", "#FFC72C"],
    ["IND", "Indianapolis", "Gainbridge Fieldhouse", "#002D62", "#FDBB30"],
    ["LAC", "Inglewood", "Intuit Dome", "#C8102E", "#1D428A"],
    ["LAL", "Los Angeles", "Crypto.com Arena", "#552583", "#FDB927"],
    ["MEM", "Memphis", "FedExForum", "#5D76A9", "#12173F"],
    ["MIA", "Miami", "Kaseya Center", "#98002E", "#F9A01B"],
    ["MIL", "Milwaukee", "Fiserv Forum", "#00471B", "#EEE1C6"],
    ["MIN", "Minneapolis", "Target Center", "#1D42BA", "#00843D"],
    ["NOP", "New Orleans", "Smoothie King Center", "#0C2340", "#C8102E"],
    ["NYK", "New York", "Madison Square Garden", "#006BB6", "#F58426"],
    ["OKC", "Oklahoma City", "Paycom Center", "#007AC1", "#EF3B24"],
    ["ORL", "Orlando", "Kia Center", "#0077C0", "#C4CED4"],
    ["PHI", "Philadelphia", "Xfinity Mobile Arena", "#006BB6", "#ED174C"],
    ["PHX", "Phoenix", "Mortgage Matchup Center", "#1D1160", "#E56020"],
    ["POR", "Portland", "Moda Center", "#E03A3E", "#000000"],
    ["SAC", "Sacramento", "Golden 1 Center", "#5A2D81", "#63727A"],
    ["SAS", "San Antonio", "Frost Bank Center", "#C4CED4", "#000000"],
    ["TOR", "Toronto", "Scotiabank Arena", "#CE1141", "#000000"],
    ["UTA", "Salt Lake City", "Delta Center", "#5B2B82", "#000000"],
    ["WAS", "Washington, DC", "Capital One Arena", "#002B5C", "#E31837"],
  ] as const).map(([id, city, arena, primaryColor, secondaryColor]) => [
    id,
    { city, arena, primaryColor, secondaryColor },
  ]),
);

type TeamPresentation = {
  readonly city: string;
  readonly arena: string;
  readonly primaryColor: string;
  readonly secondaryColor: string;
};

export const teamPresentation = (id: string): TeamPresentation | null =>
  presentationByTeamId.get(id) ?? null;
