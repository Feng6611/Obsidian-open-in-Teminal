import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { Platform } from 'obsidian';

import { logger } from './logger';

export type LaunchCommand = {
  command: string;
  cleanup?: () => void;
};

const sanitizeTerminalApp = (value: string): string => value.trim();

const escapeDoubleQuotes = (value: string): string => value.replace(/"/g, '\\"');

export const getPlatformSummary = (): string => {
  if (Platform.isDesktopApp) {
    if (Platform.isMacOS) {
      return 'desktop-macos';
    }
    if (Platform.isWin) {
      return 'desktop-windows';
    }
    if (Platform.isLinux) {
      return 'desktop-linux';
    }
    return 'desktop-unknown';
  }
  if (Platform.isMobileApp) {
    if (Platform.isIosApp) {
      return 'mobile-ios';
    }
    if (Platform.isAndroidApp) {
      return 'mobile-android';
    }
    return 'mobile-unknown';
  }
  return 'unknown';
};

const ensureTempScript = (content: string): { path: string; cleanup: () => void } => {
  const dir = mkdtempSync(join(tmpdir(), 'open-in-terminal-'));
  const filePath = join(dir, 'launch.command');
  logger.log('Creating temp script', { dir, filePath });
  writeFileSync(filePath, content, { mode: 0o755 });
  const cleanup = () => {
    try {
      rmSync(dir, { recursive: true, force: true });
      logger.log('Cleaned temp script', dir);
    } catch (error) {
      console.warn('[open-in-terminal] Failed to remove temp script', error);
    }
  };
  return { path: filePath, cleanup };
};

const buildMacLaunch = (
  terminalApp: string,
  vaultPath: string,
  toolCommand?: string
): LaunchCommand | null => {
  const app = sanitizeTerminalApp(terminalApp);
  if (!app) {
    return null;
  }

  if (!toolCommand) {
    const escapedApp = escapeDoubleQuotes(app);
    const escapedPath = escapeDoubleQuotes(vaultPath);
    const command = `open -na "${escapedApp}" "${escapedPath}"`;
    logger.log('macOS simple launch', { app, command, vaultPath });
    return { command };
  }

  const escapedVaultPath = escapeDoubleQuotes(vaultPath);
  const scriptLines = ['#!/bin/bash', `cd "${escapedVaultPath}"`];
  if (toolCommand) {
    scriptLines.push(toolCommand);
  }
  scriptLines.push('exec "$SHELL"');
  const { path, cleanup } = ensureTempScript(scriptLines.join('\n'));
  const command = `open -na "${escapeDoubleQuotes(app)}" "${path}"`;
  logger.log('macOS script launch', { app, command, script: path, toolCommand });
  return { command, cleanup };
};

const buildWindowsLaunch = (
  terminalApp: string,
  vaultPath: string,
  toolCommand?: string
): LaunchCommand | null => {
  const app = sanitizeTerminalApp(terminalApp);
  if (!app) {
    return null;
  }

  const escapedVault = vaultPath.replace(/"/g, '"');
  const cdCommand = `cd /d "${escapedVault}"`;
  const tool = toolCommand ? ` && ${toolCommand}` : '';

  const lowerApp = app.toLowerCase();

  if (lowerApp === 'cmd.exe' || lowerApp === 'cmd') {
    const command = toolCommand
      ? `start "" cmd.exe /K "${cdCommand}${tool}"`
      : `start "" cmd.exe /K "${cdCommand}"`;
    logger.log('Windows launch (cmd.exe)', { command, toolCommand, vaultPath });
    return { command };
  }

  if (lowerApp === 'powershell' || lowerApp === 'powershell.exe') {
    if (!toolCommand) {
      const command = `start "" powershell -NoExit -Command "Set-Location '${vaultPath.replace(
        /'/g,
        "''"
      )}';"`;
      logger.log('Windows launch (powershell)', { command, toolCommand, vaultPath });
      return { command };
    }
    const command = `start "" powershell -NoExit -Command "Set-Location '${vaultPath.replace(
      /'/g,
      "''"
    )}'; ${toolCommand}"`;
    logger.log('Windows launch (powershell tool)', { command, toolCommand, vaultPath });
    return { command };
  }

  if (lowerApp === 'wt.exe' || lowerApp === 'wt') {
    const command = toolCommand
      ? `start "" wt.exe new-tab cmd /K "${cdCommand}${tool}"`
      : `start "" wt.exe new-tab cmd /K "${cdCommand}"`;
    logger.log('Windows launch (wt)', { command, toolCommand, vaultPath });
    return { command };
  }

  if (!toolCommand) {
    const command = `start "" "${app}"`;
    logger.log('Windows launch (generic simple)', { command, vaultPath });
    return { command };
  }

  const command = `start "" cmd.exe /K "${cdCommand}${tool}"`;
  logger.log('Windows launch (generic tool fallback)', { command, app, toolCommand, vaultPath });
  return { command };
};

const buildUnixLaunch = (terminalApp: string, toolCommand?: string): LaunchCommand | null => {
  const app = sanitizeTerminalApp(terminalApp);
  if (!app) {
    return null;
  }

  if (!toolCommand) {
    const command = `${app}`;
    logger.log('Unix launch (simple)', { command });
    return { command };
  }

  const shellCommand = `cd "$PWD"; ${toolCommand}; exec "$SHELL"`;

  if (app.includes('gnome-terminal')) {
    const command = `${app} -- bash -lc "${shellCommand}"`;
    logger.log('Unix launch (gnome-terminal)', { command, toolCommand });
    return { command };
  }

  if (app.includes('konsole')) {
    const command = `${app} -e bash -lc "${shellCommand}"`;
    logger.log('Unix launch (konsole)', { command, toolCommand });
    return { command };
  }

  const command = `${app} -e bash -lc "${shellCommand}"`;
  logger.log('Unix launch (generic tool)', { command, toolCommand });
  return { command };
};

export const buildLaunchCommand = (
  terminalApp: string,
  vaultPath: string,
  toolCommand?: string
): LaunchCommand | null => {
  if (!Platform.isDesktopApp) {
    return null;
  }
  if (Platform.isMacOS) {
    return buildMacLaunch(terminalApp, vaultPath, toolCommand);
  }
  if (Platform.isWin) {
    return buildWindowsLaunch(terminalApp, vaultPath, toolCommand);
  }
  return buildUnixLaunch(terminalApp, toolCommand);
};
