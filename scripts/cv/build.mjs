import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const defaultRootDir = resolve(dirname(scriptPath), '..', '..');

export async function runCvBuild({
  rootDir = defaultRootDir,
  nodePath = process.execPath,
  platform = process.platform,
  spawnProcess = spawn
} = {}) {
  const commands = [
    [nodePath, ['scripts/cv/prepare.mjs'], false],
    ['bundle', ['exec', 'jekyll', 'build'], platform === 'win32'],
    [nodePath, ['scripts/cv/artifacts.mjs'], false]
  ];

  for (const [command, args, shell] of commands) {
    const exitCode = await runCommand(spawnProcess, command, args, rootDir, shell);
    if (exitCode !== 0) return exitCode;
  }
  return 0;
}

function runCommand(spawnProcess, command, args, cwd, shell) {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawnProcess(command, args, {
      cwd,
      stdio: 'inherit',
      shell,
      windowsHide: true
    });
    child.once('error', rejectCommand);
    child.once('close', (code, signal) => {
      if (signal) {
        rejectCommand(new Error(`${command} terminated by signal ${signal}.`));
        return;
      }
      resolveCommand(code ?? 1);
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  process.exitCode = await runCvBuild();
}
