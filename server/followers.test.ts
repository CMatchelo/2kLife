import assert from 'node:assert/strict';
import test from 'node:test';
import { followerChange } from '../src/domain/followers.ts';

test('match follower changes use the agreed performance thresholds and amounts', () => {
  for (const [score, expected] of [
    [0.5, 2970],
    [0.3, 2228],
    [0, 1114],
    [-0.3, 0],
    [-0.5, -743],
    [-0.7, -1485],
  ]) {
    assert.equal(followerChange(10_000, score), expected, `score ${score}`);
  }
  assert.equal(followerChange(10_000, 1), followerChange(10_000, 0.5));
  assert.equal(followerChange(10_000, -1), followerChange(10_000, -0.7));
});

test('follower changes respect the zero and one-billion bounds', () => {
  assert.equal(followerChange(0, -1), 0);
  assert.equal(followerChange(1_000_000_000, 1), 0);
});
