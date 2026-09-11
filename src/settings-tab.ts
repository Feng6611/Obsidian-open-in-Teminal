import { App, Platform, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { defaultTerminalApp, getCurrentTerminalApp, type OpenInTerminalSettings, setCurrentTerminalApp } from './settings';
import { optionalLaunchTargets } from './targets';
import { buildNotePrompt } from './note-context';

type SettingsHost = Plugin & {
  pluginSettings: OpenInTerminalSettings;
  saveSettings: () => Promise<void>;
};
// A structural definition keeps the legacy display fallback compatible with
// Obsidian 1.5, while newer versions can index and render these same rows.
type Definition = { name: string; desc?: string; render: (setting: Setting) => void };

export class OpenInTerminalSettingTab extends PluginSettingTab {
  plugin: SettingsHost;
  private preview?: Setting;

  constructor(app: App, plugin: SettingsHost) { super(app, plugin); this.plugin = plugin; }

  private updatePreview() {
    const settings = this.plugin.pluginSettings;
    const note = this.app.workspace.getActiveFile()?.path;
    this.preview?.setDesc(buildNotePrompt(settings, note) ?? (settings.enableNoteContext ? 'Open a note to preview its prompt.' : 'Note context is disabled.'));
  }

  getSettingDefinitions(): Definition[] {
    const settings = this.plugin.pluginSettings;
    const toggle = (name: string, desc: string, key: keyof Pick<OpenInTerminalSettings,
      'openAtCurrentNoteFolder' | 'reuseExistingMacApp' | 'enableWslOnWindows' | 'enableNoteContext'>): Definition => ({
      name, desc, render: row => { row.addToggle(control => control.setValue(settings[key]).onChange(async value => {
        settings[key] = value;
        await this.plugin.saveSettings();
        this.updatePreview();
      })); }
    });
    const definitions: Definition[] = [{
      name: 'Terminal application',
      desc: 'Enter an app name or executable path, without command-line arguments. Leave blank to use the default for this device.',
      render: row => { row.addText(control => control.setPlaceholder(defaultTerminalApp()).setValue(getCurrentTerminalApp(settings.terminalApp)).onChange(async value => {
        settings.terminalApp = setCurrentTerminalApp(settings.terminalApp,value);
        await this.plugin.saveSettings();
      })); }
    }, toggle("Open at current note's folder", 'Use the active note folder; fall back to the vault root when no note is open.', 'openAtCurrentNoteFolder')];
    if (Platform.isMacOS) definitions.push(toggle('Reuse existing terminal instance', 'Open a new window in the running app instead of a separate application instance.', 'reuseExistingMacApp'));
    if (Platform.isWin) definitions.push(toggle('Use WSL for commands', 'Run CLI tools and Git inside WSL on Windows.', 'enableWslOnWindows'));
    definitions.push(toggle('Include current note in prompt', 'Start an interactive CLI session with the current note path and your instructions. The CLI may begin responding immediately.', 'enableNoteContext'));
    for (const [key,name] of [['promptPrefix','Prompt prefix'],['promptSuffix','Prompt suffix']] as const) {
      definitions.push({name,desc:'Whitespace is preserved exactly.',render:row => {
        row.addTextArea(control => control.setValue(settings[key]).onChange(async value => {
          settings[key] = value;
          await this.plugin.saveSettings();
          this.updatePreview();
        }));
      }});
    }
    definitions.push({name:'Prompt preview',render:row => {this.preview=row;this.updatePreview();}});
    definitions.push({name:'Default commit message',desc:'Used by Git: commit and push.',render:row => {
      row.addText(control => control.setValue(settings.defaultCommitMessage).onChange(async value => {
        settings.defaultCommitMessage=value.trim() || 'update';
        await this.plugin.saveSettings();
      }));
    }});
    for (const target of optionalLaunchTargets) {
      definitions.push({name:`Enable ${target.settingLabel}`,desc:`Show “${target.commandName}” in the command palette.`,render:row => {
        row.addToggle(control => control.setValue(settings[target.settingKey]).onChange(async value => {
          settings[target.settingKey]=value;
          await this.plugin.saveSettings();
        }));
      }});
    }
    return definitions;
  }

  display(): void {
    this.containerEl.empty();
    for (const definition of this.getSettingDefinitions()) {
      const row = new Setting(this.containerEl).setName(definition.name);
      if (definition.desc) row.setDesc(definition.desc);
      definition.render(row);
    }
  }

  hide(): void { this.preview = undefined; }
}
