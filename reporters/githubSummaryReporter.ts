import fs from 'node:fs';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { cell, ResultCollector, type Row, type Verdict } from './results';

const COLUMNS: Verdict[] = ['passed', 'failed', 'flaky', 'known-bug', 'known-bug-fixed', 'skipped'];

/**
 * Writes a results table to the GitHub Actions run page (the "Summary" tab).
 * Does nothing outside GitHub Actions. Runs even when the run was cancelled or timed out.
 */
export default class GithubSummaryReporter implements Reporter {
  private readonly results = new ResultCollector();

  onTestEnd(test: TestCase, result: TestResult): void {
    this.results.record(test, result);
  }

  onEnd(result: FullResult): void {
    const target = process.env.GITHUB_STEP_SUMMARY;
    if (!target) return;
    fs.appendFileSync(target, this.render(this.results.rows(), result));
  }

  printsToStdio(): boolean {
    return false;
  }

  private render(rows: Row[], result: FullResult): string {
    const projects = [...new Set(rows.map((row) => row.project))];
    const count = (project: string, verdict: Verdict): number =>
      rows.filter((row) => row.project === project && row.verdict === verdict).length;

    const lines = [
      `## Test results: ${result.status}`,
      '',
      result.status === 'interrupted' || result.status === 'timedout'
        ? `> The run was **${result.status === 'timedout' ? 'stopped by the global timeout' : 'cancelled'}** before every test finished. The numbers below cover only the tests that ran.\n`
        : '',
      `| Project | ${COLUMNS.join(' | ')} |`,
      `| --- | ${COLUMNS.map(() => '---:').join(' | ')} |`,
      ...projects.map((project) => `| ${project} | ${COLUMNS.map((v) => count(project, v)).join(' | ')} |`),
      '',
      `Duration: ${Math.round(result.duration / 1000)}s`,
      '',
    ];

    const section = (title: string, verdicts: Verdict[], detail: (row: Row) => string): void => {
      const matching = rows.filter((row) => verdicts.includes(row.verdict));
      if (!matching.length) return;
      lines.push(`### ${title}`, '', '| Project | Test | Detail |', '| --- | --- | --- |');
      for (const row of matching) {
        lines.push(`| ${row.project} | ${cell(`${row.file} › ${row.title}`)} | ${cell(detail(row))} |`);
      }
      lines.push('');
    };

    section('Failed', ['failed'], (row) => row.error);
    section('Passed only after a retry', ['flaky'], (row) => `passed on retry ${row.retries}`);
    section('Known bug now passing: remove the knownBug marker', ['known-bug-fixed'], (row) => row.knownBug);
    section('Failing because of a known app bug', ['known-bug'], (row) => row.knownBug);

    return `${lines.join('\n')}\n`;
  }
}
