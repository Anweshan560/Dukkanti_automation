/**
 * Runs everything the daily regression runs, in the same order:
 * typecheck, cleanup of old test data, then all UI and API tests.
 *
 *   npm run test:all
 */
import { spawnSync } from 'node:child_process';

const steps: { name: string; command: string; mustPass: boolean }[] = [
  { name: 'Typecheck', command: 'npx tsc --noEmit', mustPass: true },
  // A failed cleanup should not stop the regression from running.
  { name: 'Clean up old test data', command: 'npx playwright test --project=cleanup', mustPass: false },
  {
    name: 'UI and API tests',
    command: 'npx playwright test --project=ui --project=api --project=customer',
    mustPass: true,
  },
];

let exitCode = 0;
for (const step of steps) {
  console.log(`\n=== ${step.name} ===`);
  const result = spawnSync(step.command, { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.log(`"${step.name}" failed (exit code ${result.status}).`);
    if (step.mustPass) exitCode = result.status ?? 1;
    if (step.name === 'Typecheck') break;
  }
}
process.exit(exitCode);
