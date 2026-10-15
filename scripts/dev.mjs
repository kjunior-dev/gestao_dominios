import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const executable = process.platform === 'win32' ? 'node.exe' : 'node';
const candidates = new Set(
  [
    process.env.DEVTRUST_NODE_PATH,
    process.execPath,
    process.env.npm_node_execpath,
    ...(process.env.PATH || '')
      .split(path.delimiter)
      .filter(Boolean)
      .map((directory) => path.join(directory, executable)),
    '/usr/local/bin/node',
    '/opt/homebrew/bin/node',
  ].filter(Boolean),
);

let selected;
let version;
for (const candidate of candidates) {
  const result = spawnSync(candidate, ['--version'], {
    encoding: 'utf8',
    timeout: 2000,
  });
  const match =
    result.status === 0 && /^v(\d+)\.(\d+)\.(\d+)\s*$/.exec(result.stdout);
  if (match && Number(match[1]) === 22 && Number(match[2]) >= 14) {
    selected = candidate;
    version = match[0].trim();
    break;
  }
}
if (!selected) {
  console.error(
    'Node 22.14+ não foi encontrado. Instale Node 22 ou defina DEVTRUST_NODE_PATH com o caminho do executável Node 22.',
  );
  process.exit(1);
}

const env = {
  ...process.env,
  PATH: path.dirname(selected) + path.delimiter + (process.env.PATH || ''),
  npm_node_execpath: selected,
  NODE: selected,
};
console.log(`DevTrust: a usar Node ${version} (${selected}).`);
// This option verifies the runtime inherited by commands without starting services.
if (process.argv.includes('--runtime-check')) {
  const result = spawnSync(executable, ['--version'], {
    env,
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
}

const child = spawn(
  selected,
  [
    require.resolve('dotenv-cli/cli.js'),
    '-e',
    '.env',
    '--',
    'sh',
    '-c',
    'node scripts/check-dev.mjs && turbo run dev',
  ],
  { cwd: root, env, stdio: 'inherit' },
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill(signal));
child.on('error', () => {
  console.error('Não foi possível iniciar o ambiente de desenvolvimento.');
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode =
    code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1);
});
