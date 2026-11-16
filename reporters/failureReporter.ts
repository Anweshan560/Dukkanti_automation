import fs from 'node:fs';
import path from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { ResultCollector, type Row } from './results';

const OUTPUT = path.resolve(__dirname, '..', 'test-results', 'failures.md');

/**
 * Writes test-results/failures.md when something needs attention: a failure, a pass only after a retry,
 * a known bug that now passes, or a run that did not finish. CI turns that file into a GitHub issue.
 * When the run is clean the file is not written, and CI opens no issue.
 */
export default class FailureReporter implements Reporter {
  private readonly results = new ResultCollector();

  onBegin(): void {
    fs.rmSync(OUTPUT, { force: true });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.results.record(test, result);
  }

  onEnd(result: FullResult): void {
    const rows = this.results.rows();
    const failed = rows.filter((row) => row.verdict === 'failed');
    const flaky = rows.filter((row) => row.verdict === 'flaky');
    const fixed = rows.filter((row) => row.verdict === 'known-bug-fixed');
    const unfinished = result.status === 'interrupted' || result.status === 'timedout';
    if (!failed.length && !flaky.length && !fixed.length && !unfinished) return;

    const list = (title: string, items: Row[], detail: (row: Row) => string): string[] =>
      items.length
        ? [
            `### ${title} (${items.length})`,
            '',
            ...items.map((row) => `- **[${row.project}] ${row.file} › ${row.title}**\n  ${detail(row)}`),
            '',
          ]
        : [];

    const lines = [
      `Run status: **${result.status}**`,
      unfinished ? '\nThe run was cancelled or hit the global timeout, so some tests did not run.\n' : '',
      ...list('Failed', failed, (row) => `\`${row.error || 'no error message'}\``),
      ...list('Passed only after a retry', flaky, (row) => `Passed on retry ${row.retries}.`),
      ...list('Known bug now passing', fixed, (row) => `${row.knownBug}. Remove the knownBug marker.`),
    ];

    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${lines.join('\n')}\n`);
  }

  printsToStdio(): boolean {
    return false;
  }
}
