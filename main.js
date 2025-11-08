'use strict';

var obsidian = require('obsidian');
var child_process = require('child_process');
var fs = require('fs');
var os = require('os');
var path = require('path');

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol, Iterator */


function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

const defaultTerminalApp = () => {
    if (!obsidian.Platform.isDesktopApp) {
        return "";
    }
    if (obsidian.Platform.isMacOS) {
        return "Terminal";
    }
    if (obsidian.Platform.isWin) {
        return "cmd.exe";
    }
    if (obsidian.Platform.isLinux) {
        return "x-terminal-emulator";
    }
    return "";
};
const DEFAULT_SETTINGS = {
    terminalApp: defaultTerminalApp(),
    enableClaude: false,
    enableCodex: false,
    enableGemini: false,
    enableLogging: false
};
const TEMP_SCRIPT_CLEANUP_DELAY_MS = 30000;
const logger = {
    enabled: false,
    setEnabled(value) {
        this.enabled = value;
    },
    log(...args) {
        if (this.enabled) {
            console.debug("[open-in-terminal]", ...args);
        }
    }
};
const resolveCommandManager = (app) => {
    const maybeCommands = app.commands;
    if (maybeCommands &&
        typeof maybeCommands.findCommand === "function" &&
        typeof maybeCommands.removeCommand === "function") {
        return maybeCommands;
    }
    return null;
};
const sanitizeTerminalApp = (value) => value.trim();
const escapeDoubleQuotes = (value) => value.replace(/"/g, '\\"');
const getPlatformSummary = () => {
    if (obsidian.Platform.isDesktopApp) {
        if (obsidian.Platform.isMacOS) {
            return "desktop-macos";
        }
        if (obsidian.Platform.isWin) {
            return "desktop-windows";
        }
        if (obsidian.Platform.isLinux) {
            return "desktop-linux";
        }
        return "desktop-unknown";
    }
    if (obsidian.Platform.isMobileApp) {
        if (obsidian.Platform.isIosApp) {
            return "mobile-ios";
        }
        if (obsidian.Platform.isAndroidApp) {
            return "mobile-android";
        }
        return "mobile-unknown";
    }
    return "unknown";
};
const ensureTempScript = (content) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "open-in-terminal-"));
    const filePath = path.join(dir, "launch.command");
    logger.log("Creating temp script", { dir, filePath });
    fs.writeFileSync(filePath, content, { mode: 0o755 });
    const cleanup = () => {
        try {
            fs.rmSync(dir, { recursive: true, force: true });
            logger.log("Cleaned temp script", dir);
        }
        catch (error) {
            console.warn("[open-in-terminal] Failed to remove temp script", error);
        }
    };
    return { path: filePath, cleanup };
};
const buildMacLaunch = (terminalApp, vaultPath, toolCommand) => {
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
const buildWindowsLaunch = (terminalApp, vaultPath, toolCommand) => {
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
            const command = `start "" powershell -NoExit -Command "Set-Location '${vaultPath.replace(/'/g, "''")}';"`;
            logger.log("Windows launch (powershell)", { command, toolCommand, vaultPath });
            return { command };
        }
        const command = `start "" powershell -NoExit -Command "Set-Location '${vaultPath.replace(/'/g, "''")}'; ${toolCommand}"`;
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
const buildUnixLaunch = (terminalApp, toolCommand) => {
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
const buildLaunchCommand = (terminalApp, vaultPath, toolCommand) => {
    if (!obsidian.Platform.isDesktopApp) {
        return null;
    }
    if (obsidian.Platform.isMacOS) {
        return buildMacLaunch(terminalApp, vaultPath, toolCommand);
    }
    if (obsidian.Platform.isWin) {
        return buildWindowsLaunch(terminalApp, vaultPath, toolCommand);
    }
    return buildUnixLaunch(terminalApp, toolCommand);
};
class OpenInTerminalPlugin extends obsidian.Plugin {
    constructor() {
        super(...arguments);
        this.registeredCommandIds = new Set();
        this.settings = Object.assign({}, DEFAULT_SETTINGS);
    }
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadSettings();
            logger.setEnabled(this.settings.enableLogging);
            this.addSettingTab(new OpenInTerminalSettingTab(this.app, this));
            this.refreshCommands();
        });
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
        const commandConfigs = [
            {
                id: "open-terminal",
                name: "Open in Terminal",
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
                name: "Open in Codex Cli",
                enabled: () => this.settings.enableCodex,
                buildCommand: () => this.composeLaunchCommand("codex")
            },
            {
                id: "open-gemini",
                name: "Open in Gemini Cli",
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
    composeLaunchCommand(toolCommand) {
        const adapter = this.app.vault.adapter;
        if (!(adapter instanceof obsidian.FileSystemAdapter)) {
            return null;
        }
        const vaultPath = adapter.getBasePath();
        const launchCommand = buildLaunchCommand(this.settings.terminalApp, vaultPath, toolCommand);
        logger.log("Compose launch command", {
            platform: getPlatformSummary(),
            terminalApp: this.settings.terminalApp,
            toolCommand,
            vaultPath,
            launchCommand
        });
        return launchCommand;
    }
    runLaunchCommand(buildCommand, label) {
        const launchCommand = buildCommand();
        if (!launchCommand) {
            new obsidian.Notice(`Unable to run ${label}. Check the Open in Terminal settings for the terminal application name.`);
            return;
        }
        this.executeShellCommand(launchCommand, label);
    }
    executeShellCommand(launchCommand, label) {
        const adapter = this.app.vault.adapter;
        if (!(adapter instanceof obsidian.FileSystemAdapter)) {
            new obsidian.Notice("File system adapter not available. This plugin works only on desktop.");
            return;
        }
        const vaultPath = adapter.getBasePath();
        try {
            logger.log("Spawning command", { label, command: launchCommand.command, vaultPath });
            const child = child_process.spawn(launchCommand.command, {
                cwd: vaultPath,
                shell: true,
                detached: true,
                stdio: "ignore"
            });
            child.on("error", (error) => {
                console.error(`[open-in-terminal] Failed to run '${launchCommand.command}':`, error);
                new obsidian.Notice(`Failed to run ${label}. Check the developer console for details.`);
            });
            child.unref();
            logger.log("Spawned command successfully", { label });
        }
        catch (error) {
            console.error(`[open-in-terminal] Unexpected error for '${launchCommand.command}':`, error);
            new obsidian.Notice(`Failed to run ${label}. Check the developer console for details.`);
        }
        finally {
            if (launchCommand.cleanup) {
                const cleanup = launchCommand.cleanup;
                setTimeout(() => {
                    try {
                        cleanup();
                    }
                    catch (error) {
                        console.warn("[open-in-terminal] Cleanup after command failed", error);
                    }
                }, TEMP_SCRIPT_CLEANUP_DELAY_MS);
            }
        }
    }
    loadSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            const stored = (yield this.loadData());
            this.settings = Object.assign({}, DEFAULT_SETTINGS, stored !== null && stored !== void 0 ? stored : {});
        });
    }
    saveSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.saveData(this.settings);
            logger.setEnabled(this.settings.enableLogging);
            this.refreshCommands();
        });
    }
}
class OpenInTerminalSettingTab extends obsidian.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        new obsidian.Setting(containerEl).setName("Terminal integration").setHeading();
        new obsidian.Setting(containerEl)
            .setName("Terminal application name")
            .setDesc("Enter the Terminal app to launch, such as the system default Terminal or a custom executable path.")
            .addText((text) => text
            .setPlaceholder(defaultTerminalApp())
            .setValue(this.plugin.settings.terminalApp)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.terminalApp = value.trim();
            yield this.plugin.saveSettings();
        })));
        new obsidian.Setting(containerEl).setName("Command toggles").setHeading();
        this.addToggleSetting(containerEl, "Claude Code", () => this.plugin.settings.enableClaude, (value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.enableClaude = value;
            yield this.plugin.saveSettings();
        }));
        this.addToggleSetting(containerEl, "Codex Cli", () => this.plugin.settings.enableCodex, (value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.enableCodex = value;
            yield this.plugin.saveSettings();
        }));
        this.addToggleSetting(containerEl, "Gemini Cli", () => this.plugin.settings.enableGemini, (value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.enableGemini = value;
            yield this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl).setName("Diagnostics").setHeading();
        new obsidian.Setting(containerEl)
            .setName("Enable debug logging")
            .setDesc("Logs generated commands to the developer console for troubleshooting.")
            .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.enableLogging)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.enableLogging = value;
            logger.setEnabled(value);
            yield this.plugin.saveSettings();
        })));
    }
    addToggleSetting(containerEl, label, getValue, setValue) {
        new obsidian.Setting(containerEl)
            .setName(`Enable ${label}`)
            .setDesc(`Add an 'Open in ${label}' command to the command palette.`)
            .addToggle((toggle) => toggle
            .setValue(getValue())
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            yield setValue(value);
        })));
    }
}

module.exports = OpenInTerminalPlugin;
//# sourceMappingURL=main.js.map
