import { randomInt, randomUUID } from "node:crypto";
import type { CareerStore } from "./careers.ts";
import type { Provider } from "./providers/shared.ts";
import type {
  InterviewContext,
  InterviewContent,
  InterviewOffer,
} from "../src/types/interview.ts";
import type { IdentityType, PlayerIdentity } from "../src/types/identity.ts";
import { identities, validateInterview } from "../src/domain/interviews.ts";
export class InterviewError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export class InterviewService {
  store: CareerStore;
  running = new Set<string>();
  constructor(store: CareerStore) {
    this.store = store;
  }
  abandon(session: string) {
    this.store.db
      .prepare(
        "UPDATE interview_evaluations SET session_id = NULL, context = NULL, content = NULL, answer_order = NULL WHERE session_id = ? AND selected IS NULL",
      )
      .run(session);
  }
  skip(career: string, game: string, session: string) {
    this.store.db
      .prepare(
        "UPDATE interview_evaluations SET session_id = NULL, context = NULL, content = NULL, answer_order = NULL WHERE career_id = ? AND game_id = ? AND session_id = ? AND selected IS NULL",
      )
      .run(career, game, session);
    return this.store.get(career);
  }
  row(career: string, game: string, session: string) {
    return this.store.db
      .prepare(
        "SELECT * FROM interview_evaluations WHERE career_id = ? AND game_id = ? AND session_id = ?",
      )
      .get(career, game, session);
  }
  async generate(
    career: string,
    game: string,
    session: string,
    provider: Provider,
  ): Promise<InterviewOffer | null> {
    const row = this.row(career, game, session);
    if (!row || !row.context || row.selected !== null) return null;
    const offer = (
      content: InterviewContent,
      order: IdentityType[],
    ): InterviewOffer => ({
      id: String(row.interview_id),
      question: content.question,
      answers: order.map((k) => content.answers[k]),
    });
    if (row.content)
      return offer(
        JSON.parse(String(row.content)),
        JSON.parse(String(row.answer_order)),
      );
    if (this.running.has(game))
      throw new InterviewError(
        "This interview is already being prepared. Retry shortly.",
        409,
      );
    if (!provider.interview)
      throw new InterviewError(
        "This provider does not support interviews.",
        409,
      );
    this.running.add(game);
    try {
      const context: InterviewContext = JSON.parse(String(row.context));
      const raw = await provider.interview(context);
      let content: InterviewContent;
      try {
        content = validateInterview(raw, context);
      } catch {
        throw new InterviewError(
          "The AI returned an invalid interview. Your match is saved. Retry the interview.",
          422,
        );
      }
      const order: IdentityType[] = [...identities];
      for (let i = order.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [order[i], order[j]] = [order[j], order[i]];
      }
      const result = this.store.db
        .prepare(
          "UPDATE interview_evaluations SET content = ?, answer_order = ? WHERE game_id = ? AND session_id = ? AND selected IS NULL AND context IS NOT NULL",
        )
        .run(JSON.stringify(content), JSON.stringify(order), game, session);
      return result.changes ? offer(content, order) : null;
    } finally {
      this.running.delete(game);
    }
  }
  answer(career: string, game: string, session: string, choice: unknown) {
    if (!Number.isInteger(choice) || Number(choice) < 0 || Number(choice) > 2)
      throw new InterviewError("Choose one of the three answers.");
    const db = this.store.db;
    db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.row(career, game, session);
      if (!row || !row.content)
        throw new InterviewError("This interview is no longer available.", 404);
      if (row.selected === null) {
        const identity: IdentityType = JSON.parse(String(row.answer_order))[
          Number(choice)
        ];
        const context: InterviewContext = JSON.parse(String(row.context));
        const playerRow = db
          .prepare("SELECT data FROM players WHERE career_id = ?")
          .get(career)!;
        const player = JSON.parse(String(playerRow.data));
        const state: PlayerIdentity = player.identity;
        db.prepare(
          "INSERT INTO interview_rewards (interview_id, career_id, identity) VALUES (?, ?, ?)",
        ).run(String(row.interview_id), career, identity);
        state.actions.push({
          id: randomUUID(),
          date: context.game.date,
          sourceType: "interview",
          sourceId: String(row.interview_id),
          identity,
          points: 1,
        });
        state.careerScores = { star: 0, team: 0, fan: 0 };
        for (const action of state.actions)
          state.careerScores[action.identity] += action.points;
        state.recentScores = { star: 0, team: 0, fan: 0 };
        for (const action of [...state.actions]
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(-10))
          state.recentScores[action.identity] += action.points;
        db.prepare("UPDATE players SET data = ? WHERE career_id = ?").run(
          JSON.stringify(player),
          career,
        );
        db.prepare(
          "UPDATE interview_evaluations SET selected = ? WHERE game_id = ?",
        ).run(Number(choice), game);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return this.store.get(career)!;
  }
}
