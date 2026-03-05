import { spawn } from 'child_process';

import { FileSystemAdapter, Notice, Platform, Plugin } from 'obsidian';

import { resolveCommandManager } from './command-manager';
import { buildLaunchCommand, getPlatformSummary, type LaunchCommand } from './launcher';
import { logger } from './logger';
import {
  DEFAULT_SETTINGS,
  getCurrentTerminalApp,
  normalizeSettings,
  type OpenInTerminalSettings
} from './settings';
import { OpenInTerminalSettingTab } from './settings-tab';
import { isTargetEnabled, launchTargets } from './targets';

const TEMP_SCRIPT_CLEANUP_DELAY_MS = 30_000;

export default class OpenInTerminalPlugin extends Plugin {
  private registeredCommandIds = new Set<string>();
  settings: OpenInTerminalSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new OpenInTerminalSettingTab(this.app, this));
    this.refreshCommands();
  }

  refreshCommands() {
    const commandManager = resolveCommandManager(this.app);

    if (commandManager) {
      for (const fullId of this.registeredCommandIds) {
        if (commandManager.findCommand(fullId)) {
          commandManager.removeCommand(fullId);
        }
      }
    }
    this.registeredCommandIds.clear();

    for (const target of launchTargets) {
      if (!isTargetEnabled(this.settings, target)) {
        continue;
      }

      this.addCommand({
        id: target.id,
        name: target.commandName,
        callback: () => {
          if (target.action === 'git') {
            if (target.gitAction === 'commit-push') {
              void this.runGitCommitPush();
              return;
            }
            void this.runGitPull();
            return;
          }

          this.runLaunchCommand(
            () => this.composeLaunchCommand(target.toolCommand),
            target.commandName
          );
        }
      });
      this.registeredCommandIds.add(`${this.manifest.id}:${target.id}`);
    }
  }

  private composeLaunchCommand(toolCommand?: string): LaunchCommand | null {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      return null;
    }
    const vaultPath = adapter.getBasePath();
    const terminalApp = getCurrentTerminalApp(this.settings.terminalApp);
    const launchCommand = buildLaunchCommand(terminalApp, vaultPath, toolCommand, {
      useWslOnWindows: this.settings.enableWslOnWindows
    });
    logger.log('Compose launch command', {
      platform: getPlatformSummary(),
      terminalApp,
      toolCommand,
      vaultPath,
      launchCommand
    });
    return launchCommand;
  }

  private runLaunchCommand(buildCommand: () => LaunchCommand | null, label: string) {
    const launchCommand = buildCommand();
    if (!launchCommand) {
      new Notice(
        `Unable to run ${label}. Check the open in terminal settings for the terminal application name.`
      );
      return;
    }
    this.executeShellCommand(launchCommand, label);
  }

  private executeShellCommand(launchCommand: LaunchCommand, label: string) {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      new Notice('File system adapter not available. This plugin works only on desktop.');
      return;
    }

    const vaultPath = adapter.getBasePath();

    try {
      logger.log('Spawning command', { label, command: launchCommand.command, vaultPath });
      const child = spawn(launchCommand.command, {
        cwd: vaultPath,
        shell: true,
        detached: true,
        stdio: 'ignore'
      });
      child.on('error', (error) => {
        console.error(`[open-in-terminal] Failed to run '${launchCommand.command}':`, error);
        new Notice(`Failed to run ${label}. Check the developer console for details.`);
      });
      child.unref();
      logger.log('Spawned command successfully', { label });
    } catch (error) {
      console.error(`[open-in-terminal] Unexpected error for '${launchCommand.command}':`, error);
      new Notice(`Failed to run ${label}. Check the developer console for details.`);
    } finally {
      if (launchCommand.cleanup) {
        const cleanup = launchCommand.cleanup;
        setTimeout(() => {
          try {
            cleanup();
          } catch (error) {
            console.warn('[open-in-terminal] Cleanup after command failed', error);
          }
        }, TEMP_SCRIPT_CLEANUP_DELAY_MS);
      }
    }
  }

  async loadSettings() {
    this.settings = normalizeSettings(await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.refreshCommands();
  }

  private async runGitCommitPush() {
    const isGitRepo = await this.checkGitRepo();
    if (!isGitRepo) {
      new Notice('Not a Git repository');
      return;
    }

    const gitCommand = this.buildGitCommitPushCommand();
    this.runLaunchCommand(() => this.composeLaunchCommand(gitCommand), 'Git: commit and push');
  }

  private async runGitPull() {
    const isGitRepo = await this.checkGitRepo();
    if (!isGitRepo) {
      new Notice('Not a Git repository');
      return;
    }

    this.runLaunchCommand(() => this.composeLaunchCommand('git pull'), 'Git: pull');
  }

  private async checkGitRepo(): Promise<boolean> {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      return false;
    }
    const vaultPath = adapter.getBasePath();

    return new Promise((resolve) => {
      const child = spawn('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: vaultPath,
        stdio: 'ignore'
      });
      child.on('close', (code) => resolve(code === 0));
      child.on('error', () => resolve(false));
    });
  }

  private buildGitCommitPushCommand(): string {
    const normalized = this.settings.defaultCommitMessage.replace(/[\r\n]+/g, ' ').trim() || 'update';
    const escaped = this.escapeCommitMessageForShell(normalized);
    return `git add . && git commit -m "${escaped}" && git push`;
  }

  private escapeCommitMessageForShell(message: string): string {
    if (Platform.isWin) {
      return message
        .replace(/\^/g, '^^')
        .replace(/"/g, '""')
        .replace(/%/g, '%%')
        .replace(/!/g, '^^!');
    }

    return message
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
      .replace(/`/g, '\\`');
  }
}
