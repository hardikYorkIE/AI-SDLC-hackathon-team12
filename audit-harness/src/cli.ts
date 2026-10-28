import { HELP, parseCliArgs } from './cli/parseArgs.ts';
import { runEval } from './eval/runEval.ts';
import { runAudit } from './runner/AuditRunner.ts';

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.message);
    console.error(HELP);
    process.exitCode = 2;
    return;
  }
  if (parsed.value.command === 'help') {
    console.log(HELP);
    return;
  }
  if (parsed.value.command === 'eval') {
    const result = await runEval({ base: parsed.value.base, heuristic: parsed.value.heuristic });
    if (!result.pass) process.exitCode = 1;
    return;
  }

  const result = await runAudit({
    url: parsed.value.url ?? '',
    mode: parsed.value.command === 'capture' ? 'capture' : 'audit',
    fixPath: parsed.value.fixPath,
    beforeRunId: parsed.value.before,
    heuristic: parsed.value.heuristic,
    ollama: parsed.value.ollama,
  });
  console.log(`Run ${result.record.id}`);
  console.log(`Report ${result.reportPath}`);
  if (result.record.gate) {
    const gate = result.record.gate;
    console.log(
      `Gate ${gate.pass ? 'PASS' : 'FAIL'} score ${result.record.summary.score} critical ${result.record.summary.critical}`,
    );
    if (!gate.pass && gate.blockedBy.length) console.log(`Blocked by ${gate.blockedBy.join(', ')}`);
  }
  if (parsed.value.command === 'gate' && result.record.gate && !result.record.gate.pass) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
