import js from "@eslint/js";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

const tsFiles = ["src/**/*.ts"];

const baseJsConfigs = Array.from(js.configs.recommended);

const tsConfigs = tseslint.configs.recommendedTypeChecked.map((config) => ({
  ...config,
  files: tsFiles,
  languageOptions: {
    ...(config.languageOptions ?? {}),
    parserOptions: {
      ...(config.languageOptions?.parserOptions ?? {}),
      project: ["./tsconfig.json"],
      tsconfigRootDir: import.meta.dirname,
    },
  },
}));

export default [
  ...baseJsConfigs,
  {
    ignores: ["node_modules/**", "main.js", "main.js.map"],
  },
  ...tsConfigs,
  {
    files: tsFiles,
    plugins: {
      obsidianmd,
    },
    rules: {
      "obsidianmd/commands/no-command-in-command-id": "error",
      "obsidianmd/commands/no-command-in-command-name": "error",
      "obsidianmd/commands/no-default-hotkeys": "error",
      "obsidianmd/commands/no-plugin-id-in-command-id": "error",
      "obsidianmd/commands/no-plugin-name-in-command-name": "error",
      "obsidianmd/settings-tab/no-manual-html-headings": "error",
      "obsidianmd/settings-tab/no-problematic-settings-headings": "error",
      "obsidianmd/vault/iterate": "error",
      "obsidianmd/detach-leaves": "error",
      "obsidianmd/hardcoded-config-path": "error",
      "obsidianmd/no-forbidden-elements": "error",
      "obsidianmd/no-plugin-as-component": "error",
      "obsidianmd/no-sample-code": "error",
      "obsidianmd/no-tfile-tfolder-cast": "error",
      "obsidianmd/no-view-references-in-plugin": "error",
      "obsidianmd/no-static-styles-assignment": "error",
      "obsidianmd/object-assign": "error",
      "obsidianmd/platform": "error",
      "obsidianmd/prefer-file-manager-trash-file": "warn",
      "obsidianmd/prefer-abstract-input-suggest": "error",
      "obsidianmd/regex-lookbehind": "error",
      "obsidianmd/sample-names": "error",
      "obsidianmd/validate-manifest": "error",
      "obsidianmd/validate-license": "error",
      "obsidianmd/ui/sentence-case": [
        "error",
        {
          brands: [
            "Terminal",
            "Terminal.app",
            "iTerm",
            "cmd.exe",
            "gnome-terminal",
            "Claude Code",
            "Codex CLI",
            "Gemini CLI",
          ],
        },
      ],
    },
  },
];
