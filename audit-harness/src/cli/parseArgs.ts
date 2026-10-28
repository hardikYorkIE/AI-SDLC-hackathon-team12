export type CliCommand = 'capture' | 'audit' | 'gate' | 'eval' | 'help';

export interface CliRequest {
  command: CliCommand;
  url?: string;
  fixPath?: string;
  before?: string;
  base: string;
  heuristic: boolean;
  ollama: boolean;
}

export type ParseResult = { ok: true; value: CliRequest } | { ok: false; message: string };

const COMMANDS = new Set<CliCommand>(['capture', 'audit', 'gate', 'eval', 'help']);

export function parseCliArgs(argv: string[]): ParseResult {
  const flags = new Map<string, string | true>();
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') {
      flags.set('help', true);
      continue;
    }
    if (arg === '--no-heuristic') {
      flags.set('heuristic', 'false');
      continue;
    }
    if (arg === '--heuristic') {
      flags.set('heuristic', 'true');
      continue;
    }
    if (arg === '--ollama') {
      flags.set('ollama', true);
      continue;
    }
    if (arg.startsWith('--')) {
      const [key, inline] = splitFlag(arg.slice(2));
      if (inline !== undefined) {
        flags.set(key, inline);
        continue;
      }
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) return { ok: false, message: `Missing value for --${key}` };
      flags.set(key, next);
      i += 1;
      continue;
    }
    positionals.push(arg);
  }

  if (flags.get('help') === true || positionals.length === 0) {
    return { ok: true, value: { command: 'help', base: 'http://localhost:5173', heuristic: true, ollama: false } };
  }

  const command = positionals[0] as CliCommand;
  if (!COMMANDS.has(command)) return { ok: false, message: `Unknown command "${positionals[0]}"` };
  const heuristic = flags.get('heuristic') !== 'false';
  const request: CliRequest = {
    command,
    url: stringFlag(flags, 'url'),
    fixPath: stringFlag(flags, 'fix'),
    before: stringFlag(flags, 'before'),
    base: stringFlag(flags, 'base') ?? 'http://localhost:5173',
    heuristic,
    ollama: flags.get('ollama') === true,
  };
  if ((command === 'audit' || command === 'gate' || command === 'capture') && !request.url) {
    return { ok: false, message: 'Missing --url' };
  }
  return { ok: true, value: request };
}

export const HELP = `UI/UX audit harness

  audit capture --url http://localhost:5173/broken-checkout
  audit audit   --url http://localhost:5173/broken-checkout [--fix file.json] [--before run_id] [--ollama] [--no-heuristic]
  audit gate    --url http://localhost:5173/good-landing [--fix file.json]
  audit eval    [--base http://localhost:5173]

Gate exits 0 when score >= 80 and critical findings are 0. Low-confidence notes do not affect the score.
Only localhost, 127.0.0.1, and ::1 are allowed.`;

function splitFlag(body: string): [string, string | undefined] {
  const index = body.indexOf('=');
  if (index === -1) return [body, undefined];
  return [body.slice(0, index), body.slice(index + 1)];
}

function stringFlag(flags: Map<string, string | true>, key: string): string | undefined {
  const value = flags.get(key);
  return typeof value === 'string' ? value : undefined;
}
