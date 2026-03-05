import { App, Platform, Plugin, PluginSettingTab, Setting } from 'obsidian';

import {
  defaultTerminalApp,
  getCurrentTerminalApp,
  OpenInTerminalSettings,
  setCurrentTerminalApp
} from './settings';
import { optionalLaunchTargets } from './targets';

type SettingsHost = Plugin & {
  settings: OpenInTerminalSettings;
  saveSettings: () => Promise<void>;
};

export class OpenInTerminalSettingTab extends PluginSettingTab {
  plugin: SettingsHost;

  constructor(app: App, plugin: SettingsHost) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName('Terminal integration').setHeading();

    new Setting(containerEl)
      .setName('Terminal application name')
      .setDesc(
        'Enter the command line app to launch, such as the default shell or a custom executable path.'
      )
      .addText((text) =>
        text
          .setPlaceholder(defaultTerminalApp())
          .setValue(getCurrentTerminalApp(this.plugin.settings.terminalApp))
          .onChange(async (value) => {
            this.plugin.settings.terminalApp = setCurrentTerminalApp(
              this.plugin.settings.terminalApp,
              value
            );
            await this.plugin.saveSettings();
          })
      );

    if (Platform.isWin) {
      new Setting(containerEl)
        .setName('Use WSL for commands')
        .setDesc('Run commands inside WSL on Windows.')
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.enableWslOnWindows).onChange(async (value) => {
            this.plugin.settings.enableWslOnWindows = value;
            await this.plugin.saveSettings();
          })
        );
    }

    new Setting(containerEl).setName('Git commands').setHeading();

    new Setting(containerEl)
      .setName('Default commit message')
      .setDesc('Used when running the commit and push command.')
      .addText((text) =>
        text
          .setPlaceholder('Update')
          .setValue(this.plugin.settings.defaultCommitMessage)
          .onChange(async (value) => {
            this.plugin.settings.defaultCommitMessage = value.trim() || 'update';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Enable Git: commit and push')
      .setDesc('Add a command to commit all changes and push to remote.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableGitCommitPush).onChange(async (value) => {
          this.plugin.settings.enableGitCommitPush = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Enable Git: pull')
      .setDesc('Add a command to pull changes from remote.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableGitPull).onChange(async (value) => {
          this.plugin.settings.enableGitPull = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl).setName('Command toggles').setHeading();

    for (const target of optionalLaunchTargets) {
      if (target.action !== 'terminal') {
        continue;
      }
      this.addToggleSetting(
        containerEl,
        target.settingLabel,
        () => this.plugin.settings[target.settingKey],
        async (value) => {
          this.plugin.settings[target.settingKey] = value;
          await this.plugin.saveSettings();
        }
      );
    }
  }

  private addToggleSetting(
    containerEl: HTMLElement,
    label: string,
    getValue: () => boolean,
    setValue: (value: boolean) => Promise<void>
  ) {
    new Setting(containerEl)
      .setName(`Enable ${label}`)
      .setDesc(`Add an 'Open in ${label}' command to the command palette.`)
      .addToggle((toggle) =>
        toggle.setValue(getValue()).onChange(async (value) => {
          await setValue(value);
        })
      );
  }
}
