import type { App } from 'obsidian';

type CommandManager = {
  findCommand: (id: string) => unknown;
  removeCommand: (id: string) => void;
};

export const resolveCommandManager = (app: App): CommandManager | null => {
  const maybeCommands = (app as App & { commands?: CommandManager }).commands;
  if (
    maybeCommands &&
    typeof maybeCommands.findCommand === 'function' &&
    typeof maybeCommands.removeCommand === 'function'
  ) {
    return maybeCommands;
  }
  return null;
};
