import { test } from '@playwright/test';
import knownBugs from '../known-bugs.json';

export type KnownBugKey = keyof typeof knownBugs;

export const KNOWN_BUG_ANNOTATION = 'knownBug';

/**
 * Marks the current test as failing because of a real app bug listed in known-bugs.json.
 *
 * The test is then expected to fail, so it does not turn the run red. When the app is fixed the test
 * passes, Playwright reports that as "expected to fail, but passed", and the reporters flag it so the
 * marker can be removed. Call it as the first line of the test.
 */
export function knownBug(key: KnownBugKey): void {
  const bug = knownBugs[key];
  test.info().annotations.push({
    type: KNOWN_BUG_ANNOTATION,
    description: `${key}: ${bug.description}${bug.issue ? ` (${bug.issue})` : ''}`,
  });
  test.fail(true, `Known app bug "${key}": ${bug.description}`);
}
