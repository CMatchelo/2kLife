import type { Career } from "./career.ts";
import type { Game } from "./game.ts";

export type SponsorOfferReference = { id: string };
export type InvitationWindowReference = { id: string; date: string };
export type SponsorProcessingResult = { offers: SponsorOfferReference[] };
export type OffDayProcessingResult = {
  invitationWindow: InvitationWindowReference | null;
};
export type AdvanceDayRequest = {
  requestId: string;
  expectedDate: string | null;
  // Future offer presentation can be dismissed without deciding every offer.
  resumeTransitionId?: string;
};
export type AdvanceDayOutcome =
  | { kind: "incomplete_game"; game: Game }
  | { kind: "game_day"; game: Game }
  | { kind: "pending_interview"; gameId: string }
  | {
      kind: "sponsor_offers";
      transitionId: string;
      offers: SponsorOfferReference[];
    }
  | { kind: "off_day_invitations"; invitationWindow: InvitationWindowReference }
  | { kind: "advanced_date"; date: string }
  | { kind: "season_end"; seasonEndDate: string; message: string }
  | {
      kind: "error";
      code:
        | "calendar_coverage_needed"
        | "schedule_needed"
        | "season_end_date_needed"
        | "stale_date"
        | "processing_failed";
      message: string;
      month?: string;
    };
export type AdvanceDayResult = { career: Career } & AdvanceDayOutcome;
