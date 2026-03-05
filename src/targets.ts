import type { OpenInTerminalSettings } from './settings';

export type OptionalTargetSettingKey =
  | 'enableClaude'
  | 'enableCodex'
  | 'enableCursor'
  | 'enableGemini'
  | 'enableOpencode'
  | 'enableGitCommitPush'
  | 'enableGitPull';

type TerminalTarget = {
  action: 'terminal';
  toolCommand?: string;
};

type GitTarget = {
  action: 'git';
  gitAction: 'commit-push' | 'pull';
};

export type LaunchTarget = {
  id: string;
  commandName: string;
  settingKey?: OptionalTargetSettingKey;
  settingLabel?: string;
} & (TerminalTarget | GitTarget);

type OptionalLaunchTarget = LaunchTarget & {
  settingKey: OptionalTargetSettingKey;
  settingLabel: string;
};

export const optionalLaunchTargets: readonly OptionalLaunchTarget[] = [
  {
    id: 'open-claude',
    commandName: 'Open in Claude Code',
    action: 'terminal',
    toolCommand: 'claude',
    settingKey: 'enableClaude',
    settingLabel: 'Claude Code'
  },
  {
    id: 'open-codex',
    commandName: 'Open in Codex cli',
    action: 'terminal',
    toolCommand: 'codex',
    settingKey: 'enableCodex',
    settingLabel: 'Codex cli'
  },
  {
    id: 'open-cursor',
    commandName: 'Open in Cursor cli',
    action: 'terminal',
    toolCommand: 'agent',
    settingKey: 'enableCursor',
    settingLabel: 'Cursor cli'
  },
  {
    id: 'open-gemini',
    commandName: 'Open in Gemini cli',
    action: 'terminal',
    toolCommand: 'gemini',
    settingKey: 'enableGemini',
    settingLabel: 'Gemini cli'
  },
  {
    id: 'open-opencode',
    commandName: 'Open in OpenCode',
    action: 'terminal',
    toolCommand: 'opencode',
    settingKey: 'enableOpencode',
    settingLabel: 'OpenCode'
  },
  {
    id: 'git-commit-push',
    commandName: 'Git: commit and push',
    action: 'git',
    gitAction: 'commit-push',
    settingKey: 'enableGitCommitPush',
    settingLabel: 'Git: commit and push'
  },
  {
    id: 'git-pull',
    commandName: 'Git: pull',
    action: 'git',
    gitAction: 'pull',
    settingKey: 'enableGitPull',
    settingLabel: 'Git: pull'
  }
];

export const launchTargets: readonly LaunchTarget[] = [
  {
    id: 'open-terminal',
    commandName: 'Open in terminal',
    action: 'terminal'
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
