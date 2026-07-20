import test = require('node:test');
import assert = require('node:assert/strict');

import { releaseEvidence, runtimeStatus } from '../services/deliveryEvidence';

test('delivery evidence resolves a valid deployed commit without exposing arbitrary values', () => {
  const evidence = releaseEvidence({
    APP_COMMIT_SHA: 'ABCDEF1234567890',
    NEXT_PUBLIC_APP_URL: 'https://gold-and-grith.example/'
  } as NodeJS.ProcessEnv);

  assert.equal(evidence.commitSha, 'abcdef1234567890');
  assert.equal(evidence.commitUrl, 'https://github.com/Anu062004/Herewesoso/commit/abcdef1234567890');
  assert.equal(evidence.demoUrl, 'https://gold-and-grith.example/');

  const rejected = releaseEvidence({ APP_COMMIT_SHA: 'not-a-commit' } as NodeJS.ProcessEnv);
  assert.equal(rejected.commitSha, null);
  assert.equal(rejected.commitUrl, null);
});

test('runtime evidence is LIVE only for a reachable production persistence path', () => {
  assert.equal(runtimeStatus(true, true), 'LIVE');
  assert.equal(runtimeStatus(true, false), 'REPOSITORY_ONLY');
  assert.equal(runtimeStatus(false, true), 'REPOSITORY_ONLY');
  assert.equal(runtimeStatus(false, false), 'REPOSITORY_ONLY');
});
