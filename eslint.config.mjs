import obsidianmd from 'eslint-plugin-obsidianmd';

export default [
  { ignores: ['node_modules/**', 'main.js', 'main.js.map', 'tests/**', 'scripts/**', 'rollup.config.js', 'eslint.config.mjs'] },
  ...obsidianmd.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: { project: ['./tsconfig.json'], tsconfigRootDir: import.meta.dirname }
    },
    rules: {
      'obsidianmd/ui/sentence-case': ['warn', {
        brands: ['Terminal', 'Terminal.app', 'iTerm', 'Claude Code', 'Codex', 'Cursor', 'Gemini', 'OpenCode', 'GitHub Copilot', 'Git', 'WSL', 'Windows']
      }]
    }
  }
];
