import { useEffect, useState } from "react";
import type { Career } from "../types/career";
import type { LeagueResults } from "../domain/leagueResults";
import { api } from "./api";

export function useLeagueResults(career: Career) {
  const [results, setResults] = useState<LeagueResults | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const { id, currentDate, season: { id: seasonId } } = career;
  useEffect(() => {
    let active = true;
    api<LeagueResults>(`careers/${id}/league-results`).then(
      (value) => { if (active) { setResults(value); setError(""); } },
      (failure: Error) => { if (active) setError(failure.message); },
    );
    return () => { active = false; };
  }, [id, currentDate, seasonId, retry]);
  return {
    results: results?.seasonId === seasonId ? results : null,
    setResults, error, reload: () => setRetry((value) => value + 1),
  };
}

