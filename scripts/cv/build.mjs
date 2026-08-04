import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeBasePath } from './artifacts.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const defaultRootDir = resolve(dirname(scriptPath), '..', '..');

export async function runCvBuild({
  rootDir = defaultRootDir,
  nodePath = process.execPath,
  platform = process.platform,
  spawnProcess = spawn,
  processTarget = process,
  terminateChild = terminateActiveChild,
  environment = process.env,
  basePath = environment.PAGES_BASE_PATH ?? ''
} = {}) {
  const normalizedBasePath = normalizeBasePath(basePath);
  const jekyllBasePathArgs = normalizedBasePath ? ['--baseurl', normalizedBasePath] : [];
  const artifactBasePathArgs = normalizedBasePath ? ['--base-path', normalizedBasePath] : [];
  const commands = [
    [nodePath, ['scripts/cv/prepare.mjs'], false],
    ['bundle', ['exec', 'jekyll', 'build', ...jekyllBasePathArgs], platform === 'win32'],
    [nodePath, ['scripts/cv/artifacts.mjs', ...artifactBasePathArgs], false]
  ];

  let activeChild;
  let receivedSignal;
  let terminationRequested = false;
  const requestTermination = (signal) => {
    if (receivedSignal) return;
    receivedSignal = signal;
    if (activeChild && !terminationRequested) {
      terminationRequested = true;
      terminateChild(activeChild, signal, platform);
    }
  };
  const onSigint = () => requestTermination('SIGINT');
  const onSigterm = () => requestTermination('SIGTERM');

  processTarget.on('SIGINT', onSigint);
  processTarget.on('SIGTERM', onSigterm);
  try {
    for (const [command, args, shell] of commands) {
      const outcome = await runCommand(
        spawnProcess,
        command,
        args,
        rootDir,
        shell,
        environment,
        (child) => {
          activeChild = child;
          if (receivedSignal && !terminationRequested) {
            terminationRequested = true;
            terminateChild(activeChild, receivedSignal, platform);
          }
        }
      );
      activeChild = undefined;
      if (receivedSignal) return signalExitCode(receivedSignal);
      if (outcome.code !== 0) return outcome.code;
    }
    return 0;
  } finally {
    processTarget.off('SIGINT', onSigint);
    processTarget.off('SIGTERM', onSigterm);
  }
}

function runCommand(spawnProcess, command, args, cwd, shell, environment, onStart) {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawnProcess(command, args, {
      cwd,
      env: environment,
      stdio: 'inherit',
      shell,
      windowsHide: true
    });
    onStart(child);
    child.once('error', rejectCommand);
    child.once('close', (code, signal) => {
      resolveCommand({ code: code ?? (signal ? signalExitCode(signal) : 1), signal });
    });
  });
}

function terminateActiveChild(child, signal, platform) {
  if (child.exitCode !== undefined && child.exitCode !== null) return;
  if (platform === 'win32') child.kill();
  else child.kill(signal);
}

function signalExitCode(signal) {
  return signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  process.exitCode = await runCvBuild();
}
