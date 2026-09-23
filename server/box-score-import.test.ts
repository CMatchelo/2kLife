import test from "node:test";
import assert from "node:assert/strict";
import { normalizeExtractedBoxScore } from "../src/domain/boxScoreImport.ts";
import { parseBoxScoreImportRequest } from "./box-score-import-request.ts";

test("box-score extraction derives defensive rebounds and validates shooting totals", () => {
  const stats = normalizeExtractedBoxScore({
    imageHasRecentGamesTable: true,
    extractedFirstHighlightedRow: true,
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
    plusMinus: -25,
  });
  assert.equal(stats.defensiveRebounds, 2);
  assert.equal(stats.rebounds, 3);
  assert.throws(() =>
    normalizeExtractedBoxScore({
      ...stats,
      points: 23,
      defensiveRebounds: undefined,
    }),
  );
  assert.throws(() =>
    normalizeExtractedBoxScore({
      imageHasRecentGamesTable: false,
      extractedFirstHighlightedRow: true,
      ...stats,
    }),
  );
});

test("box-score extraction accepts plain numeric strings from permissive provider tools", () => {
  const stats = normalizeExtractedBoxScore({
    imageHasRecentGamesTable: "true",
    extractedFirstHighlightedRow: "true",
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
    plusMinus: "-25",
  });
  assert.equal(stats.plusMinus, -25);
  assert.equal(stats.defensiveRebounds, 2);
});

test("box-score extraction unwraps a provider's nested stats object", () => {
  const stats = normalizeExtractedBoxScore({
    imageHasRecentGamesTable: true,
    extractedFirstHighlightedRow: true,
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
      plusMinus: -25,
    },
  });
  assert.equal(stats.minutes, 34);
  assert.equal(stats.plusMinus, -25);
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
