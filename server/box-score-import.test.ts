import test from "node:test";
import assert from "node:assert/strict";
import { normalizeExtractedBoxScore } from "../src/domain/boxScoreImport.ts";
import { parseBoxScoreImportRequest } from "./box-score-import-request.ts";

test("box-score extraction derives defensive rebounds and validates shooting totals", () => {
  const extracted = normalizeExtractedBoxScore({
    imageHasBoxScoreTable: true,
    extractedHighlightedPlayerRow: true,
    awayTeamScore: 103,
    homeTeamScore: 78,
    minutes: 34,
    points: 22,
    rebounds: 3,
    assists: 2,
    steals: 0,
    blocks: 1,
    turnovers: 2,
    fieldGoalsMade: 9,
    fieldGoalsAttempted: 19,
    threePointersMade: 1,
    threePointersAttempted: 7,
    freeThrowsMade: 3,
    freeThrowsAttempted: 3,
    offensiveRebounds: 1,
    personalFouls: 3,
  });
  const stats = extracted.stats;
  assert.equal(stats.defensiveRebounds, 2);
  assert.equal(stats.rebounds, 3);
  assert.equal(stats.plusMinus, 0);
  assert.equal(extracted.awayTeamScore, 103);
  assert.throws(() =>
    normalizeExtractedBoxScore({
      ...stats,
      points: 23,
      defensiveRebounds: undefined,
    }),
  );
  assert.throws(() =>
    normalizeExtractedBoxScore({
      imageHasBoxScoreTable: false,
      extractedHighlightedPlayerRow: true,
      awayTeamScore: 103,
      homeTeamScore: 78,
      ...stats,
    }),
  );
});

test("new match box-score layout extracts the highlighted player and final totals", () => {
  const extracted = normalizeExtractedBoxScore({
    imageHasBoxScoreTable: true,
    extractedHighlightedPlayerRow: true,
    awayTeamScore: 103,
    homeTeamScore: 78,
    minutes: 36,
    points: 20,
    rebounds: 6,
    assists: 9,
    steals: 0,
    blocks: 4,
    turnovers: 3,
    fieldGoalsMade: 9,
    fieldGoalsAttempted: 20,
    threePointersMade: 2,
    threePointersAttempted: 7,
    freeThrowsMade: 0,
    freeThrowsAttempted: 2,
    offensiveRebounds: 2,
    personalFouls: 0,
  });

  assert.equal(extracted.awayTeamScore, 103);
  assert.equal(extracted.homeTeamScore, 78);
  assert.deepEqual(extracted.stats, {
    minutes: 36,
    points: 20,
    rebounds: 6,
    assists: 9,
    steals: 0,
    blocks: 4,
    turnovers: 3,
    fieldGoalsMade: 9,
    fieldGoalsAttempted: 20,
    threePointersMade: 2,
    threePointersAttempted: 7,
    freeThrowsMade: 0,
    freeThrowsAttempted: 2,
    offensiveRebounds: 2,
    personalFouls: 0,
    defensiveRebounds: 4,
    plusMinus: 0,
  });
});

test("box-score extraction accepts plain numeric strings from permissive provider tools", () => {
  const extracted = normalizeExtractedBoxScore({
    imageHasBoxScoreTable: "true",
    extractedHighlightedPlayerRow: "true",
    awayTeamScore: "103",
    homeTeamScore: "78",
    minutes: "34",
    points: "22",
    rebounds: "3",
    assists: "2",
    steals: "0",
    blocks: "1",
    turnovers: "2",
    fieldGoalsMade: "9",
    fieldGoalsAttempted: "19",
    threePointersMade: "1",
    threePointersAttempted: "7",
    freeThrowsMade: "3",
    freeThrowsAttempted: "3",
    offensiveRebounds: "1",
    personalFouls: "3",
  });
  assert.equal(extracted.stats.plusMinus, 0);
  assert.equal(extracted.stats.defensiveRebounds, 2);
});

test("box-score extraction unwraps a provider's nested stats object", () => {
  const extracted = normalizeExtractedBoxScore({
    imageHasBoxScoreTable: true,
    extractedHighlightedPlayerRow: true,
    awayTeamScore: 103,
    homeTeamScore: 78,
    stats: {
      minutes: 34,
      points: 22,
      rebounds: 3,
      assists: 2,
      steals: 0,
      blocks: 1,
      turnovers: 2,
      fieldGoalsMade: 9,
      fieldGoalsAttempted: 19,
      threePointersMade: 1,
      threePointersAttempted: 7,
      freeThrowsMade: 3,
      freeThrowsAttempted: 3,
      offensiveRebounds: 1,
      personalFouls: 3,
    },
  });
  assert.equal(extracted.stats.minutes, 34);
  assert.equal(extracted.stats.plusMinus, 0);
});

test("box-score image requests verify file signatures", () => {
  const jpeg = Buffer.from([255, 216, 255, 1, 2, 3]).toString("base64");
  assert.equal(
    parseBoxScoreImportRequest({
      provider: "codex",
      image: { mediaType: "image/jpeg", data: jpeg },
    }).image.data,
    jpeg,
  );
  assert.throws(() =>
    parseBoxScoreImportRequest({
      provider: "codex",
      image: { mediaType: "image/png", data: jpeg },
    }),
  );
});
