export const logger = {
  enabled: false,
  setEnabled(value: boolean) {
    this.enabled = value;
  },
  log(...args: unknown[]) {
    if (this.enabled) {
      console.debug('[open-in-terminal]', ...args);
    }
  }
};
