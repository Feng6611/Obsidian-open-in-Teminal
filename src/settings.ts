import { Platform } from 'obsidian';

type DesktopPlatform = 'win' | 'macos' | 'linux';

type TerminalAppByPlatform = {
  win?: string;
  macos?: string;
  linux?: string;
};

export interface OpenInTerminalSettings {
  terminalApp: TerminalAppByPlatform;
  enableClaude: boolean;
  enableCodex: boolean;
  enableCursor: boolean;
  enableGemini: boolean;
  enableOpencode: boolean;
  enableWslOnWindows: boolean;
}

export const defaultTerminalApp = (): string => {
  if (!Platform.isDesktopApp) {
    return '';
  }
  if (Platform.isMacOS) {
    return 'Terminal';
  }
  if (Platform.isWin) {
    return 'cmd.exe';
  }
  if (Platform.isLinux) {
    return 'x-terminal-emulator';
  }
  return '';
};

const getCurrentDesktopPlatform = (): DesktopPlatform | null => {
  if (!Platform.isDesktopApp) {
    return null;
  }
  if (Platform.isMacOS) {
    return 'macos';
  }
  if (Platform.isWin) {
    return 'win';
  }
  if (Platform.isLinux) {
    return 'linux';
  }
  return null;
};

const buildDefaultTerminalAppSetting = (): TerminalAppByPlatform => {
  const platform = getCurrentDesktopPlatform();
  const app = defaultTerminalApp();
  if (!platform) {
    return {};
  }
  return { [platform]: app };
};

export const DEFAULT_SETTINGS: OpenInTerminalSettings = {
  terminalApp: buildDefaultTerminalAppSetting(),
  enableClaude: false,
  enableCodex: false,
  enableCursor: false,
  enableGemini: false,
  enableOpencode: false,
  enableWslOnWindows: false
};

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null;

const normalizeTerminalAppSetting = (
  value: unknown,
  fallback: TerminalAppByPlatform
): TerminalAppByPlatform => {
  const platform = getCurrentDesktopPlatform();
  if (typeof value === 'string') {
    if (!platform) {
      return { ...fallback };
    }
    return { [platform]: value.trim() };
  }

  if (isRecord(value)) {
    const next: TerminalAppByPlatform = {};
    if (typeof value.win === 'string') {
      next.win = value.win.trim();
    }
    if (typeof value.macos === 'string') {
      next.macos = value.macos.trim();
    }
    if (typeof value.linux === 'string') {
      next.linux = value.linux.trim();
    }
    return next;
  }

  return { ...fallback };
};

const readBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

export const normalizeSettings = (stored: unknown): OpenInTerminalSettings => {
  const source = isRecord(stored) ? stored : {};
  return {
    terminalApp: normalizeTerminalAppSetting(source.terminalApp, DEFAULT_SETTINGS.terminalApp),
    enableClaude: readBoolean(source.enableClaude, DEFAULT_SETTINGS.enableClaude),
    enableCodex: readBoolean(source.enableCodex, DEFAULT_SETTINGS.enableCodex),
    enableCursor: readBoolean(source.enableCursor, DEFAULT_SETTINGS.enableCursor),
    enableGemini: readBoolean(source.enableGemini, DEFAULT_SETTINGS.enableGemini),
    enableOpencode: readBoolean(source.enableOpencode, DEFAULT_SETTINGS.enableOpencode),
    enableWslOnWindows: readBoolean(
      source.enableWslOnWindows,
      DEFAULT_SETTINGS.enableWslOnWindows
    )
  };
};

export const getCurrentTerminalApp = (terminalApp: TerminalAppByPlatform): string => {
  const platform = getCurrentDesktopPlatform();
  if (!platform) {
    return '';
  }
  return terminalApp[platform] ?? '';
};

export const setCurrentTerminalApp = (
  terminalApp: TerminalAppByPlatform,
  value: string
): TerminalAppByPlatform => {
  const platform = getCurrentDesktopPlatform();
  if (!platform) {
    return { ...terminalApp };
  }
  return {
    ...terminalApp,
    [platform]: value.trim()
  };
};
