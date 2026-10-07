import { spawn } from 'child_process';
import { FileSystemAdapter, Notice, Platform, Plugin } from 'obsidian';

import { buildNotePrompt, promptArguments } from './note-context';
import { buildGitProbe, buildLaunchCommand, getPlatformSummary, type LaunchAction, type LaunchCommand } from './launcher';
import { logger } from './logger';
import {
  DEFAULT_SETTINGS,
  getCurrentTerminalApp,
  normalizeSettings,
  type OpenInTerminalSettings
} from './settings';
import { OpenInTerminalSettingTab } from './settings-tab';
import { resolveLaunchPath } from './paths';
import { isTargetEnabled, launchTargets } from './targets';

const TEMP_SCRIPT_CLEANUP_DELAY_MS = 30_000;


export default class OpenInTerminalPlugin extends Plugin {
  private registeredCommandIds = new Set<string>();
  pluginSettings: OpenInTerminalSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new OpenInTerminalSettingTab(this.app, this));
    this.refreshCommands();
  }

  refreshCommands() {
    for (const target of launchTargets) {
      if (this.registeredCommandIds.has(target.id)) continue;
      this.addCommand({
        id: target.id,
        name: target.commandName,
        checkCallback: (checking) => {
          if (!isTargetEnabled(this.pluginSettings, target)) return false;
          if (checking) return true;
          if (target.action === 'git') {
            if (target.gitAction === 'commit-push') void this.runGitCommitPush();
            else void this.runGitPull();
          } else {
            this.runLaunchCommand(() => {
              const prompt = buildNotePrompt(this.pluginSettings, this.app.workspace.getActiveFile()?.path);
              const action: LaunchAction | undefined = target.toolCommand
                ? { kind: 'tool', executable: target.toolCommand, args: promptArguments(target.toolCommand, prompt) }
                : undefined;
              return this.composeLaunchCommand(action);
            }, target.commandName);
          }
          return true;
        }
      });
      this.registeredCommandIds.add(target.id);
    }
  }

  private composeLaunchCommand(action?: LaunchAction, useVaultRoot = false): LaunchCommand | null {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      return null;
    }
    const vaultPath = adapter.getBasePath();
    const launchPath = useVaultRoot ? vaultPath : this.getLaunchPath(vaultPath);
    const terminalApp = getCurrentTerminalApp(this.pluginSettings.terminalApp);
    const launchCommand = buildLaunchCommand(terminalApp, launchPath, action, {
      useWslOnWindows: this.pluginSettings.enableWslOnWindows,
      reuseExistingMacApp: this.pluginSettings.reuseExistingMacApp
    });
    logger.log('Compose launch command', {
      platform: getPlatformSummary(),
      terminalApp,
      action,
      vaultPath,
      launchPath,
      launchCommand
    });
    return launchCommand;
  }

  private getLaunchPath(vaultPath: string): string {
    const activeFile = this.app.workspace.getActiveFile();
    return resolveLaunchPath(
      vaultPath,
      this.pluginSettings.openAtCurrentNoteFolder,
      activeFile?.parent?.path
    );
  }

  private runLaunchCommand(buildCommand: () => LaunchCommand | null, label: string) {
    let launchCommand: LaunchCommand | null;
    try { launchCommand = buildCommand(); }
    catch (error) {
      console.error('[open-in-terminal] Failed to prepare launch', error);
      new Notice(`Failed to prepare ${label}. Check the developer console for details.`);
      return;
    }
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
    const workingDirectory = launchCommand.cwd ?? vaultPath;

    try {
      logger.log('Spawning command', {
        label,
        executable: launchCommand.executable,
        vaultPath,
        workingDirectory
      });
      const child = spawn(launchCommand.executable, launchCommand.args, {
        cwd: workingDirectory,
        shell: false,
        // A detached Windows PowerShell can exit 0 without executing its script.
        detached: !Platform.isWin,
        windowsHide: true,
        stdio: 'ignore'
      });
      child.on('error', (error) => {
        console.error(`[open-in-terminal] Failed to run '${launchCommand.executable}':`, error);
        new Notice(`Failed to run ${label}. Check the developer console for details.`);
      });
      child.on('exit', (code) => {
        if (code !== null && code !== 0) {
          new Notice(`Failed to run ${label} (exit ${code}). Check the terminal application setting.`);
        }
      });
      child.unref();
      logger.log('Spawned command successfully', { label });
    } catch (error) {
      console.error(`[open-in-terminal] Unexpected error for '${launchCommand.executable}':`, error);
      new Notice(`Failed to run ${label}. Check the developer console for details.`);
    } finally {
      if (launchCommand.cleanup) {
        const cleanup = launchCommand.cleanup;
        window.setTimeout(() => {
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
    this.pluginSettings = normalizeSettings(await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.pluginSettings);
    this.refreshCommands();
  }

  private async runGitCommitPush() {
    const isGitRepo = await this.checkGitRepo();
    if (!isGitRepo) {
      new Notice('Not a Git repository');
      return;
    }

    const gitCommand: LaunchAction = { kind: 'git', action: 'commit-push', message: this.pluginSettings.defaultCommitMessage };
    this.runLaunchCommand(() => this.composeLaunchCommand(gitCommand, true), 'Git: commit and push');
  }

  private async runGitPull() {
    const isGitRepo = await this.checkGitRepo();
    if (!isGitRepo) {
      new Notice('Not a Git repository');
      return;
    }

    this.runLaunchCommand(() => this.composeLaunchCommand({ kind: 'git', action: 'pull' }, true), 'Git: pull');
  }

  private async checkGitRepo(): Promise<boolean> {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      return false;
    }
    const vaultPath = adapter.getBasePath();

    const probe = buildGitProbe(vaultPath, this.pluginSettings.enableWslOnWindows);
    if (!probe) return false;
    return new Promise((resolve) => {
      const child = spawn(probe.executable, probe.args, {
        cwd: probe.cwd,
        stdio: 'ignore'
      });
      child.on('close', (code) => resolve(code === 0));
      child.on('error', () => resolve(false));
    });
  }

}
