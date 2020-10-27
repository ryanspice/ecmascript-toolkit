/**
 * minify.config.js
 * merges into webpack.config.babel.js, is babel minify
 * @type {{memberExpressions: boolean, numericLiterals: boolean, replace: boolean, typeConstructors: boolean, removeConsole: boolean, mangle: boolean, guards: boolean, builtIns: boolean, keepFnName: boolean, deadcode: boolean, flipComparisons: boolean, simplifyComparisons: boolean, propertyLiterals: boolean, removeUndefined: boolean, removeDebugger: boolean, booleans: boolean, infinity: boolean, consecutiveAdds: boolean, regexpConstructors: boolean, simplify: boolean, evaluate: boolean, undefinedToVoid: boolean, mergeVars: boolean}}
 */
module.exports = {
  booleans: true,
  builtIns: true,
  consecutiveAdds: true,
  deadcode: true,
  evaluate: false,
  flipComparisons: true,
  guards: true,
  infinity: true,
  memberExpressions: true,
  mergeVars: true,
  numericLiterals: true,
  propertyLiterals: true,
  regexpConstructors: true,
  replace: true,
  simplify: true,
  simplifyComparisons: true,
  typeConstructors: true,
  removeConsole: false,
  removeDebugger: false,
  removeUndefined: true,
  undefinedToVoid: true,
  mangle: true,
  keepFnName: true,
};
