import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Platform } from 'obsidian';

export type LaunchAction =
  | { kind: 'tool'; executable: string; args?: string[] }
  | { kind: 'git'; action: 'commit-push' | 'pull'; message?: string };

export type LaunchCommand = {
  executable: string;
  args: string[];
  cwd: string;
  cleanup?: () => void;
};
export type LaunchOptions = { useWslOnWindows?: boolean; reuseExistingMacApp?: boolean };

// Data is quoted for the shell that actually consumes it, never for the host OS.
const quotePosix = (value: string): string => "'" + value.replace(/'/g, "'\\''") + "'";
const quotePowerShell = (value: string): string => "'" + value.replace(/'/g, "''") + "'";

export const getPlatformSummary = (): string => {
  if (!Platform.isDesktopApp) return 'mobile';
  return Platform.isMacOS ? 'desktop-macos' : Platform.isWin ? 'desktop-windows' : 'desktop-linux';
};

const actionCommands = (action: LaunchAction): string[][] => {
  if (action.kind === 'tool') return [[action.executable, ...(action.args ?? [])]];
  if (action.action === 'pull') return [['git', 'pull']];
  return [['git', 'add', '.'], ['git', 'commit', '-m', action.message?.trim() || 'update'], ['git', 'push']];
};

const posixScript = (cwd: string, action?: LaunchAction): string => {
  const lines = [`cd -- ${quotePosix(cwd)} || exit 1`];
  if (action) lines.push(actionCommands(action).map(args => args.map(quotePosix).join(' ')).join(' && '));
  lines.push('exec "${SHELL:-/bin/sh}"');
  return lines.join('\n');
};

const tempScript = (content: string, filename = 'launch.command'): { path: string; cleanup: () => void } => {
  const dir = mkdtempSync(join(tmpdir(), 'open-in-terminal-'));
  const path = join(dir, filename);
  try { writeFileSync(path, content, { mode: 0o700 }); }
  catch (error) { rmSync(dir, {recursive:true, force:true}); throw error; }
  return { path, cleanup: () => rmSync(dir, {recursive:true, force:true}) };
};

const buildMacLaunch = (app: string, cwd: string, action?: LaunchAction, options?: LaunchOptions): LaunchCommand => {
  const args = [options?.reuseExistingMacApp === false ? '-na' : '-a', app];
  if (!action) return {executable:'open', args:[...args,cwd], cwd};
  const script = tempScript('#!/bin/bash -l\n' + posixScript(cwd, action) + '\n');
  return {executable:'open',args:[...args,script.path],cwd,cleanup:script.cleanup};
};

// Start-Process accepts a command-line string, not an argv array. Apply Windows
// argv quoting before embedding that string as a literal in the encoded script.
const quoteWindowsArg = (value: string): string =>
  '"' + value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1') + '"';
const encodePowerShell = (script: string): string => Buffer.from(script,'utf16le').toString('base64');

// Bypass PowerShell 5.1's lossy native argv serialization. Known npm shims
// are resolved to their package bin and run with node, without cmd.exe.
const nativePowerShell = (executable: string, args: string[]): string => {
  const packages: Record<string, string> = {
    claude: '@anthropic-ai/claude-code', codex: '@openai/codex',
    gemini: '@google/gemini-cli', opencode: 'opencode-ai', copilot: '@github/copilot'
  };
  const packageName = packages[executable];
  const lines = [
    `$resolved = (Get-Command -Name ${quotePowerShell(executable)} -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source`,
    `$arguments = ${quotePowerShell(args.map(quoteWindowsArg).join(' '))}`,
    "if ([IO.Path]::GetExtension($resolved) -in @('.cmd', '.bat')) {"
  ];
  if (packageName) {
    lines.push(
      `$packageFile = Join-Path (Split-Path $resolved) ${quotePowerShell('node_modules/' + packageName + '/package.json')}`,
      "if (!(Test-Path -LiteralPath $packageFile)) { throw 'Cannot resolve this CLI shim. Install a native CLI executable or use WSL.' }",
      '$package = Get-Content -LiteralPath $packageFile -Raw | ConvertFrom-Json',
      `$bin = if ($package.bin -is [string]) { $package.bin } else { $package.bin.${executable} }`,
      "if (!$bin) { throw 'The CLI package has no matching executable.' }",
      '$entry = [IO.Path]::GetFullPath((Join-Path (Split-Path $packageFile) $bin))',
      // Windows file paths cannot contain quotes; double trailing slashes are
      // irrelevant because the resolved entry is a file, not a directory.
      '$arguments = \'"\' + $entry + \'" \' + $arguments',
      "$localNode = Join-Path (Split-Path $resolved) 'node.exe'",
      "$resolved = if (Test-Path -LiteralPath $localNode) { $localNode } else { (Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source }"
    );
  } else {
    lines.push("throw 'Batch command shims are unsupported. Use a native executable or WSL.'");
  }
  lines.push('}',
    '$info = New-Object System.Diagnostics.ProcessStartInfo',
    '$info.FileName = $resolved',
    '$info.Arguments = $arguments',
    '$info.WorkingDirectory = (Get-Location).Path',
    '$info.UseShellExecute = $false',
    '$process = [System.Diagnostics.Process]::Start($info)',
    '$process.WaitForExit()',
    '$toolExitCode = $process.ExitCode',
    '$process.Dispose()',
    'if ($toolExitCode -ne 0) { return }'
  );
  return lines.join('\n');
};

const powerShellScript = (cwd: string, action?: LaunchAction): string => {
  const lines = [`$ErrorActionPreference = 'Stop'`, `Set-Location -LiteralPath ${quotePowerShell(cwd)}`];
  if (action) for (const [executable, ...args] of actionCommands(action)) lines.push(nativePowerShell(executable,args));
  return lines.join('\n');
};

const resolveWslPath = (cwd: string): {path: string; distro?: string} | null => {
  const normalized = cwd.replace(/\\/g,'/');
  const unc = normalized.match(/^\/\/wsl(?:\.localhost|\$)\/([^/]+)(\/.*)?$/i);
  if (unc) return {distro:unc[1],path:unc[2] || '/'};
  const drive = normalized.match(/^([a-z]):\/(.*)$/i);
  if (drive) return {path:`/mnt/${drive[1].toLowerCase()}/${drive[2]}`};
  return null;
};

const buildWindowsLaunch = (app: string, cwd: string, action?: LaunchAction, options?: LaunchOptions): LaunchCommand | null => {
  let script: string;
  if (options?.useWslOnWindows) {
    const wsl = resolveWslPath(cwd);
    if (!wsl) return null;
    // wsl.exe's --exec receives bash and its arguments directly. A login shell
    // finds CLI tools installed only in the distribution's user environment.
    const args = [...(wsl.distro ? ['--distribution',wsl.distro] : []), '--cd',wsl.path,'--exec','bash','-lc',posixScript(wsl.path,action)];
    script = `$ErrorActionPreference = 'Stop'\n` + nativePowerShell('wsl.exe',args);
  } else {
    script = powerShellScript(cwd,action);
  }
  const file = tempScript('\uFEFF' + script, 'launch.ps1');
  const encoded = encodePowerShell('& ' + quotePowerShell(file.path));
  const shellArgs = ['-NoExit','-ExecutionPolicy','Bypass','-EncodedCommand',encoded];
  const name = app.replace(/\\/g,'/').split('/').pop()?.toLowerCase();
  let executable = app;
  let args: string[];
  if (name === 'powershell' || name === 'powershell.exe' || name === 'pwsh' || name === 'pwsh.exe') {
    args = shellArgs;
  } else if (name === 'wt' || name === 'wt.exe') {
    args = ['new-tab','powershell.exe',...shellArgs];
  } else if (name === 'tabby' || name === 'tabby.exe') {
    args = ['run','powershell.exe',...shellArgs];
  } else if (name === 'cmd' || name === 'cmd.exe') {
    args = ['/d','/k',`powershell.exe -ExecutionPolicy Bypass -EncodedCommand ${encoded}`];
  } else if (!action && !options?.useWslOnWindows) {
    args = [];
  } else {
    executable = 'cmd.exe';
    args = ['/d','/k',`powershell.exe -ExecutionPolicy Bypass -EncodedCommand ${encoded}`];
  }
  const start = `$ErrorActionPreference = 'Stop'\nStart-Process -FilePath ${quotePowerShell(executable)}` +
    (args.length ? ` -ArgumentList ${quotePowerShell(args.map(quoteWindowsArg).join(' '))}` : '') +
    (options?.useWslOnWindows ? '' : ` -WorkingDirectory ${quotePowerShell(cwd)}`);
  return {executable:'powershell.exe',args:['-NoProfile','-NonInteractive','-EncodedCommand',encodePowerShell(start)],cwd: options?.useWslOnWindows ? tmpdir() : cwd,cleanup:file.cleanup};
};

export const buildLaunchCommand = (terminalApp: string, cwd: string, action?: LaunchAction, options?: LaunchOptions): LaunchCommand | null => {
  const app = terminalApp.trim();
  if (!Platform.isDesktopApp || !app) return null;
  if (Platform.isMacOS) return buildMacLaunch(app,cwd,action,options);
  if (Platform.isWin) return buildWindowsLaunch(app,cwd,action,options);
  // Explicitly set the directory even for a terminal-only launch: terminal
  // server processes may otherwise reuse an unrelated working directory.
  const args = [app.includes('gnome-terminal') ? '--' : '-e','bash','-lc',posixScript(cwd,action)];
  return {executable:app,args,cwd};
};

export const buildGitProbe = (cwd: string, useWsl: boolean): LaunchCommand | null => {
  if (Platform.isWin && useWsl) {
    const wsl = resolveWslPath(cwd);
    if (!wsl) return null;
    return {executable:'wsl.exe',args:[...(wsl.distro ? ['--distribution',wsl.distro] : []), '--cd',wsl.path,'--exec','git','rev-parse','--is-inside-work-tree'],cwd:tmpdir()};
  }
  return {executable:'git',args:['rev-parse','--is-inside-work-tree'],cwd};
};
