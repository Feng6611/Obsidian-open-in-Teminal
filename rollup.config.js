const typescript = require("@rollup/plugin-typescript");
const { nodeResolve } = require("@rollup/plugin-node-resolve");
const commonjs = require("@rollup/plugin-commonjs");

module.exports = {
  input: "src/main.ts",
  output: {
    dir: ".",
    sourcemap: true,
    format: "cjs",
    exports: "default"
  },
  external: ["obsidian", "child_process"],
  plugins: [
    typescript({ tsconfig: "./tsconfig.json" }),
    nodeResolve({ browser: true }),
    commonjs()
  ]
};
