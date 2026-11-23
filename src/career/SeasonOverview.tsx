import type { CSSProperties } from "react";
import { sponsorCatalog } from "../domain/sponsors";
import { teamPresentation } from "../domain/teamPresentation";
import { teamLogo, teamName } from "../domain/teams";
import type { Career, Team } from "../types/career";
import type { Game } from "../types/game";
import type { SponsorsOverview } from "../types/sponsor";
import { SponsorLogo } from "./Sponsors";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const sponsorNames = new Map(sponsorCatalog.brands.map(({ id, name }) => [id, name]));

export function PlayerBanner({ career }: { career: Career }) {
  const teamId = career.profile.currentTeamId;
  const team = teamPresentation(teamId);
  const logo = teamLogo(teamId);
  const style = team
    ? ({
        "--team-primary": team.primaryColor,
        "--team-secondary": team.secondaryColor,
      } as CSSProperties)
    : undefined;

  return (
    <header className="season-player-banner" style={style}>
      {logo && <img src={logo} alt="" className="season-player-watermark" />}
      <div className="relative">
        <p className="text-xs font-bold uppercase tracking-widest text-gold">{career.saveName}</p>
        <div className="my-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">{career.profile.name}</h1>
          {career.profile.jerseyNumber && (
            <span className="season-player-number border-l border-white/35 pl-4 text-2xl font-extrabold text-slate-200 sm:text-3xl">
              #{career.profile.jerseyNumber}
            </span>
          )}
        </div>
        <p className="text-sm font-semibold text-slate-200">
          {teamName(career.teams, teamId)} · {career.season.year} · {career.season.era}
        </p>
      </div>
    </header>
  );
}

export function NextMatchup({
  game,
  teams,
  busy,
  disabled,
  blockedReason,
  onNextDay,
}: {
  game?: Game;
  teams: Team[];
  busy: boolean;
  disabled: boolean;
  blockedReason?: string;
  onNextDay: () => void;
}) {
  const venue = game && teamPresentation(game.location === "home" ? game.teamId : game.opponentId);
  return (
    <section className="min-w-0" aria-labelledby="next-matchup-title">
      <h2 id="next-matchup-title" className="season-heading">Next Matchup</h2>
      {game ? (
        <div className="my-4 space-y-2">
          <time className="text-sm text-gold" dateTime={game.date}>{game.date}</time>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
            {[game.teamId, game.opponentId].map((id, index) => {
              const logo = teamLogo(id);
              return (
                <div key={index} className="contents">
                  {index === 1 && (
                    <span className="text-xs font-bold text-muted">
                      {game.location === "home" ? "VS" : "AT"}
                    </span>
                  )}
                  <div className="min-w-0 text-xs font-bold">
                    {logo && <img src={logo} alt="" className="mx-auto mb-1 size-10 object-contain" />}
                    {teamName(teams, id)}
                  </div>
                </div>
              );
            })}
          </div>
          {venue && <p className="text-center text-xs text-muted">{venue.arena} · {venue.city}</p>}
        </div>
      ) : (
        <p className="my-4 text-sm text-muted">No match scheduled</p>
      )}
      <div className="group relative">
        <button
          type="button"
          className="ai-primary w-full aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
          disabled={disabled && !blockedReason}
          aria-disabled={disabled || undefined}
          aria-describedby={blockedReason ? "next-day-reason" : undefined}
          onClick={() => {
            if (!disabled) onNextDay();
          }}
        >
          {busy ? "Processing." : "Next day"}
        </button>
        {blockedReason && (
          <p
            id="next-day-reason"
            role="tooltip"
            className="pointer-events-none invisible absolute inset-x-0 top-full z-30 mt-1 border border-divider bg-[#172532] p-2 text-xs text-white group-focus-within:visible group-hover:visible"
          >
            {blockedReason}
          </p>
        )}
      </div>
    </section>
  );
}

export function Endorsements({
  overview,
  error,
  onSponsors,
}: {
  overview: SponsorsOverview | null;
  error: string;
  onSponsors: () => void;
}) {
  const contracts = overview?.activeContracts.slice(0, 2) ?? [];
  const potential = overview?.potentialSponsors.slice(0, 2) ?? [];
  return (
    <section aria-labelledby="endorsement-title">
      <h2 id="endorsement-title" className="season-heading border-b-2">My Endorsements</h2>
      {!overview && <p className="py-3 text-sm text-muted" role={error ? "alert" : "status"}>{error || "Loading endorsements."}</p>}
      <div className="space-y-2 py-3">
        <h3 className="font-bold">Active Contracts</h3>
        {overview && contracts.length === 0 && <p className="text-sm text-muted">No active contracts</p>}
        {contracts.map((contract) => (
          <div key={contract.id} className="flex items-center gap-3 py-2">
            <SponsorLogo brandId={contract.brandId} brandName={contract.brandName} />
            <div className="min-w-0">
              <p className="font-semibold">{contract.brandName}</p>
              <p className="text-xs text-muted">
                {contract.attendedEvents} attended · {Math.max(0, contract.requiredEvents - contract.attendedEvents)} required left
              </p>
              <p className="text-xs">{currency.format(contract.perMatchUsdCents / 100)} per match</p>
            </div>
          </div>
        ))}
        <button type="button" onClick={onSponsors} aria-label="See all active contract details" className="season-details">See all details</button>
      </div>
      <div className="space-y-2 border-t border-divider py-3">
        <h3 className="font-bold">Potential Sponsors</h3>
        {overview && potential.length === 0 && <p className="text-sm text-muted">No potential sponsors</p>}
        {potential.map((sponsor) => {
          const name = sponsorNames.get(sponsor.brandId) ?? sponsor.brandId;
          return (
            <div key={sponsor.brandId} className="flex items-center gap-3 py-2">
              <SponsorLogo brandId={sponsor.brandId} brandName={name} />
              <div className="min-w-0">
                <p className="font-semibold">{name}</p>
                <p className="text-xs text-muted">{sponsor.interestPercentage}% interest</p>
              </div>
            </div>
          );
        })}
        <button type="button" onClick={onSponsors} aria-label="See all potential sponsor details" className="season-details">See all details</button>
      </div>
    </section>
  );
}

