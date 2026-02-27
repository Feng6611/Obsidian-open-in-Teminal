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
        .setDesc('Run terminal and CLI commands inside WSL on Windows.')
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.enableWslOnWindows).onChange(async (value) => {
            this.plugin.settings.enableWslOnWindows = value;
            await this.plugin.saveSettings();
          })
        );
    }

    new Setting(containerEl).setName('Command toggles').setHeading();

    for (const target of optionalLaunchTargets) {
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
