import { spawn } from 'child_process';

import { FileSystemAdapter, Modal, Notice, Plugin } from 'obsidian';

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

      if (target.id === 'git-commit-push') {
        this.addCommand({
          id: target.id,
          name: target.commandName,
          callback: () => this.runGitCommitPush()
        });
        this.registeredCommandIds.add(`${this.manifest.id}:${target.id}`);
        continue;
      }

      if (target.id === 'git-pull') {
        this.addCommand({
          id: target.id,
          name: target.commandName,
          callback: () => this.runGitPull()
        });
        this.registeredCommandIds.add(`${this.manifest.id}:${target.id}`);
        continue;
      }

      this.addCommand({
        id: target.id,
        name: target.commandName,
        callback: () =>
          this.runLaunchCommand(
            () => this.composeLaunchCommand(target.toolCommand),
            target.commandName
          )
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

    const message = await this.promptCommitMessage();
    if (!message) {
      return;
    }

    const escapedMessage = message.replace(/"/g, '\\"');
    const gitCommand = `git add . && git commit -m "${escapedMessage}" && git push`;

    this.runLaunchCommand(
      () => this.composeLaunchCommand(gitCommand),
      'Git: commit and push'
    );
  }

  private async runGitPull() {
    const isGitRepo = await this.checkGitRepo();
    if (!isGitRepo) {
      new Notice('Not a Git repository');
      return;
    }

    const gitCommand = 'git pull';
    this.runLaunchCommand(() => this.composeLaunchCommand(gitCommand), 'Git: pull');
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
        shell: true,
        stdio: 'ignore'
      });
      child.on('close', (code) => resolve(code === 0));
      child.on('error', () => resolve(false));
    });
  }

  private async promptCommitMessage(): Promise<string | null> {
    return new Promise((resolve) => {
      const modal = new Modal(this.app);
      modal.titleEl.setText('Git commit message');

      const inputEl = modal.contentEl.createEl('input', {
        type: 'text',
        value: this.settings.defaultCommitMessage
      });
      inputEl.setCssProps({
        width: '100%',
        marginBottom: '10px'
      });
      inputEl.select();

      const buttonContainer = modal.contentEl.createDiv();
      buttonContainer.setCssProps({
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '8px'
      });

      const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
      const commitBtn = buttonContainer.createEl('button', {
        text: 'Commit and push',
        cls: 'mod-cta'
      });

      cancelBtn.onclick = () => {
        modal.close();
        resolve(null);
      };

      commitBtn.onclick = () => {
        const message = inputEl.value.trim();
        if (message) {
          modal.close();
          resolve(message);
        } else {
          new Notice('Commit message cannot be empty');
        }
      };

      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          commitBtn.click();
        } else if (e.key === 'Escape') {
          cancelBtn.click();
        }
      });

      modal.open();
      inputEl.focus();
    });
  }
}
