import type { OpenInTerminalSettings } from './settings';

export type OptionalTargetSettingKey =
  | 'enableClaude'
  | 'enableCodex'
  | 'enableCursor'
  | 'enableGemini'
  | 'enableOpencode';

export type LaunchTarget = {
  id: string;
  commandName: string;
  toolCommand?: string;
  settingKey?: OptionalTargetSettingKey;
  settingLabel?: string;
};

type OptionalLaunchTarget = LaunchTarget & {
  settingKey: OptionalTargetSettingKey;
  settingLabel: string;
  toolCommand: string;
};

export const optionalLaunchTargets: readonly OptionalLaunchTarget[] = [
  {
    id: 'open-claude',
    commandName: 'Open in Claude Code',
    toolCommand: 'claude',
    settingKey: 'enableClaude',
    settingLabel: 'Claude Code'
  },
  {
    id: 'open-codex',
    commandName: 'Open in Codex cli',
    toolCommand: 'codex',
    settingKey: 'enableCodex',
    settingLabel: 'Codex cli'
  },
  {
    id: 'open-cursor',
    commandName: 'Open in Cursor cli',
    toolCommand: 'agent',
    settingKey: 'enableCursor',
    settingLabel: 'Cursor cli'
  },
  {
    id: 'open-gemini',
    commandName: 'Open in Gemini cli',
    toolCommand: 'gemini',
    settingKey: 'enableGemini',
    settingLabel: 'Gemini cli'
  },
  {
    id: 'open-opencode',
    commandName: 'Open in OpenCode',
    toolCommand: 'opencode',
    settingKey: 'enableOpencode',
    settingLabel: 'OpenCode'
  }
];

export const launchTargets: readonly LaunchTarget[] = [
  {
    id: 'open-terminal',
    commandName: 'Open in terminal'
  },
  ...optionalLaunchTargets
];

export const isTargetEnabled = (
  settings: OpenInTerminalSettings,
  target: LaunchTarget
): boolean => {
  if (!target.settingKey) {
    return true;
  }
  return settings[target.settingKey];
};
