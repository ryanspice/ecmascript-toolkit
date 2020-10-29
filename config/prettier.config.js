/**
 * prettier.config.js
 * merges into webpack.config.babel.js, is prettier config
 */
module.exports = {
  ignore: [
    //'**/*.json',
    "**/*.txt",
    "**/*.xml",
    "**/*.svg",
  ],
  include: ["./config/*.js", "./*"],
  importLoaders: 2,
  sourceMap: true,
  encoding: "utf-8",
  extensions: [".js", ".ts"],
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  bracketSpacing: true,
  htmlWhitespaceSensitivity: "ignore",
  jsxBracketSameLine: false,
  overrides: [],
  printWidth: 100,
  useTabs: false,
  tabWidth: 2,
  arrowParens: "always",
};
