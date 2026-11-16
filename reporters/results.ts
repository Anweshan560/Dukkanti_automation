import type { TestCase, TestResult } from '@playwright/test/reporter';
import { KNOWN_BUG_ANNOTATION } from '../utils/knownBug';
import { redact, stripAnsi } from '../utils/redact';

export type Verdict =
  | 'passed'
  | 'failed'
  | 'flaky' // passed only after a retry
  | 'skipped'
  | 'known-bug' // failed as expected because of a bug in known-bugs.json
  | 'known-bug-fixed'; // marked as a known bug but it passes now: remove the marker

export interface Row {
  project: string;
  file: string;
  title: string;
  verdict: Verdict;
  retries: number;
  durationMs: number;
  error: string;
  knownBug: string;
}

/** Collects the final result of every test. Shared by the reporters. */
export class ResultCollector {
  private readonly latest = new Map<string, { test: TestCase; result: TestResult }>();

  record(test: TestCase, result: TestResult): void {
    this.latest.set(test.id, { test, result });
  }

  rows(): Row[] {
    return [...this.latest.values()].map(({ test, result }) => {
      const knownBug =
        [...test.annotations, ...result.annotations].find((a) => a.type === KNOWN_BUG_ANNOTATION)
          ?.description ?? '';
      const outcome = test.outcome();
      let verdict: Verdict;
      if (outcome === 'skipped') verdict = 'skipped';
      else if (outcome === 'flaky') verdict = 'flaky';
      else if (outcome === 'expected') verdict = knownBug ? 'known-bug' : 'passed';
      else verdict = knownBug && result.status === 'passed' ? 'known-bug-fixed' : 'failed';

      const firstLine = stripAnsi(result.error?.message ?? '')
        .split('\n')
        .slice(0, 3)
        .join(' ')
        .slice(0, 400);

      return {
        project: test.parent.project()?.name ?? '',
        file: test.location.file.replace(/\\/g, '/').split('/tests/').pop() ?? '',
        title: test.title,
        verdict,
        retries: result.retry,
        durationMs: test.results.reduce((total, r) => total + r.duration, 0),
        error: redact(firstLine),
        knownBug,
      };
    });
  }
}

/** Makes text safe to put in a Markdown table cell. */
export const cell = (text: string): string => text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
