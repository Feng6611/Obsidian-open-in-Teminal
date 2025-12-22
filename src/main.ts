import {
  App,
  FileSystemAdapter,
  Notice,
  Platform,
  Plugin,
  PluginSettingTab,
  Setting
} from "obsidian";
import { spawn } from "child_process";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

interface OpenInTerminalSettings {
  terminalApp: string;
  enableClaude: boolean;
  enableCodex: boolean;
  enableGemini: boolean;
  enableLogging: boolean;
}

const defaultTerminalApp = (): string => {
  if (!Platform.isDesktopApp) {
    return "";
  }
  if (Platform.isMacOS) {
    return "Terminal";
  }
  if (Platform.isWin) {
    return "cmd.exe";
  }
  if (Platform.isLinux) {
    return "x-terminal-emulator";
  }
  return "";
};

const DEFAULT_SETTINGS: OpenInTerminalSettings = {
  terminalApp: defaultTerminalApp(),
  enableClaude: false,
  enableCodex: false,
  enableGemini: false,
  enableLogging: false
};

const TEMP_SCRIPT_CLEANUP_DELAY_MS = 30_000;

const logger = {
  enabled: false,
  setEnabled(value: boolean) {
    this.enabled = value;
  },
  log(...args: unknown[]) {
    if (this.enabled) {
      console.debug("[open-in-terminal]", ...args);
    }
  }
};

type CommandConfig = {
  id: string;
  name: string;
  enabled: () => boolean;
  buildCommand: () => LaunchCommand | null;
};

type CommandManager = {
  findCommand: (id: string) => unknown;
  removeCommand: (id: string) => void;
};

type LaunchCommand = {
  command: string;
  cleanup?: () => void;
};

const resolveCommandManager = (app: App): CommandManager | null => {
  const maybeCommands = (app as App & { commands?: CommandManager }).commands;
  if (
    maybeCommands &&
    typeof maybeCommands.findCommand === "function" &&
    typeof maybeCommands.removeCommand === "function"
  ) {
    return maybeCommands;
  }
  return null;
};

const sanitizeTerminalApp = (value: string): string => value.trim();

const escapeDoubleQuotes = (value: string): string => value.replace(/"/g, '\\"');

const getPlatformSummary = (): string => {
  if (Platform.isDesktopApp) {
    if (Platform.isMacOS) {
      return "desktop-macos";
    }
    if (Platform.isWin) {
      return "desktop-windows";
    }
    if (Platform.isLinux) {
      return "desktop-linux";
    }
    return "desktop-unknown";
  }
  if (Platform.isMobileApp) {
    if (Platform.isIosApp) {
      return "mobile-ios";
    }
    if (Platform.isAndroidApp) {
      return "mobile-android";
    }
    return "mobile-unknown";
  }
  return "unknown";
};

const ensureTempScript = (content: string): { path: string; cleanup: () => void } => {
  const dir = mkdtempSync(join(tmpdir(), "open-in-terminal-"));
  const filePath = join(dir, "launch.command");
  logger.log("Creating temp script", { dir, filePath });
  writeFileSync(filePath, content, { mode: 0o755 });
  const cleanup = () => {
    try {
      rmSync(dir, { recursive: true, force: true });
      logger.log("Cleaned temp script", dir);
    } catch (error) {
      console.warn("[open-in-terminal] Failed to remove temp script", error);
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
    logger.log("macOS simple launch", { app, command, vaultPath });
    return { command };
  }

  const escapedVaultPath = escapeDoubleQuotes(vaultPath);
  const scriptLines = [
    "#!/bin/bash",
    `cd "${escapedVaultPath}"`
  ];
  if (toolCommand) {
    scriptLines.push(toolCommand);
  }
  scriptLines.push('exec "$SHELL"');
  const { path, cleanup } = ensureTempScript(scriptLines.join("\n"));
  const command = `open -na "${escapeDoubleQuotes(app)}" "${path}"`;
  logger.log("macOS script launch", { app, command, script: path, toolCommand });
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
  const tool = toolCommand ? ` && ${toolCommand}` : "";

  const lowerApp = app.toLowerCase();

  if (lowerApp === "cmd.exe" || lowerApp === "cmd") {
    const command = toolCommand
      ? `start "" cmd.exe /K "${cdCommand}${tool}"`
      : `start "" cmd.exe /K "${cdCommand}"`;
    logger.log("Windows launch (cmd.exe)", { command, toolCommand, vaultPath });
    return { command };
  }

  if (lowerApp === "powershell" || lowerApp === "powershell.exe") {
    if (!toolCommand) {
      const command = `start "" powershell -NoExit -Command "Set-Location '${vaultPath.replace(
        /'/g,
        "''"
      )}';"`;
      logger.log("Windows launch (powershell)", { command, toolCommand, vaultPath });
      return { command };
    }
    const command = `start "" powershell -NoExit -Command "Set-Location '${vaultPath.replace(
      /'/g,
      "''"
    )}'; ${toolCommand}"`;
    logger.log("Windows launch (powershell tool)", { command, toolCommand, vaultPath });
    return { command };
  }

  if (lowerApp === "wt.exe" || lowerApp === "wt") {
    const command = toolCommand
      ? `start "" wt.exe new-tab cmd /K "${cdCommand}${tool}"`
      : `start "" wt.exe new-tab cmd /K "${cdCommand}"`;
    logger.log("Windows launch (wt)", { command, toolCommand, vaultPath });
    return { command };
  }

  if (!toolCommand) {
    const command = `start "" "${app}"`;
    logger.log("Windows launch (generic simple)", { command, vaultPath });
    return { command };
  }

  const command = `start "" cmd.exe /K "${cdCommand}${tool}"`;
  logger.log("Windows launch (generic tool fallback)", { command, app, toolCommand, vaultPath });
  return { command };
};

const buildUnixLaunch = (terminalApp: string, toolCommand?: string): LaunchCommand | null => {
  const app = sanitizeTerminalApp(terminalApp);
  if (!app) {
    return null;
  }

  if (!toolCommand) {
    const command = `${app}`;
    logger.log("Unix launch (simple)", { command });
    return { command };
  }

  const shellCommand = `cd "$PWD"; ${toolCommand}; exec "$SHELL"`;

  if (app.includes("gnome-terminal")) {
    const command = `${app} -- bash -lc "${shellCommand}"`;
    logger.log("Unix launch (gnome-terminal)", { command, toolCommand });
    return { command };
  }

  if (app.includes("konsole")) {
    const command = `${app} -e bash -lc "${shellCommand}"`;
    logger.log("Unix launch (konsole)", { command, toolCommand });
    return { command };
  }

  const command = `${app} -e bash -lc "${shellCommand}"`;
  logger.log("Unix launch (generic tool)", { command, toolCommand });
  return { command };
};

const buildLaunchCommand = (
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

export default class OpenInTerminalPlugin extends Plugin {
  private registeredCommandIds = new Set<string>();
  settings: OpenInTerminalSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    await this.loadSettings();
    logger.setEnabled(this.settings.enableLogging);
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

    const commandConfigs: CommandConfig[] = [
      {
        id: "open-terminal",
        name: "Open in terminal",
        enabled: () => true,
        buildCommand: () => this.composeLaunchCommand()
      },
      {
        id: "open-claude",
        name: "Open in Claude Code",
        enabled: () => this.settings.enableClaude,
        buildCommand: () => this.composeLaunchCommand("claude")
      },
      {
        id: "open-codex",
        name: "Open in Codex CLI",
        enabled: () => this.settings.enableCodex,
        buildCommand: () => this.composeLaunchCommand("codex")
      },
      {
        id: "open-gemini",
        name: "Open in Gemini CLI",
        enabled: () => this.settings.enableGemini,
        buildCommand: () => this.composeLaunchCommand("gemini")
      }
    ];

    for (const config of commandConfigs) {
      if (!config.enabled()) {
        continue;
      }

      this.addCommand({
        id: config.id,
        name: config.name,
        callback: () => this.runLaunchCommand(config.buildCommand, config.name)
      });
      this.registeredCommandIds.add(`${this.manifest.id}:${config.id}`);
    }
  }

  private composeLaunchCommand(toolCommand?: string): LaunchCommand | null {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      return null;
    }
    const vaultPath = adapter.getBasePath();
    const launchCommand = buildLaunchCommand(
      this.settings.terminalApp,
      vaultPath,
      toolCommand
    );
    logger.log("Compose launch command", {
      platform: getPlatformSummary(),
      terminalApp: this.settings.terminalApp,
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
      new Notice("File system adapter not available. This plugin works only on desktop.");
      return;
    }

    const vaultPath = adapter.getBasePath();

    try {
      logger.log("Spawning command", { label, command: launchCommand.command, vaultPath });
      const child = spawn(launchCommand.command, {
        cwd: vaultPath,
        shell: true,
        detached: true,
        stdio: "ignore"
      });
      child.on("error", (error) => {
        console.error(`[open-in-terminal] Failed to run '${launchCommand.command}':`, error);
        new Notice(`Failed to run ${label}. Check the developer console for details.`);
      });
      child.unref();
      logger.log("Spawned command successfully", { label });
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
            console.warn("[open-in-terminal] Cleanup after command failed", error);
          }
        }, TEMP_SCRIPT_CLEANUP_DELAY_MS);
      }
    }
  }

  async loadSettings() {
    const stored = (await this.loadData()) as Partial<OpenInTerminalSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, stored ?? {});
  }

  async saveSettings() {
    await this.saveData(this.settings);
    logger.setEnabled(this.settings.enableLogging);
    this.refreshCommands();
  }
}

class OpenInTerminalSettingTab extends PluginSettingTab {
  plugin: OpenInTerminalPlugin;

  constructor(app: App, plugin: OpenInTerminalPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("Terminal integration").setHeading();

    new Setting(containerEl)
      .setName("Terminal application name")
      .setDesc("Enter the command line app to launch, such as the default shell or a custom executable path.")
      .addText((text) =>
        text
          .setPlaceholder(defaultTerminalApp())
          .setValue(this.plugin.settings.terminalApp)
          .onChange(async (value) => {
            this.plugin.settings.terminalApp = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl).setName("Command toggles").setHeading();

    this.addToggleSetting(containerEl, "Claude Code", () => this.plugin.settings.enableClaude, async (value) => {
      this.plugin.settings.enableClaude = value;
      await this.plugin.saveSettings();
    });

    this.addToggleSetting(containerEl, "Codex CLI", () => this.plugin.settings.enableCodex, async (value) => {
      this.plugin.settings.enableCodex = value;
      await this.plugin.saveSettings();
    });

    this.addToggleSetting(containerEl, "Gemini CLI", () => this.plugin.settings.enableGemini, async (value) => {
      this.plugin.settings.enableGemini = value;
      await this.plugin.saveSettings();
    });

    new Setting(containerEl).setName("Diagnostics").setHeading();

    new Setting(containerEl)
      .setName("Enable debug logging")
      .setDesc("Logs generated commands to the developer console for troubleshooting.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableLogging)
          .onChange(async (value) => {
            this.plugin.settings.enableLogging = value;
            logger.setEnabled(value);
            await this.plugin.saveSettings();
          })
      );
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
        toggle
          .setValue(getValue())
          .onChange(async (value) => {
            await setValue(value);
          })
      );
  }
}
