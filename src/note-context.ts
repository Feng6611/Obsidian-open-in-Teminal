import { posix } from 'path';
import type { OpenInTerminalSettings } from './settings';

export const buildNotePrompt = (settings: OpenInTerminalSettings, notePath?: string): string | undefined => {
  if (!settings.enableNoteContext || !notePath) return undefined;
  const path = settings.openAtCurrentNoteFolder ? posix.basename(notePath) : notePath;
  return `${settings.promptPrefix}${path}${settings.promptSuffix}`;
};

export const promptArguments = (tool: string, prompt?: string): string[] => {
  if (prompt === undefined) return [];
  if (tool === 'gemini' || tool === 'copilot') return ['-i', prompt];
  if (tool === 'opencode') return ['--prompt', prompt];
  // End option parsing so user-entered prefixes cannot become CLI flags.
  return ['--', prompt];
};
