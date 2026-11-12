import { evalHelp, parseEvalArgs, runEvaluation } from '../src/evals/runner';
import { createEvalWorkspace } from '../tests/evals/helpers/workspace';

async function main(): Promise<void> {
  const parsed = parseEvalArgs(process.argv.slice(2));
  if ('help' in parsed) {
    process.stdout.write(evalHelp());
    return;
  }
  const result = await runEvaluation(parsed, {
    createWorkspace: (fixtureName) => createEvalWorkspace(fixtureName),
  });
  process.stdout.write(
    'Evaluation complete: ' + result.measuredCases + ' measured cases; model digest ' +
    (result.modelDigest ?? 'unknown') + '.\nResults: ' + result.outputPath + '\n',
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write('Evaluation failed: ' + message + '\n');
  process.exitCode = 1;
});
