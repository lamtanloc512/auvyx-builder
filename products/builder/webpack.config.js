const path = require("path");
const defaultConfig = require("@wordpress/scripts/config/webpack.config");

// One editor bundle instead of one per block: blocks share block-kit (ADR 0007).
module.exports = {
  ...defaultConfig,
  entry: {
    editor: path.resolve(__dirname, "editor/index.ts"),
    "visual-builder": path.resolve(__dirname, "visual-builder/index.ts"),
  },
};
