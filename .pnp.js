#!/usr/bin/env node

/* eslint-disable max-len, flowtype/require-valid-file-annotation, flowtype/require-return-type */
/* global packageInformationStores, null, $$SETUP_STATIC_TABLES */

// Used for the resolveUnqualified part of the resolution (ie resolving folder/index.js & file extensions)
// Deconstructed so that they aren't affected by any fs monkeypatching occuring later during the execution
const {statSync, lstatSync, readlinkSync, readFileSync, existsSync, realpathSync} = require('fs');

const Module = require('module');
const path = require('path');
const StringDecoder = require('string_decoder');

const ignorePattern = null ? new RegExp(null) : null;

const pnpFile = path.resolve(__dirname, __filename);
const builtinModules = new Set(Module.builtinModules || Object.keys(process.binding('natives')));

const topLevelLocator = {name: null, reference: null};
const blacklistedLocator = {name: NaN, reference: NaN};

// Used for compatibility purposes - cf setupCompatibilityLayer
const patchedModules = [];
const fallbackLocators = [topLevelLocator];

// Matches backslashes of Windows paths
const backwardSlashRegExp = /\\/g;

// Matches if the path must point to a directory (ie ends with /)
const isDirRegExp = /\/$/;

// Matches if the path starts with a valid path qualifier (./, ../, /)
// eslint-disable-next-line no-unused-vars
const isStrictRegExp = /^\.{0,2}\//;

// Splits a require request into its components, or return null if the request is a file path
const pathRegExp = /^(?![a-zA-Z]:[\\\/]|\\\\|\.{0,2}(?:\/|$))((?:@[^\/]+\/)?[^\/]+)\/?(.*|)$/;

// Keep a reference around ("module" is a common name in this context, so better rename it to something more significant)
const pnpModule = module;

/**
 * Used to disable the resolution hooks (for when we want to fallback to the previous resolution - we then need
 * a way to "reset" the environment temporarily)
 */

let enableNativeHooks = true;

/**
 * Simple helper function that assign an error code to an error, so that it can more easily be caught and used
 * by third-parties.
 */

function makeError(code, message, data = {}) {
    const error = new Error(message);
    return Object.assign(error, {code, data});
}

/**
 * Ensures that the returned locator isn't a blacklisted one.
 *
 * Blacklisted packages are packages that cannot be used because their dependencies cannot be deduced. This only
 * happens with peer dependencies, which effectively have different sets of dependencies depending on their parents.
 *
 * In order to deambiguate those different sets of dependencies, the Yarn implementation of PnP will generate a
 * symlink for each combination of <package name>/<package version>/<dependent package> it will find, and will
 * blacklist the target of those symlinks. By doing this, we ensure that files loaded through a specific path
 * will always have the same set of dependencies, provided the symlinks are correctly preserved.
 *
 * Unfortunately, some tools do not preserve them, and when it happens PnP isn't able anymore to deduce the set of
 * dependencies based on the path of the file that makes the require calls. But since we've blacklisted those paths,
 * we're able to print a more helpful error message that points out that a third-party package is doing something
 * incompatible!
 */

// eslint-disable-next-line no-unused-vars
function blacklistCheck(locator) {
    if (locator === blacklistedLocator) {
        throw makeError(
            `BLACKLISTED`,
            [
                `A package has been resolved through a blacklisted path - this is usually caused by one of your tools calling`,
                `"realpath" on the return value of "require.resolve". Since the returned values use symlinks to disambiguate`,
                `peer dependencies, they must be passed untransformed to "require".`,
            ].join(` `)
        );
    }

    return locator;
}

let packageInformationStores = new Map([
    ["@babel/core", new Map([
        ["7.7.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-core-7.7.2-ea5b99693bcfc058116f42fa1dd54da412b29d91/node_modules/@babel/core/"),
            packageDependencies: new Map([
                ["@babel/code-frame", "7.5.5"],
                ["@babel/generator", "7.7.2"],
                ["@babel/helpers", "7.7.0"],
                ["@babel/parser", "7.7.3"],
                ["@babel/template", "7.7.0"],
                ["@babel/traverse", "7.7.2"],
                ["@babel/types", "7.7.2"],
                ["convert-source-map", "1.7.0"],
                ["debug", "4.1.1"],
                ["json5", "2.1.1"],
                ["lodash", "4.17.15"],
                ["resolve", "1.12.0"],
                ["semver", "5.7.1"],
                ["source-map", "0.5.7"],
                ["@babel/core", "7.7.2"],
            ]),
        }],
    ])],
    ["@babel/code-frame", new Map([
        ["7.5.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-code-frame-7.5.5-bc0782f6d69f7b7d49531219699b988f669a8f9d/node_modules/@babel/code-frame/"),
            packageDependencies: new Map([
                ["@babel/highlight", "7.5.0"],
                ["@babel/code-frame", "7.5.5"],
            ]),
        }],
    ])],
    ["@babel/highlight", new Map([
        ["7.5.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-highlight-7.5.0-56d11312bd9248fa619591d02472be6e8cb32540/node_modules/@babel/highlight/"),
            packageDependencies: new Map([
                ["chalk", "2.4.2"],
                ["esutils", "2.0.3"],
                ["js-tokens", "4.0.0"],
                ["@babel/highlight", "7.5.0"],
            ]),
        }],
    ])],
    ["chalk", new Map([
        ["2.4.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-chalk-2.4.2-cd42541677a54333cf541a49108c1432b44c9424/node_modules/chalk/"),
            packageDependencies: new Map([
                ["ansi-styles", "3.2.1"],
                ["escape-string-regexp", "1.0.5"],
                ["supports-color", "5.5.0"],
                ["chalk", "2.4.2"],
            ]),
        }],
        ["1.1.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-chalk-1.1.3-a8115c55e4a702fe4d150abd3872822a7e09fc98/node_modules/chalk/"),
            packageDependencies: new Map([
                ["ansi-styles", "2.2.1"],
                ["escape-string-regexp", "1.0.5"],
                ["has-ansi", "2.0.0"],
                ["strip-ansi", "3.0.1"],
                ["supports-color", "2.0.0"],
                ["chalk", "1.1.3"],
            ]),
        }],
    ])],
    ["ansi-styles", new Map([
        ["3.2.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ansi-styles-3.2.1-41fbb20243e50b12be0f04b8dedbf07520ce841d/node_modules/ansi-styles/"),
            packageDependencies: new Map([
                ["color-convert", "1.9.3"],
                ["ansi-styles", "3.2.1"],
            ]),
        }],
        ["2.2.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ansi-styles-2.2.1-b432dd3358b634cf75e1e4664368240533c1ddbe/node_modules/ansi-styles/"),
            packageDependencies: new Map([
                ["ansi-styles", "2.2.1"],
            ]),
        }],
    ])],
    ["color-convert", new Map([
        ["1.9.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-color-convert-1.9.3-bb71850690e1f136567de629d2d5471deda4c1e8/node_modules/color-convert/"),
            packageDependencies: new Map([
                ["color-name", "1.1.3"],
                ["color-convert", "1.9.3"],
            ]),
        }],
    ])],
    ["color-name", new Map([
        ["1.1.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-color-name-1.1.3-a7d0558bd89c42f795dd42328f740831ca53bc25/node_modules/color-name/"),
            packageDependencies: new Map([
                ["color-name", "1.1.3"],
            ]),
        }],
    ])],
    ["escape-string-regexp", new Map([
        ["1.0.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-escape-string-regexp-1.0.5-1b61c0562190a8dff6ae3bb2cf0200ca130b86d4/node_modules/escape-string-regexp/"),
            packageDependencies: new Map([
                ["escape-string-regexp", "1.0.5"],
            ]),
        }],
    ])],
    ["supports-color", new Map([
        ["5.5.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-supports-color-5.5.0-e2e69a44ac8772f78a1ec0b35b689df6530efc8f/node_modules/supports-color/"),
            packageDependencies: new Map([
                ["has-flag", "3.0.0"],
                ["supports-color", "5.5.0"],
            ]),
        }],
        ["2.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-supports-color-2.0.0-535d045ce6b6363fa40117084629995e9df324c7/node_modules/supports-color/"),
            packageDependencies: new Map([
                ["supports-color", "2.0.0"],
            ]),
        }],
        ["3.2.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-supports-color-3.2.3-65ac0504b3954171d8a64946b2ae3cbb8a5f54f6/node_modules/supports-color/"),
            packageDependencies: new Map([
                ["has-flag", "1.0.0"],
                ["supports-color", "3.2.3"],
            ]),
        }],
        ["6.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-supports-color-6.1.0-0764abc69c63d5ac842dd4867e8d025e880df8f3/node_modules/supports-color/"),
            packageDependencies: new Map([
                ["has-flag", "3.0.0"],
                ["supports-color", "6.1.0"],
            ]),
        }],
    ])],
    ["has-flag", new Map([
        ["3.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-has-flag-3.0.0-b5d454dc2199ae225699f3467e5a07f3b955bafd/node_modules/has-flag/"),
            packageDependencies: new Map([
                ["has-flag", "3.0.0"],
            ]),
        }],
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-has-flag-1.0.0-9d9e793165ce017a00f00418c43f942a7b1d11fa/node_modules/has-flag/"),
            packageDependencies: new Map([
                ["has-flag", "1.0.0"],
            ]),
        }],
    ])],
    ["esutils", new Map([
        ["2.0.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-esutils-2.0.3-74d2eb4de0b8da1293711910d50775b9b710ef64/node_modules/esutils/"),
            packageDependencies: new Map([
                ["esutils", "2.0.3"],
            ]),
        }],
    ])],
    ["js-tokens", new Map([
        ["4.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-js-tokens-4.0.0-19203fb59991df98e3a287050d4647cdeaf32499/node_modules/js-tokens/"),
            packageDependencies: new Map([
                ["js-tokens", "4.0.0"],
            ]),
        }],
        ["3.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-js-tokens-3.0.2-9866df395102130e38f7f996bceb65443209c25b/node_modules/js-tokens/"),
            packageDependencies: new Map([
                ["js-tokens", "3.0.2"],
            ]),
        }],
    ])],
    ["@babel/generator", new Map([
        ["7.7.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-generator-7.7.2-2f4852d04131a5e17ea4f6645488b5da66ebf3af/node_modules/@babel/generator/"),
            packageDependencies: new Map([
                ["@babel/types", "7.7.2"],
                ["jsesc", "2.5.2"],
                ["lodash", "4.17.15"],
                ["source-map", "0.5.7"],
                ["@babel/generator", "7.7.2"],
            ]),
        }],
        ["7.7.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-generator-7.7.4-db651e2840ca9aa66f327dcec1dc5f5fa9611369/node_modules/@babel/generator/"),
            packageDependencies: new Map([
                ["@babel/types", "7.7.4"],
                ["jsesc", "2.5.2"],
                ["lodash", "4.17.15"],
                ["source-map", "0.5.7"],
                ["@babel/generator", "7.7.4"],
            ]),
        }],
    ])],
    ["@babel/types", new Map([
        ["7.7.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-types-7.7.2-550b82e5571dcd174af576e23f0adba7ffc683f7/node_modules/@babel/types/"),
            packageDependencies: new Map([
                ["esutils", "2.0.3"],
                ["lodash", "4.17.15"],
                ["to-fast-properties", "2.0.0"],
                ["@babel/types", "7.7.2"],
            ]),
        }],
        ["7.7.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-types-7.7.4-516570d539e44ddf308c07569c258ff94fde9193/node_modules/@babel/types/"),
            packageDependencies: new Map([
                ["esutils", "2.0.3"],
                ["lodash", "4.17.15"],
                ["to-fast-properties", "2.0.0"],
                ["@babel/types", "7.7.4"],
            ]),
        }],
    ])],
    ["lodash", new Map([
        ["4.17.15", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-lodash-4.17.15-b447f6670a0455bbfeedd11392eff330ea097548/node_modules/lodash/"),
            packageDependencies: new Map([
                ["lodash", "4.17.15"],
            ]),
        }],
    ])],
    ["to-fast-properties", new Map([
        ["2.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-to-fast-properties-2.0.0-dc5e698cbd079265bc73e0377681a4e4e83f616e/node_modules/to-fast-properties/"),
            packageDependencies: new Map([
                ["to-fast-properties", "2.0.0"],
            ]),
        }],
        ["1.0.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-to-fast-properties-1.0.3-b83571fa4d8c25b82e231b06e3a3055de4ca1a47/node_modules/to-fast-properties/"),
            packageDependencies: new Map([
                ["to-fast-properties", "1.0.3"],
            ]),
        }],
    ])],
    ["jsesc", new Map([
        ["2.5.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-jsesc-2.5.2-80564d2e483dacf6e8ef209650a67df3f0c283a4/node_modules/jsesc/"),
            packageDependencies: new Map([
                ["jsesc", "2.5.2"],
            ]),
        }],
        ["0.5.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-jsesc-0.5.0-e7dee66e35d6fc16f710fe91d5cf69f70f08911d/node_modules/jsesc/"),
            packageDependencies: new Map([
                ["jsesc", "0.5.0"],
            ]),
        }],
        ["1.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-jsesc-1.3.0-46c3fec8c1892b12b0833db9bc7622176dbab34b/node_modules/jsesc/"),
            packageDependencies: new Map([
                ["jsesc", "1.3.0"],
            ]),
        }],
    ])],
    ["source-map", new Map([
        ["0.5.7", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-source-map-0.5.7-8a039d2d1021d22d1ea14c80d8ea468ba2ef3fcc/node_modules/source-map/"),
            packageDependencies: new Map([
                ["source-map", "0.5.7"],
            ]),
        }],
        ["0.6.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-source-map-0.6.1-74722af32e9614e9c287a8d0bbde48b5e2f1a263/node_modules/source-map/"),
            packageDependencies: new Map([
                ["source-map", "0.6.1"],
            ]),
        }],
    ])],
    ["@babel/helpers", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helpers-7.7.0-359bb5ac3b4726f7c1fde0ec75f64b3f4275d60b/node_modules/@babel/helpers/"),
            packageDependencies: new Map([
                ["@babel/template", "7.7.0"],
                ["@babel/traverse", "7.7.2"],
                ["@babel/types", "7.7.2"],
                ["@babel/helpers", "7.7.0"],
            ]),
        }],
    ])],
    ["@babel/template", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-template-7.7.0-4fadc1b8e734d97f56de39c77de76f2562e597d0/node_modules/@babel/template/"),
            packageDependencies: new Map([
                ["@babel/code-frame", "7.5.5"],
                ["@babel/parser", "7.7.3"],
                ["@babel/types", "7.7.2"],
                ["@babel/template", "7.7.0"],
            ]),
        }],
        ["7.7.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-template-7.7.4-428a7d9eecffe27deac0a98e23bf8e3675d2a77b/node_modules/@babel/template/"),
            packageDependencies: new Map([
                ["@babel/code-frame", "7.5.5"],
                ["@babel/parser", "7.7.4"],
                ["@babel/types", "7.7.4"],
                ["@babel/template", "7.7.4"],
            ]),
        }],
    ])],
    ["@babel/parser", new Map([
        ["7.7.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-parser-7.7.3-5fad457c2529de476a248f75b0f090b3060af043/node_modules/@babel/parser/"),
            packageDependencies: new Map([
                ["@babel/parser", "7.7.3"],
            ]),
        }],
        ["7.7.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-parser-7.7.4-75ab2d7110c2cf2fa949959afb05fa346d2231bb/node_modules/@babel/parser/"),
            packageDependencies: new Map([
                ["@babel/parser", "7.7.4"],
            ]),
        }],
    ])],
    ["@babel/traverse", new Map([
        ["7.7.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-traverse-7.7.2-ef0a65e07a2f3c550967366b3d9b62a2dcbeae09/node_modules/@babel/traverse/"),
            packageDependencies: new Map([
                ["@babel/code-frame", "7.5.5"],
                ["@babel/generator", "7.7.2"],
                ["@babel/helper-function-name", "7.7.0"],
                ["@babel/helper-split-export-declaration", "7.7.0"],
                ["@babel/parser", "7.7.3"],
                ["@babel/types", "7.7.2"],
                ["debug", "4.1.1"],
                ["globals", "11.12.0"],
                ["lodash", "4.17.15"],
                ["@babel/traverse", "7.7.2"],
            ]),
        }],
        ["7.7.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-traverse-7.7.4-9c1e7c60fb679fe4fcfaa42500833333c2058558/node_modules/@babel/traverse/"),
            packageDependencies: new Map([
                ["@babel/code-frame", "7.5.5"],
                ["@babel/generator", "7.7.4"],
                ["@babel/helper-function-name", "7.7.4"],
                ["@babel/helper-split-export-declaration", "7.7.4"],
                ["@babel/parser", "7.7.4"],
                ["@babel/types", "7.7.4"],
                ["debug", "4.1.1"],
                ["globals", "11.12.0"],
                ["lodash", "4.17.15"],
                ["@babel/traverse", "7.7.4"],
            ]),
        }],
    ])],
    ["@babel/helper-function-name", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-function-name-7.7.0-44a5ad151cfff8ed2599c91682dda2ec2c8430a3/node_modules/@babel/helper-function-name/"),
            packageDependencies: new Map([
                ["@babel/helper-get-function-arity", "7.7.0"],
                ["@babel/template", "7.7.0"],
                ["@babel/types", "7.7.2"],
                ["@babel/helper-function-name", "7.7.0"],
            ]),
        }],
        ["7.7.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-function-name-7.7.4-ab6e041e7135d436d8f0a3eca15de5b67a341a2e/node_modules/@babel/helper-function-name/"),
            packageDependencies: new Map([
                ["@babel/helper-get-function-arity", "7.7.4"],
                ["@babel/template", "7.7.4"],
                ["@babel/types", "7.7.4"],
                ["@babel/helper-function-name", "7.7.4"],
            ]),
        }],
    ])],
    ["@babel/helper-get-function-arity", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-get-function-arity-7.7.0-c604886bc97287a1d1398092bc666bc3d7d7aa2d/node_modules/@babel/helper-get-function-arity/"),
            packageDependencies: new Map([
                ["@babel/types", "7.7.2"],
                ["@babel/helper-get-function-arity", "7.7.0"],
            ]),
        }],
        ["7.7.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-get-function-arity-7.7.4-cb46348d2f8808e632f0ab048172130e636005f0/node_modules/@babel/helper-get-function-arity/"),
            packageDependencies: new Map([
                ["@babel/types", "7.7.4"],
                ["@babel/helper-get-function-arity", "7.7.4"],
            ]),
        }],
    ])],
    ["@babel/helper-split-export-declaration", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-split-export-declaration-7.7.0-1365e74ea6c614deeb56ebffabd71006a0eb2300/node_modules/@babel/helper-split-export-declaration/"),
            packageDependencies: new Map([
                ["@babel/types", "7.7.2"],
                ["@babel/helper-split-export-declaration", "7.7.0"],
            ]),
        }],
        ["7.7.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-split-export-declaration-7.7.4-57292af60443c4a3622cf74040ddc28e68336fd8/node_modules/@babel/helper-split-export-declaration/"),
            packageDependencies: new Map([
                ["@babel/types", "7.7.4"],
                ["@babel/helper-split-export-declaration", "7.7.4"],
            ]),
        }],
    ])],
    ["debug", new Map([
        ["4.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-debug-4.1.1-3b72260255109c6b589cee050f1d516139664791/node_modules/debug/"),
            packageDependencies: new Map([
                ["ms", "2.1.2"],
                ["debug", "4.1.1"],
            ]),
        }],
        ["2.6.9", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-debug-2.6.9-5d128515df134ff327e90a4c93f4e077a536341f/node_modules/debug/"),
            packageDependencies: new Map([
                ["ms", "2.0.0"],
                ["debug", "2.6.9"],
            ]),
        }],
        ["3.2.6", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-debug-3.2.6-e83d17de16d8a7efb7717edbe5fb10135eee629b/node_modules/debug/"),
            packageDependencies: new Map([
                ["ms", "2.1.2"],
                ["debug", "3.2.6"],
            ]),
        }],
    ])],
    ["ms", new Map([
        ["2.1.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ms-2.1.2-d09d1f357b443f493382a8eb3ccd183872ae6009/node_modules/ms/"),
            packageDependencies: new Map([
                ["ms", "2.1.2"],
            ]),
        }],
        ["2.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ms-2.0.0-5608aeadfc00be6c2901df5f9861788de0d597c8/node_modules/ms/"),
            packageDependencies: new Map([
                ["ms", "2.0.0"],
            ]),
        }],
        ["2.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ms-2.1.1-30a5864eb3ebb0a66f2ebe6d727af06a09d86e0a/node_modules/ms/"),
            packageDependencies: new Map([
                ["ms", "2.1.1"],
            ]),
        }],
    ])],
    ["globals", new Map([
        ["11.12.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-globals-11.12.0-ab8795338868a0babd8525758018c2a7eb95c42e/node_modules/globals/"),
            packageDependencies: new Map([
                ["globals", "11.12.0"],
            ]),
        }],
        ["9.18.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-globals-9.18.0-aa3896b3e69b487f17e31ed2143d69a8e30c2d8a/node_modules/globals/"),
            packageDependencies: new Map([
                ["globals", "9.18.0"],
            ]),
        }],
    ])],
    ["convert-source-map", new Map([
        ["1.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-convert-source-map-1.7.0-17a2cb882d7f77d3490585e2ce6c524424a3a442/node_modules/convert-source-map/"),
            packageDependencies: new Map([
                ["safe-buffer", "5.1.2"],
                ["convert-source-map", "1.7.0"],
            ]),
        }],
    ])],
    ["safe-buffer", new Map([
        ["5.1.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-safe-buffer-5.1.2-991ec69d296e0313747d59bdfd2b745c35f8828d/node_modules/safe-buffer/"),
            packageDependencies: new Map([
                ["safe-buffer", "5.1.2"],
            ]),
        }],
        ["5.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-safe-buffer-5.2.0-b74daec49b1148f88c64b68d49b1e815c1f2f519/node_modules/safe-buffer/"),
            packageDependencies: new Map([
                ["safe-buffer", "5.2.0"],
            ]),
        }],
    ])],
    ["json5", new Map([
        ["2.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-json5-2.1.1-81b6cb04e9ba496f1c7005d07b4368a2638f90b6/node_modules/json5/"),
            packageDependencies: new Map([
                ["minimist", "1.2.0"],
                ["json5", "2.1.1"],
            ]),
        }],
        ["1.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-json5-1.0.1-779fb0018604fa854eacbf6252180d83543e3dbe/node_modules/json5/"),
            packageDependencies: new Map([
                ["minimist", "1.2.0"],
                ["json5", "1.0.1"],
            ]),
        }],
        ["0.5.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-json5-0.5.1-1eade7acc012034ad84e2396767ead9fa5495821/node_modules/json5/"),
            packageDependencies: new Map([
                ["json5", "0.5.1"],
            ]),
        }],
    ])],
    ["minimist", new Map([
        ["1.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-minimist-1.2.0-a35008b20f41383eec1fb914f4cd5df79a264284/node_modules/minimist/"),
            packageDependencies: new Map([
                ["minimist", "1.2.0"],
            ]),
        }],
        ["0.0.8", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-minimist-0.0.8-857fcabfc3397d2625b8228262e86aa7a011b05d/node_modules/minimist/"),
            packageDependencies: new Map([
                ["minimist", "0.0.8"],
            ]),
        }],
        ["0.0.10", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-minimist-0.0.10-de3f98543dbf96082be48ad1a0c7cda836301dcf/node_modules/minimist/"),
            packageDependencies: new Map([
                ["minimist", "0.0.10"],
            ]),
        }],
    ])],
    ["resolve", new Map([
        ["1.12.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-resolve-1.12.0-3fc644a35c84a48554609ff26ec52b66fa577df6/node_modules/resolve/"),
            packageDependencies: new Map([
                ["path-parse", "1.0.6"],
                ["resolve", "1.12.0"],
            ]),
        }],
    ])],
    ["path-parse", new Map([
        ["1.0.6", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-path-parse-1.0.6-d62dbb5679405d72c4737ec58600e9ddcf06d24c/node_modules/path-parse/"),
            packageDependencies: new Map([
                ["path-parse", "1.0.6"],
            ]),
        }],
    ])],
    ["semver", new Map([
        ["5.7.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-semver-5.7.1-a954f931aeba508d307bbf069eff0c01c96116f7/node_modules/semver/"),
            packageDependencies: new Map([
                ["semver", "5.7.1"],
            ]),
        }],
        ["6.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-semver-6.3.0-ee0a64c8af5e8ceea67687b133761e1becbd1d3d/node_modules/semver/"),
            packageDependencies: new Map([
                ["semver", "6.3.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-proposal-class-properties", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-class-properties-7.7.0-ac54e728ecf81d90e8f4d2a9c05a890457107917/node_modules/@babel/plugin-proposal-class-properties/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-create-class-features-plugin", "pnp:83fed53edb56c6d4a44663771c2953b964853068"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-proposal-class-properties", "7.7.0"],
            ]),
        }],
    ])],
    ["@babel/helper-create-class-features-plugin", new Map([
        ["pnp:83fed53edb56c6d4a44663771c2953b964853068", {
            packageLocation: path.resolve(__dirname, "./.pnp/externals/pnp-83fed53edb56c6d4a44663771c2953b964853068/node_modules/@babel/helper-create-class-features-plugin/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-function-name", "7.7.0"],
                ["@babel/helper-member-expression-to-functions", "7.7.0"],
                ["@babel/helper-optimise-call-expression", "7.7.0"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/helper-replace-supers", "7.7.0"],
                ["@babel/helper-split-export-declaration", "7.7.0"],
                ["@babel/helper-create-class-features-plugin", "pnp:83fed53edb56c6d4a44663771c2953b964853068"],
            ]),
        }],
        ["pnp:f2d928359c86b6fd803fa60b9c6c5e57b0d39a07", {
            packageLocation: path.resolve(__dirname, "./.pnp/externals/pnp-f2d928359c86b6fd803fa60b9c6c5e57b0d39a07/node_modules/@babel/helper-create-class-features-plugin/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-function-name", "7.7.0"],
                ["@babel/helper-member-expression-to-functions", "7.7.0"],
                ["@babel/helper-optimise-call-expression", "7.7.0"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/helper-replace-supers", "7.7.0"],
                ["@babel/helper-split-export-declaration", "7.7.0"],
                ["@babel/helper-create-class-features-plugin", "pnp:f2d928359c86b6fd803fa60b9c6c5e57b0d39a07"],
            ]),
        }],
        ["7.7.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-create-class-features-plugin-7.7.4-fce60939fd50618610942320a8d951b3b639da2d/node_modules/@babel/helper-create-class-features-plugin/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-function-name", "7.7.4"],
                ["@babel/helper-member-expression-to-functions", "7.7.4"],
                ["@babel/helper-optimise-call-expression", "7.7.4"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/helper-replace-supers", "7.7.4"],
                ["@babel/helper-split-export-declaration", "7.7.4"],
                ["@babel/helper-create-class-features-plugin", "7.7.4"],
            ]),
        }],
    ])],
    ["@babel/helper-member-expression-to-functions", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-member-expression-to-functions-7.7.0-472b93003a57071f95a541ea6c2b098398bcad8a/node_modules/@babel/helper-member-expression-to-functions/"),
            packageDependencies: new Map([
                ["@babel/types", "7.7.2"],
                ["@babel/helper-member-expression-to-functions", "7.7.0"],
            ]),
        }],
        ["7.7.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-member-expression-to-functions-7.7.4-356438e2569df7321a8326644d4b790d2122cb74/node_modules/@babel/helper-member-expression-to-functions/"),
            packageDependencies: new Map([
                ["@babel/types", "7.7.4"],
                ["@babel/helper-member-expression-to-functions", "7.7.4"],
            ]),
        }],
    ])],
    ["@babel/helper-optimise-call-expression", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-optimise-call-expression-7.7.0-4f66a216116a66164135dc618c5d8b7a959f9365/node_modules/@babel/helper-optimise-call-expression/"),
            packageDependencies: new Map([
                ["@babel/types", "7.7.2"],
                ["@babel/helper-optimise-call-expression", "7.7.0"],
            ]),
        }],
        ["7.7.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-optimise-call-expression-7.7.4-034af31370d2995242aa4df402c3b7794b2dcdf2/node_modules/@babel/helper-optimise-call-expression/"),
            packageDependencies: new Map([
                ["@babel/types", "7.7.4"],
                ["@babel/helper-optimise-call-expression", "7.7.4"],
            ]),
        }],
    ])],
    ["@babel/helper-plugin-utils", new Map([
        ["7.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-plugin-utils-7.0.0-bbb3fbee98661c569034237cc03967ba99b4f250/node_modules/@babel/helper-plugin-utils/"),
            packageDependencies: new Map([
                ["@babel/helper-plugin-utils", "7.0.0"],
            ]),
        }],
    ])],
    ["@babel/helper-replace-supers", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-replace-supers-7.7.0-d5365c8667fe7cbd13b8ddddceb9bd7f2b387512/node_modules/@babel/helper-replace-supers/"),
            packageDependencies: new Map([
                ["@babel/helper-member-expression-to-functions", "7.7.0"],
                ["@babel/helper-optimise-call-expression", "7.7.0"],
                ["@babel/traverse", "7.7.2"],
                ["@babel/types", "7.7.2"],
                ["@babel/helper-replace-supers", "7.7.0"],
            ]),
        }],
        ["7.7.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-replace-supers-7.7.4-3c881a6a6a7571275a72d82e6107126ec9e2cdd2/node_modules/@babel/helper-replace-supers/"),
            packageDependencies: new Map([
                ["@babel/helper-member-expression-to-functions", "7.7.4"],
                ["@babel/helper-optimise-call-expression", "7.7.4"],
                ["@babel/traverse", "7.7.4"],
                ["@babel/types", "7.7.4"],
                ["@babel/helper-replace-supers", "7.7.4"],
            ]),
        }],
    ])],
    ["@babel/plugin-proposal-decorators", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-decorators-7.7.0-d386a45730a4eb8c03e23a80b6d3dbefd761c9c9/node_modules/@babel/plugin-proposal-decorators/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-create-class-features-plugin", "pnp:f2d928359c86b6fd803fa60b9c6c5e57b0d39a07"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-decorators", "7.2.0"],
                ["@babel/plugin-proposal-decorators", "7.7.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-syntax-decorators", new Map([
        ["7.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-syntax-decorators-7.2.0-c50b1b957dcc69e4b1127b65e1c33eef61570c1b/node_modules/@babel/plugin-syntax-decorators/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-decorators", "7.2.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-proposal-export-default-from", new Map([
        ["7.5.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-export-default-from-7.5.2-2c0ac2dcc36e3b2443fead2c3c5fc796fb1b5145/node_modules/@babel/plugin-proposal-export-default-from/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-export-default-from", "7.2.0"],
                ["@babel/plugin-proposal-export-default-from", "7.5.2"],
            ]),
        }],
    ])],
    ["@babel/plugin-syntax-export-default-from", new Map([
        ["7.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-syntax-export-default-from-7.2.0-edd83b7adc2e0d059e2467ca96c650ab6d2f3820/node_modules/@babel/plugin-syntax-export-default-from/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-export-default-from", "7.2.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-proposal-export-namespace-from", new Map([
        ["7.5.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-export-namespace-from-7.5.2-ccd5ed05b06d700688ff1db01a9dd27155e0d2a0/node_modules/@babel/plugin-proposal-export-namespace-from/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-export-namespace-from", "7.2.0"],
                ["@babel/plugin-proposal-export-namespace-from", "7.5.2"],
            ]),
        }],
    ])],
    ["@babel/plugin-syntax-export-namespace-from", new Map([
        ["7.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-syntax-export-namespace-from-7.2.0-8d257838c6b3b779db52c0224443459bd27fb039/node_modules/@babel/plugin-syntax-export-namespace-from/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-export-namespace-from", "7.2.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-proposal-function-sent", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-function-sent-7.7.0-590fcf28b55832459d9a747625c563d8abba4d13/node_modules/@babel/plugin-proposal-function-sent/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/helper-wrap-function", "7.7.0"],
                ["@babel/plugin-syntax-function-sent", "7.2.0"],
                ["@babel/plugin-proposal-function-sent", "7.7.0"],
            ]),
        }],
    ])],
    ["@babel/helper-wrap-function", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-wrap-function-7.7.0-15af3d3e98f8417a60554acbb6c14e75e0b33b74/node_modules/@babel/helper-wrap-function/"),
            packageDependencies: new Map([
                ["@babel/helper-function-name", "7.7.0"],
                ["@babel/template", "7.7.0"],
                ["@babel/traverse", "7.7.2"],
                ["@babel/types", "7.7.2"],
                ["@babel/helper-wrap-function", "7.7.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-syntax-function-sent", new Map([
        ["7.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-syntax-function-sent-7.2.0-91474d4d400604e4c6cbd4d77cd6cb3b8565576c/node_modules/@babel/plugin-syntax-function-sent/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-function-sent", "7.2.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-proposal-json-strings", new Map([
        ["pnp:95b7255d806e48378a73c6255b1d4c3917494842", {
            packageLocation: path.resolve(__dirname, "./.pnp/externals/pnp-95b7255d806e48378a73c6255b1d4c3917494842/node_modules/@babel/plugin-proposal-json-strings/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-json-strings", "pnp:b070ab5530b4c80bc1fc46ce2024e469e5d7fbdb"],
                ["@babel/plugin-proposal-json-strings", "pnp:95b7255d806e48378a73c6255b1d4c3917494842"],
            ]),
        }],
        ["pnp:1ced04ae106d776a5bb9c7c6b8070f960b5cccbb", {
            packageLocation: path.resolve(__dirname, "./.pnp/externals/pnp-1ced04ae106d776a5bb9c7c6b8070f960b5cccbb/node_modules/@babel/plugin-proposal-json-strings/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-json-strings", "pnp:fd98af3495c3c6f1203613fc06648c76c2b60d3b"],
                ["@babel/plugin-proposal-json-strings", "pnp:1ced04ae106d776a5bb9c7c6b8070f960b5cccbb"],
            ]),
        }],
    ])],
    ["@babel/plugin-syntax-json-strings", new Map([
        ["pnp:b070ab5530b4c80bc1fc46ce2024e469e5d7fbdb", {
            packageLocation: path.resolve(__dirname, "./.pnp/externals/pnp-b070ab5530b4c80bc1fc46ce2024e469e5d7fbdb/node_modules/@babel/plugin-syntax-json-strings/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-json-strings", "pnp:b070ab5530b4c80bc1fc46ce2024e469e5d7fbdb"],
            ]),
        }],
        ["pnp:fd98af3495c3c6f1203613fc06648c76c2b60d3b", {
            packageLocation: path.resolve(__dirname, "./.pnp/externals/pnp-fd98af3495c3c6f1203613fc06648c76c2b60d3b/node_modules/@babel/plugin-syntax-json-strings/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-json-strings", "pnp:fd98af3495c3c6f1203613fc06648c76c2b60d3b"],
            ]),
        }],
        ["pnp:2830c17de82a10d46b198a052d8defa1fc4566a1", {
            packageLocation: path.resolve(__dirname, "./.pnp/externals/pnp-2830c17de82a10d46b198a052d8defa1fc4566a1/node_modules/@babel/plugin-syntax-json-strings/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-json-strings", "pnp:2830c17de82a10d46b198a052d8defa1fc4566a1"],
            ]),
        }],
    ])],
    ["@babel/plugin-proposal-numeric-separator", new Map([
        ["7.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-numeric-separator-7.2.0-646854daf4cd22fd6733f6076013a936310443ac/node_modules/@babel/plugin-proposal-numeric-separator/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-numeric-separator", "7.2.0"],
                ["@babel/plugin-proposal-numeric-separator", "7.2.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-syntax-numeric-separator", new Map([
        ["7.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-syntax-numeric-separator-7.2.0-7470fe070c2944469a756752a69a6963135018be/node_modules/@babel/plugin-syntax-numeric-separator/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-numeric-separator", "7.2.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-proposal-object-rest-spread", new Map([
        ["7.7.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-object-rest-spread-7.7.4-cc57849894a5c774214178c8ab64f6334ec8af71/node_modules/@babel/plugin-proposal-object-rest-spread/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-object-rest-spread", "7.7.4"],
                ["@babel/plugin-proposal-object-rest-spread", "7.7.4"],
            ]),
        }],
        ["7.6.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-object-rest-spread-7.6.2-8ffccc8f3a6545e9f78988b6bf4fe881b88e8096/node_modules/@babel/plugin-proposal-object-rest-spread/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-object-rest-spread", "pnp:38603f6e818eb5a82002bf59036b8fdb0abb4079"],
                ["@babel/plugin-proposal-object-rest-spread", "7.6.2"],
            ]),
        }],
    ])],
    ["@babel/plugin-syntax-object-rest-spread", new Map([
        ["7.7.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-syntax-object-rest-spread-7.7.4-47cf220d19d6d0d7b154304701f468fc1cc6ff46/node_modules/@babel/plugin-syntax-object-rest-spread/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-object-rest-spread", "7.7.4"],
            ]),
        }],
        ["pnp:38603f6e818eb5a82002bf59036b8fdb0abb4079", {
            packageLocation: path.resolve(__dirname, "./.pnp/externals/pnp-38603f6e818eb5a82002bf59036b8fdb0abb4079/node_modules/@babel/plugin-syntax-object-rest-spread/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-object-rest-spread", "pnp:38603f6e818eb5a82002bf59036b8fdb0abb4079"],
            ]),
        }],
        ["pnp:f74e4a3f79bc77f6007dc94310a63c1df2a4ed04", {
            packageLocation: path.resolve(__dirname, "./.pnp/externals/pnp-f74e4a3f79bc77f6007dc94310a63c1df2a4ed04/node_modules/@babel/plugin-syntax-object-rest-spread/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-object-rest-spread", "pnp:f74e4a3f79bc77f6007dc94310a63c1df2a4ed04"],
            ]),
        }],
    ])],
    ["@babel/plugin-proposal-optional-chaining", new Map([
        ["7.6.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-optional-chaining-7.6.0-e9bf1f9b9ba10c77c033082da75f068389041af8/node_modules/@babel/plugin-proposal-optional-chaining/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-optional-chaining", "7.2.0"],
                ["@babel/plugin-proposal-optional-chaining", "7.6.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-syntax-optional-chaining", new Map([
        ["7.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-syntax-optional-chaining-7.2.0-a59d6ae8c167e7608eaa443fda9fa8fa6bf21dff/node_modules/@babel/plugin-syntax-optional-chaining/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-optional-chaining", "7.2.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-proposal-private-methods", new Map([
        ["7.7.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-private-methods-7.7.4-2531e747064df7a2d9162eac47d713c7b26340b9/node_modules/@babel/plugin-proposal-private-methods/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-create-class-features-plugin", "7.7.4"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-proposal-private-methods", "7.7.4"],
            ]),
        }],
    ])],
    ["@babel/plugin-proposal-throw-expressions", new Map([
        ["7.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-throw-expressions-7.2.0-2d9e452d370f139000e51db65d0a85dc60c64739/node_modules/@babel/plugin-proposal-throw-expressions/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-throw-expressions", "7.2.0"],
                ["@babel/plugin-proposal-throw-expressions", "7.2.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-syntax-throw-expressions", new Map([
        ["7.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-syntax-throw-expressions-7.2.0-79001ee2afe1b174b1733cdc2fc69c9a46a0f1f8/node_modules/@babel/plugin-syntax-throw-expressions/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-throw-expressions", "7.2.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-syntax-dynamic-import", new Map([
        ["pnp:dca2d6f7fc46ba4c77c5e8686a6350625873747d", {
            packageLocation: path.resolve(__dirname, "./.pnp/externals/pnp-dca2d6f7fc46ba4c77c5e8686a6350625873747d/node_modules/@babel/plugin-syntax-dynamic-import/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-dynamic-import", "pnp:dca2d6f7fc46ba4c77c5e8686a6350625873747d"],
            ]),
        }],
        ["pnp:3c1bc8676e7033b9f0989a5079b420b93d99b950", {
            packageLocation: path.resolve(__dirname, "./.pnp/externals/pnp-3c1bc8676e7033b9f0989a5079b420b93d99b950/node_modules/@babel/plugin-syntax-dynamic-import/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-dynamic-import", "pnp:3c1bc8676e7033b9f0989a5079b420b93d99b950"],
            ]),
        }],
        ["pnp:4c795551df188e40f630a551aca3f0b67d712d91", {
            packageLocation: path.resolve(__dirname, "./.pnp/externals/pnp-4c795551df188e40f630a551aca3f0b67d712d91/node_modules/@babel/plugin-syntax-dynamic-import/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-dynamic-import", "pnp:4c795551df188e40f630a551aca3f0b67d712d91"],
            ]),
        }],
    ])],
    ["@babel/plugin-syntax-flow", new Map([
        ["7.7.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-syntax-flow-7.7.4-6d91b59e1a0e4c17f36af2e10dd64ef220919d7b/node_modules/@babel/plugin-syntax-flow/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-flow", "7.7.4"],
            ]),
        }],
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-syntax-flow-7.7.0-5c9465bcd26354d5215294ea90ab1c706a571386/node_modules/@babel/plugin-syntax-flow/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-flow", "7.7.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-syntax-import-meta", new Map([
        ["7.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-syntax-import-meta-7.2.0-2333ef4b875553a3bcd1e93f8ebc09f5b9213a40/node_modules/@babel/plugin-syntax-import-meta/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-import-meta", "7.2.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-flow-strip-types", new Map([
        ["pnp:968d630ee766ba18b9af0c11cba1fb8f929ca617", {
            packageLocation: path.resolve(__dirname, "./.pnp/externals/pnp-968d630ee766ba18b9af0c11cba1fb8f929ca617/node_modules/@babel/plugin-transform-flow-strip-types/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-flow", "7.7.0"],
                ["@babel/plugin-transform-flow-strip-types", "pnp:968d630ee766ba18b9af0c11cba1fb8f929ca617"],
            ]),
        }],
        ["pnp:55946e8417942779578fc39ee8c25e17593ac269", {
            packageLocation: path.resolve(__dirname, "./.pnp/externals/pnp-55946e8417942779578fc39ee8c25e17593ac269/node_modules/@babel/plugin-transform-flow-strip-types/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-flow", "7.7.0"],
                ["@babel/plugin-transform-flow-strip-types", "pnp:55946e8417942779578fc39ee8c25e17593ac269"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-runtime", new Map([
        ["7.6.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-runtime-7.6.2-2669f67c1fae0ae8d8bf696e4263ad52cb98b6f8/node_modules/@babel/plugin-transform-runtime/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-module-imports", "7.7.0"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["resolve", "1.12.0"],
                ["semver", "5.7.1"],
                ["@babel/plugin-transform-runtime", "7.6.2"],
            ]),
        }],
    ])],
    ["@babel/helper-module-imports", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-module-imports-7.7.0-99c095889466e5f7b6d66d98dffc58baaf42654d/node_modules/@babel/helper-module-imports/"),
            packageDependencies: new Map([
                ["@babel/types", "7.7.2"],
                ["@babel/helper-module-imports", "7.7.0"],
            ]),
        }],
    ])],
    ["@babel/preset-env", new Map([
        ["7.7.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-preset-env-7.7.1-04a2ff53552c5885cf1083e291c8dd5490f744bb/node_modules/@babel/preset-env/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-module-imports", "7.7.0"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-proposal-async-generator-functions", "7.7.0"],
                ["@babel/plugin-proposal-dynamic-import", "7.7.0"],
                ["@babel/plugin-proposal-json-strings", "pnp:1ced04ae106d776a5bb9c7c6b8070f960b5cccbb"],
                ["@babel/plugin-proposal-object-rest-spread", "7.6.2"],
                ["@babel/plugin-proposal-optional-catch-binding", "7.2.0"],
                ["@babel/plugin-proposal-unicode-property-regex", "7.7.0"],
                ["@babel/plugin-syntax-async-generators", "pnp:c3762f2effb1ef896fed6137769e7cbce250079e"],
                ["@babel/plugin-syntax-dynamic-import", "pnp:4c795551df188e40f630a551aca3f0b67d712d91"],
                ["@babel/plugin-syntax-json-strings", "pnp:2830c17de82a10d46b198a052d8defa1fc4566a1"],
                ["@babel/plugin-syntax-object-rest-spread", "pnp:f74e4a3f79bc77f6007dc94310a63c1df2a4ed04"],
                ["@babel/plugin-syntax-optional-catch-binding", "pnp:1535a3cdab988c4b77ae582ee936d0c8523246dc"],
                ["@babel/plugin-syntax-top-level-await", "7.7.0"],
                ["@babel/plugin-transform-arrow-functions", "7.2.0"],
                ["@babel/plugin-transform-async-to-generator", "7.7.0"],
                ["@babel/plugin-transform-block-scoped-functions", "7.2.0"],
                ["@babel/plugin-transform-block-scoping", "7.6.3"],
                ["@babel/plugin-transform-classes", "7.7.0"],
                ["@babel/plugin-transform-computed-properties", "7.2.0"],
                ["@babel/plugin-transform-destructuring", "7.6.0"],
                ["@babel/plugin-transform-dotall-regex", "7.7.0"],
                ["@babel/plugin-transform-duplicate-keys", "7.5.0"],
                ["@babel/plugin-transform-exponentiation-operator", "7.2.0"],
                ["@babel/plugin-transform-for-of", "7.4.4"],
                ["@babel/plugin-transform-function-name", "7.7.0"],
                ["@babel/plugin-transform-literals", "7.2.0"],
                ["@babel/plugin-transform-member-expression-literals", "7.2.0"],
                ["@babel/plugin-transform-modules-amd", "7.5.0"],
                ["@babel/plugin-transform-modules-commonjs", "7.7.0"],
                ["@babel/plugin-transform-modules-systemjs", "7.7.0"],
                ["@babel/plugin-transform-modules-umd", "7.7.0"],
                ["@babel/plugin-transform-named-capturing-groups-regex", "7.7.0"],
                ["@babel/plugin-transform-new-target", "7.4.4"],
                ["@babel/plugin-transform-object-super", "7.5.5"],
                ["@babel/plugin-transform-parameters", "7.4.4"],
                ["@babel/plugin-transform-property-literals", "7.2.0"],
                ["@babel/plugin-transform-regenerator", "7.7.0"],
                ["@babel/plugin-transform-reserved-words", "7.2.0"],
                ["@babel/plugin-transform-shorthand-properties", "7.2.0"],
                ["@babel/plugin-transform-spread", "7.6.2"],
                ["@babel/plugin-transform-sticky-regex", "7.2.0"],
                ["@babel/plugin-transform-template-literals", "7.4.4"],
                ["@babel/plugin-transform-typeof-symbol", "7.2.0"],
                ["@babel/plugin-transform-unicode-regex", "7.7.0"],
                ["@babel/types", "7.7.2"],
                ["browserslist", "4.7.3"],
                ["core-js-compat", "3.4.1"],
                ["invariant", "2.2.4"],
                ["js-levenshtein", "1.1.6"],
                ["semver", "5.7.1"],
                ["@babel/preset-env", "7.7.1"],
            ]),
        }],
    ])],
    ["@babel/plugin-proposal-async-generator-functions", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-async-generator-functions-7.7.0-83ef2d6044496b4c15d8b4904e2219e6dccc6971/node_modules/@babel/plugin-proposal-async-generator-functions/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/helper-remap-async-to-generator", "7.7.0"],
                ["@babel/plugin-syntax-async-generators", "pnp:7647dcedd7cea865fe6006a2ceae5b654356fc45"],
                ["@babel/plugin-proposal-async-generator-functions", "7.7.0"],
            ]),
        }],
    ])],
    ["@babel/helper-remap-async-to-generator", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-remap-async-to-generator-7.7.0-4d69ec653e8bff5bce62f5d33fc1508f223c75a7/node_modules/@babel/helper-remap-async-to-generator/"),
            packageDependencies: new Map([
                ["@babel/helper-annotate-as-pure", "7.7.0"],
                ["@babel/helper-wrap-function", "7.7.0"],
                ["@babel/template", "7.7.0"],
                ["@babel/traverse", "7.7.2"],
                ["@babel/types", "7.7.2"],
                ["@babel/helper-remap-async-to-generator", "7.7.0"],
            ]),
        }],
    ])],
    ["@babel/helper-annotate-as-pure", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-annotate-as-pure-7.7.0-efc54032d43891fe267679e63f6860aa7dbf4a5e/node_modules/@babel/helper-annotate-as-pure/"),
            packageDependencies: new Map([
                ["@babel/types", "7.7.2"],
                ["@babel/helper-annotate-as-pure", "7.7.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-syntax-async-generators", new Map([
        ["pnp:7647dcedd7cea865fe6006a2ceae5b654356fc45", {
            packageLocation: path.resolve(__dirname, "./.pnp/externals/pnp-7647dcedd7cea865fe6006a2ceae5b654356fc45/node_modules/@babel/plugin-syntax-async-generators/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-async-generators", "pnp:7647dcedd7cea865fe6006a2ceae5b654356fc45"],
            ]),
        }],
        ["pnp:c3762f2effb1ef896fed6137769e7cbce250079e", {
            packageLocation: path.resolve(__dirname, "./.pnp/externals/pnp-c3762f2effb1ef896fed6137769e7cbce250079e/node_modules/@babel/plugin-syntax-async-generators/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-async-generators", "pnp:c3762f2effb1ef896fed6137769e7cbce250079e"],
            ]),
        }],
    ])],
    ["@babel/plugin-proposal-dynamic-import", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-dynamic-import-7.7.0-dc02a8bad8d653fb59daf085516fa416edd2aa7f/node_modules/@babel/plugin-proposal-dynamic-import/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-dynamic-import", "pnp:3c1bc8676e7033b9f0989a5079b420b93d99b950"],
                ["@babel/plugin-proposal-dynamic-import", "7.7.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-proposal-optional-catch-binding", new Map([
        ["7.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-optional-catch-binding-7.2.0-135d81edb68a081e55e56ec48541ece8065c38f5/node_modules/@babel/plugin-proposal-optional-catch-binding/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-optional-catch-binding", "pnp:3370d07367235b9c5a1cb9b71ec55425520b8884"],
                ["@babel/plugin-proposal-optional-catch-binding", "7.2.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-syntax-optional-catch-binding", new Map([
        ["pnp:3370d07367235b9c5a1cb9b71ec55425520b8884", {
            packageLocation: path.resolve(__dirname, "./.pnp/externals/pnp-3370d07367235b9c5a1cb9b71ec55425520b8884/node_modules/@babel/plugin-syntax-optional-catch-binding/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-optional-catch-binding", "pnp:3370d07367235b9c5a1cb9b71ec55425520b8884"],
            ]),
        }],
        ["pnp:1535a3cdab988c4b77ae582ee936d0c8523246dc", {
            packageLocation: path.resolve(__dirname, "./.pnp/externals/pnp-1535a3cdab988c4b77ae582ee936d0c8523246dc/node_modules/@babel/plugin-syntax-optional-catch-binding/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-optional-catch-binding", "pnp:1535a3cdab988c4b77ae582ee936d0c8523246dc"],
            ]),
        }],
    ])],
    ["@babel/plugin-proposal-unicode-property-regex", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-unicode-property-regex-7.7.0-549fe1717a1bd0a2a7e63163841cb37e78179d5d/node_modules/@babel/plugin-proposal-unicode-property-regex/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-create-regexp-features-plugin", "pnp:da3fcd7cc0d19352a9f0005ab0a3aba6e38e1da6"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-proposal-unicode-property-regex", "7.7.0"],
            ]),
        }],
    ])],
    ["@babel/helper-create-regexp-features-plugin", new Map([
        ["pnp:da3fcd7cc0d19352a9f0005ab0a3aba6e38e1da6", {
            packageLocation: path.resolve(__dirname, "./.pnp/externals/pnp-da3fcd7cc0d19352a9f0005ab0a3aba6e38e1da6/node_modules/@babel/helper-create-regexp-features-plugin/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-regex", "7.5.5"],
                ["regexpu-core", "4.6.0"],
                ["@babel/helper-create-regexp-features-plugin", "pnp:da3fcd7cc0d19352a9f0005ab0a3aba6e38e1da6"],
            ]),
        }],
        ["pnp:c1d07d59eb251071bf95817fbc2720a2de9825c5", {
            packageLocation: path.resolve(__dirname, "./.pnp/externals/pnp-c1d07d59eb251071bf95817fbc2720a2de9825c5/node_modules/@babel/helper-create-regexp-features-plugin/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-regex", "7.5.5"],
                ["regexpu-core", "4.6.0"],
                ["@babel/helper-create-regexp-features-plugin", "pnp:c1d07d59eb251071bf95817fbc2720a2de9825c5"],
            ]),
        }],
        ["pnp:73743d202a8c421645fe70f62867b9ce94402827", {
            packageLocation: path.resolve(__dirname, "./.pnp/externals/pnp-73743d202a8c421645fe70f62867b9ce94402827/node_modules/@babel/helper-create-regexp-features-plugin/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-regex", "7.5.5"],
                ["regexpu-core", "4.6.0"],
                ["@babel/helper-create-regexp-features-plugin", "pnp:73743d202a8c421645fe70f62867b9ce94402827"],
            ]),
        }],
        ["pnp:1551b6ba428967d7f74de1808a8877b6e3775e6f", {
            packageLocation: path.resolve(__dirname, "./.pnp/externals/pnp-1551b6ba428967d7f74de1808a8877b6e3775e6f/node_modules/@babel/helper-create-regexp-features-plugin/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-regex", "7.5.5"],
                ["regexpu-core", "4.6.0"],
                ["@babel/helper-create-regexp-features-plugin", "pnp:1551b6ba428967d7f74de1808a8877b6e3775e6f"],
            ]),
        }],
    ])],
    ["@babel/helper-regex", new Map([
        ["7.5.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-regex-7.5.5-0aa6824f7100a2e0e89c1527c23936c152cab351/node_modules/@babel/helper-regex/"),
            packageDependencies: new Map([
                ["lodash", "4.17.15"],
                ["@babel/helper-regex", "7.5.5"],
            ]),
        }],
    ])],
    ["regexpu-core", new Map([
        ["4.6.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-regexpu-core-4.6.0-2037c18b327cfce8a6fea2a4ec441f2432afb8b6/node_modules/regexpu-core/"),
            packageDependencies: new Map([
                ["regenerate", "1.4.0"],
                ["regenerate-unicode-properties", "8.1.0"],
                ["regjsgen", "0.5.1"],
                ["regjsparser", "0.6.0"],
                ["unicode-match-property-ecmascript", "1.0.4"],
                ["unicode-match-property-value-ecmascript", "1.1.0"],
                ["regexpu-core", "4.6.0"],
            ]),
        }],
    ])],
    ["regenerate", new Map([
        ["1.4.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-regenerate-1.4.0-4a856ec4b56e4077c557589cae85e7a4c8869a11/node_modules/regenerate/"),
            packageDependencies: new Map([
                ["regenerate", "1.4.0"],
            ]),
        }],
    ])],
    ["regenerate-unicode-properties", new Map([
        ["8.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-regenerate-unicode-properties-8.1.0-ef51e0f0ea4ad424b77bf7cb41f3e015c70a3f0e/node_modules/regenerate-unicode-properties/"),
            packageDependencies: new Map([
                ["regenerate", "1.4.0"],
                ["regenerate-unicode-properties", "8.1.0"],
            ]),
        }],
    ])],
    ["regjsgen", new Map([
        ["0.5.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-regjsgen-0.5.1-48f0bf1a5ea205196929c0d9798b42d1ed98443c/node_modules/regjsgen/"),
            packageDependencies: new Map([
                ["regjsgen", "0.5.1"],
            ]),
        }],
    ])],
    ["regjsparser", new Map([
        ["0.6.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-regjsparser-0.6.0-f1e6ae8b7da2bae96c99399b868cd6c933a2ba9c/node_modules/regjsparser/"),
            packageDependencies: new Map([
                ["jsesc", "0.5.0"],
                ["regjsparser", "0.6.0"],
            ]),
        }],
    ])],
    ["unicode-match-property-ecmascript", new Map([
        ["1.0.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-unicode-match-property-ecmascript-1.0.4-8ed2a32569961bce9227d09cd3ffbb8fed5f020c/node_modules/unicode-match-property-ecmascript/"),
            packageDependencies: new Map([
                ["unicode-canonical-property-names-ecmascript", "1.0.4"],
                ["unicode-property-aliases-ecmascript", "1.0.5"],
                ["unicode-match-property-ecmascript", "1.0.4"],
            ]),
        }],
    ])],
    ["unicode-canonical-property-names-ecmascript", new Map([
        ["1.0.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-unicode-canonical-property-names-ecmascript-1.0.4-2619800c4c825800efdd8343af7dd9933cbe2818/node_modules/unicode-canonical-property-names-ecmascript/"),
            packageDependencies: new Map([
                ["unicode-canonical-property-names-ecmascript", "1.0.4"],
            ]),
        }],
    ])],
    ["unicode-property-aliases-ecmascript", new Map([
        ["1.0.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-unicode-property-aliases-ecmascript-1.0.5-a9cc6cc7ce63a0a3023fc99e341b94431d405a57/node_modules/unicode-property-aliases-ecmascript/"),
            packageDependencies: new Map([
                ["unicode-property-aliases-ecmascript", "1.0.5"],
            ]),
        }],
    ])],
    ["unicode-match-property-value-ecmascript", new Map([
        ["1.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-unicode-match-property-value-ecmascript-1.1.0-5b4b426e08d13a80365e0d657ac7a6c1ec46a277/node_modules/unicode-match-property-value-ecmascript/"),
            packageDependencies: new Map([
                ["unicode-match-property-value-ecmascript", "1.1.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-syntax-top-level-await", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-syntax-top-level-await-7.7.0-f5699549f50bbe8d12b1843a4e82f0a37bb65f4d/node_modules/@babel/plugin-syntax-top-level-await/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-syntax-top-level-await", "7.7.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-arrow-functions", new Map([
        ["7.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-arrow-functions-7.2.0-9aeafbe4d6ffc6563bf8f8372091628f00779550/node_modules/@babel/plugin-transform-arrow-functions/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-transform-arrow-functions", "7.2.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-async-to-generator", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-async-to-generator-7.7.0-e2b84f11952cf5913fe3438b7d2585042772f492/node_modules/@babel/plugin-transform-async-to-generator/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-module-imports", "7.7.0"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/helper-remap-async-to-generator", "7.7.0"],
                ["@babel/plugin-transform-async-to-generator", "7.7.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-block-scoped-functions", new Map([
        ["7.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-block-scoped-functions-7.2.0-5d3cc11e8d5ddd752aa64c9148d0db6cb79fd190/node_modules/@babel/plugin-transform-block-scoped-functions/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-transform-block-scoped-functions", "7.2.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-block-scoping", new Map([
        ["7.6.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-block-scoping-7.6.3-6e854e51fbbaa84351b15d4ddafe342f3a5d542a/node_modules/@babel/plugin-transform-block-scoping/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["lodash", "4.17.15"],
                ["@babel/plugin-transform-block-scoping", "7.6.3"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-classes", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-classes-7.7.0-b411ecc1b8822d24b81e5d184f24149136eddd4a/node_modules/@babel/plugin-transform-classes/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-annotate-as-pure", "7.7.0"],
                ["@babel/helper-define-map", "7.7.0"],
                ["@babel/helper-function-name", "7.7.0"],
                ["@babel/helper-optimise-call-expression", "7.7.0"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/helper-replace-supers", "7.7.0"],
                ["@babel/helper-split-export-declaration", "7.7.0"],
                ["globals", "11.12.0"],
                ["@babel/plugin-transform-classes", "7.7.0"],
            ]),
        }],
    ])],
    ["@babel/helper-define-map", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-define-map-7.7.0-60b0e9fd60def9de5054c38afde8c8ee409c7529/node_modules/@babel/helper-define-map/"),
            packageDependencies: new Map([
                ["@babel/helper-function-name", "7.7.0"],
                ["@babel/types", "7.7.2"],
                ["lodash", "4.17.15"],
                ["@babel/helper-define-map", "7.7.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-computed-properties", new Map([
        ["7.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-computed-properties-7.2.0-83a7df6a658865b1c8f641d510c6f3af220216da/node_modules/@babel/plugin-transform-computed-properties/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-transform-computed-properties", "7.2.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-destructuring", new Map([
        ["7.6.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-destructuring-7.6.0-44bbe08b57f4480094d57d9ffbcd96d309075ba6/node_modules/@babel/plugin-transform-destructuring/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-transform-destructuring", "7.6.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-dotall-regex", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-dotall-regex-7.7.0-c5c9ecacab3a5e0c11db6981610f0c32fd698b3b/node_modules/@babel/plugin-transform-dotall-regex/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-create-regexp-features-plugin", "pnp:c1d07d59eb251071bf95817fbc2720a2de9825c5"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-transform-dotall-regex", "7.7.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-duplicate-keys", new Map([
        ["7.5.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-duplicate-keys-7.5.0-c5dbf5106bf84cdf691222c0974c12b1df931853/node_modules/@babel/plugin-transform-duplicate-keys/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-transform-duplicate-keys", "7.5.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-exponentiation-operator", new Map([
        ["7.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-exponentiation-operator-7.2.0-a63868289e5b4007f7054d46491af51435766008/node_modules/@babel/plugin-transform-exponentiation-operator/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-builder-binary-assignment-operator-visitor", "7.7.0"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-transform-exponentiation-operator", "7.2.0"],
            ]),
        }],
    ])],
    ["@babel/helper-builder-binary-assignment-operator-visitor", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-builder-binary-assignment-operator-visitor-7.7.0-32dd9551d6ed3a5fc2edc50d6912852aa18274d9/node_modules/@babel/helper-builder-binary-assignment-operator-visitor/"),
            packageDependencies: new Map([
                ["@babel/helper-explode-assignable-expression", "7.7.0"],
                ["@babel/types", "7.7.2"],
                ["@babel/helper-builder-binary-assignment-operator-visitor", "7.7.0"],
            ]),
        }],
    ])],
    ["@babel/helper-explode-assignable-expression", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-explode-assignable-expression-7.7.0-db2a6705555ae1f9f33b4b8212a546bc7f9dc3ef/node_modules/@babel/helper-explode-assignable-expression/"),
            packageDependencies: new Map([
                ["@babel/traverse", "7.7.2"],
                ["@babel/types", "7.7.2"],
                ["@babel/helper-explode-assignable-expression", "7.7.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-for-of", new Map([
        ["7.4.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-for-of-7.4.4-0267fc735e24c808ba173866c6c4d1440fc3c556/node_modules/@babel/plugin-transform-for-of/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-transform-for-of", "7.4.4"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-function-name", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-function-name-7.7.0-0fa786f1eef52e3b7d4fc02e54b2129de8a04c2a/node_modules/@babel/plugin-transform-function-name/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-function-name", "7.7.0"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-transform-function-name", "7.7.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-literals", new Map([
        ["7.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-literals-7.2.0-690353e81f9267dad4fd8cfd77eafa86aba53ea1/node_modules/@babel/plugin-transform-literals/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-transform-literals", "7.2.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-member-expression-literals", new Map([
        ["7.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-member-expression-literals-7.2.0-fa10aa5c58a2cb6afcf2c9ffa8cb4d8b3d489a2d/node_modules/@babel/plugin-transform-member-expression-literals/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-transform-member-expression-literals", "7.2.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-modules-amd", new Map([
        ["7.5.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-modules-amd-7.5.0-ef00435d46da0a5961aa728a1d2ecff063e4fb91/node_modules/@babel/plugin-transform-modules-amd/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-module-transforms", "7.7.0"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["babel-plugin-dynamic-import-node", "2.3.0"],
                ["@babel/plugin-transform-modules-amd", "7.5.0"],
            ]),
        }],
    ])],
    ["@babel/helper-module-transforms", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-module-transforms-7.7.0-154a69f0c5b8fd4d39e49750ff7ac4faa3f36786/node_modules/@babel/helper-module-transforms/"),
            packageDependencies: new Map([
                ["@babel/helper-module-imports", "7.7.0"],
                ["@babel/helper-simple-access", "7.7.0"],
                ["@babel/helper-split-export-declaration", "7.7.0"],
                ["@babel/template", "7.7.0"],
                ["@babel/types", "7.7.2"],
                ["lodash", "4.17.15"],
                ["@babel/helper-module-transforms", "7.7.0"],
            ]),
        }],
    ])],
    ["@babel/helper-simple-access", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-simple-access-7.7.0-97a8b6c52105d76031b86237dc1852b44837243d/node_modules/@babel/helper-simple-access/"),
            packageDependencies: new Map([
                ["@babel/template", "7.7.0"],
                ["@babel/types", "7.7.2"],
                ["@babel/helper-simple-access", "7.7.0"],
            ]),
        }],
    ])],
    ["babel-plugin-dynamic-import-node", new Map([
        ["2.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-dynamic-import-node-2.3.0-f00f507bdaa3c3e3ff6e7e5e98d90a7acab96f7f/node_modules/babel-plugin-dynamic-import-node/"),
            packageDependencies: new Map([
                ["object.assign", "4.1.0"],
                ["babel-plugin-dynamic-import-node", "2.3.0"],
            ]),
        }],
    ])],
    ["object.assign", new Map([
        ["4.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-object-assign-4.1.0-968bf1100d7956bb3ca086f006f846b3bc4008da/node_modules/object.assign/"),
            packageDependencies: new Map([
                ["define-properties", "1.1.3"],
                ["function-bind", "1.1.1"],
                ["has-symbols", "1.0.1"],
                ["object-keys", "1.1.1"],
                ["object.assign", "4.1.0"],
            ]),
        }],
    ])],
    ["define-properties", new Map([
        ["1.1.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-define-properties-1.1.3-cf88da6cbee26fe6db7094f61d870cbd84cee9f1/node_modules/define-properties/"),
            packageDependencies: new Map([
                ["object-keys", "1.1.1"],
                ["define-properties", "1.1.3"],
            ]),
        }],
    ])],
    ["object-keys", new Map([
        ["1.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-object-keys-1.1.1-1c47f272df277f3b1daf061677d9c82e2322c60e/node_modules/object-keys/"),
            packageDependencies: new Map([
                ["object-keys", "1.1.1"],
            ]),
        }],
    ])],
    ["function-bind", new Map([
        ["1.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-function-bind-1.1.1-a56899d3ea3c9bab874bb9773b7c5ede92f4895d/node_modules/function-bind/"),
            packageDependencies: new Map([
                ["function-bind", "1.1.1"],
            ]),
        }],
    ])],
    ["has-symbols", new Map([
        ["1.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-has-symbols-1.0.1-9f5214758a44196c406d9bd76cebf81ec2dd31e8/node_modules/has-symbols/"),
            packageDependencies: new Map([
                ["has-symbols", "1.0.1"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-modules-commonjs", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-modules-commonjs-7.7.0-3e5ffb4fd8c947feede69cbe24c9554ab4113fe3/node_modules/@babel/plugin-transform-modules-commonjs/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-module-transforms", "7.7.0"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/helper-simple-access", "7.7.0"],
                ["babel-plugin-dynamic-import-node", "2.3.0"],
                ["@babel/plugin-transform-modules-commonjs", "7.7.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-modules-systemjs", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-modules-systemjs-7.7.0-9baf471213af9761c1617bb12fd278e629041417/node_modules/@babel/plugin-transform-modules-systemjs/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-hoist-variables", "7.7.0"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["babel-plugin-dynamic-import-node", "2.3.0"],
                ["@babel/plugin-transform-modules-systemjs", "7.7.0"],
            ]),
        }],
    ])],
    ["@babel/helper-hoist-variables", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-hoist-variables-7.7.0-b4552e4cfe5577d7de7b183e193e84e4ec538c81/node_modules/@babel/helper-hoist-variables/"),
            packageDependencies: new Map([
                ["@babel/types", "7.7.2"],
                ["@babel/helper-hoist-variables", "7.7.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-modules-umd", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-modules-umd-7.7.0-d62c7da16670908e1d8c68ca0b5d4c0097b69966/node_modules/@babel/plugin-transform-modules-umd/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-module-transforms", "7.7.0"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-transform-modules-umd", "7.7.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-named-capturing-groups-regex", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-named-capturing-groups-regex-7.7.0-358e6fd869b9a4d8f5cbc79e4ed4fc340e60dcaf/node_modules/@babel/plugin-transform-named-capturing-groups-regex/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-create-regexp-features-plugin", "pnp:73743d202a8c421645fe70f62867b9ce94402827"],
                ["@babel/plugin-transform-named-capturing-groups-regex", "7.7.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-new-target", new Map([
        ["7.4.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-new-target-7.4.4-18d120438b0cc9ee95a47f2c72bc9768fbed60a5/node_modules/@babel/plugin-transform-new-target/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-transform-new-target", "7.4.4"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-object-super", new Map([
        ["7.5.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-object-super-7.5.5-c70021df834073c65eb613b8679cc4a381d1a9f9/node_modules/@babel/plugin-transform-object-super/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/helper-replace-supers", "7.7.0"],
                ["@babel/plugin-transform-object-super", "7.5.5"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-parameters", new Map([
        ["7.4.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-parameters-7.4.4-7556cf03f318bd2719fe4c922d2d808be5571e16/node_modules/@babel/plugin-transform-parameters/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-call-delegate", "7.7.0"],
                ["@babel/helper-get-function-arity", "7.7.0"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-transform-parameters", "7.4.4"],
            ]),
        }],
    ])],
    ["@babel/helper-call-delegate", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-call-delegate-7.7.0-df8942452c2c1a217335ca7e393b9afc67f668dc/node_modules/@babel/helper-call-delegate/"),
            packageDependencies: new Map([
                ["@babel/helper-hoist-variables", "7.7.0"],
                ["@babel/traverse", "7.7.2"],
                ["@babel/types", "7.7.2"],
                ["@babel/helper-call-delegate", "7.7.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-property-literals", new Map([
        ["7.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-property-literals-7.2.0-03e33f653f5b25c4eb572c98b9485055b389e905/node_modules/@babel/plugin-transform-property-literals/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-transform-property-literals", "7.2.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-regenerator", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-regenerator-7.7.0-f1b20b535e7716b622c99e989259d7dd942dd9cc/node_modules/@babel/plugin-transform-regenerator/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["regenerator-transform", "0.14.1"],
                ["@babel/plugin-transform-regenerator", "7.7.0"],
            ]),
        }],
    ])],
    ["regenerator-transform", new Map([
        ["0.14.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-regenerator-transform-0.14.1-3b2fce4e1ab7732c08f665dfdb314749c7ddd2fb/node_modules/regenerator-transform/"),
            packageDependencies: new Map([
                ["private", "0.1.8"],
                ["regenerator-transform", "0.14.1"],
            ]),
        }],
    ])],
    ["private", new Map([
        ["0.1.8", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-private-0.1.8-2381edb3689f7a53d653190060fcf822d2f368ff/node_modules/private/"),
            packageDependencies: new Map([
                ["private", "0.1.8"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-reserved-words", new Map([
        ["7.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-reserved-words-7.2.0-4792af87c998a49367597d07fedf02636d2e1634/node_modules/@babel/plugin-transform-reserved-words/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-transform-reserved-words", "7.2.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-shorthand-properties", new Map([
        ["7.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-shorthand-properties-7.2.0-6333aee2f8d6ee7e28615457298934a3b46198f0/node_modules/@babel/plugin-transform-shorthand-properties/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-transform-shorthand-properties", "7.2.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-spread", new Map([
        ["7.6.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-spread-7.6.2-fc77cf798b24b10c46e1b51b1b88c2bf661bb8dd/node_modules/@babel/plugin-transform-spread/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-transform-spread", "7.6.2"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-sticky-regex", new Map([
        ["7.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-sticky-regex-7.2.0-a1e454b5995560a9c1e0d537dfc15061fd2687e1/node_modules/@babel/plugin-transform-sticky-regex/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/helper-regex", "7.5.5"],
                ["@babel/plugin-transform-sticky-regex", "7.2.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-template-literals", new Map([
        ["7.4.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-template-literals-7.4.4-9d28fea7bbce637fb7612a0750989d8321d4bcb0/node_modules/@babel/plugin-transform-template-literals/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-annotate-as-pure", "7.7.0"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-transform-template-literals", "7.4.4"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-typeof-symbol", new Map([
        ["7.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-typeof-symbol-7.2.0-117d2bcec2fbf64b4b59d1f9819894682d29f2b2/node_modules/@babel/plugin-transform-typeof-symbol/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-transform-typeof-symbol", "7.2.0"],
            ]),
        }],
    ])],
    ["@babel/plugin-transform-unicode-regex", new Map([
        ["7.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-unicode-regex-7.7.0-743d9bcc44080e3cc7d49259a066efa30f9187a3/node_modules/@babel/plugin-transform-unicode-regex/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-create-regexp-features-plugin", "pnp:1551b6ba428967d7f74de1808a8877b6e3775e6f"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-transform-unicode-regex", "7.7.0"],
            ]),
        }],
    ])],
    ["browserslist", new Map([
        ["4.7.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-browserslist-4.7.3-02341f162b6bcc1e1028e30624815d4924442dc3/node_modules/browserslist/"),
            packageDependencies: new Map([
                ["caniuse-lite", "1.0.30001011"],
                ["electron-to-chromium", "1.3.307"],
                ["node-releases", "1.1.40"],
                ["browserslist", "4.7.3"],
            ]),
        }],
    ])],
    ["caniuse-lite", new Map([
        ["1.0.30001011", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-caniuse-lite-1.0.30001011-0d6c4549c78c4a800bb043a83ca0cbe0aee6c6e1/node_modules/caniuse-lite/"),
            packageDependencies: new Map([
                ["caniuse-lite", "1.0.30001011"],
            ]),
        }],
    ])],
    ["electron-to-chromium", new Map([
        ["1.3.307", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-electron-to-chromium-1.3.307-e9b98901371d20164af7c0ca5bc820bd4305ccd3/node_modules/electron-to-chromium/"),
            packageDependencies: new Map([
                ["electron-to-chromium", "1.3.307"],
            ]),
        }],
    ])],
    ["node-releases", new Map([
        ["1.1.40", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-node-releases-1.1.40-a94facfa8e2d612302601ca1361741d529c4515a/node_modules/node-releases/"),
            packageDependencies: new Map([
                ["semver", "6.3.0"],
                ["node-releases", "1.1.40"],
            ]),
        }],
    ])],
    ["core-js-compat", new Map([
        ["3.4.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-core-js-compat-3.4.1-e12c5a3ef9fcb50fd9d9a32805bfe674f9139246/node_modules/core-js-compat/"),
            packageDependencies: new Map([
                ["browserslist", "4.7.3"],
                ["semver", "6.3.0"],
                ["core-js-compat", "3.4.1"],
            ]),
        }],
    ])],
    ["invariant", new Map([
        ["2.2.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-invariant-2.2.4-610f3c92c9359ce1db616e538008d23ff35158e6/node_modules/invariant/"),
            packageDependencies: new Map([
                ["loose-envify", "1.4.0"],
                ["invariant", "2.2.4"],
            ]),
        }],
    ])],
    ["loose-envify", new Map([
        ["1.4.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-loose-envify-1.4.0-71ee51fa7be4caec1a63839f7e682d8132d30caf/node_modules/loose-envify/"),
            packageDependencies: new Map([
                ["js-tokens", "4.0.0"],
                ["loose-envify", "1.4.0"],
            ]),
        }],
    ])],
    ["js-levenshtein", new Map([
        ["1.1.6", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-js-levenshtein-1.1.6-c6cee58eb3550372df8deb85fad5ce66ce01d59d/node_modules/js-levenshtein/"),
            packageDependencies: new Map([
                ["js-levenshtein", "1.1.6"],
            ]),
        }],
    ])],
    ["@babel/preset-flow", new Map([
        ["7.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-preset-flow-7.0.0-afd764835d9535ec63d8c7d4caf1c06457263da2/node_modules/@babel/preset-flow/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/helper-plugin-utils", "7.0.0"],
                ["@babel/plugin-transform-flow-strip-types", "pnp:55946e8417942779578fc39ee8c25e17593ac269"],
                ["@babel/preset-flow", "7.0.0"],
            ]),
        }],
    ])],
    ["@babel/runtime", new Map([
        ["7.7.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-runtime-7.7.2-111a78002a5c25fc8e3361bedc9529c696b85a6a/node_modules/@babel/runtime/"),
            packageDependencies: new Map([
                ["regenerator-runtime", "0.13.3"],
                ["@babel/runtime", "7.7.2"],
            ]),
        }],
    ])],
    ["regenerator-runtime", new Map([
        ["0.13.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-regenerator-runtime-0.13.3-7cf6a77d8f5c6f60eb73c5fc1955b2ceb01e6bf5/node_modules/regenerator-runtime/"),
            packageDependencies: new Map([
                ["regenerator-runtime", "0.13.3"],
            ]),
        }],
        ["0.11.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-regenerator-runtime-0.11.1-be05ad7f9bf7d22e056f9726cee5017fbf19e2e9/node_modules/regenerator-runtime/"),
            packageDependencies: new Map([
                ["regenerator-runtime", "0.11.1"],
            ]),
        }],
    ])],
    ["babel-loader", new Map([
        ["8.0.6", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-loader-8.0.6-e33bdb6f362b03f4bb141a0c21ab87c501b70dfb/node_modules/babel-loader/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["webpack", "5.0.0-beta.7"],
                ["find-cache-dir", "2.1.0"],
                ["loader-utils", "1.2.3"],
                ["mkdirp", "0.5.1"],
                ["pify", "4.0.1"],
                ["babel-loader", "8.0.6"],
            ]),
        }],
    ])],
    ["find-cache-dir", new Map([
        ["2.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-find-cache-dir-2.1.0-8d0f94cd13fe43c6c7c261a0d86115ca918c05f7/node_modules/find-cache-dir/"),
            packageDependencies: new Map([
                ["commondir", "1.0.1"],
                ["make-dir", "2.1.0"],
                ["pkg-dir", "3.0.0"],
                ["find-cache-dir", "2.1.0"],
            ]),
        }],
        ["3.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-find-cache-dir-3.1.0-9935894999debef4cf9f677fdf646d002c4cdecb/node_modules/find-cache-dir/"),
            packageDependencies: new Map([
                ["commondir", "1.0.1"],
                ["make-dir", "3.0.0"],
                ["pkg-dir", "4.2.0"],
                ["find-cache-dir", "3.1.0"],
            ]),
        }],
    ])],
    ["commondir", new Map([
        ["1.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-commondir-1.0.1-ddd800da0c66127393cca5950ea968a3aaf1253b/node_modules/commondir/"),
            packageDependencies: new Map([
                ["commondir", "1.0.1"],
            ]),
        }],
    ])],
    ["make-dir", new Map([
        ["2.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-make-dir-2.1.0-5f0310e18b8be898cc07009295a30ae41e91e6f5/node_modules/make-dir/"),
            packageDependencies: new Map([
                ["pify", "4.0.1"],
                ["semver", "5.7.1"],
                ["make-dir", "2.1.0"],
            ]),
        }],
        ["3.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-make-dir-3.0.0-1b5f39f6b9270ed33f9f054c5c0f84304989f801/node_modules/make-dir/"),
            packageDependencies: new Map([
                ["semver", "6.3.0"],
                ["make-dir", "3.0.0"],
            ]),
        }],
    ])],
    ["pify", new Map([
        ["4.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-pify-4.0.1-4b2cd25c50d598735c50292224fd8c6df41e3231/node_modules/pify/"),
            packageDependencies: new Map([
                ["pify", "4.0.1"],
            ]),
        }],
        ["2.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-pify-2.3.0-ed141a6ac043a849ea588498e7dca8b15330e90c/node_modules/pify/"),
            packageDependencies: new Map([
                ["pify", "2.3.0"],
            ]),
        }],
    ])],
    ["pkg-dir", new Map([
        ["3.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-pkg-dir-3.0.0-2749020f239ed990881b1f71210d51eb6523bea3/node_modules/pkg-dir/"),
            packageDependencies: new Map([
                ["find-up", "3.0.0"],
                ["pkg-dir", "3.0.0"],
            ]),
        }],
        ["4.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-pkg-dir-4.2.0-f099133df7ede422e81d1d8448270eeb3e4261f3/node_modules/pkg-dir/"),
            packageDependencies: new Map([
                ["find-up", "4.1.0"],
                ["pkg-dir", "4.2.0"],
            ]),
        }],
    ])],
    ["find-up", new Map([
        ["3.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-find-up-3.0.0-49169f1d7993430646da61ecc5ae355c21c97b73/node_modules/find-up/"),
            packageDependencies: new Map([
                ["locate-path", "3.0.0"],
                ["find-up", "3.0.0"],
            ]),
        }],
        ["4.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-find-up-4.1.0-97afe7d6cdc0bc5928584b7c8d7b16e8a9aa5d19/node_modules/find-up/"),
            packageDependencies: new Map([
                ["locate-path", "5.0.0"],
                ["path-exists", "4.0.0"],
                ["find-up", "4.1.0"],
            ]),
        }],
    ])],
    ["locate-path", new Map([
        ["3.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-locate-path-3.0.0-dbec3b3ab759758071b58fe59fc41871af21400e/node_modules/locate-path/"),
            packageDependencies: new Map([
                ["p-locate", "3.0.0"],
                ["path-exists", "3.0.0"],
                ["locate-path", "3.0.0"],
            ]),
        }],
        ["5.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-locate-path-5.0.0-1afba396afd676a6d42504d0a67a3a7eb9f62aa0/node_modules/locate-path/"),
            packageDependencies: new Map([
                ["p-locate", "4.1.0"],
                ["locate-path", "5.0.0"],
            ]),
        }],
    ])],
    ["p-locate", new Map([
        ["3.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-p-locate-3.0.0-322d69a05c0264b25997d9f40cd8a891ab0064a4/node_modules/p-locate/"),
            packageDependencies: new Map([
                ["p-limit", "2.2.1"],
                ["p-locate", "3.0.0"],
            ]),
        }],
        ["4.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-p-locate-4.1.0-a3428bb7088b3a60292f66919278b7c297ad4f07/node_modules/p-locate/"),
            packageDependencies: new Map([
                ["p-limit", "2.2.1"],
                ["p-locate", "4.1.0"],
            ]),
        }],
    ])],
    ["p-limit", new Map([
        ["2.2.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-p-limit-2.2.1-aa07a788cc3151c939b5131f63570f0dd2009537/node_modules/p-limit/"),
            packageDependencies: new Map([
                ["p-try", "2.2.0"],
                ["p-limit", "2.2.1"],
            ]),
        }],
    ])],
    ["p-try", new Map([
        ["2.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-p-try-2.2.0-cb2868540e313d61de58fafbe35ce9004d5540e6/node_modules/p-try/"),
            packageDependencies: new Map([
                ["p-try", "2.2.0"],
            ]),
        }],
    ])],
    ["path-exists", new Map([
        ["3.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-path-exists-3.0.0-ce0ebeaa5f78cb18925ea7d810d7b59b010fd515/node_modules/path-exists/"),
            packageDependencies: new Map([
                ["path-exists", "3.0.0"],
            ]),
        }],
        ["4.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-path-exists-4.0.0-513bdbe2d3b95d7762e8c1137efa195c6c61b5b3/node_modules/path-exists/"),
            packageDependencies: new Map([
                ["path-exists", "4.0.0"],
            ]),
        }],
    ])],
    ["loader-utils", new Map([
        ["1.2.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-loader-utils-1.2.3-1ff5dc6911c9f0a062531a4c04b609406108c2c7/node_modules/loader-utils/"),
            packageDependencies: new Map([
                ["big.js", "5.2.2"],
                ["emojis-list", "2.1.0"],
                ["json5", "1.0.1"],
                ["loader-utils", "1.2.3"],
            ]),
        }],
    ])],
    ["big.js", new Map([
        ["5.2.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-big-js-5.2.2-65f0af382f578bcdc742bd9c281e9cb2d7768328/node_modules/big.js/"),
            packageDependencies: new Map([
                ["big.js", "5.2.2"],
            ]),
        }],
    ])],
    ["emojis-list", new Map([
        ["2.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-emojis-list-2.1.0-4daa4d9db00f9819880c79fa457ae5b09a1fd389/node_modules/emojis-list/"),
            packageDependencies: new Map([
                ["emojis-list", "2.1.0"],
            ]),
        }],
    ])],
    ["mkdirp", new Map([
        ["0.5.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-mkdirp-0.5.1-30057438eac6cf7f8c4767f38648d6697d75c903/node_modules/mkdirp/"),
            packageDependencies: new Map([
                ["minimist", "0.0.8"],
                ["mkdirp", "0.5.1"],
            ]),
        }],
    ])],
    ["babel-minify", new Map([
        ["0.5.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-minify-0.5.1-dcb8bfe22fcf4bb911dac97ba2987464ee59eeed/node_modules/babel-minify/"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["babel-preset-minify", "0.5.1"],
                ["fs-readdir-recursive", "1.1.0"],
                ["lodash", "4.17.15"],
                ["mkdirp", "0.5.1"],
                ["util.promisify", "1.0.0"],
                ["yargs-parser", "10.1.0"],
                ["babel-minify", "0.5.1"],
            ]),
        }],
    ])],
    ["babel-preset-minify", new Map([
        ["0.5.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-preset-minify-0.5.1-25f5d0bce36ec818be80338d0e594106e21eaa9f/node_modules/babel-preset-minify/"),
            packageDependencies: new Map([
                ["babel-plugin-minify-builtins", "0.5.0"],
                ["babel-plugin-minify-constant-folding", "0.5.0"],
                ["babel-plugin-minify-dead-code-elimination", "0.5.1"],
                ["babel-plugin-minify-flip-comparisons", "0.4.3"],
                ["babel-plugin-minify-guarded-expressions", "0.4.4"],
                ["babel-plugin-minify-infinity", "0.4.3"],
                ["babel-plugin-minify-mangle-names", "0.5.0"],
                ["babel-plugin-minify-numeric-literals", "0.4.3"],
                ["babel-plugin-minify-replace", "0.5.0"],
                ["babel-plugin-minify-simplify", "0.5.1"],
                ["babel-plugin-minify-type-constructors", "0.4.3"],
                ["babel-plugin-transform-inline-consecutive-adds", "0.4.3"],
                ["babel-plugin-transform-member-expression-literals", "6.9.4"],
                ["babel-plugin-transform-merge-sibling-variables", "6.9.4"],
                ["babel-plugin-transform-minify-booleans", "6.9.4"],
                ["babel-plugin-transform-property-literals", "6.9.4"],
                ["babel-plugin-transform-regexp-constructors", "0.4.3"],
                ["babel-plugin-transform-remove-console", "6.9.4"],
                ["babel-plugin-transform-remove-debugger", "6.9.4"],
                ["babel-plugin-transform-remove-undefined", "0.5.0"],
                ["babel-plugin-transform-simplify-comparison-operators", "6.9.4"],
                ["babel-plugin-transform-undefined-to-void", "6.9.4"],
                ["lodash", "4.17.15"],
                ["babel-preset-minify", "0.5.1"],
            ]),
        }],
        ["0.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-preset-minify-0.3.0-7db64afa75f16f6e06c0aa5f25195f6f36784d77/node_modules/babel-preset-minify/"),
            packageDependencies: new Map([
                ["babel-plugin-minify-builtins", "0.3.0"],
                ["babel-plugin-minify-constant-folding", "0.3.0"],
                ["babel-plugin-minify-dead-code-elimination", "0.3.0"],
                ["babel-plugin-minify-flip-comparisons", "0.3.0"],
                ["babel-plugin-minify-guarded-expressions", "0.3.0"],
                ["babel-plugin-minify-infinity", "0.3.0"],
                ["babel-plugin-minify-mangle-names", "0.3.0"],
                ["babel-plugin-minify-numeric-literals", "0.3.0"],
                ["babel-plugin-minify-replace", "0.3.0"],
                ["babel-plugin-minify-simplify", "0.3.0"],
                ["babel-plugin-minify-type-constructors", "0.3.0"],
                ["babel-plugin-transform-inline-consecutive-adds", "0.3.0"],
                ["babel-plugin-transform-member-expression-literals", "6.9.4"],
                ["babel-plugin-transform-merge-sibling-variables", "6.9.4"],
                ["babel-plugin-transform-minify-booleans", "6.9.4"],
                ["babel-plugin-transform-property-literals", "6.9.4"],
                ["babel-plugin-transform-regexp-constructors", "0.3.0"],
                ["babel-plugin-transform-remove-console", "6.9.4"],
                ["babel-plugin-transform-remove-debugger", "6.9.4"],
                ["babel-plugin-transform-remove-undefined", "0.3.0"],
                ["babel-plugin-transform-simplify-comparison-operators", "6.9.4"],
                ["babel-plugin-transform-undefined-to-void", "6.9.4"],
                ["lodash.isplainobject", "4.0.6"],
                ["babel-preset-minify", "0.3.0"],
            ]),
        }],
    ])],
    ["babel-plugin-minify-builtins", new Map([
        ["0.5.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-builtins-0.5.0-31eb82ed1a0d0efdc31312f93b6e4741ce82c36b/node_modules/babel-plugin-minify-builtins/"),
            packageDependencies: new Map([
                ["babel-plugin-minify-builtins", "0.5.0"],
            ]),
        }],
        ["0.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-builtins-0.3.0-4740117a6a784063aaf8f092989cf9e4bd484860/node_modules/babel-plugin-minify-builtins/"),
            packageDependencies: new Map([
                ["babel-helper-evaluate-path", "0.3.0"],
                ["babel-plugin-minify-builtins", "0.3.0"],
            ]),
        }],
    ])],
    ["babel-plugin-minify-constant-folding", new Map([
        ["0.5.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-constant-folding-0.5.0-f84bc8dbf6a561e5e350ff95ae216b0ad5515b6e/node_modules/babel-plugin-minify-constant-folding/"),
            packageDependencies: new Map([
                ["babel-helper-evaluate-path", "0.5.0"],
                ["babel-plugin-minify-constant-folding", "0.5.0"],
            ]),
        }],
        ["0.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-constant-folding-0.3.0-687e40336bd4ddd921e0e197f0006235ac184bb9/node_modules/babel-plugin-minify-constant-folding/"),
            packageDependencies: new Map([
                ["babel-helper-evaluate-path", "0.3.0"],
                ["babel-plugin-minify-constant-folding", "0.3.0"],
            ]),
        }],
    ])],
    ["babel-helper-evaluate-path", new Map([
        ["0.5.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-helper-evaluate-path-0.5.0-a62fa9c4e64ff7ea5cea9353174ef023a900a67c/node_modules/babel-helper-evaluate-path/"),
            packageDependencies: new Map([
                ["babel-helper-evaluate-path", "0.5.0"],
            ]),
        }],
        ["0.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-helper-evaluate-path-0.3.0-2439545e0b6eae5b7f49b790acbebd6b9a73df20/node_modules/babel-helper-evaluate-path/"),
            packageDependencies: new Map([
                ["babel-helper-evaluate-path", "0.3.0"],
            ]),
        }],
    ])],
    ["babel-plugin-minify-dead-code-elimination", new Map([
        ["0.5.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-dead-code-elimination-0.5.1-1a0c68e44be30de4976ca69ffc535e08be13683f/node_modules/babel-plugin-minify-dead-code-elimination/"),
            packageDependencies: new Map([
                ["babel-helper-evaluate-path", "0.5.0"],
                ["babel-helper-mark-eval-scopes", "0.4.3"],
                ["babel-helper-remove-or-void", "0.4.3"],
                ["lodash", "4.17.15"],
                ["babel-plugin-minify-dead-code-elimination", "0.5.1"],
            ]),
        }],
        ["0.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-dead-code-elimination-0.3.0-a323f686c404b824186ba5583cf7996cac81719e/node_modules/babel-plugin-minify-dead-code-elimination/"),
            packageDependencies: new Map([
                ["babel-helper-evaluate-path", "0.3.0"],
                ["babel-helper-mark-eval-scopes", "0.3.0"],
                ["babel-helper-remove-or-void", "0.3.0"],
                ["lodash.some", "4.6.0"],
                ["babel-plugin-minify-dead-code-elimination", "0.3.0"],
            ]),
        }],
    ])],
    ["babel-helper-mark-eval-scopes", new Map([
        ["0.4.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-helper-mark-eval-scopes-0.4.3-d244a3bef9844872603ffb46e22ce8acdf551562/node_modules/babel-helper-mark-eval-scopes/"),
            packageDependencies: new Map([
                ["babel-helper-mark-eval-scopes", "0.4.3"],
            ]),
        }],
        ["0.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-helper-mark-eval-scopes-0.3.0-b4731314fdd7a89091271a5213b4e12d236e29e8/node_modules/babel-helper-mark-eval-scopes/"),
            packageDependencies: new Map([
                ["babel-helper-mark-eval-scopes", "0.3.0"],
            ]),
        }],
    ])],
    ["babel-helper-remove-or-void", new Map([
        ["0.4.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-helper-remove-or-void-0.4.3-a4f03b40077a0ffe88e45d07010dee241ff5ae60/node_modules/babel-helper-remove-or-void/"),
            packageDependencies: new Map([
                ["babel-helper-remove-or-void", "0.4.3"],
            ]),
        }],
        ["0.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-helper-remove-or-void-0.3.0-f43c86147c8fcc395a9528cbb31e7ff49d7e16e3/node_modules/babel-helper-remove-or-void/"),
            packageDependencies: new Map([
                ["babel-helper-remove-or-void", "0.3.0"],
            ]),
        }],
    ])],
    ["babel-plugin-minify-flip-comparisons", new Map([
        ["0.4.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-flip-comparisons-0.4.3-00ca870cb8f13b45c038b3c1ebc0f227293c965a/node_modules/babel-plugin-minify-flip-comparisons/"),
            packageDependencies: new Map([
                ["babel-helper-is-void-0", "0.4.3"],
                ["babel-plugin-minify-flip-comparisons", "0.4.3"],
            ]),
        }],
        ["0.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-flip-comparisons-0.3.0-6627893a409c9f30ef7f2c89e0c6eea7ee97ddc4/node_modules/babel-plugin-minify-flip-comparisons/"),
            packageDependencies: new Map([
                ["babel-helper-is-void-0", "0.3.0"],
                ["babel-plugin-minify-flip-comparisons", "0.3.0"],
            ]),
        }],
    ])],
    ["babel-helper-is-void-0", new Map([
        ["0.4.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-helper-is-void-0-0.4.3-7d9c01b4561e7b95dbda0f6eee48f5b60e67313e/node_modules/babel-helper-is-void-0/"),
            packageDependencies: new Map([
                ["babel-helper-is-void-0", "0.4.3"],
            ]),
        }],
        ["0.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-helper-is-void-0-0.3.0-95570d20bd27b2206f68083ae9980ee7003d8fe7/node_modules/babel-helper-is-void-0/"),
            packageDependencies: new Map([
                ["babel-helper-is-void-0", "0.3.0"],
            ]),
        }],
    ])],
    ["babel-plugin-minify-guarded-expressions", new Map([
        ["0.4.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-guarded-expressions-0.4.4-818960f64cc08aee9d6c75bec6da974c4d621135/node_modules/babel-plugin-minify-guarded-expressions/"),
            packageDependencies: new Map([
                ["babel-helper-evaluate-path", "0.5.0"],
                ["babel-helper-flip-expressions", "0.4.3"],
                ["babel-plugin-minify-guarded-expressions", "0.4.4"],
            ]),
        }],
        ["0.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-guarded-expressions-0.3.0-2552d96189ef45d9a463f1a6b5e4fa110703ac8d/node_modules/babel-plugin-minify-guarded-expressions/"),
            packageDependencies: new Map([
                ["babel-helper-flip-expressions", "0.3.0"],
                ["babel-plugin-minify-guarded-expressions", "0.3.0"],
            ]),
        }],
    ])],
    ["babel-helper-flip-expressions", new Map([
        ["0.4.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-helper-flip-expressions-0.4.3-3696736a128ac18bc25254b5f40a22ceb3c1d3fd/node_modules/babel-helper-flip-expressions/"),
            packageDependencies: new Map([
                ["babel-helper-flip-expressions", "0.4.3"],
            ]),
        }],
        ["0.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-helper-flip-expressions-0.3.0-f5b6394bd5219b43cf8f7b201535ed540c6e7fa2/node_modules/babel-helper-flip-expressions/"),
            packageDependencies: new Map([
                ["babel-helper-flip-expressions", "0.3.0"],
            ]),
        }],
    ])],
    ["babel-plugin-minify-infinity", new Map([
        ["0.4.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-infinity-0.4.3-dfb876a1b08a06576384ef3f92e653ba607b39ca/node_modules/babel-plugin-minify-infinity/"),
            packageDependencies: new Map([
                ["babel-plugin-minify-infinity", "0.4.3"],
            ]),
        }],
        ["0.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-infinity-0.3.0-c5ec0edd433517cf31b3af17077c202beb48bbe7/node_modules/babel-plugin-minify-infinity/"),
            packageDependencies: new Map([
                ["babel-plugin-minify-infinity", "0.3.0"],
            ]),
        }],
    ])],
    ["babel-plugin-minify-mangle-names", new Map([
        ["0.5.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-mangle-names-0.5.0-bcddb507c91d2c99e138bd6b17a19c3c271e3fd3/node_modules/babel-plugin-minify-mangle-names/"),
            packageDependencies: new Map([
                ["babel-helper-mark-eval-scopes", "0.4.3"],
                ["babel-plugin-minify-mangle-names", "0.5.0"],
            ]),
        }],
        ["0.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-mangle-names-0.3.0-f28561bad0dd2f0380816816bb946e219b3b6135/node_modules/babel-plugin-minify-mangle-names/"),
            packageDependencies: new Map([
                ["babel-helper-mark-eval-scopes", "0.3.0"],
                ["babel-plugin-minify-mangle-names", "0.3.0"],
            ]),
        }],
    ])],
    ["babel-plugin-minify-numeric-literals", new Map([
        ["0.4.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-numeric-literals-0.4.3-8e4fd561c79f7801286ff60e8c5fd9deee93c0bc/node_modules/babel-plugin-minify-numeric-literals/"),
            packageDependencies: new Map([
                ["babel-plugin-minify-numeric-literals", "0.4.3"],
            ]),
        }],
        ["0.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-numeric-literals-0.3.0-b57734a612e8a592005407323c321119f27d4b40/node_modules/babel-plugin-minify-numeric-literals/"),
            packageDependencies: new Map([
                ["babel-plugin-minify-numeric-literals", "0.3.0"],
            ]),
        }],
    ])],
    ["babel-plugin-minify-replace", new Map([
        ["0.5.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-replace-0.5.0-d3e2c9946c9096c070efc96761ce288ec5c3f71c/node_modules/babel-plugin-minify-replace/"),
            packageDependencies: new Map([
                ["babel-plugin-minify-replace", "0.5.0"],
            ]),
        }],
        ["0.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-replace-0.3.0-980125bbf7cbb5a637439de9d0b1b030a4693893/node_modules/babel-plugin-minify-replace/"),
            packageDependencies: new Map([
                ["babel-plugin-minify-replace", "0.3.0"],
            ]),
        }],
    ])],
    ["babel-plugin-minify-simplify", new Map([
        ["0.5.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-simplify-0.5.1-f21613c8b95af3450a2ca71502fdbd91793c8d6a/node_modules/babel-plugin-minify-simplify/"),
            packageDependencies: new Map([
                ["babel-helper-evaluate-path", "0.5.0"],
                ["babel-helper-flip-expressions", "0.4.3"],
                ["babel-helper-is-nodes-equiv", "0.0.1"],
                ["babel-helper-to-multiple-sequence-expressions", "0.5.0"],
                ["babel-plugin-minify-simplify", "0.5.1"],
            ]),
        }],
        ["0.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-simplify-0.3.0-14574cc74d21c81d3060fafa041010028189f11b/node_modules/babel-plugin-minify-simplify/"),
            packageDependencies: new Map([
                ["babel-helper-flip-expressions", "0.3.0"],
                ["babel-helper-is-nodes-equiv", "0.0.1"],
                ["babel-helper-to-multiple-sequence-expressions", "0.3.0"],
                ["babel-plugin-minify-simplify", "0.3.0"],
            ]),
        }],
    ])],
    ["babel-helper-is-nodes-equiv", new Map([
        ["0.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-helper-is-nodes-equiv-0.0.1-34e9b300b1479ddd98ec77ea0bbe9342dfe39684/node_modules/babel-helper-is-nodes-equiv/"),
            packageDependencies: new Map([
                ["babel-helper-is-nodes-equiv", "0.0.1"],
            ]),
        }],
    ])],
    ["babel-helper-to-multiple-sequence-expressions", new Map([
        ["0.5.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-helper-to-multiple-sequence-expressions-0.5.0-a3f924e3561882d42fcf48907aa98f7979a4588d/node_modules/babel-helper-to-multiple-sequence-expressions/"),
            packageDependencies: new Map([
                ["babel-helper-to-multiple-sequence-expressions", "0.5.0"],
            ]),
        }],
        ["0.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-helper-to-multiple-sequence-expressions-0.3.0-8da2275ccc26995566118f7213abfd9af7214427/node_modules/babel-helper-to-multiple-sequence-expressions/"),
            packageDependencies: new Map([
                ["babel-helper-to-multiple-sequence-expressions", "0.3.0"],
            ]),
        }],
    ])],
    ["babel-plugin-minify-type-constructors", new Map([
        ["0.4.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-type-constructors-0.4.3-1bc6f15b87f7ab1085d42b330b717657a2156500/node_modules/babel-plugin-minify-type-constructors/"),
            packageDependencies: new Map([
                ["babel-helper-is-void-0", "0.4.3"],
                ["babel-plugin-minify-type-constructors", "0.4.3"],
            ]),
        }],
        ["0.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-type-constructors-0.3.0-7f5a86ef322c4746364e3c591b8514eeafea6ad4/node_modules/babel-plugin-minify-type-constructors/"),
            packageDependencies: new Map([
                ["babel-helper-is-void-0", "0.3.0"],
                ["babel-plugin-minify-type-constructors", "0.3.0"],
            ]),
        }],
    ])],
    ["babel-plugin-transform-inline-consecutive-adds", new Map([
        ["0.4.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-transform-inline-consecutive-adds-0.4.3-323d47a3ea63a83a7ac3c811ae8e6941faf2b0d1/node_modules/babel-plugin-transform-inline-consecutive-adds/"),
            packageDependencies: new Map([
                ["babel-plugin-transform-inline-consecutive-adds", "0.4.3"],
            ]),
        }],
        ["0.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-transform-inline-consecutive-adds-0.3.0-f07d93689c0002ed2b2b62969bdd99f734e03f57/node_modules/babel-plugin-transform-inline-consecutive-adds/"),
            packageDependencies: new Map([
                ["babel-plugin-transform-inline-consecutive-adds", "0.3.0"],
            ]),
        }],
    ])],
    ["babel-plugin-transform-member-expression-literals", new Map([
        ["6.9.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-transform-member-expression-literals-6.9.4-37039c9a0c3313a39495faac2ff3a6b5b9d038bf/node_modules/babel-plugin-transform-member-expression-literals/"),
            packageDependencies: new Map([
                ["babel-plugin-transform-member-expression-literals", "6.9.4"],
            ]),
        }],
    ])],
    ["babel-plugin-transform-merge-sibling-variables", new Map([
        ["6.9.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-transform-merge-sibling-variables-6.9.4-85b422fc3377b449c9d1cde44087203532401dae/node_modules/babel-plugin-transform-merge-sibling-variables/"),
            packageDependencies: new Map([
                ["babel-plugin-transform-merge-sibling-variables", "6.9.4"],
            ]),
        }],
    ])],
    ["babel-plugin-transform-minify-booleans", new Map([
        ["6.9.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-transform-minify-booleans-6.9.4-acbb3e56a3555dd23928e4b582d285162dd2b198/node_modules/babel-plugin-transform-minify-booleans/"),
            packageDependencies: new Map([
                ["babel-plugin-transform-minify-booleans", "6.9.4"],
            ]),
        }],
    ])],
    ["babel-plugin-transform-property-literals", new Map([
        ["6.9.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-transform-property-literals-6.9.4-98c1d21e255736573f93ece54459f6ce24985d39/node_modules/babel-plugin-transform-property-literals/"),
            packageDependencies: new Map([
                ["esutils", "2.0.3"],
                ["babel-plugin-transform-property-literals", "6.9.4"],
            ]),
        }],
    ])],
    ["babel-plugin-transform-regexp-constructors", new Map([
        ["0.4.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-transform-regexp-constructors-0.4.3-58b7775b63afcf33328fae9a5f88fbd4fb0b4965/node_modules/babel-plugin-transform-regexp-constructors/"),
            packageDependencies: new Map([
                ["babel-plugin-transform-regexp-constructors", "0.4.3"],
            ]),
        }],
        ["0.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-transform-regexp-constructors-0.3.0-9bb2c8dd082271a5cb1b3a441a7c52e8fd07e0f5/node_modules/babel-plugin-transform-regexp-constructors/"),
            packageDependencies: new Map([
                ["babel-plugin-transform-regexp-constructors", "0.3.0"],
            ]),
        }],
    ])],
    ["babel-plugin-transform-remove-console", new Map([
        ["6.9.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-transform-remove-console-6.9.4-b980360c067384e24b357a588d807d3c83527780/node_modules/babel-plugin-transform-remove-console/"),
            packageDependencies: new Map([
                ["babel-plugin-transform-remove-console", "6.9.4"],
            ]),
        }],
    ])],
    ["babel-plugin-transform-remove-debugger", new Map([
        ["6.9.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-transform-remove-debugger-6.9.4-42b727631c97978e1eb2d199a7aec84a18339ef2/node_modules/babel-plugin-transform-remove-debugger/"),
            packageDependencies: new Map([
                ["babel-plugin-transform-remove-debugger", "6.9.4"],
            ]),
        }],
    ])],
    ["babel-plugin-transform-remove-undefined", new Map([
        ["0.5.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-transform-remove-undefined-0.5.0-80208b31225766c630c97fa2d288952056ea22dd/node_modules/babel-plugin-transform-remove-undefined/"),
            packageDependencies: new Map([
                ["babel-helper-evaluate-path", "0.5.0"],
                ["babel-plugin-transform-remove-undefined", "0.5.0"],
            ]),
        }],
        ["0.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-transform-remove-undefined-0.3.0-03f5f0071867781e9beabbc7b77bf8095fd3f3ec/node_modules/babel-plugin-transform-remove-undefined/"),
            packageDependencies: new Map([
                ["babel-helper-evaluate-path", "0.3.0"],
                ["babel-plugin-transform-remove-undefined", "0.3.0"],
            ]),
        }],
    ])],
    ["babel-plugin-transform-simplify-comparison-operators", new Map([
        ["6.9.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-transform-simplify-comparison-operators-6.9.4-f62afe096cab0e1f68a2d753fdf283888471ceb9/node_modules/babel-plugin-transform-simplify-comparison-operators/"),
            packageDependencies: new Map([
                ["babel-plugin-transform-simplify-comparison-operators", "6.9.4"],
            ]),
        }],
    ])],
    ["babel-plugin-transform-undefined-to-void", new Map([
        ["6.9.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-transform-undefined-to-void-6.9.4-be241ca81404030678b748717322b89d0c8fe280/node_modules/babel-plugin-transform-undefined-to-void/"),
            packageDependencies: new Map([
                ["babel-plugin-transform-undefined-to-void", "6.9.4"],
            ]),
        }],
    ])],
    ["fs-readdir-recursive", new Map([
        ["1.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-fs-readdir-recursive-1.1.0-e32fc030a2ccee44a6b5371308da54be0b397d27/node_modules/fs-readdir-recursive/"),
            packageDependencies: new Map([
                ["fs-readdir-recursive", "1.1.0"],
            ]),
        }],
    ])],
    ["util.promisify", new Map([
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-util-promisify-1.0.0-440f7165a459c9a16dc145eb8e72f35687097030/node_modules/util.promisify/"),
            packageDependencies: new Map([
                ["define-properties", "1.1.3"],
                ["object.getownpropertydescriptors", "2.0.3"],
                ["util.promisify", "1.0.0"],
            ]),
        }],
    ])],
    ["object.getownpropertydescriptors", new Map([
        ["2.0.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-object-getownpropertydescriptors-2.0.3-8758c846f5b407adab0f236e0986f14b051caa16/node_modules/object.getownpropertydescriptors/"),
            packageDependencies: new Map([
                ["define-properties", "1.1.3"],
                ["es-abstract", "1.16.0"],
                ["object.getownpropertydescriptors", "2.0.3"],
            ]),
        }],
    ])],
    ["es-abstract", new Map([
        ["1.16.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-es-abstract-1.16.0-d3a26dc9c3283ac9750dca569586e976d9dcc06d/node_modules/es-abstract/"),
            packageDependencies: new Map([
                ["es-to-primitive", "1.2.1"],
                ["function-bind", "1.1.1"],
                ["has", "1.0.3"],
                ["has-symbols", "1.0.1"],
                ["is-callable", "1.1.4"],
                ["is-regex", "1.0.4"],
                ["object-inspect", "1.7.0"],
                ["object-keys", "1.1.1"],
                ["string.prototype.trimleft", "2.1.0"],
                ["string.prototype.trimright", "2.1.0"],
                ["es-abstract", "1.16.0"],
            ]),
        }],
    ])],
    ["es-to-primitive", new Map([
        ["1.2.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-es-to-primitive-1.2.1-e55cd4c9cdc188bcefb03b366c736323fc5c898a/node_modules/es-to-primitive/"),
            packageDependencies: new Map([
                ["is-callable", "1.1.4"],
                ["is-date-object", "1.0.1"],
                ["is-symbol", "1.0.3"],
                ["es-to-primitive", "1.2.1"],
            ]),
        }],
    ])],
    ["is-callable", new Map([
        ["1.1.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-callable-1.1.4-1e1adf219e1eeb684d691f9d6a05ff0d30a24d75/node_modules/is-callable/"),
            packageDependencies: new Map([
                ["is-callable", "1.1.4"],
            ]),
        }],
    ])],
    ["is-date-object", new Map([
        ["1.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-date-object-1.0.1-9aa20eb6aeebbff77fbd33e74ca01b33581d3a16/node_modules/is-date-object/"),
            packageDependencies: new Map([
                ["is-date-object", "1.0.1"],
            ]),
        }],
    ])],
    ["is-symbol", new Map([
        ["1.0.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-symbol-1.0.3-38e1014b9e6329be0de9d24a414fd7441ec61937/node_modules/is-symbol/"),
            packageDependencies: new Map([
                ["has-symbols", "1.0.1"],
                ["is-symbol", "1.0.3"],
            ]),
        }],
    ])],
    ["has", new Map([
        ["1.0.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-has-1.0.3-722d7cbfc1f6aa8241f16dd814e011e1f41e8796/node_modules/has/"),
            packageDependencies: new Map([
                ["function-bind", "1.1.1"],
                ["has", "1.0.3"],
            ]),
        }],
    ])],
    ["is-regex", new Map([
        ["1.0.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-regex-1.0.4-5517489b547091b0930e095654ced25ee97e9491/node_modules/is-regex/"),
            packageDependencies: new Map([
                ["has", "1.0.3"],
                ["is-regex", "1.0.4"],
            ]),
        }],
    ])],
    ["object-inspect", new Map([
        ["1.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-object-inspect-1.7.0-f4f6bd181ad77f006b5ece60bd0b6f398ff74a67/node_modules/object-inspect/"),
            packageDependencies: new Map([
                ["object-inspect", "1.7.0"],
            ]),
        }],
    ])],
    ["string.prototype.trimleft", new Map([
        ["2.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-string-prototype-trimleft-2.1.0-6cc47f0d7eb8d62b0f3701611715a3954591d634/node_modules/string.prototype.trimleft/"),
            packageDependencies: new Map([
                ["define-properties", "1.1.3"],
                ["function-bind", "1.1.1"],
                ["string.prototype.trimleft", "2.1.0"],
            ]),
        }],
    ])],
    ["string.prototype.trimright", new Map([
        ["2.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-string-prototype-trimright-2.1.0-669d164be9df9b6f7559fa8e89945b168a5a6c58/node_modules/string.prototype.trimright/"),
            packageDependencies: new Map([
                ["define-properties", "1.1.3"],
                ["function-bind", "1.1.1"],
                ["string.prototype.trimright", "2.1.0"],
            ]),
        }],
    ])],
    ["yargs-parser", new Map([
        ["10.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-yargs-parser-10.1.0-7202265b89f7e9e9f2e5765e0fe735a905edbaa8/node_modules/yargs-parser/"),
            packageDependencies: new Map([
                ["camelcase", "4.1.0"],
                ["yargs-parser", "10.1.0"],
            ]),
        }],
        ["13.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-yargs-parser-13.1.1-d26058532aa06d365fe091f6a1fc06b2f7e5eca0/node_modules/yargs-parser/"),
            packageDependencies: new Map([
                ["camelcase", "5.3.1"],
                ["decamelize", "1.2.0"],
                ["yargs-parser", "13.1.1"],
            ]),
        }],
        ["11.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-yargs-parser-11.1.1-879a0865973bca9f6bab5cbdf3b1c67ec7d3bcf4/node_modules/yargs-parser/"),
            packageDependencies: new Map([
                ["camelcase", "5.3.1"],
                ["decamelize", "1.2.0"],
                ["yargs-parser", "11.1.1"],
            ]),
        }],
    ])],
    ["camelcase", new Map([
        ["4.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-camelcase-4.1.0-d545635be1e33c542649c69173e5de6acfae34dd/node_modules/camelcase/"),
            packageDependencies: new Map([
                ["camelcase", "4.1.0"],
            ]),
        }],
        ["5.3.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-camelcase-5.3.1-e3c9b31569e106811df242f715725a1f4c494320/node_modules/camelcase/"),
            packageDependencies: new Map([
                ["camelcase", "5.3.1"],
            ]),
        }],
        ["1.2.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-camelcase-1.2.1-9bb5304d2e0b56698b2c758b08a3eaa9daa58a39/node_modules/camelcase/"),
            packageDependencies: new Map([
                ["camelcase", "1.2.1"],
            ]),
        }],
    ])],
    ["babel-minify-webpack-plugin", new Map([
        ["0.3.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-minify-webpack-plugin-0.3.1-292aa240af190e2dcadf4f684d6d84d179b6d5a4/node_modules/babel-minify-webpack-plugin/"),
            packageDependencies: new Map([
                ["webpack", "5.0.0-beta.7"],
                ["babel-core", "6.26.3"],
                ["babel-preset-minify", "0.3.0"],
                ["webpack-sources", "1.4.3"],
                ["babel-minify-webpack-plugin", "0.3.1"],
            ]),
        }],
    ])],
    ["babel-core", new Map([
        ["6.26.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-core-6.26.3-b2e2f09e342d0f0c88e2f02e067794125e75c207/node_modules/babel-core/"),
            packageDependencies: new Map([
                ["babel-code-frame", "6.26.0"],
                ["babel-generator", "6.26.1"],
                ["babel-helpers", "6.24.1"],
                ["babel-messages", "6.23.0"],
                ["babel-register", "6.26.0"],
                ["babel-runtime", "6.26.0"],
                ["babel-template", "6.26.0"],
                ["babel-traverse", "6.26.0"],
                ["babel-types", "6.26.0"],
                ["babylon", "6.18.0"],
                ["convert-source-map", "1.7.0"],
                ["debug", "2.6.9"],
                ["json5", "0.5.1"],
                ["lodash", "4.17.15"],
                ["minimatch", "3.0.4"],
                ["path-is-absolute", "1.0.1"],
                ["private", "0.1.8"],
                ["slash", "1.0.0"],
                ["source-map", "0.5.7"],
                ["babel-core", "6.26.3"],
            ]),
        }],
    ])],
    ["babel-code-frame", new Map([
        ["6.26.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-code-frame-6.26.0-63fd43f7dc1e3bb7ce35947db8fe369a3f58c74b/node_modules/babel-code-frame/"),
            packageDependencies: new Map([
                ["chalk", "1.1.3"],
                ["esutils", "2.0.3"],
                ["js-tokens", "3.0.2"],
                ["babel-code-frame", "6.26.0"],
            ]),
        }],
    ])],
    ["has-ansi", new Map([
        ["2.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-has-ansi-2.0.0-34f5049ce1ecdf2b0649af3ef24e45ed35416d91/node_modules/has-ansi/"),
            packageDependencies: new Map([
                ["ansi-regex", "2.1.1"],
                ["has-ansi", "2.0.0"],
            ]),
        }],
    ])],
    ["ansi-regex", new Map([
        ["2.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ansi-regex-2.1.1-c3b33ab5ee360d86e0e628f0468ae7ef27d654df/node_modules/ansi-regex/"),
            packageDependencies: new Map([
                ["ansi-regex", "2.1.1"],
            ]),
        }],
        ["4.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ansi-regex-4.1.0-8b9f8f08cf1acb843756a839ca8c7e3168c51997/node_modules/ansi-regex/"),
            packageDependencies: new Map([
                ["ansi-regex", "4.1.0"],
            ]),
        }],
        ["3.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ansi-regex-3.0.0-ed0317c322064f79466c02966bddb605ab37d998/node_modules/ansi-regex/"),
            packageDependencies: new Map([
                ["ansi-regex", "3.0.0"],
            ]),
        }],
    ])],
    ["strip-ansi", new Map([
        ["3.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-strip-ansi-3.0.1-6a385fb8853d952d5ff05d0e8aaf94278dc63dcf/node_modules/strip-ansi/"),
            packageDependencies: new Map([
                ["ansi-regex", "2.1.1"],
                ["strip-ansi", "3.0.1"],
            ]),
        }],
        ["5.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-strip-ansi-5.2.0-8c9a536feb6afc962bdfa5b104a5091c1ad9c0ae/node_modules/strip-ansi/"),
            packageDependencies: new Map([
                ["ansi-regex", "4.1.0"],
                ["strip-ansi", "5.2.0"],
            ]),
        }],
        ["4.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-strip-ansi-4.0.0-a8479022eb1ac368a871389b635262c505ee368f/node_modules/strip-ansi/"),
            packageDependencies: new Map([
                ["ansi-regex", "3.0.0"],
                ["strip-ansi", "4.0.0"],
            ]),
        }],
    ])],
    ["babel-generator", new Map([
        ["6.26.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-generator-6.26.1-1844408d3b8f0d35a404ea7ac180f087a601bd90/node_modules/babel-generator/"),
            packageDependencies: new Map([
                ["babel-messages", "6.23.0"],
                ["babel-runtime", "6.26.0"],
                ["babel-types", "6.26.0"],
                ["detect-indent", "4.0.0"],
                ["jsesc", "1.3.0"],
                ["lodash", "4.17.15"],
                ["source-map", "0.5.7"],
                ["trim-right", "1.0.1"],
                ["babel-generator", "6.26.1"],
            ]),
        }],
    ])],
    ["babel-messages", new Map([
        ["6.23.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-messages-6.23.0-f3cdf4703858035b2a2951c6ec5edf6c62f2630e/node_modules/babel-messages/"),
            packageDependencies: new Map([
                ["babel-runtime", "6.26.0"],
                ["babel-messages", "6.23.0"],
            ]),
        }],
    ])],
    ["babel-runtime", new Map([
        ["6.26.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-runtime-6.26.0-965c7058668e82b55d7bfe04ff2337bc8b5647fe/node_modules/babel-runtime/"),
            packageDependencies: new Map([
                ["core-js", "2.6.10"],
                ["regenerator-runtime", "0.11.1"],
                ["babel-runtime", "6.26.0"],
            ]),
        }],
    ])],
    ["core-js", new Map([
        ["2.6.10", {
            packageLocation: path.resolve(__dirname, "./.pnp/unplugged/npm-core-js-2.6.10-8a5b8391f8cc7013da703411ce5b585706300d7f/node_modules/core-js/"),
            packageDependencies: new Map([
                ["core-js", "2.6.10"],
            ]),
        }],
    ])],
    ["babel-types", new Map([
        ["6.26.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-types-6.26.0-a3b073f94ab49eb6fa55cd65227a334380632497/node_modules/babel-types/"),
            packageDependencies: new Map([
                ["babel-runtime", "6.26.0"],
                ["esutils", "2.0.3"],
                ["lodash", "4.17.15"],
                ["to-fast-properties", "1.0.3"],
                ["babel-types", "6.26.0"],
            ]),
        }],
    ])],
    ["detect-indent", new Map([
        ["4.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-detect-indent-4.0.0-f76d064352cdf43a1cb6ce619c4ee3a9475de208/node_modules/detect-indent/"),
            packageDependencies: new Map([
                ["repeating", "2.0.1"],
                ["detect-indent", "4.0.0"],
            ]),
        }],
    ])],
    ["repeating", new Map([
        ["2.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-repeating-2.0.1-5214c53a926d3552707527fbab415dbc08d06dda/node_modules/repeating/"),
            packageDependencies: new Map([
                ["is-finite", "1.0.2"],
                ["repeating", "2.0.1"],
            ]),
        }],
    ])],
    ["is-finite", new Map([
        ["1.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-finite-1.0.2-cc6677695602be550ef11e8b4aa6305342b6d0aa/node_modules/is-finite/"),
            packageDependencies: new Map([
                ["number-is-nan", "1.0.1"],
                ["is-finite", "1.0.2"],
            ]),
        }],
    ])],
    ["number-is-nan", new Map([
        ["1.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-number-is-nan-1.0.1-097b602b53422a522c1afb8790318336941a011d/node_modules/number-is-nan/"),
            packageDependencies: new Map([
                ["number-is-nan", "1.0.1"],
            ]),
        }],
    ])],
    ["trim-right", new Map([
        ["1.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-trim-right-1.0.1-cb2e1203067e0c8de1f614094b9fe45704ea6003/node_modules/trim-right/"),
            packageDependencies: new Map([
                ["trim-right", "1.0.1"],
            ]),
        }],
    ])],
    ["babel-helpers", new Map([
        ["6.24.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-helpers-6.24.1-3471de9caec388e5c850e597e58a26ddf37602b2/node_modules/babel-helpers/"),
            packageDependencies: new Map([
                ["babel-runtime", "6.26.0"],
                ["babel-template", "6.26.0"],
                ["babel-helpers", "6.24.1"],
            ]),
        }],
    ])],
    ["babel-template", new Map([
        ["6.26.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-template-6.26.0-de03e2d16396b069f46dd9fff8521fb1a0e35e02/node_modules/babel-template/"),
            packageDependencies: new Map([
                ["babel-runtime", "6.26.0"],
                ["babel-traverse", "6.26.0"],
                ["babel-types", "6.26.0"],
                ["babylon", "6.18.0"],
                ["lodash", "4.17.15"],
                ["babel-template", "6.26.0"],
            ]),
        }],
    ])],
    ["babel-traverse", new Map([
        ["6.26.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-traverse-6.26.0-46a9cbd7edcc62c8e5c064e2d2d8d0f4035766ee/node_modules/babel-traverse/"),
            packageDependencies: new Map([
                ["babel-code-frame", "6.26.0"],
                ["babel-messages", "6.23.0"],
                ["babel-runtime", "6.26.0"],
                ["babel-types", "6.26.0"],
                ["babylon", "6.18.0"],
                ["debug", "2.6.9"],
                ["globals", "9.18.0"],
                ["invariant", "2.2.4"],
                ["lodash", "4.17.15"],
                ["babel-traverse", "6.26.0"],
            ]),
        }],
    ])],
    ["babylon", new Map([
        ["6.18.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babylon-6.18.0-af2f3b88fa6f5c1e4c634d1a0f8eac4f55b395e3/node_modules/babylon/"),
            packageDependencies: new Map([
                ["babylon", "6.18.0"],
            ]),
        }],
    ])],
    ["babel-register", new Map([
        ["6.26.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-register-6.26.0-6ed021173e2fcb486d7acb45c6009a856f647071/node_modules/babel-register/"),
            packageDependencies: new Map([
                ["babel-core", "6.26.3"],
                ["babel-runtime", "6.26.0"],
                ["core-js", "2.6.10"],
                ["home-or-tmp", "2.0.0"],
                ["lodash", "4.17.15"],
                ["mkdirp", "0.5.1"],
                ["source-map-support", "0.4.18"],
                ["babel-register", "6.26.0"],
            ]),
        }],
    ])],
    ["home-or-tmp", new Map([
        ["2.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-home-or-tmp-2.0.0-e36c3f2d2cae7d746a857e38d18d5f32a7882db8/node_modules/home-or-tmp/"),
            packageDependencies: new Map([
                ["os-homedir", "1.0.2"],
                ["os-tmpdir", "1.0.2"],
                ["home-or-tmp", "2.0.0"],
            ]),
        }],
    ])],
    ["os-homedir", new Map([
        ["1.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-os-homedir-1.0.2-ffbc4988336e0e833de0c168c7ef152121aa7fb3/node_modules/os-homedir/"),
            packageDependencies: new Map([
                ["os-homedir", "1.0.2"],
            ]),
        }],
    ])],
    ["os-tmpdir", new Map([
        ["1.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-os-tmpdir-1.0.2-bbe67406c79aa85c5cfec766fe5734555dfa1274/node_modules/os-tmpdir/"),
            packageDependencies: new Map([
                ["os-tmpdir", "1.0.2"],
            ]),
        }],
    ])],
    ["source-map-support", new Map([
        ["0.4.18", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-source-map-support-0.4.18-0286a6de8be42641338594e97ccea75f0a2c585f/node_modules/source-map-support/"),
            packageDependencies: new Map([
                ["source-map", "0.5.7"],
                ["source-map-support", "0.4.18"],
            ]),
        }],
        ["0.5.16", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-source-map-support-0.5.16-0ae069e7fe3ba7538c64c98515e35339eac5a042/node_modules/source-map-support/"),
            packageDependencies: new Map([
                ["buffer-from", "1.1.1"],
                ["source-map", "0.6.1"],
                ["source-map-support", "0.5.16"],
            ]),
        }],
    ])],
    ["minimatch", new Map([
        ["3.0.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-minimatch-3.0.4-5166e286457f03306064be5497e8dbb0c3d32083/node_modules/minimatch/"),
            packageDependencies: new Map([
                ["brace-expansion", "1.1.11"],
                ["minimatch", "3.0.4"],
            ]),
        }],
    ])],
    ["brace-expansion", new Map([
        ["1.1.11", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-brace-expansion-1.1.11-3c7fcbf529d87226f3d2f52b966ff5271eb441dd/node_modules/brace-expansion/"),
            packageDependencies: new Map([
                ["balanced-match", "1.0.0"],
                ["concat-map", "0.0.1"],
                ["brace-expansion", "1.1.11"],
            ]),
        }],
    ])],
    ["balanced-match", new Map([
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-balanced-match-1.0.0-89b4d199ab2bee49de164ea02b89ce462d71b767/node_modules/balanced-match/"),
            packageDependencies: new Map([
                ["balanced-match", "1.0.0"],
            ]),
        }],
    ])],
    ["concat-map", new Map([
        ["0.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-concat-map-0.0.1-d8a96bd77fd68df7793a73036a3ba0d5405d477b/node_modules/concat-map/"),
            packageDependencies: new Map([
                ["concat-map", "0.0.1"],
            ]),
        }],
    ])],
    ["path-is-absolute", new Map([
        ["1.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-path-is-absolute-1.0.1-174b9268735534ffbc7ace6bf53a5a9e1b5c5f5f/node_modules/path-is-absolute/"),
            packageDependencies: new Map([
                ["path-is-absolute", "1.0.1"],
            ]),
        }],
    ])],
    ["slash", new Map([
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-slash-1.0.0-c41f2f6c39fc16d1cd17ad4b5d896114ae470d55/node_modules/slash/"),
            packageDependencies: new Map([
                ["slash", "1.0.0"],
            ]),
        }],
    ])],
    ["lodash.some", new Map([
        ["4.6.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-lodash-some-4.6.0-1bb9f314ef6b8baded13b549169b2a945eb68e4d/node_modules/lodash.some/"),
            packageDependencies: new Map([
                ["lodash.some", "4.6.0"],
            ]),
        }],
    ])],
    ["lodash.isplainobject", new Map([
        ["4.0.6", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-lodash-isplainobject-4.0.6-7c526a52d89b45c45cc690b88163be0497f550cb/node_modules/lodash.isplainobject/"),
            packageDependencies: new Map([
                ["lodash.isplainobject", "4.0.6"],
            ]),
        }],
    ])],
    ["webpack-sources", new Map([
        ["1.4.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-webpack-sources-1.4.3-eedd8ec0b928fbf1cbfe994e22d2d890f330a933/node_modules/webpack-sources/"),
            packageDependencies: new Map([
                ["source-list-map", "2.0.1"],
                ["source-map", "0.6.1"],
                ["webpack-sources", "1.4.3"],
            ]),
        }],
        ["2.0.0-beta.8", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-webpack-sources-2.0.0-beta.8-0fc292239f6767cf4e9b47becfaa340ce6d7ea4f/node_modules/webpack-sources/"),
            packageDependencies: new Map([
                ["source-list-map", "2.0.1"],
                ["source-map", "0.6.1"],
                ["webpack-sources", "2.0.0-beta.8"],
            ]),
        }],
    ])],
    ["source-list-map", new Map([
        ["2.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-source-list-map-2.0.1-3993bd873bfc48479cca9ea3a547835c7c154b34/node_modules/source-list-map/"),
            packageDependencies: new Map([
                ["source-list-map", "2.0.1"],
            ]),
        }],
    ])],
    ["circular-dependency-plugin", new Map([
        ["5.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-circular-dependency-plugin-5.2.0-e09dbc2dd3e2928442403e2d45b41cea06bc0a93/node_modules/circular-dependency-plugin/"),
            packageDependencies: new Map([
                ["webpack", "5.0.0-beta.7"],
                ["circular-dependency-plugin", "5.2.0"],
            ]),
        }],
    ])],
    ["copyfiles", new Map([
        ["2.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-copyfiles-2.1.1-d430e122d7880f92c45d372208b0af03b0c39db6/node_modules/copyfiles/"),
            packageDependencies: new Map([
                ["glob", "7.1.6"],
                ["minimatch", "3.0.4"],
                ["mkdirp", "0.5.1"],
                ["noms", "0.0.0"],
                ["through2", "2.0.5"],
                ["yargs", "13.3.0"],
                ["copyfiles", "2.1.1"],
            ]),
        }],
    ])],
    ["glob", new Map([
        ["7.1.6", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-glob-7.1.6-141f33b81a7c2492e125594307480c46679278a6/node_modules/glob/"),
            packageDependencies: new Map([
                ["fs.realpath", "1.0.0"],
                ["inflight", "1.0.6"],
                ["inherits", "2.0.4"],
                ["minimatch", "3.0.4"],
                ["once", "1.4.0"],
                ["path-is-absolute", "1.0.1"],
                ["glob", "7.1.6"],
            ]),
        }],
    ])],
    ["fs.realpath", new Map([
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-fs-realpath-1.0.0-1504ad2523158caa40db4a2787cb01411994ea4f/node_modules/fs.realpath/"),
            packageDependencies: new Map([
                ["fs.realpath", "1.0.0"],
            ]),
        }],
    ])],
    ["inflight", new Map([
        ["1.0.6", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-inflight-1.0.6-49bd6331d7d02d0c09bc910a1075ba8165b56df9/node_modules/inflight/"),
            packageDependencies: new Map([
                ["once", "1.4.0"],
                ["wrappy", "1.0.2"],
                ["inflight", "1.0.6"],
            ]),
        }],
    ])],
    ["once", new Map([
        ["1.4.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-once-1.4.0-583b1aa775961d4b113ac17d9c50baef9dd76bd1/node_modules/once/"),
            packageDependencies: new Map([
                ["wrappy", "1.0.2"],
                ["once", "1.4.0"],
            ]),
        }],
    ])],
    ["wrappy", new Map([
        ["1.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-wrappy-1.0.2-b5243d8f3ec1aa35f1364605bc0d1036e30ab69f/node_modules/wrappy/"),
            packageDependencies: new Map([
                ["wrappy", "1.0.2"],
            ]),
        }],
    ])],
    ["inherits", new Map([
        ["2.0.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-inherits-2.0.4-0fa2c64f932917c3433a0ded55363aae37416b7c/node_modules/inherits/"),
            packageDependencies: new Map([
                ["inherits", "2.0.4"],
            ]),
        }],
        ["2.0.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-inherits-2.0.3-633c2c83e3da42a502f52466022480f4208261de/node_modules/inherits/"),
            packageDependencies: new Map([
                ["inherits", "2.0.3"],
            ]),
        }],
    ])],
    ["noms", new Map([
        ["0.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-noms-0.0.0-da8ebd9f3af9d6760919b27d9cdc8092a7332859/node_modules/noms/"),
            packageDependencies: new Map([
                ["inherits", "2.0.4"],
                ["readable-stream", "1.0.34"],
                ["noms", "0.0.0"],
            ]),
        }],
    ])],
    ["readable-stream", new Map([
        ["1.0.34", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-readable-stream-1.0.34-125820e34bc842d2f2aaafafe4c2916ee32c157c/node_modules/readable-stream/"),
            packageDependencies: new Map([
                ["core-util-is", "1.0.2"],
                ["inherits", "2.0.4"],
                ["isarray", "0.0.1"],
                ["string_decoder", "0.10.31"],
                ["readable-stream", "1.0.34"],
            ]),
        }],
        ["2.3.6", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-readable-stream-2.3.6-b11c27d88b8ff1fbe070643cf94b0c79ae1b0aaf/node_modules/readable-stream/"),
            packageDependencies: new Map([
                ["core-util-is", "1.0.2"],
                ["inherits", "2.0.4"],
                ["isarray", "1.0.0"],
                ["process-nextick-args", "2.0.1"],
                ["safe-buffer", "5.1.2"],
                ["string_decoder", "1.1.1"],
                ["util-deprecate", "1.0.2"],
                ["readable-stream", "2.3.6"],
            ]),
        }],
        ["3.4.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-readable-stream-3.4.0-a51c26754658e0a3c21dbf59163bd45ba6f447fc/node_modules/readable-stream/"),
            packageDependencies: new Map([
                ["inherits", "2.0.4"],
                ["string_decoder", "1.3.0"],
                ["util-deprecate", "1.0.2"],
                ["readable-stream", "3.4.0"],
            ]),
        }],
    ])],
    ["core-util-is", new Map([
        ["1.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-core-util-is-1.0.2-b5fd54220aa2bc5ab57aab7140c940754503c1a7/node_modules/core-util-is/"),
            packageDependencies: new Map([
                ["core-util-is", "1.0.2"],
            ]),
        }],
    ])],
    ["isarray", new Map([
        ["0.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-isarray-0.0.1-8a18acfca9a8f4177e09abfc6038939b05d1eedf/node_modules/isarray/"),
            packageDependencies: new Map([
                ["isarray", "0.0.1"],
            ]),
        }],
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-isarray-1.0.0-bb935d48582cba168c06834957a54a3e07124f11/node_modules/isarray/"),
            packageDependencies: new Map([
                ["isarray", "1.0.0"],
            ]),
        }],
    ])],
    ["string_decoder", new Map([
        ["0.10.31", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-string-decoder-0.10.31-62e203bc41766c6c28c9fc84301dab1c5310fa94/node_modules/string_decoder/"),
            packageDependencies: new Map([
                ["string_decoder", "0.10.31"],
            ]),
        }],
        ["1.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-string-decoder-1.1.1-9cf1611ba62685d7030ae9e4ba34149c3af03fc8/node_modules/string_decoder/"),
            packageDependencies: new Map([
                ["safe-buffer", "5.1.2"],
                ["string_decoder", "1.1.1"],
            ]),
        }],
        ["1.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-string-decoder-1.3.0-42f114594a46cf1a8e30b0a84f56c78c3edac21e/node_modules/string_decoder/"),
            packageDependencies: new Map([
                ["safe-buffer", "5.2.0"],
                ["string_decoder", "1.3.0"],
            ]),
        }],
    ])],
    ["through2", new Map([
        ["2.0.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-through2-2.0.5-01c1e39eb31d07cb7d03a96a70823260b23132cd/node_modules/through2/"),
            packageDependencies: new Map([
                ["readable-stream", "2.3.6"],
                ["xtend", "4.0.2"],
                ["through2", "2.0.5"],
            ]),
        }],
    ])],
    ["process-nextick-args", new Map([
        ["2.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-process-nextick-args-2.0.1-7820d9b16120cc55ca9ae7792680ae7dba6d7fe2/node_modules/process-nextick-args/"),
            packageDependencies: new Map([
                ["process-nextick-args", "2.0.1"],
            ]),
        }],
    ])],
    ["util-deprecate", new Map([
        ["1.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-util-deprecate-1.0.2-450d4dc9fa70de732762fbd2d4a28981419a0ccf/node_modules/util-deprecate/"),
            packageDependencies: new Map([
                ["util-deprecate", "1.0.2"],
            ]),
        }],
    ])],
    ["xtend", new Map([
        ["4.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-xtend-4.0.2-bb72779f5fa465186b1f438f674fa347fdb5db54/node_modules/xtend/"),
            packageDependencies: new Map([
                ["xtend", "4.0.2"],
            ]),
        }],
    ])],
    ["yargs", new Map([
        ["13.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-yargs-13.3.0-4c657a55e07e5f2cf947f8a366567c04a0dedc83/node_modules/yargs/"),
            packageDependencies: new Map([
                ["cliui", "5.0.0"],
                ["find-up", "3.0.0"],
                ["get-caller-file", "2.0.5"],
                ["require-directory", "2.1.1"],
                ["require-main-filename", "2.0.0"],
                ["set-blocking", "2.0.0"],
                ["string-width", "3.1.0"],
                ["which-module", "2.0.0"],
                ["y18n", "4.0.0"],
                ["yargs-parser", "13.1.1"],
                ["yargs", "13.3.0"],
            ]),
        }],
        ["13.2.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-yargs-13.2.4-0b562b794016eb9651b98bd37acf364aa5d6dc83/node_modules/yargs/"),
            packageDependencies: new Map([
                ["cliui", "5.0.0"],
                ["find-up", "3.0.0"],
                ["get-caller-file", "2.0.5"],
                ["os-locale", "3.1.0"],
                ["require-directory", "2.1.1"],
                ["require-main-filename", "2.0.0"],
                ["set-blocking", "2.0.0"],
                ["string-width", "3.1.0"],
                ["which-module", "2.0.0"],
                ["y18n", "4.0.0"],
                ["yargs-parser", "13.1.1"],
                ["yargs", "13.2.4"],
            ]),
        }],
        ["12.0.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-yargs-12.0.5-05f5997b609647b64f66b81e3b4b10a368e7ad13/node_modules/yargs/"),
            packageDependencies: new Map([
                ["cliui", "4.1.0"],
                ["decamelize", "1.2.0"],
                ["find-up", "3.0.0"],
                ["get-caller-file", "1.0.3"],
                ["os-locale", "3.1.0"],
                ["require-directory", "2.1.1"],
                ["require-main-filename", "1.0.1"],
                ["set-blocking", "2.0.0"],
                ["string-width", "2.1.1"],
                ["which-module", "2.0.0"],
                ["y18n", "4.0.0"],
                ["yargs-parser", "11.1.1"],
                ["yargs", "12.0.5"],
            ]),
        }],
        ["3.10.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-yargs-3.10.0-f7ee7bd857dd7c1d2d38c0e74efbd681d1431fd1/node_modules/yargs/"),
            packageDependencies: new Map([
                ["camelcase", "1.2.1"],
                ["cliui", "2.1.0"],
                ["decamelize", "1.2.0"],
                ["window-size", "0.1.0"],
                ["yargs", "3.10.0"],
            ]),
        }],
    ])],
    ["cliui", new Map([
        ["5.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-cliui-5.0.0-deefcfdb2e800784aa34f46fa08e06851c7bbbc5/node_modules/cliui/"),
            packageDependencies: new Map([
                ["string-width", "3.1.0"],
                ["strip-ansi", "5.2.0"],
                ["wrap-ansi", "5.1.0"],
                ["cliui", "5.0.0"],
            ]),
        }],
        ["4.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-cliui-4.1.0-348422dbe82d800b3022eef4f6ac10bf2e4d1b49/node_modules/cliui/"),
            packageDependencies: new Map([
                ["string-width", "2.1.1"],
                ["strip-ansi", "4.0.0"],
                ["wrap-ansi", "2.1.0"],
                ["cliui", "4.1.0"],
            ]),
        }],
        ["2.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-cliui-2.1.0-4b475760ff80264c762c3a1719032e91c7fea0d1/node_modules/cliui/"),
            packageDependencies: new Map([
                ["center-align", "0.1.3"],
                ["right-align", "0.1.3"],
                ["wordwrap", "0.0.2"],
                ["cliui", "2.1.0"],
            ]),
        }],
    ])],
    ["string-width", new Map([
        ["3.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-string-width-3.1.0-22767be21b62af1081574306f69ac51b62203961/node_modules/string-width/"),
            packageDependencies: new Map([
                ["emoji-regex", "7.0.3"],
                ["is-fullwidth-code-point", "2.0.0"],
                ["strip-ansi", "5.2.0"],
                ["string-width", "3.1.0"],
            ]),
        }],
        ["2.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-string-width-2.1.1-ab93f27a8dc13d28cac815c462143a6d9012ae9e/node_modules/string-width/"),
            packageDependencies: new Map([
                ["is-fullwidth-code-point", "2.0.0"],
                ["strip-ansi", "4.0.0"],
                ["string-width", "2.1.1"],
            ]),
        }],
        ["1.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-string-width-1.0.2-118bdf5b8cdc51a2a7e70d211e07e2b0b9b107d3/node_modules/string-width/"),
            packageDependencies: new Map([
                ["code-point-at", "1.1.0"],
                ["is-fullwidth-code-point", "1.0.0"],
                ["strip-ansi", "3.0.1"],
                ["string-width", "1.0.2"],
            ]),
        }],
    ])],
    ["emoji-regex", new Map([
        ["7.0.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-emoji-regex-7.0.3-933a04052860c85e83c122479c4748a8e4c72156/node_modules/emoji-regex/"),
            packageDependencies: new Map([
                ["emoji-regex", "7.0.3"],
            ]),
        }],
    ])],
    ["is-fullwidth-code-point", new Map([
        ["2.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-fullwidth-code-point-2.0.0-a3b30a5c4f199183167aaab93beefae3ddfb654f/node_modules/is-fullwidth-code-point/"),
            packageDependencies: new Map([
                ["is-fullwidth-code-point", "2.0.0"],
            ]),
        }],
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-fullwidth-code-point-1.0.0-ef9e31386f031a7f0d643af82fde50c457ef00cb/node_modules/is-fullwidth-code-point/"),
            packageDependencies: new Map([
                ["number-is-nan", "1.0.1"],
                ["is-fullwidth-code-point", "1.0.0"],
            ]),
        }],
    ])],
    ["wrap-ansi", new Map([
        ["5.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-wrap-ansi-5.1.0-1fd1f67235d5b6d0fee781056001bfb694c03b09/node_modules/wrap-ansi/"),
            packageDependencies: new Map([
                ["ansi-styles", "3.2.1"],
                ["string-width", "3.1.0"],
                ["strip-ansi", "5.2.0"],
                ["wrap-ansi", "5.1.0"],
            ]),
        }],
        ["2.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-wrap-ansi-2.1.0-d8fc3d284dd05794fe84973caecdd1cf824fdd85/node_modules/wrap-ansi/"),
            packageDependencies: new Map([
                ["string-width", "1.0.2"],
                ["strip-ansi", "3.0.1"],
                ["wrap-ansi", "2.1.0"],
            ]),
        }],
    ])],
    ["get-caller-file", new Map([
        ["2.0.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-get-caller-file-2.0.5-4f94412a82db32f36e3b0b9741f8a97feb031f7e/node_modules/get-caller-file/"),
            packageDependencies: new Map([
                ["get-caller-file", "2.0.5"],
            ]),
        }],
        ["1.0.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-get-caller-file-1.0.3-f978fa4c90d1dfe7ff2d6beda2a515e713bdcf4a/node_modules/get-caller-file/"),
            packageDependencies: new Map([
                ["get-caller-file", "1.0.3"],
            ]),
        }],
    ])],
    ["require-directory", new Map([
        ["2.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-require-directory-2.1.1-8c64ad5fd30dab1c976e2344ffe7f792a6a6df42/node_modules/require-directory/"),
            packageDependencies: new Map([
                ["require-directory", "2.1.1"],
            ]),
        }],
    ])],
    ["require-main-filename", new Map([
        ["2.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-require-main-filename-2.0.0-d0b329ecc7cc0f61649f62215be69af54aa8989b/node_modules/require-main-filename/"),
            packageDependencies: new Map([
                ["require-main-filename", "2.0.0"],
            ]),
        }],
        ["1.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-require-main-filename-1.0.1-97f717b69d48784f5f526a6c5aa8ffdda055a4d1/node_modules/require-main-filename/"),
            packageDependencies: new Map([
                ["require-main-filename", "1.0.1"],
            ]),
        }],
    ])],
    ["set-blocking", new Map([
        ["2.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-set-blocking-2.0.0-045f9782d011ae9a6803ddd382b24392b3d890f7/node_modules/set-blocking/"),
            packageDependencies: new Map([
                ["set-blocking", "2.0.0"],
            ]),
        }],
    ])],
    ["which-module", new Map([
        ["2.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-which-module-2.0.0-d9ef07dce77b9902b8a3a8fa4b31c3e3f7e6e87a/node_modules/which-module/"),
            packageDependencies: new Map([
                ["which-module", "2.0.0"],
            ]),
        }],
    ])],
    ["y18n", new Map([
        ["4.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-y18n-4.0.0-95ef94f85ecc81d007c264e190a120f0a3c8566b/node_modules/y18n/"),
            packageDependencies: new Map([
                ["y18n", "4.0.0"],
            ]),
        }],
    ])],
    ["decamelize", new Map([
        ["1.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-decamelize-1.2.0-f6534d15148269b20352e7bee26f501f9a191290/node_modules/decamelize/"),
            packageDependencies: new Map([
                ["decamelize", "1.2.0"],
            ]),
        }],
    ])],
    ["diff", new Map([
        ["4.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-diff-4.0.1-0c667cb467ebbb5cea7f14f135cc2dba7780a8ff/node_modules/diff/"),
            packageDependencies: new Map([
                ["diff", "4.0.1"],
            ]),
        }],
        ["1.4.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-diff-1.4.0-7f28d2eb9ee7b15a97efd89ce63dcfdaa3ccbabf/node_modules/diff/"),
            packageDependencies: new Map([
                ["diff", "1.4.0"],
            ]),
        }],
    ])],
    ["duplicate-package-checker-webpack-plugin", new Map([
        ["3.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-duplicate-package-checker-webpack-plugin-3.0.0-78bb89e625fa7cf8c2a59c53f62b495fda9ba287/node_modules/duplicate-package-checker-webpack-plugin/"),
            packageDependencies: new Map([
                ["chalk", "2.4.2"],
                ["find-root", "1.1.0"],
                ["lodash", "4.17.15"],
                ["semver", "5.7.1"],
                ["duplicate-package-checker-webpack-plugin", "3.0.0"],
            ]),
        }],
    ])],
    ["find-root", new Map([
        ["1.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-find-root-1.1.0-abcfc8ba76f708c42a97b3d685b7e9450bfb9ce4/node_modules/find-root/"),
            packageDependencies: new Map([
                ["find-root", "1.1.0"],
            ]),
        }],
    ])],
    ["eslint-plugin-flowtype", new Map([
        ["4.5.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-eslint-plugin-flowtype-4.5.2-5353449692663ef70e8fc8c2386cebdecac7e86b/node_modules/eslint-plugin-flowtype/"),
            packageDependencies: new Map([
                ["lodash", "4.17.15"],
                ["eslint-plugin-flowtype", "4.5.2"],
            ]),
        }],
    ])],
    ["flow-bin", new Map([
        ["0.112.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-flow-bin-0.112.0-6a21c31937c4a2f23a750056a364c598a95ea216/node_modules/flow-bin/"),
            packageDependencies: new Map([
                ["flow-bin", "0.112.0"],
            ]),
        }],
    ])],
    ["html-webpack-plugin", new Map([
        ["4.0.0-beta.8", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-html-webpack-plugin-4.0.0-beta.8-db1e0cb7aa89d23212cd87a8958566420002c24d/node_modules/html-webpack-plugin/"),
            packageDependencies: new Map([
                ["webpack", "5.0.0-beta.7"],
                ["html-minifier", "4.0.0"],
                ["loader-utils", "1.2.3"],
                ["lodash", "4.17.15"],
                ["pretty-error", "2.1.1"],
                ["tapable", "1.1.3"],
                ["util.promisify", "1.0.0"],
                ["html-webpack-plugin", "4.0.0-beta.8"],
            ]),
        }],
    ])],
    ["html-minifier", new Map([
        ["4.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-html-minifier-4.0.0-cca9aad8bce1175e02e17a8c33e46d8988889f56/node_modules/html-minifier/"),
            packageDependencies: new Map([
                ["camel-case", "3.0.0"],
                ["clean-css", "4.2.1"],
                ["commander", "2.20.3"],
                ["he", "1.2.0"],
                ["param-case", "2.1.1"],
                ["relateurl", "0.2.7"],
                ["uglify-js", "3.7.0"],
                ["html-minifier", "4.0.0"],
            ]),
        }],
    ])],
    ["camel-case", new Map([
        ["3.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-camel-case-3.0.0-ca3c3688a4e9cf3a4cda777dc4dcbc713249cf73/node_modules/camel-case/"),
            packageDependencies: new Map([
                ["no-case", "2.3.2"],
                ["upper-case", "1.1.3"],
                ["camel-case", "3.0.0"],
            ]),
        }],
    ])],
    ["no-case", new Map([
        ["2.3.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-no-case-2.3.2-60b813396be39b3f1288a4c1ed5d1e7d28b464ac/node_modules/no-case/"),
            packageDependencies: new Map([
                ["lower-case", "1.1.4"],
                ["no-case", "2.3.2"],
            ]),
        }],
    ])],
    ["lower-case", new Map([
        ["1.1.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-lower-case-1.1.4-9a2cabd1b9e8e0ae993a4bf7d5875c39c42e8eac/node_modules/lower-case/"),
            packageDependencies: new Map([
                ["lower-case", "1.1.4"],
            ]),
        }],
    ])],
    ["upper-case", new Map([
        ["1.1.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-upper-case-1.1.3-f6b4501c2ec4cdd26ba78be7222961de77621598/node_modules/upper-case/"),
            packageDependencies: new Map([
                ["upper-case", "1.1.3"],
            ]),
        }],
    ])],
    ["clean-css", new Map([
        ["4.2.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-clean-css-4.2.1-2d411ef76b8569b6d0c84068dabe85b0aa5e5c17/node_modules/clean-css/"),
            packageDependencies: new Map([
                ["source-map", "0.6.1"],
                ["clean-css", "4.2.1"],
            ]),
        }],
    ])],
    ["commander", new Map([
        ["2.20.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-commander-2.20.3-fd485e84c03eb4881c20722ba48035e8531aeb33/node_modules/commander/"),
            packageDependencies: new Map([
                ["commander", "2.20.3"],
            ]),
        }],
    ])],
    ["he", new Map([
        ["1.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-he-1.2.0-84ae65fa7eafb165fddb61566ae14baf05664f0f/node_modules/he/"),
            packageDependencies: new Map([
                ["he", "1.2.0"],
            ]),
        }],
    ])],
    ["param-case", new Map([
        ["2.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-param-case-2.1.1-df94fd8cf6531ecf75e6bef9a0858fbc72be2247/node_modules/param-case/"),
            packageDependencies: new Map([
                ["no-case", "2.3.2"],
                ["param-case", "2.1.1"],
            ]),
        }],
    ])],
    ["relateurl", new Map([
        ["0.2.7", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-relateurl-0.2.7-54dbf377e51440aca90a4cd274600d3ff2d888a9/node_modules/relateurl/"),
            packageDependencies: new Map([
                ["relateurl", "0.2.7"],
            ]),
        }],
    ])],
    ["uglify-js", new Map([
        ["3.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-uglify-js-3.7.0-14b854003386b7a7c045910f43afbc96d2aa5307/node_modules/uglify-js/"),
            packageDependencies: new Map([
                ["commander", "2.20.3"],
                ["source-map", "0.6.1"],
                ["uglify-js", "3.7.0"],
            ]),
        }],
        ["2.8.29", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-uglify-js-2.8.29-29c5733148057bb4e1f75df35b7a9cb72e6a59dd/node_modules/uglify-js/"),
            packageDependencies: new Map([
                ["source-map", "0.5.7"],
                ["yargs", "3.10.0"],
                ["uglify-to-browserify", "1.0.2"],
                ["uglify-js", "2.8.29"],
            ]),
        }],
    ])],
    ["pretty-error", new Map([
        ["2.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-pretty-error-2.1.1-5f4f87c8f91e5ae3f3ba87ab4cf5e03b1a17f1a3/node_modules/pretty-error/"),
            packageDependencies: new Map([
                ["renderkid", "2.0.3"],
                ["utila", "0.4.0"],
                ["pretty-error", "2.1.1"],
            ]),
        }],
    ])],
    ["renderkid", new Map([
        ["2.0.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-renderkid-2.0.3-380179c2ff5ae1365c522bf2fcfcff01c5b74149/node_modules/renderkid/"),
            packageDependencies: new Map([
                ["css-select", "1.2.0"],
                ["dom-converter", "0.2.0"],
                ["htmlparser2", "3.10.1"],
                ["strip-ansi", "3.0.1"],
                ["utila", "0.4.0"],
                ["renderkid", "2.0.3"],
            ]),
        }],
    ])],
    ["css-select", new Map([
        ["1.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-css-select-1.2.0-2b3a110539c5355f1cd8d314623e870b121ec858/node_modules/css-select/"),
            packageDependencies: new Map([
                ["boolbase", "1.0.0"],
                ["css-what", "2.1.3"],
                ["domutils", "1.5.1"],
                ["nth-check", "1.0.2"],
                ["css-select", "1.2.0"],
            ]),
        }],
    ])],
    ["boolbase", new Map([
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-boolbase-1.0.0-68dff5fbe60c51eb37725ea9e3ed310dcc1e776e/node_modules/boolbase/"),
            packageDependencies: new Map([
                ["boolbase", "1.0.0"],
            ]),
        }],
    ])],
    ["css-what", new Map([
        ["2.1.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-css-what-2.1.3-a6d7604573365fe74686c3f311c56513d88285f2/node_modules/css-what/"),
            packageDependencies: new Map([
                ["css-what", "2.1.3"],
            ]),
        }],
    ])],
    ["domutils", new Map([
        ["1.5.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-domutils-1.5.1-dcd8488a26f563d61079e48c9f7b7e32373682cf/node_modules/domutils/"),
            packageDependencies: new Map([
                ["dom-serializer", "0.2.2"],
                ["domelementtype", "1.3.1"],
                ["domutils", "1.5.1"],
            ]),
        }],
        ["1.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-domutils-1.7.0-56ea341e834e06e6748af7a1cb25da67ea9f8c2a/node_modules/domutils/"),
            packageDependencies: new Map([
                ["dom-serializer", "0.2.2"],
                ["domelementtype", "1.3.1"],
                ["domutils", "1.7.0"],
            ]),
        }],
    ])],
    ["dom-serializer", new Map([
        ["0.2.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-dom-serializer-0.2.2-1afb81f533717175d478655debc5e332d9f9bb51/node_modules/dom-serializer/"),
            packageDependencies: new Map([
                ["domelementtype", "2.0.1"],
                ["entities", "2.0.0"],
                ["dom-serializer", "0.2.2"],
            ]),
        }],
    ])],
    ["domelementtype", new Map([
        ["2.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-domelementtype-2.0.1-1f8bdfe91f5a78063274e803b4bdcedf6e94f94d/node_modules/domelementtype/"),
            packageDependencies: new Map([
                ["domelementtype", "2.0.1"],
            ]),
        }],
        ["1.3.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-domelementtype-1.3.1-d048c44b37b0d10a7f2a3d5fee3f4333d790481f/node_modules/domelementtype/"),
            packageDependencies: new Map([
                ["domelementtype", "1.3.1"],
            ]),
        }],
    ])],
    ["entities", new Map([
        ["2.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-entities-2.0.0-68d6084cab1b079767540d80e56a39b423e4abf4/node_modules/entities/"),
            packageDependencies: new Map([
                ["entities", "2.0.0"],
            ]),
        }],
        ["1.1.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-entities-1.1.2-bdfa735299664dfafd34529ed4f8522a275fea56/node_modules/entities/"),
            packageDependencies: new Map([
                ["entities", "1.1.2"],
            ]),
        }],
    ])],
    ["nth-check", new Map([
        ["1.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-nth-check-1.0.2-b2bd295c37e3dd58a3bf0700376663ba4d9cf05c/node_modules/nth-check/"),
            packageDependencies: new Map([
                ["boolbase", "1.0.0"],
                ["nth-check", "1.0.2"],
            ]),
        }],
    ])],
    ["dom-converter", new Map([
        ["0.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-dom-converter-0.2.0-6721a9daee2e293682955b6afe416771627bb768/node_modules/dom-converter/"),
            packageDependencies: new Map([
                ["utila", "0.4.0"],
                ["dom-converter", "0.2.0"],
            ]),
        }],
    ])],
    ["utila", new Map([
        ["0.4.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-utila-0.4.0-8a16a05d445657a3aea5eecc5b12a4fa5379772c/node_modules/utila/"),
            packageDependencies: new Map([
                ["utila", "0.4.0"],
            ]),
        }],
    ])],
    ["htmlparser2", new Map([
        ["3.10.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-htmlparser2-3.10.1-bd679dc3f59897b6a34bb10749c855bb53a9392f/node_modules/htmlparser2/"),
            packageDependencies: new Map([
                ["domelementtype", "1.3.1"],
                ["domhandler", "2.4.2"],
                ["domutils", "1.7.0"],
                ["entities", "1.1.2"],
                ["inherits", "2.0.4"],
                ["readable-stream", "3.4.0"],
                ["htmlparser2", "3.10.1"],
            ]),
        }],
    ])],
    ["domhandler", new Map([
        ["2.4.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-domhandler-2.4.2-8805097e933d65e85546f726d60f5eb88b44f803/node_modules/domhandler/"),
            packageDependencies: new Map([
                ["domelementtype", "1.3.1"],
                ["domhandler", "2.4.2"],
            ]),
        }],
    ])],
    ["tapable", new Map([
        ["1.1.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-tapable-1.1.3-a1fccc06b58db61fd7a45da2da44f5f3a3e67ba2/node_modules/tapable/"),
            packageDependencies: new Map([
                ["tapable", "1.1.3"],
            ]),
        }],
        ["2.0.0-beta.8", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-tapable-2.0.0-beta.8-0a8d42f6895d43d5a895de15d9a9e3e425f72a0a/node_modules/tapable/"),
            packageDependencies: new Map([
                ["tapable", "2.0.0-beta.8"],
            ]),
        }],
    ])],
    ["http-server", new Map([
        ["0.11.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-http-server-0.11.1-2302a56a6ffef7f9abea0147d838a5e9b6b6a79b/node_modules/http-server/"),
            packageDependencies: new Map([
                ["colors", "1.0.3"],
                ["corser", "2.0.1"],
                ["ecstatic", "3.3.2"],
                ["http-proxy", "1.18.0"],
                ["opener", "1.4.3"],
                ["optimist", "0.6.1"],
                ["portfinder", "1.0.25"],
                ["union", "0.4.6"],
                ["http-server", "0.11.1"],
            ]),
        }],
    ])],
    ["colors", new Map([
        ["1.0.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-colors-1.0.3-0433f44d809680fdeb60ed260f1b0c262e82a40b/node_modules/colors/"),
            packageDependencies: new Map([
                ["colors", "1.0.3"],
            ]),
        }],
    ])],
    ["corser", new Map([
        ["2.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-corser-2.0.1-8eda252ecaab5840dcd975ceb90d9370c819ff87/node_modules/corser/"),
            packageDependencies: new Map([
                ["corser", "2.0.1"],
            ]),
        }],
    ])],
    ["ecstatic", new Map([
        ["3.3.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ecstatic-3.3.2-6d1dd49814d00594682c652adb66076a69d46c48/node_modules/ecstatic/"),
            packageDependencies: new Map([
                ["he", "1.2.0"],
                ["mime", "1.6.0"],
                ["minimist", "1.2.0"],
                ["url-join", "2.0.5"],
                ["ecstatic", "3.3.2"],
            ]),
        }],
    ])],
    ["mime", new Map([
        ["1.6.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-mime-1.6.0-32cd9e5c64553bd58d19a568af452acff04981b1/node_modules/mime/"),
            packageDependencies: new Map([
                ["mime", "1.6.0"],
            ]),
        }],
        ["2.4.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-mime-2.4.4-bd7b91135fc6b01cde3e9bae33d659b63d8857e5/node_modules/mime/"),
            packageDependencies: new Map([
                ["mime", "2.4.4"],
            ]),
        }],
    ])],
    ["url-join", new Map([
        ["2.0.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-url-join-2.0.5-5af22f18c052a000a48d7b82c5e9c2e2feeda728/node_modules/url-join/"),
            packageDependencies: new Map([
                ["url-join", "2.0.5"],
            ]),
        }],
    ])],
    ["http-proxy", new Map([
        ["1.18.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-http-proxy-1.18.0-dbe55f63e75a347db7f3d99974f2692a314a6a3a/node_modules/http-proxy/"),
            packageDependencies: new Map([
                ["eventemitter3", "4.0.0"],
                ["follow-redirects", "1.9.0"],
                ["requires-port", "1.0.0"],
                ["http-proxy", "1.18.0"],
            ]),
        }],
    ])],
    ["eventemitter3", new Map([
        ["4.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-eventemitter3-4.0.0-d65176163887ee59f386d64c82610b696a4a74eb/node_modules/eventemitter3/"),
            packageDependencies: new Map([
                ["eventemitter3", "4.0.0"],
            ]),
        }],
    ])],
    ["follow-redirects", new Map([
        ["1.9.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-follow-redirects-1.9.0-8d5bcdc65b7108fe1508649c79c12d732dcedb4f/node_modules/follow-redirects/"),
            packageDependencies: new Map([
                ["debug", "3.2.6"],
                ["follow-redirects", "1.9.0"],
            ]),
        }],
    ])],
    ["requires-port", new Map([
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-requires-port-1.0.0-925d2601d39ac485e091cf0da5c6e694dc3dcaff/node_modules/requires-port/"),
            packageDependencies: new Map([
                ["requires-port", "1.0.0"],
            ]),
        }],
    ])],
    ["opener", new Map([
        ["1.4.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-opener-1.4.3-5c6da2c5d7e5831e8ffa3964950f8d6674ac90b8/node_modules/opener/"),
            packageDependencies: new Map([
                ["opener", "1.4.3"],
            ]),
        }],
        ["1.5.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-opener-1.5.1-6d2f0e77f1a0af0032aca716c2c1fbb8e7e8abed/node_modules/opener/"),
            packageDependencies: new Map([
                ["opener", "1.5.1"],
            ]),
        }],
    ])],
    ["optimist", new Map([
        ["0.6.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-optimist-0.6.1-da3ea74686fa21a19a111c326e90eb15a0196686/node_modules/optimist/"),
            packageDependencies: new Map([
                ["minimist", "0.0.10"],
                ["wordwrap", "0.0.3"],
                ["optimist", "0.6.1"],
            ]),
        }],
    ])],
    ["wordwrap", new Map([
        ["0.0.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-wordwrap-0.0.3-a3d5da6cd5c0bc0008d37234bbaf1bed63059107/node_modules/wordwrap/"),
            packageDependencies: new Map([
                ["wordwrap", "0.0.3"],
            ]),
        }],
        ["0.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-wordwrap-0.0.2-b79669bb42ecb409f83d583cad52ca17eaa1643f/node_modules/wordwrap/"),
            packageDependencies: new Map([
                ["wordwrap", "0.0.2"],
            ]),
        }],
    ])],
    ["portfinder", new Map([
        ["1.0.25", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-portfinder-1.0.25-254fd337ffba869f4b9d37edc298059cb4d35eca/node_modules/portfinder/"),
            packageDependencies: new Map([
                ["async", "2.6.3"],
                ["debug", "3.2.6"],
                ["mkdirp", "0.5.1"],
                ["portfinder", "1.0.25"],
            ]),
        }],
    ])],
    ["async", new Map([
        ["2.6.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-async-2.6.3-d72625e2344a3656e3a3ad4fa749fa83299d82ff/node_modules/async/"),
            packageDependencies: new Map([
                ["lodash", "4.17.15"],
                ["async", "2.6.3"],
            ]),
        }],
    ])],
    ["union", new Map([
        ["0.4.6", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-union-0.4.6-198fbdaeba254e788b0efcb630bc11f24a2959e0/node_modules/union/"),
            packageDependencies: new Map([
                ["qs", "2.3.3"],
                ["union", "0.4.6"],
            ]),
        }],
    ])],
    ["qs", new Map([
        ["2.3.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-qs-2.3.3-e9e85adbe75da0bbe4c8e0476a086290f863b404/node_modules/qs/"),
            packageDependencies: new Map([
                ["qs", "2.3.3"],
            ]),
        }],
        ["6.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-qs-6.7.0-41dc1a015e3d581f1621776be31afb2876a9b1bc/node_modules/qs/"),
            packageDependencies: new Map([
                ["qs", "6.7.0"],
            ]),
        }],
    ])],
    ["parallel-webpack", new Map([
        ["2.4.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-parallel-webpack-2.4.0-37b06e6018cfeaccf713c969a19ae31b77b0474c/node_modules/parallel-webpack/"),
            packageDependencies: new Map([
                ["webpack", "5.0.0-beta.7"],
                ["ajv", "4.11.8"],
                ["bluebird", "3.7.1"],
                ["chalk", "1.1.3"],
                ["interpret", "1.2.0"],
                ["lodash.assign", "4.2.0"],
                ["lodash.endswith", "4.2.1"],
                ["lodash.flatten", "4.4.0"],
                ["minimist", "1.2.0"],
                ["node-ipc", "9.1.1"],
                ["pluralize", "1.2.1"],
                ["supports-color", "3.2.3"],
                ["worker-farm", "1.7.0"],
                ["parallel-webpack", "2.4.0"],
            ]),
        }],
    ])],
    ["ajv", new Map([
        ["4.11.8", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ajv-4.11.8-82ffb02b29e662ae53bdc20af15947706739c536/node_modules/ajv/"),
            packageDependencies: new Map([
                ["co", "4.6.0"],
                ["json-stable-stringify", "1.0.1"],
                ["ajv", "4.11.8"],
            ]),
        }],
        ["6.10.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ajv-6.10.2-d3cea04d6b017b2894ad69040fec8b623eb4bd52/node_modules/ajv/"),
            packageDependencies: new Map([
                ["fast-deep-equal", "2.0.1"],
                ["fast-json-stable-stringify", "2.0.0"],
                ["json-schema-traverse", "0.4.1"],
                ["uri-js", "4.2.2"],
                ["ajv", "6.10.2"],
            ]),
        }],
    ])],
    ["co", new Map([
        ["4.6.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-co-4.6.0-6ea6bdf3d853ae54ccb8e47bfa0bf3f9031fb184/node_modules/co/"),
            packageDependencies: new Map([
                ["co", "4.6.0"],
            ]),
        }],
    ])],
    ["json-stable-stringify", new Map([
        ["1.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-json-stable-stringify-1.0.1-9a759d39c5f2ff503fd5300646ed445f88c4f9af/node_modules/json-stable-stringify/"),
            packageDependencies: new Map([
                ["jsonify", "0.0.0"],
                ["json-stable-stringify", "1.0.1"],
            ]),
        }],
    ])],
    ["jsonify", new Map([
        ["0.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-jsonify-0.0.0-2c74b6ee41d93ca51b7b5aaee8f503631d252a73/node_modules/jsonify/"),
            packageDependencies: new Map([
                ["jsonify", "0.0.0"],
            ]),
        }],
    ])],
    ["bluebird", new Map([
        ["3.7.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-bluebird-3.7.1-df70e302b471d7473489acf26a93d63b53f874de/node_modules/bluebird/"),
            packageDependencies: new Map([
                ["bluebird", "3.7.1"],
            ]),
        }],
    ])],
    ["interpret", new Map([
        ["1.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-interpret-1.2.0-d5061a6224be58e8083985f5014d844359576296/node_modules/interpret/"),
            packageDependencies: new Map([
                ["interpret", "1.2.0"],
            ]),
        }],
    ])],
    ["lodash.assign", new Map([
        ["4.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-lodash-assign-4.2.0-0d99f3ccd7a6d261d19bdaeb9245005d285808e7/node_modules/lodash.assign/"),
            packageDependencies: new Map([
                ["lodash.assign", "4.2.0"],
            ]),
        }],
    ])],
    ["lodash.endswith", new Map([
        ["4.2.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-lodash-endswith-4.2.1-fed59ac1738ed3e236edd7064ec456448b37bc09/node_modules/lodash.endswith/"),
            packageDependencies: new Map([
                ["lodash.endswith", "4.2.1"],
            ]),
        }],
    ])],
    ["lodash.flatten", new Map([
        ["4.4.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-lodash-flatten-4.4.0-f31c22225a9632d2bbf8e4addbef240aa765a61f/node_modules/lodash.flatten/"),
            packageDependencies: new Map([
                ["lodash.flatten", "4.4.0"],
            ]),
        }],
    ])],
    ["node-ipc", new Map([
        ["9.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-node-ipc-9.1.1-4e245ed6938e65100e595ebc5dc34b16e8dd5d69/node_modules/node-ipc/"),
            packageDependencies: new Map([
                ["event-pubsub", "4.3.0"],
                ["js-message", "1.0.5"],
                ["js-queue", "2.0.0"],
                ["node-ipc", "9.1.1"],
            ]),
        }],
    ])],
    ["event-pubsub", new Map([
        ["4.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-event-pubsub-4.3.0-f68d816bc29f1ec02c539dc58c8dd40ce72cb36e/node_modules/event-pubsub/"),
            packageDependencies: new Map([
                ["event-pubsub", "4.3.0"],
            ]),
        }],
    ])],
    ["js-message", new Map([
        ["1.0.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-js-message-1.0.5-2300d24b1af08e89dd095bc1a4c9c9cfcb892d15/node_modules/js-message/"),
            packageDependencies: new Map([
                ["js-message", "1.0.5"],
            ]),
        }],
    ])],
    ["js-queue", new Map([
        ["2.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-js-queue-2.0.0-362213cf860f468f0125fc6c96abc1742531f948/node_modules/js-queue/"),
            packageDependencies: new Map([
                ["easy-stack", "1.0.0"],
                ["js-queue", "2.0.0"],
            ]),
        }],
    ])],
    ["easy-stack", new Map([
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-easy-stack-1.0.0-12c91b3085a37f0baa336e9486eac4bf94e3e788/node_modules/easy-stack/"),
            packageDependencies: new Map([
                ["easy-stack", "1.0.0"],
            ]),
        }],
    ])],
    ["pluralize", new Map([
        ["1.2.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-pluralize-1.2.1-d1a21483fd22bb41e58a12fa3421823140897c45/node_modules/pluralize/"),
            packageDependencies: new Map([
                ["pluralize", "1.2.1"],
            ]),
        }],
    ])],
    ["worker-farm", new Map([
        ["1.7.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-worker-farm-1.7.0-26a94c5391bbca926152002f69b84a4bf772e5a8/node_modules/worker-farm/"),
            packageDependencies: new Map([
                ["errno", "0.1.7"],
                ["worker-farm", "1.7.0"],
            ]),
        }],
    ])],
    ["errno", new Map([
        ["0.1.7", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-errno-0.1.7-4684d71779ad39af177e3f007996f7c67c852618/node_modules/errno/"),
            packageDependencies: new Map([
                ["prr", "1.0.1"],
                ["errno", "0.1.7"],
            ]),
        }],
    ])],
    ["prr", new Map([
        ["1.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-prr-1.0.1-d3fc114ba06995a45ec6893f484ceb1d78f5f476/node_modules/prr/"),
            packageDependencies: new Map([
                ["prr", "1.0.1"],
            ]),
        }],
    ])],
    ["rimraf", new Map([
        ["3.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-rimraf-3.0.0-614176d4b3010b75e5c390eb0ee96f6dc0cebb9b/node_modules/rimraf/"),
            packageDependencies: new Map([
                ["glob", "7.1.6"],
                ["rimraf", "3.0.0"],
            ]),
        }],
        ["2.7.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-rimraf-2.7.1-35797f13a7fdadc566142c29d4f07ccad483e3ec/node_modules/rimraf/"),
            packageDependencies: new Map([
                ["glob", "7.1.6"],
                ["rimraf", "2.7.1"],
            ]),
        }],
    ])],
    ["script-ext-html-webpack-plugin", new Map([
        ["2.1.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-script-ext-html-webpack-plugin-2.1.4-7c309354e310bf78523e1b84ca96fd374ceb9880/node_modules/script-ext-html-webpack-plugin/"),
            packageDependencies: new Map([
                ["webpack", "5.0.0-beta.7"],
                ["html-webpack-plugin", "4.0.0-beta.8"],
                ["debug", "4.1.1"],
                ["script-ext-html-webpack-plugin", "2.1.4"],
            ]),
        }],
    ])],
    ["webpack", new Map([
        ["5.0.0-beta.7", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-webpack-5.0.0-beta.7-e2dc0ed0543c71e97524be0fcb68a80de50aa898/node_modules/webpack/"),
            packageDependencies: new Map([
                ["@webassemblyjs/ast", "1.8.5"],
                ["@webassemblyjs/helper-module-context", "1.8.5"],
                ["@webassemblyjs/wasm-edit", "1.8.5"],
                ["@webassemblyjs/wasm-parser", "1.8.5"],
                ["acorn", "7.1.0"],
                ["chrome-trace-event", "1.0.2"],
                ["enhanced-resolve", "5.0.0-beta.4"],
                ["eslint-scope", "5.0.0"],
                ["events", "3.0.0"],
                ["glob-to-regexp", "0.4.1"],
                ["graceful-fs", "4.2.3"],
                ["json-parse-better-errors", "1.0.2"],
                ["loader-runner", "3.0.0"],
                ["loader-utils", "1.2.3"],
                ["neo-async", "2.6.1"],
                ["pkg-dir", "4.2.0"],
                ["schema-utils", "2.5.0"],
                ["tapable", "2.0.0-beta.8"],
                ["terser-webpack-plugin", "2.2.1"],
                ["watchpack", "2.0.0-beta.10"],
                ["webpack-sources", "2.0.0-beta.8"],
                ["webpack", "5.0.0-beta.7"],
            ]),
        }],
    ])],
    ["@webassemblyjs/ast", new Map([
        ["1.8.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-ast-1.8.5-51b1c5fe6576a34953bf4b253df9f0d490d9e359/node_modules/@webassemblyjs/ast/"),
            packageDependencies: new Map([
                ["@webassemblyjs/helper-module-context", "1.8.5"],
                ["@webassemblyjs/helper-wasm-bytecode", "1.8.5"],
                ["@webassemblyjs/wast-parser", "1.8.5"],
                ["@webassemblyjs/ast", "1.8.5"],
            ]),
        }],
    ])],
    ["@webassemblyjs/helper-module-context", new Map([
        ["1.8.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-helper-module-context-1.8.5-def4b9927b0101dc8cbbd8d1edb5b7b9c82eb245/node_modules/@webassemblyjs/helper-module-context/"),
            packageDependencies: new Map([
                ["@webassemblyjs/ast", "1.8.5"],
                ["mamacro", "0.0.3"],
                ["@webassemblyjs/helper-module-context", "1.8.5"],
            ]),
        }],
    ])],
    ["mamacro", new Map([
        ["0.0.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-mamacro-0.0.3-ad2c9576197c9f1abf308d0787865bd975a3f3e4/node_modules/mamacro/"),
            packageDependencies: new Map([
                ["mamacro", "0.0.3"],
            ]),
        }],
    ])],
    ["@webassemblyjs/helper-wasm-bytecode", new Map([
        ["1.8.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-helper-wasm-bytecode-1.8.5-537a750eddf5c1e932f3744206551c91c1b93e61/node_modules/@webassemblyjs/helper-wasm-bytecode/"),
            packageDependencies: new Map([
                ["@webassemblyjs/helper-wasm-bytecode", "1.8.5"],
            ]),
        }],
    ])],
    ["@webassemblyjs/wast-parser", new Map([
        ["1.8.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-wast-parser-1.8.5-e10eecd542d0e7bd394f6827c49f3df6d4eefb8c/node_modules/@webassemblyjs/wast-parser/"),
            packageDependencies: new Map([
                ["@webassemblyjs/ast", "1.8.5"],
                ["@webassemblyjs/floating-point-hex-parser", "1.8.5"],
                ["@webassemblyjs/helper-api-error", "1.8.5"],
                ["@webassemblyjs/helper-code-frame", "1.8.5"],
                ["@webassemblyjs/helper-fsm", "1.8.5"],
                ["@xtuc/long", "4.2.2"],
                ["@webassemblyjs/wast-parser", "1.8.5"],
            ]),
        }],
    ])],
    ["@webassemblyjs/floating-point-hex-parser", new Map([
        ["1.8.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-floating-point-hex-parser-1.8.5-1ba926a2923613edce496fd5b02e8ce8a5f49721/node_modules/@webassemblyjs/floating-point-hex-parser/"),
            packageDependencies: new Map([
                ["@webassemblyjs/floating-point-hex-parser", "1.8.5"],
            ]),
        }],
    ])],
    ["@webassemblyjs/helper-api-error", new Map([
        ["1.8.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-helper-api-error-1.8.5-c49dad22f645227c5edb610bdb9697f1aab721f7/node_modules/@webassemblyjs/helper-api-error/"),
            packageDependencies: new Map([
                ["@webassemblyjs/helper-api-error", "1.8.5"],
            ]),
        }],
    ])],
    ["@webassemblyjs/helper-code-frame", new Map([
        ["1.8.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-helper-code-frame-1.8.5-9a740ff48e3faa3022b1dff54423df9aa293c25e/node_modules/@webassemblyjs/helper-code-frame/"),
            packageDependencies: new Map([
                ["@webassemblyjs/wast-printer", "1.8.5"],
                ["@webassemblyjs/helper-code-frame", "1.8.5"],
            ]),
        }],
    ])],
    ["@webassemblyjs/wast-printer", new Map([
        ["1.8.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-wast-printer-1.8.5-114bbc481fd10ca0e23b3560fa812748b0bae5bc/node_modules/@webassemblyjs/wast-printer/"),
            packageDependencies: new Map([
                ["@webassemblyjs/ast", "1.8.5"],
                ["@webassemblyjs/wast-parser", "1.8.5"],
                ["@xtuc/long", "4.2.2"],
                ["@webassemblyjs/wast-printer", "1.8.5"],
            ]),
        }],
    ])],
    ["@xtuc/long", new Map([
        ["4.2.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@xtuc-long-4.2.2-d291c6a4e97989b5c61d9acf396ae4fe133a718d/node_modules/@xtuc/long/"),
            packageDependencies: new Map([
                ["@xtuc/long", "4.2.2"],
            ]),
        }],
    ])],
    ["@webassemblyjs/helper-fsm", new Map([
        ["1.8.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-helper-fsm-1.8.5-ba0b7d3b3f7e4733da6059c9332275d860702452/node_modules/@webassemblyjs/helper-fsm/"),
            packageDependencies: new Map([
                ["@webassemblyjs/helper-fsm", "1.8.5"],
            ]),
        }],
    ])],
    ["@webassemblyjs/wasm-edit", new Map([
        ["1.8.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-wasm-edit-1.8.5-962da12aa5acc1c131c81c4232991c82ce56e01a/node_modules/@webassemblyjs/wasm-edit/"),
            packageDependencies: new Map([
                ["@webassemblyjs/ast", "1.8.5"],
                ["@webassemblyjs/helper-buffer", "1.8.5"],
                ["@webassemblyjs/helper-wasm-bytecode", "1.8.5"],
                ["@webassemblyjs/helper-wasm-section", "1.8.5"],
                ["@webassemblyjs/wasm-gen", "1.8.5"],
                ["@webassemblyjs/wasm-opt", "1.8.5"],
                ["@webassemblyjs/wasm-parser", "1.8.5"],
                ["@webassemblyjs/wast-printer", "1.8.5"],
                ["@webassemblyjs/wasm-edit", "1.8.5"],
            ]),
        }],
    ])],
    ["@webassemblyjs/helper-buffer", new Map([
        ["1.8.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-helper-buffer-1.8.5-fea93e429863dd5e4338555f42292385a653f204/node_modules/@webassemblyjs/helper-buffer/"),
            packageDependencies: new Map([
                ["@webassemblyjs/helper-buffer", "1.8.5"],
            ]),
        }],
    ])],
    ["@webassemblyjs/helper-wasm-section", new Map([
        ["1.8.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-helper-wasm-section-1.8.5-74ca6a6bcbe19e50a3b6b462847e69503e6bfcbf/node_modules/@webassemblyjs/helper-wasm-section/"),
            packageDependencies: new Map([
                ["@webassemblyjs/ast", "1.8.5"],
                ["@webassemblyjs/helper-buffer", "1.8.5"],
                ["@webassemblyjs/helper-wasm-bytecode", "1.8.5"],
                ["@webassemblyjs/wasm-gen", "1.8.5"],
                ["@webassemblyjs/helper-wasm-section", "1.8.5"],
            ]),
        }],
    ])],
    ["@webassemblyjs/wasm-gen", new Map([
        ["1.8.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-wasm-gen-1.8.5-54840766c2c1002eb64ed1abe720aded714f98bc/node_modules/@webassemblyjs/wasm-gen/"),
            packageDependencies: new Map([
                ["@webassemblyjs/ast", "1.8.5"],
                ["@webassemblyjs/helper-wasm-bytecode", "1.8.5"],
                ["@webassemblyjs/ieee754", "1.8.5"],
                ["@webassemblyjs/leb128", "1.8.5"],
                ["@webassemblyjs/utf8", "1.8.5"],
                ["@webassemblyjs/wasm-gen", "1.8.5"],
            ]),
        }],
    ])],
    ["@webassemblyjs/ieee754", new Map([
        ["1.8.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-ieee754-1.8.5-712329dbef240f36bf57bd2f7b8fb9bf4154421e/node_modules/@webassemblyjs/ieee754/"),
            packageDependencies: new Map([
                ["@xtuc/ieee754", "1.2.0"],
                ["@webassemblyjs/ieee754", "1.8.5"],
            ]),
        }],
    ])],
    ["@xtuc/ieee754", new Map([
        ["1.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@xtuc-ieee754-1.2.0-eef014a3145ae477a1cbc00cd1e552336dceb790/node_modules/@xtuc/ieee754/"),
            packageDependencies: new Map([
                ["@xtuc/ieee754", "1.2.0"],
            ]),
        }],
    ])],
    ["@webassemblyjs/leb128", new Map([
        ["1.8.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-leb128-1.8.5-044edeb34ea679f3e04cd4fd9824d5e35767ae10/node_modules/@webassemblyjs/leb128/"),
            packageDependencies: new Map([
                ["@xtuc/long", "4.2.2"],
                ["@webassemblyjs/leb128", "1.8.5"],
            ]),
        }],
    ])],
    ["@webassemblyjs/utf8", new Map([
        ["1.8.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-utf8-1.8.5-a8bf3b5d8ffe986c7c1e373ccbdc2a0915f0cedc/node_modules/@webassemblyjs/utf8/"),
            packageDependencies: new Map([
                ["@webassemblyjs/utf8", "1.8.5"],
            ]),
        }],
    ])],
    ["@webassemblyjs/wasm-opt", new Map([
        ["1.8.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-wasm-opt-1.8.5-b24d9f6ba50394af1349f510afa8ffcb8a63d264/node_modules/@webassemblyjs/wasm-opt/"),
            packageDependencies: new Map([
                ["@webassemblyjs/ast", "1.8.5"],
                ["@webassemblyjs/helper-buffer", "1.8.5"],
                ["@webassemblyjs/wasm-gen", "1.8.5"],
                ["@webassemblyjs/wasm-parser", "1.8.5"],
                ["@webassemblyjs/wasm-opt", "1.8.5"],
            ]),
        }],
    ])],
    ["@webassemblyjs/wasm-parser", new Map([
        ["1.8.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-wasm-parser-1.8.5-21576f0ec88b91427357b8536383668ef7c66b8d/node_modules/@webassemblyjs/wasm-parser/"),
            packageDependencies: new Map([
                ["@webassemblyjs/ast", "1.8.5"],
                ["@webassemblyjs/helper-api-error", "1.8.5"],
                ["@webassemblyjs/helper-wasm-bytecode", "1.8.5"],
                ["@webassemblyjs/ieee754", "1.8.5"],
                ["@webassemblyjs/leb128", "1.8.5"],
                ["@webassemblyjs/utf8", "1.8.5"],
                ["@webassemblyjs/wasm-parser", "1.8.5"],
            ]),
        }],
    ])],
    ["acorn", new Map([
        ["7.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-acorn-7.1.0-949d36f2c292535da602283586c2477c57eb2d6c/node_modules/acorn/"),
            packageDependencies: new Map([
                ["acorn", "7.1.0"],
            ]),
        }],
        ["6.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-acorn-6.3.0-0087509119ffa4fc0a0041d1e93a417e68cb856e/node_modules/acorn/"),
            packageDependencies: new Map([
                ["acorn", "6.3.0"],
            ]),
        }],
    ])],
    ["chrome-trace-event", new Map([
        ["1.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-chrome-trace-event-1.0.2-234090ee97c7d4ad1a2c4beae27505deffc608a4/node_modules/chrome-trace-event/"),
            packageDependencies: new Map([
                ["tslib", "1.10.0"],
                ["chrome-trace-event", "1.0.2"],
            ]),
        }],
    ])],
    ["tslib", new Map([
        ["1.10.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-tslib-1.10.0-c3c19f95973fb0a62973fb09d90d961ee43e5c8a/node_modules/tslib/"),
            packageDependencies: new Map([
                ["tslib", "1.10.0"],
            ]),
        }],
    ])],
    ["enhanced-resolve", new Map([
        ["5.0.0-beta.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-enhanced-resolve-5.0.0-beta.4-a14a799c098c2c43ec2cd0b718b14a2eadec7301/node_modules/enhanced-resolve/"),
            packageDependencies: new Map([
                ["graceful-fs", "4.2.3"],
                ["tapable", "2.0.0-beta.8"],
                ["enhanced-resolve", "5.0.0-beta.4"],
            ]),
        }],
        ["4.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-enhanced-resolve-4.1.0-41c7e0bfdfe74ac1ffe1e57ad6a5c6c9f3742a7f/node_modules/enhanced-resolve/"),
            packageDependencies: new Map([
                ["graceful-fs", "4.2.3"],
                ["memory-fs", "0.4.1"],
                ["tapable", "1.1.3"],
                ["enhanced-resolve", "4.1.0"],
            ]),
        }],
    ])],
    ["graceful-fs", new Map([
        ["4.2.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-graceful-fs-4.2.3-4a12ff1b60376ef09862c2093edd908328be8423/node_modules/graceful-fs/"),
            packageDependencies: new Map([
                ["graceful-fs", "4.2.3"],
            ]),
        }],
    ])],
    ["eslint-scope", new Map([
        ["5.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-eslint-scope-5.0.0-e87c8887c73e8d1ec84f1ca591645c358bfc8fb9/node_modules/eslint-scope/"),
            packageDependencies: new Map([
                ["esrecurse", "4.2.1"],
                ["estraverse", "4.3.0"],
                ["eslint-scope", "5.0.0"],
            ]),
        }],
    ])],
    ["esrecurse", new Map([
        ["4.2.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-esrecurse-4.2.1-007a3b9fdbc2b3bb87e4879ea19c92fdbd3942cf/node_modules/esrecurse/"),
            packageDependencies: new Map([
                ["estraverse", "4.3.0"],
                ["esrecurse", "4.2.1"],
            ]),
        }],
    ])],
    ["estraverse", new Map([
        ["4.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-estraverse-4.3.0-398ad3f3c5a24948be7725e83d11a7de28cdbd1d/node_modules/estraverse/"),
            packageDependencies: new Map([
                ["estraverse", "4.3.0"],
            ]),
        }],
    ])],
    ["events", new Map([
        ["3.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-events-3.0.0-9a0a0dfaf62893d92b875b8f2698ca4114973e88/node_modules/events/"),
            packageDependencies: new Map([
                ["events", "3.0.0"],
            ]),
        }],
    ])],
    ["glob-to-regexp", new Map([
        ["0.4.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-glob-to-regexp-0.4.1-c75297087c851b9a578bd217dd59a92f59fe546e/node_modules/glob-to-regexp/"),
            packageDependencies: new Map([
                ["glob-to-regexp", "0.4.1"],
            ]),
        }],
    ])],
    ["json-parse-better-errors", new Map([
        ["1.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-json-parse-better-errors-1.0.2-bb867cfb3450e69107c131d1c514bab3dc8bcaa9/node_modules/json-parse-better-errors/"),
            packageDependencies: new Map([
                ["json-parse-better-errors", "1.0.2"],
            ]),
        }],
    ])],
    ["loader-runner", new Map([
        ["3.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-loader-runner-3.0.0-c86f303af2dacbd27eabd2ea3aaa957291562e23/node_modules/loader-runner/"),
            packageDependencies: new Map([
                ["loader-runner", "3.0.0"],
            ]),
        }],
    ])],
    ["neo-async", new Map([
        ["2.6.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-neo-async-2.6.1-ac27ada66167fa8849a6addd837f6b189ad2081c/node_modules/neo-async/"),
            packageDependencies: new Map([
                ["neo-async", "2.6.1"],
            ]),
        }],
    ])],
    ["schema-utils", new Map([
        ["2.5.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-schema-utils-2.5.0-8f254f618d402cc80257486213c8970edfd7c22f/node_modules/schema-utils/"),
            packageDependencies: new Map([
                ["ajv", "6.10.2"],
                ["ajv-keywords", "pnp:b05430443ee7aa37b1a8425db8c1975689445330"],
                ["schema-utils", "2.5.0"],
            ]),
        }],
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-schema-utils-1.0.0-0b79a93204d7b600d4b2850d1f66c2a34951c770/node_modules/schema-utils/"),
            packageDependencies: new Map([
                ["ajv", "6.10.2"],
                ["ajv-errors", "1.0.1"],
                ["ajv-keywords", "pnp:98617499d4d50a8cd551a218fe8b73ef64f99afe"],
                ["schema-utils", "1.0.0"],
            ]),
        }],
    ])],
    ["fast-deep-equal", new Map([
        ["2.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-fast-deep-equal-2.0.1-7b05218ddf9667bf7f370bf7fdb2cb15fdd0aa49/node_modules/fast-deep-equal/"),
            packageDependencies: new Map([
                ["fast-deep-equal", "2.0.1"],
            ]),
        }],
    ])],
    ["fast-json-stable-stringify", new Map([
        ["2.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-fast-json-stable-stringify-2.0.0-d5142c0caee6b1189f87d3a76111064f86c8bbf2/node_modules/fast-json-stable-stringify/"),
            packageDependencies: new Map([
                ["fast-json-stable-stringify", "2.0.0"],
            ]),
        }],
    ])],
    ["json-schema-traverse", new Map([
        ["0.4.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-json-schema-traverse-0.4.1-69f6a87d9513ab8bb8fe63bdb0979c448e684660/node_modules/json-schema-traverse/"),
            packageDependencies: new Map([
                ["json-schema-traverse", "0.4.1"],
            ]),
        }],
    ])],
    ["uri-js", new Map([
        ["4.2.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-uri-js-4.2.2-94c540e1ff772956e2299507c010aea6c8838eb0/node_modules/uri-js/"),
            packageDependencies: new Map([
                ["punycode", "2.1.1"],
                ["uri-js", "4.2.2"],
            ]),
        }],
    ])],
    ["punycode", new Map([
        ["2.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-punycode-2.1.1-b58b010ac40c22c5657616c8d2c2c02c7bf479ec/node_modules/punycode/"),
            packageDependencies: new Map([
                ["punycode", "2.1.1"],
            ]),
        }],
        ["1.3.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-punycode-1.3.2-9653a036fb7c1ee42342f2325cceefea3926c48d/node_modules/punycode/"),
            packageDependencies: new Map([
                ["punycode", "1.3.2"],
            ]),
        }],
    ])],
    ["ajv-keywords", new Map([
        ["pnp:b05430443ee7aa37b1a8425db8c1975689445330", {
            packageLocation: path.resolve(__dirname, "./.pnp/externals/pnp-b05430443ee7aa37b1a8425db8c1975689445330/node_modules/ajv-keywords/"),
            packageDependencies: new Map([
                ["ajv", "6.10.2"],
                ["ajv-keywords", "pnp:b05430443ee7aa37b1a8425db8c1975689445330"],
            ]),
        }],
        ["pnp:98617499d4d50a8cd551a218fe8b73ef64f99afe", {
            packageLocation: path.resolve(__dirname, "./.pnp/externals/pnp-98617499d4d50a8cd551a218fe8b73ef64f99afe/node_modules/ajv-keywords/"),
            packageDependencies: new Map([
                ["ajv", "6.10.2"],
                ["ajv-keywords", "pnp:98617499d4d50a8cd551a218fe8b73ef64f99afe"],
            ]),
        }],
    ])],
    ["terser-webpack-plugin", new Map([
        ["2.2.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-terser-webpack-plugin-2.2.1-5569e6c7d8be79e5e43d6da23acc3b6ba77d22bd/node_modules/terser-webpack-plugin/"),
            packageDependencies: new Map([
                ["cacache", "13.0.1"],
                ["find-cache-dir", "3.1.0"],
                ["jest-worker", "24.9.0"],
                ["schema-utils", "2.5.0"],
                ["serialize-javascript", "2.1.0"],
                ["source-map", "0.6.1"],
                ["terser", "4.4.0"],
                ["webpack-sources", "1.4.3"],
                ["terser-webpack-plugin", "2.2.1"],
            ]),
        }],
    ])],
    ["cacache", new Map([
        ["13.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-cacache-13.0.1-a8000c21697089082f85287a1aec6e382024a71c/node_modules/cacache/"),
            packageDependencies: new Map([
                ["chownr", "1.1.3"],
                ["figgy-pudding", "3.5.1"],
                ["fs-minipass", "2.0.0"],
                ["glob", "7.1.6"],
                ["graceful-fs", "4.2.3"],
                ["infer-owner", "1.0.4"],
                ["lru-cache", "5.1.1"],
                ["minipass", "3.1.1"],
                ["minipass-collect", "1.0.2"],
                ["minipass-flush", "1.0.5"],
                ["minipass-pipeline", "1.2.2"],
                ["mkdirp", "0.5.1"],
                ["move-concurrently", "1.0.1"],
                ["p-map", "3.0.0"],
                ["promise-inflight", "1.0.1"],
                ["rimraf", "2.7.1"],
                ["ssri", "7.1.0"],
                ["unique-filename", "1.1.1"],
                ["cacache", "13.0.1"],
            ]),
        }],
    ])],
    ["chownr", new Map([
        ["1.1.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-chownr-1.1.3-42d837d5239688d55f303003a508230fa6727142/node_modules/chownr/"),
            packageDependencies: new Map([
                ["chownr", "1.1.3"],
            ]),
        }],
    ])],
    ["figgy-pudding", new Map([
        ["3.5.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-figgy-pudding-3.5.1-862470112901c727a0e495a80744bd5baa1d6790/node_modules/figgy-pudding/"),
            packageDependencies: new Map([
                ["figgy-pudding", "3.5.1"],
            ]),
        }],
    ])],
    ["fs-minipass", new Map([
        ["2.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-fs-minipass-2.0.0-a6415edab02fae4b9e9230bc87ee2e4472003cd1/node_modules/fs-minipass/"),
            packageDependencies: new Map([
                ["minipass", "3.1.1"],
                ["fs-minipass", "2.0.0"],
            ]),
        }],
    ])],
    ["minipass", new Map([
        ["3.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-minipass-3.1.1-7607ce778472a185ad6d89082aa2070f79cedcd5/node_modules/minipass/"),
            packageDependencies: new Map([
                ["yallist", "4.0.0"],
                ["minipass", "3.1.1"],
            ]),
        }],
    ])],
    ["yallist", new Map([
        ["4.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-yallist-4.0.0-9bb92790d9c0effec63be73519e11a35019a3a72/node_modules/yallist/"),
            packageDependencies: new Map([
                ["yallist", "4.0.0"],
            ]),
        }],
        ["3.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-yallist-3.1.1-dbb7daf9bfd8bac9ab45ebf602b8cbad0d5d08fd/node_modules/yallist/"),
            packageDependencies: new Map([
                ["yallist", "3.1.1"],
            ]),
        }],
    ])],
    ["infer-owner", new Map([
        ["1.0.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-infer-owner-1.0.4-c4cefcaa8e51051c2a40ba2ce8a3d27295af9467/node_modules/infer-owner/"),
            packageDependencies: new Map([
                ["infer-owner", "1.0.4"],
            ]),
        }],
    ])],
    ["lru-cache", new Map([
        ["5.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-lru-cache-5.1.1-1da27e6710271947695daf6848e847f01d84b920/node_modules/lru-cache/"),
            packageDependencies: new Map([
                ["yallist", "3.1.1"],
                ["lru-cache", "5.1.1"],
            ]),
        }],
    ])],
    ["minipass-collect", new Map([
        ["1.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-minipass-collect-1.0.2-22b813bf745dc6edba2576b940022ad6edc8c617/node_modules/minipass-collect/"),
            packageDependencies: new Map([
                ["minipass", "3.1.1"],
                ["minipass-collect", "1.0.2"],
            ]),
        }],
    ])],
    ["minipass-flush", new Map([
        ["1.0.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-minipass-flush-1.0.5-82e7135d7e89a50ffe64610a787953c4c4cbb373/node_modules/minipass-flush/"),
            packageDependencies: new Map([
                ["minipass", "3.1.1"],
                ["minipass-flush", "1.0.5"],
            ]),
        }],
    ])],
    ["minipass-pipeline", new Map([
        ["1.2.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-minipass-pipeline-1.2.2-3dcb6bb4a546e32969c7ad710f2c79a86abba93a/node_modules/minipass-pipeline/"),
            packageDependencies: new Map([
                ["minipass", "3.1.1"],
                ["minipass-pipeline", "1.2.2"],
            ]),
        }],
    ])],
    ["move-concurrently", new Map([
        ["1.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-move-concurrently-1.0.1-be2c005fda32e0b29af1f05d7c4b33214c701f92/node_modules/move-concurrently/"),
            packageDependencies: new Map([
                ["aproba", "1.2.0"],
                ["copy-concurrently", "1.0.5"],
                ["fs-write-stream-atomic", "1.0.10"],
                ["mkdirp", "0.5.1"],
                ["rimraf", "2.7.1"],
                ["run-queue", "1.0.3"],
                ["move-concurrently", "1.0.1"],
            ]),
        }],
    ])],
    ["aproba", new Map([
        ["1.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-aproba-1.2.0-6802e6264efd18c790a1b0d517f0f2627bf2c94a/node_modules/aproba/"),
            packageDependencies: new Map([
                ["aproba", "1.2.0"],
            ]),
        }],
    ])],
    ["copy-concurrently", new Map([
        ["1.0.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-copy-concurrently-1.0.5-92297398cae34937fcafd6ec8139c18051f0b5e0/node_modules/copy-concurrently/"),
            packageDependencies: new Map([
                ["aproba", "1.2.0"],
                ["fs-write-stream-atomic", "1.0.10"],
                ["iferr", "0.1.5"],
                ["mkdirp", "0.5.1"],
                ["rimraf", "2.7.1"],
                ["run-queue", "1.0.3"],
                ["copy-concurrently", "1.0.5"],
            ]),
        }],
    ])],
    ["fs-write-stream-atomic", new Map([
        ["1.0.10", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-fs-write-stream-atomic-1.0.10-b47df53493ef911df75731e70a9ded0189db40c9/node_modules/fs-write-stream-atomic/"),
            packageDependencies: new Map([
                ["graceful-fs", "4.2.3"],
                ["iferr", "0.1.5"],
                ["imurmurhash", "0.1.4"],
                ["readable-stream", "2.3.6"],
                ["fs-write-stream-atomic", "1.0.10"],
            ]),
        }],
    ])],
    ["iferr", new Map([
        ["0.1.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-iferr-0.1.5-c60eed69e6d8fdb6b3104a1fcbca1c192dc5b501/node_modules/iferr/"),
            packageDependencies: new Map([
                ["iferr", "0.1.5"],
            ]),
        }],
    ])],
    ["imurmurhash", new Map([
        ["0.1.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-imurmurhash-0.1.4-9218b9b2b928a238b13dc4fb6b6d576f231453ea/node_modules/imurmurhash/"),
            packageDependencies: new Map([
                ["imurmurhash", "0.1.4"],
            ]),
        }],
    ])],
    ["run-queue", new Map([
        ["1.0.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-run-queue-1.0.3-e848396f057d223f24386924618e25694161ec47/node_modules/run-queue/"),
            packageDependencies: new Map([
                ["aproba", "1.2.0"],
                ["run-queue", "1.0.3"],
            ]),
        }],
    ])],
    ["p-map", new Map([
        ["3.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-p-map-3.0.0-d704d9af8a2ba684e2600d9a215983d4141a979d/node_modules/p-map/"),
            packageDependencies: new Map([
                ["aggregate-error", "3.0.1"],
                ["p-map", "3.0.0"],
            ]),
        }],
        ["2.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-p-map-2.1.0-310928feef9c9ecc65b68b17693018a665cea175/node_modules/p-map/"),
            packageDependencies: new Map([
                ["p-map", "2.1.0"],
            ]),
        }],
    ])],
    ["aggregate-error", new Map([
        ["3.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-aggregate-error-3.0.1-db2fe7246e536f40d9b5442a39e117d7dd6a24e0/node_modules/aggregate-error/"),
            packageDependencies: new Map([
                ["clean-stack", "2.2.0"],
                ["indent-string", "4.0.0"],
                ["aggregate-error", "3.0.1"],
            ]),
        }],
    ])],
    ["clean-stack", new Map([
        ["2.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-clean-stack-2.2.0-ee8472dbb129e727b31e8a10a427dee9dfe4008b/node_modules/clean-stack/"),
            packageDependencies: new Map([
                ["clean-stack", "2.2.0"],
            ]),
        }],
    ])],
    ["indent-string", new Map([
        ["4.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-indent-string-4.0.0-624f8f4497d619b2d9768531d58f4122854d7251/node_modules/indent-string/"),
            packageDependencies: new Map([
                ["indent-string", "4.0.0"],
            ]),
        }],
    ])],
    ["promise-inflight", new Map([
        ["1.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-promise-inflight-1.0.1-98472870bf228132fcbdd868129bad12c3c029e3/node_modules/promise-inflight/"),
            packageDependencies: new Map([
                ["promise-inflight", "1.0.1"],
            ]),
        }],
    ])],
    ["ssri", new Map([
        ["7.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ssri-7.1.0-92c241bf6de82365b5c7fb4bd76e975522e1294d/node_modules/ssri/"),
            packageDependencies: new Map([
                ["figgy-pudding", "3.5.1"],
                ["minipass", "3.1.1"],
                ["ssri", "7.1.0"],
            ]),
        }],
    ])],
    ["unique-filename", new Map([
        ["1.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-unique-filename-1.1.1-1d69769369ada0583103a1e6ae87681b56573230/node_modules/unique-filename/"),
            packageDependencies: new Map([
                ["unique-slug", "2.0.2"],
                ["unique-filename", "1.1.1"],
            ]),
        }],
    ])],
    ["unique-slug", new Map([
        ["2.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-unique-slug-2.0.2-baabce91083fc64e945b0f3ad613e264f7cd4e6c/node_modules/unique-slug/"),
            packageDependencies: new Map([
                ["imurmurhash", "0.1.4"],
                ["unique-slug", "2.0.2"],
            ]),
        }],
    ])],
    ["jest-worker", new Map([
        ["24.9.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-jest-worker-24.9.0-5dbfdb5b2d322e98567898238a9697bcce67b3e5/node_modules/jest-worker/"),
            packageDependencies: new Map([
                ["merge-stream", "2.0.0"],
                ["supports-color", "6.1.0"],
                ["jest-worker", "24.9.0"],
            ]),
        }],
    ])],
    ["merge-stream", new Map([
        ["2.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-merge-stream-2.0.0-52823629a14dd00c9770fb6ad47dc6310f2c1f60/node_modules/merge-stream/"),
            packageDependencies: new Map([
                ["merge-stream", "2.0.0"],
            ]),
        }],
    ])],
    ["serialize-javascript", new Map([
        ["2.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-serialize-javascript-2.1.0-9310276819efd0eb128258bb341957f6eb2fc570/node_modules/serialize-javascript/"),
            packageDependencies: new Map([
                ["serialize-javascript", "2.1.0"],
            ]),
        }],
    ])],
    ["terser", new Map([
        ["4.4.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-terser-4.4.0-22c46b4817cf4c9565434bfe6ad47336af259ac3/node_modules/terser/"),
            packageDependencies: new Map([
                ["commander", "2.20.3"],
                ["source-map", "0.6.1"],
                ["source-map-support", "0.5.16"],
                ["terser", "4.4.0"],
            ]),
        }],
    ])],
    ["buffer-from", new Map([
        ["1.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-buffer-from-1.1.1-32713bc028f75c02fdb710d7c7bcec1f2c6070ef/node_modules/buffer-from/"),
            packageDependencies: new Map([
                ["buffer-from", "1.1.1"],
            ]),
        }],
    ])],
    ["watchpack", new Map([
        ["2.0.0-beta.10", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-watchpack-2.0.0-beta.10-6e4a5b16bda08a5a3ce9851f166a45a8860066bb/node_modules/watchpack/"),
            packageDependencies: new Map([
                ["glob-to-regexp", "0.4.1"],
                ["graceful-fs", "4.2.3"],
                ["neo-async", "2.6.1"],
                ["watchpack", "2.0.0-beta.10"],
            ]),
        }],
    ])],
    ["webpack-bundle-analyzer", new Map([
        ["3.6.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-webpack-bundle-analyzer-3.6.0-39b3a8f829ca044682bc6f9e011c95deb554aefd/node_modules/webpack-bundle-analyzer/"),
            packageDependencies: new Map([
                ["acorn", "6.3.0"],
                ["acorn-walk", "6.2.0"],
                ["bfj", "6.1.2"],
                ["chalk", "2.4.2"],
                ["commander", "2.20.3"],
                ["ejs", "2.7.4"],
                ["express", "4.17.1"],
                ["filesize", "3.6.1"],
                ["gzip-size", "5.1.1"],
                ["lodash", "4.17.15"],
                ["mkdirp", "0.5.1"],
                ["opener", "1.5.1"],
                ["ws", "6.2.1"],
                ["webpack-bundle-analyzer", "3.6.0"],
            ]),
        }],
    ])],
    ["acorn-walk", new Map([
        ["6.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-acorn-walk-6.2.0-123cb8f3b84c2171f1f7fb252615b1c78a6b1a8c/node_modules/acorn-walk/"),
            packageDependencies: new Map([
                ["acorn-walk", "6.2.0"],
            ]),
        }],
    ])],
    ["bfj", new Map([
        ["6.1.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-bfj-6.1.2-325c861a822bcb358a41c78a33b8e6e2086dde7f/node_modules/bfj/"),
            packageDependencies: new Map([
                ["bluebird", "3.7.1"],
                ["check-types", "8.0.3"],
                ["hoopy", "0.1.4"],
                ["tryer", "1.0.1"],
                ["bfj", "6.1.2"],
            ]),
        }],
    ])],
    ["check-types", new Map([
        ["8.0.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-check-types-8.0.3-3356cca19c889544f2d7a95ed49ce508a0ecf552/node_modules/check-types/"),
            packageDependencies: new Map([
                ["check-types", "8.0.3"],
            ]),
        }],
    ])],
    ["hoopy", new Map([
        ["0.1.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-hoopy-0.1.4-609207d661100033a9a9402ad3dea677381c1b1d/node_modules/hoopy/"),
            packageDependencies: new Map([
                ["hoopy", "0.1.4"],
            ]),
        }],
    ])],
    ["tryer", new Map([
        ["1.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-tryer-1.0.1-f2c85406800b9b0f74c9f7465b81eaad241252f8/node_modules/tryer/"),
            packageDependencies: new Map([
                ["tryer", "1.0.1"],
            ]),
        }],
    ])],
    ["ejs", new Map([
        ["2.7.4", {
            packageLocation: path.resolve(__dirname, "./.pnp/unplugged/npm-ejs-2.7.4-48661287573dcc53e366c7a1ae52c3a120eec9ba/node_modules/ejs/"),
            packageDependencies: new Map([
                ["ejs", "2.7.4"],
            ]),
        }],
    ])],
    ["express", new Map([
        ["4.17.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-express-4.17.1-4491fc38605cf51f8629d39c2b5d026f98a4c134/node_modules/express/"),
            packageDependencies: new Map([
                ["accepts", "1.3.7"],
                ["array-flatten", "1.1.1"],
                ["body-parser", "1.19.0"],
                ["content-disposition", "0.5.3"],
                ["content-type", "1.0.4"],
                ["cookie", "0.4.0"],
                ["cookie-signature", "1.0.6"],
                ["debug", "2.6.9"],
                ["depd", "1.1.2"],
                ["encodeurl", "1.0.2"],
                ["escape-html", "1.0.3"],
                ["etag", "1.8.1"],
                ["finalhandler", "1.1.2"],
                ["fresh", "0.5.2"],
                ["merge-descriptors", "1.0.1"],
                ["methods", "1.1.2"],
                ["on-finished", "2.3.0"],
                ["parseurl", "1.3.3"],
                ["path-to-regexp", "0.1.7"],
                ["proxy-addr", "2.0.5"],
                ["qs", "6.7.0"],
                ["range-parser", "1.2.1"],
                ["safe-buffer", "5.1.2"],
                ["send", "0.17.1"],
                ["serve-static", "1.14.1"],
                ["setprototypeof", "1.1.1"],
                ["statuses", "1.5.0"],
                ["type-is", "1.6.18"],
                ["utils-merge", "1.0.1"],
                ["vary", "1.1.2"],
                ["express", "4.17.1"],
            ]),
        }],
    ])],
    ["accepts", new Map([
        ["1.3.7", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-accepts-1.3.7-531bc726517a3b2b41f850021c6cc15eaab507cd/node_modules/accepts/"),
            packageDependencies: new Map([
                ["mime-types", "2.1.25"],
                ["negotiator", "0.6.2"],
                ["accepts", "1.3.7"],
            ]),
        }],
    ])],
    ["mime-types", new Map([
        ["2.1.25", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-mime-types-2.1.25-39772d46621f93e2a80a856c53b86a62156a6437/node_modules/mime-types/"),
            packageDependencies: new Map([
                ["mime-db", "1.42.0"],
                ["mime-types", "2.1.25"],
            ]),
        }],
    ])],
    ["mime-db", new Map([
        ["1.42.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-mime-db-1.42.0-3e252907b4c7adb906597b4b65636272cf9e7bac/node_modules/mime-db/"),
            packageDependencies: new Map([
                ["mime-db", "1.42.0"],
            ]),
        }],
    ])],
    ["negotiator", new Map([
        ["0.6.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-negotiator-0.6.2-feacf7ccf525a77ae9634436a64883ffeca346fb/node_modules/negotiator/"),
            packageDependencies: new Map([
                ["negotiator", "0.6.2"],
            ]),
        }],
    ])],
    ["array-flatten", new Map([
        ["1.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-array-flatten-1.1.1-9a5f699051b1e7073328f2a008968b64ea2955d2/node_modules/array-flatten/"),
            packageDependencies: new Map([
                ["array-flatten", "1.1.1"],
            ]),
        }],
        ["2.1.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-array-flatten-2.1.2-24ef80a28c1a893617e2149b0c6d0d788293b099/node_modules/array-flatten/"),
            packageDependencies: new Map([
                ["array-flatten", "2.1.2"],
            ]),
        }],
    ])],
    ["body-parser", new Map([
        ["1.19.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-body-parser-1.19.0-96b2709e57c9c4e09a6fd66a8fd979844f69f08a/node_modules/body-parser/"),
            packageDependencies: new Map([
                ["bytes", "3.1.0"],
                ["content-type", "1.0.4"],
                ["debug", "2.6.9"],
                ["depd", "1.1.2"],
                ["http-errors", "1.7.2"],
                ["iconv-lite", "0.4.24"],
                ["on-finished", "2.3.0"],
                ["qs", "6.7.0"],
                ["raw-body", "2.4.0"],
                ["type-is", "1.6.18"],
                ["body-parser", "1.19.0"],
            ]),
        }],
    ])],
    ["bytes", new Map([
        ["3.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-bytes-3.1.0-f6cf7933a360e0588fa9fde85651cdc7f805d1f6/node_modules/bytes/"),
            packageDependencies: new Map([
                ["bytes", "3.1.0"],
            ]),
        }],
        ["3.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-bytes-3.0.0-d32815404d689699f85a4ea4fa8755dd13a96048/node_modules/bytes/"),
            packageDependencies: new Map([
                ["bytes", "3.0.0"],
            ]),
        }],
    ])],
    ["content-type", new Map([
        ["1.0.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-content-type-1.0.4-e138cc75e040c727b1966fe5e5f8c9aee256fe3b/node_modules/content-type/"),
            packageDependencies: new Map([
                ["content-type", "1.0.4"],
            ]),
        }],
    ])],
    ["depd", new Map([
        ["1.1.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-depd-1.1.2-9bcd52e14c097763e749b274c4346ed2e560b5a9/node_modules/depd/"),
            packageDependencies: new Map([
                ["depd", "1.1.2"],
            ]),
        }],
    ])],
    ["http-errors", new Map([
        ["1.7.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-http-errors-1.7.2-4f5029cf13239f31036e5b2e55292bcfbcc85c8f/node_modules/http-errors/"),
            packageDependencies: new Map([
                ["depd", "1.1.2"],
                ["inherits", "2.0.3"],
                ["setprototypeof", "1.1.1"],
                ["statuses", "1.5.0"],
                ["toidentifier", "1.0.0"],
                ["http-errors", "1.7.2"],
            ]),
        }],
        ["1.7.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-http-errors-1.7.3-6c619e4f9c60308c38519498c14fbb10aacebb06/node_modules/http-errors/"),
            packageDependencies: new Map([
                ["depd", "1.1.2"],
                ["inherits", "2.0.4"],
                ["setprototypeof", "1.1.1"],
                ["statuses", "1.5.0"],
                ["toidentifier", "1.0.0"],
                ["http-errors", "1.7.3"],
            ]),
        }],
        ["1.6.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-http-errors-1.6.3-8b55680bb4be283a0b5bf4ea2e38580be1d9320d/node_modules/http-errors/"),
            packageDependencies: new Map([
                ["depd", "1.1.2"],
                ["inherits", "2.0.3"],
                ["setprototypeof", "1.1.0"],
                ["statuses", "1.5.0"],
                ["http-errors", "1.6.3"],
            ]),
        }],
    ])],
    ["setprototypeof", new Map([
        ["1.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-setprototypeof-1.1.1-7e95acb24aa92f5885e0abef5ba131330d4ae683/node_modules/setprototypeof/"),
            packageDependencies: new Map([
                ["setprototypeof", "1.1.1"],
            ]),
        }],
        ["1.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-setprototypeof-1.1.0-d0bd85536887b6fe7c0d818cb962d9d91c54e656/node_modules/setprototypeof/"),
            packageDependencies: new Map([
                ["setprototypeof", "1.1.0"],
            ]),
        }],
    ])],
    ["statuses", new Map([
        ["1.5.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-statuses-1.5.0-161c7dac177659fd9811f43771fa99381478628c/node_modules/statuses/"),
            packageDependencies: new Map([
                ["statuses", "1.5.0"],
            ]),
        }],
    ])],
    ["toidentifier", new Map([
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-toidentifier-1.0.0-7e1be3470f1e77948bc43d94a3c8f4d7752ba553/node_modules/toidentifier/"),
            packageDependencies: new Map([
                ["toidentifier", "1.0.0"],
            ]),
        }],
    ])],
    ["iconv-lite", new Map([
        ["0.4.24", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-iconv-lite-0.4.24-2022b4b25fbddc21d2f524974a474aafe733908b/node_modules/iconv-lite/"),
            packageDependencies: new Map([
                ["safer-buffer", "2.1.2"],
                ["iconv-lite", "0.4.24"],
            ]),
        }],
    ])],
    ["safer-buffer", new Map([
        ["2.1.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-safer-buffer-2.1.2-44fa161b0187b9549dd84bb91802f9bd8385cd6a/node_modules/safer-buffer/"),
            packageDependencies: new Map([
                ["safer-buffer", "2.1.2"],
            ]),
        }],
    ])],
    ["on-finished", new Map([
        ["2.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-on-finished-2.3.0-20f1336481b083cd75337992a16971aa2d906947/node_modules/on-finished/"),
            packageDependencies: new Map([
                ["ee-first", "1.1.1"],
                ["on-finished", "2.3.0"],
            ]),
        }],
    ])],
    ["ee-first", new Map([
        ["1.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ee-first-1.1.1-590c61156b0ae2f4f0255732a158b266bc56b21d/node_modules/ee-first/"),
            packageDependencies: new Map([
                ["ee-first", "1.1.1"],
            ]),
        }],
    ])],
    ["raw-body", new Map([
        ["2.4.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-raw-body-2.4.0-a1ce6fb9c9bc356ca52e89256ab59059e13d0332/node_modules/raw-body/"),
            packageDependencies: new Map([
                ["bytes", "3.1.0"],
                ["http-errors", "1.7.2"],
                ["iconv-lite", "0.4.24"],
                ["unpipe", "1.0.0"],
                ["raw-body", "2.4.0"],
            ]),
        }],
    ])],
    ["unpipe", new Map([
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-unpipe-1.0.0-b2bf4ee8514aae6165b4817829d21b2ef49904ec/node_modules/unpipe/"),
            packageDependencies: new Map([
                ["unpipe", "1.0.0"],
            ]),
        }],
    ])],
    ["type-is", new Map([
        ["1.6.18", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-type-is-1.6.18-4e552cd05df09467dcbc4ef739de89f2cf37c131/node_modules/type-is/"),
            packageDependencies: new Map([
                ["media-typer", "0.3.0"],
                ["mime-types", "2.1.25"],
                ["type-is", "1.6.18"],
            ]),
        }],
    ])],
    ["media-typer", new Map([
        ["0.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-media-typer-0.3.0-8710d7af0aa626f8fffa1ce00168545263255748/node_modules/media-typer/"),
            packageDependencies: new Map([
                ["media-typer", "0.3.0"],
            ]),
        }],
    ])],
    ["content-disposition", new Map([
        ["0.5.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-content-disposition-0.5.3-e130caf7e7279087c5616c2007d0485698984fbd/node_modules/content-disposition/"),
            packageDependencies: new Map([
                ["safe-buffer", "5.1.2"],
                ["content-disposition", "0.5.3"],
            ]),
        }],
    ])],
    ["cookie", new Map([
        ["0.4.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-cookie-0.4.0-beb437e7022b3b6d49019d088665303ebe9c14ba/node_modules/cookie/"),
            packageDependencies: new Map([
                ["cookie", "0.4.0"],
            ]),
        }],
    ])],
    ["cookie-signature", new Map([
        ["1.0.6", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-cookie-signature-1.0.6-e303a882b342cc3ee8ca513a79999734dab3ae2c/node_modules/cookie-signature/"),
            packageDependencies: new Map([
                ["cookie-signature", "1.0.6"],
            ]),
        }],
    ])],
    ["encodeurl", new Map([
        ["1.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-encodeurl-1.0.2-ad3ff4c86ec2d029322f5a02c3a9a606c95b3f59/node_modules/encodeurl/"),
            packageDependencies: new Map([
                ["encodeurl", "1.0.2"],
            ]),
        }],
    ])],
    ["escape-html", new Map([
        ["1.0.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-escape-html-1.0.3-0258eae4d3d0c0974de1c169188ef0051d1d1988/node_modules/escape-html/"),
            packageDependencies: new Map([
                ["escape-html", "1.0.3"],
            ]),
        }],
    ])],
    ["etag", new Map([
        ["1.8.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-etag-1.8.1-41ae2eeb65efa62268aebfea83ac7d79299b0887/node_modules/etag/"),
            packageDependencies: new Map([
                ["etag", "1.8.1"],
            ]),
        }],
    ])],
    ["finalhandler", new Map([
        ["1.1.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-finalhandler-1.1.2-b7e7d000ffd11938d0fdb053506f6ebabe9f587d/node_modules/finalhandler/"),
            packageDependencies: new Map([
                ["debug", "2.6.9"],
                ["encodeurl", "1.0.2"],
                ["escape-html", "1.0.3"],
                ["on-finished", "2.3.0"],
                ["parseurl", "1.3.3"],
                ["statuses", "1.5.0"],
                ["unpipe", "1.0.0"],
                ["finalhandler", "1.1.2"],
            ]),
        }],
    ])],
    ["parseurl", new Map([
        ["1.3.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-parseurl-1.3.3-9da19e7bee8d12dff0513ed5b76957793bc2e8d4/node_modules/parseurl/"),
            packageDependencies: new Map([
                ["parseurl", "1.3.3"],
            ]),
        }],
    ])],
    ["fresh", new Map([
        ["0.5.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-fresh-0.5.2-3d8cadd90d976569fa835ab1f8e4b23a105605a7/node_modules/fresh/"),
            packageDependencies: new Map([
                ["fresh", "0.5.2"],
            ]),
        }],
    ])],
    ["merge-descriptors", new Map([
        ["1.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-merge-descriptors-1.0.1-b00aaa556dd8b44568150ec9d1b953f3f90cbb61/node_modules/merge-descriptors/"),
            packageDependencies: new Map([
                ["merge-descriptors", "1.0.1"],
            ]),
        }],
    ])],
    ["methods", new Map([
        ["1.1.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-methods-1.1.2-5529a4d67654134edcc5266656835b0f851afcee/node_modules/methods/"),
            packageDependencies: new Map([
                ["methods", "1.1.2"],
            ]),
        }],
    ])],
    ["path-to-regexp", new Map([
        ["0.1.7", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-path-to-regexp-0.1.7-df604178005f522f15eb4490e7247a1bfaa67f8c/node_modules/path-to-regexp/"),
            packageDependencies: new Map([
                ["path-to-regexp", "0.1.7"],
            ]),
        }],
    ])],
    ["proxy-addr", new Map([
        ["2.0.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-proxy-addr-2.0.5-34cbd64a2d81f4b1fd21e76f9f06c8a45299ee34/node_modules/proxy-addr/"),
            packageDependencies: new Map([
                ["forwarded", "0.1.2"],
                ["ipaddr.js", "1.9.0"],
                ["proxy-addr", "2.0.5"],
            ]),
        }],
    ])],
    ["forwarded", new Map([
        ["0.1.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-forwarded-0.1.2-98c23dab1175657b8c0573e8ceccd91b0ff18c84/node_modules/forwarded/"),
            packageDependencies: new Map([
                ["forwarded", "0.1.2"],
            ]),
        }],
    ])],
    ["ipaddr.js", new Map([
        ["1.9.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ipaddr-js-1.9.0-37df74e430a0e47550fe54a2defe30d8acd95f65/node_modules/ipaddr.js/"),
            packageDependencies: new Map([
                ["ipaddr.js", "1.9.0"],
            ]),
        }],
        ["1.9.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ipaddr-js-1.9.1-bff38543eeb8984825079ff3a2a8e6cbd46781b3/node_modules/ipaddr.js/"),
            packageDependencies: new Map([
                ["ipaddr.js", "1.9.1"],
            ]),
        }],
    ])],
    ["range-parser", new Map([
        ["1.2.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-range-parser-1.2.1-3cf37023d199e1c24d1a55b84800c2f3e6468031/node_modules/range-parser/"),
            packageDependencies: new Map([
                ["range-parser", "1.2.1"],
            ]),
        }],
    ])],
    ["send", new Map([
        ["0.17.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-send-0.17.1-c1d8b059f7900f7466dd4938bdc44e11ddb376c8/node_modules/send/"),
            packageDependencies: new Map([
                ["debug", "2.6.9"],
                ["depd", "1.1.2"],
                ["destroy", "1.0.4"],
                ["encodeurl", "1.0.2"],
                ["escape-html", "1.0.3"],
                ["etag", "1.8.1"],
                ["fresh", "0.5.2"],
                ["http-errors", "1.7.3"],
                ["mime", "1.6.0"],
                ["ms", "2.1.1"],
                ["on-finished", "2.3.0"],
                ["range-parser", "1.2.1"],
                ["statuses", "1.5.0"],
                ["send", "0.17.1"],
            ]),
        }],
    ])],
    ["destroy", new Map([
        ["1.0.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-destroy-1.0.4-978857442c44749e4206613e37946205826abd80/node_modules/destroy/"),
            packageDependencies: new Map([
                ["destroy", "1.0.4"],
            ]),
        }],
    ])],
    ["serve-static", new Map([
        ["1.14.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-serve-static-1.14.1-666e636dc4f010f7ef29970a88a674320898b2f9/node_modules/serve-static/"),
            packageDependencies: new Map([
                ["encodeurl", "1.0.2"],
                ["escape-html", "1.0.3"],
                ["parseurl", "1.3.3"],
                ["send", "0.17.1"],
                ["serve-static", "1.14.1"],
            ]),
        }],
    ])],
    ["utils-merge", new Map([
        ["1.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-utils-merge-1.0.1-9f95710f50a267947b2ccc124741c1028427e713/node_modules/utils-merge/"),
            packageDependencies: new Map([
                ["utils-merge", "1.0.1"],
            ]),
        }],
    ])],
    ["vary", new Map([
        ["1.1.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-vary-1.1.2-2299f02c6ded30d4a5961b0b9f74524a18f634fc/node_modules/vary/"),
            packageDependencies: new Map([
                ["vary", "1.1.2"],
            ]),
        }],
    ])],
    ["filesize", new Map([
        ["3.6.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-filesize-3.6.1-090bb3ee01b6f801a8a8be99d31710b3422bb317/node_modules/filesize/"),
            packageDependencies: new Map([
                ["filesize", "3.6.1"],
            ]),
        }],
    ])],
    ["gzip-size", new Map([
        ["5.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-gzip-size-5.1.1-cb9bee692f87c0612b232840a873904e4c135274/node_modules/gzip-size/"),
            packageDependencies: new Map([
                ["duplexer", "0.1.1"],
                ["pify", "4.0.1"],
                ["gzip-size", "5.1.1"],
            ]),
        }],
    ])],
    ["duplexer", new Map([
        ["0.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-duplexer-0.1.1-ace6ff808c1ce66b57d1ebf97977acb02334cfc1/node_modules/duplexer/"),
            packageDependencies: new Map([
                ["duplexer", "0.1.1"],
            ]),
        }],
    ])],
    ["ws", new Map([
        ["6.2.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ws-6.2.1-442fdf0a47ed64f59b6a5d8ff130f4748ed524fb/node_modules/ws/"),
            packageDependencies: new Map([
                ["async-limiter", "1.0.1"],
                ["ws", "6.2.1"],
            ]),
        }],
    ])],
    ["async-limiter", new Map([
        ["1.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-async-limiter-1.0.1-dd379e94f0db8310b08291f9d64c3209766617fd/node_modules/async-limiter/"),
            packageDependencies: new Map([
                ["async-limiter", "1.0.1"],
            ]),
        }],
    ])],
    ["webpack-cli", new Map([
        ["3.3.10", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-webpack-cli-3.3.10-17b279267e9b4fb549023fae170da8e6e766da13/node_modules/webpack-cli/"),
            packageDependencies: new Map([
                ["webpack", "5.0.0-beta.7"],
                ["chalk", "2.4.2"],
                ["cross-spawn", "6.0.5"],
                ["enhanced-resolve", "4.1.0"],
                ["findup-sync", "3.0.0"],
                ["global-modules", "2.0.0"],
                ["import-local", "2.0.0"],
                ["interpret", "1.2.0"],
                ["loader-utils", "1.2.3"],
                ["supports-color", "6.1.0"],
                ["v8-compile-cache", "2.0.3"],
                ["yargs", "13.2.4"],
                ["webpack-cli", "3.3.10"],
            ]),
        }],
    ])],
    ["cross-spawn", new Map([
        ["6.0.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-cross-spawn-6.0.5-4a5ec7c64dfae22c3a14124dbacdee846d80cbc4/node_modules/cross-spawn/"),
            packageDependencies: new Map([
                ["nice-try", "1.0.5"],
                ["path-key", "2.0.1"],
                ["semver", "5.7.1"],
                ["shebang-command", "1.2.0"],
                ["which", "1.3.1"],
                ["cross-spawn", "6.0.5"],
            ]),
        }],
    ])],
    ["nice-try", new Map([
        ["1.0.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-nice-try-1.0.5-a3378a7696ce7d223e88fc9b764bd7ef1089e366/node_modules/nice-try/"),
            packageDependencies: new Map([
                ["nice-try", "1.0.5"],
            ]),
        }],
    ])],
    ["path-key", new Map([
        ["2.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-path-key-2.0.1-411cadb574c5a140d3a4b1910d40d80cc9f40b40/node_modules/path-key/"),
            packageDependencies: new Map([
                ["path-key", "2.0.1"],
            ]),
        }],
    ])],
    ["shebang-command", new Map([
        ["1.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-shebang-command-1.2.0-44aac65b695b03398968c39f363fee5deafdf1ea/node_modules/shebang-command/"),
            packageDependencies: new Map([
                ["shebang-regex", "1.0.0"],
                ["shebang-command", "1.2.0"],
            ]),
        }],
    ])],
    ["shebang-regex", new Map([
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-shebang-regex-1.0.0-da42f49740c0b42db2ca9728571cb190c98efea3/node_modules/shebang-regex/"),
            packageDependencies: new Map([
                ["shebang-regex", "1.0.0"],
            ]),
        }],
    ])],
    ["which", new Map([
        ["1.3.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-which-1.3.1-a45043d54f5805316da8d62f9f50918d3da70b0a/node_modules/which/"),
            packageDependencies: new Map([
                ["isexe", "2.0.0"],
                ["which", "1.3.1"],
            ]),
        }],
    ])],
    ["isexe", new Map([
        ["2.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-isexe-2.0.0-e8fbf374dc556ff8947a10dcb0572d633f2cfa10/node_modules/isexe/"),
            packageDependencies: new Map([
                ["isexe", "2.0.0"],
            ]),
        }],
    ])],
    ["memory-fs", new Map([
        ["0.4.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-memory-fs-0.4.1-3a9a20b8462523e447cfbc7e8bb80ed667bfc552/node_modules/memory-fs/"),
            packageDependencies: new Map([
                ["errno", "0.1.7"],
                ["readable-stream", "2.3.6"],
                ["memory-fs", "0.4.1"],
            ]),
        }],
    ])],
    ["findup-sync", new Map([
        ["3.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-findup-sync-3.0.0-17b108f9ee512dfb7a5c7f3c8b27ea9e1a9c08d1/node_modules/findup-sync/"),
            packageDependencies: new Map([
                ["detect-file", "1.0.0"],
                ["is-glob", "4.0.1"],
                ["micromatch", "3.1.10"],
                ["resolve-dir", "1.0.1"],
                ["findup-sync", "3.0.0"],
            ]),
        }],
    ])],
    ["detect-file", new Map([
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-detect-file-1.0.0-f0d66d03672a825cb1b73bdb3fe62310c8e552b7/node_modules/detect-file/"),
            packageDependencies: new Map([
                ["detect-file", "1.0.0"],
            ]),
        }],
    ])],
    ["is-glob", new Map([
        ["4.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-glob-4.0.1-7567dbe9f2f5e2467bc77ab83c4a29482407a5dc/node_modules/is-glob/"),
            packageDependencies: new Map([
                ["is-extglob", "2.1.1"],
                ["is-glob", "4.0.1"],
            ]),
        }],
        ["3.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-glob-3.1.0-7ba5ae24217804ac70707b96922567486cc3e84a/node_modules/is-glob/"),
            packageDependencies: new Map([
                ["is-extglob", "2.1.1"],
                ["is-glob", "3.1.0"],
            ]),
        }],
    ])],
    ["is-extglob", new Map([
        ["2.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-extglob-2.1.1-a88c02535791f02ed37c76a1b9ea9773c833f8c2/node_modules/is-extglob/"),
            packageDependencies: new Map([
                ["is-extglob", "2.1.1"],
            ]),
        }],
    ])],
    ["micromatch", new Map([
        ["3.1.10", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-micromatch-3.1.10-70859bc95c9840952f359a068a3fc49f9ecfac23/node_modules/micromatch/"),
            packageDependencies: new Map([
                ["arr-diff", "4.0.0"],
                ["array-unique", "0.3.2"],
                ["braces", "2.3.2"],
                ["define-property", "2.0.2"],
                ["extend-shallow", "3.0.2"],
                ["extglob", "2.0.4"],
                ["fragment-cache", "0.2.1"],
                ["kind-of", "6.0.2"],
                ["nanomatch", "1.2.13"],
                ["object.pick", "1.3.0"],
                ["regex-not", "1.0.2"],
                ["snapdragon", "0.8.2"],
                ["to-regex", "3.0.2"],
                ["micromatch", "3.1.10"],
            ]),
        }],
    ])],
    ["arr-diff", new Map([
        ["4.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-arr-diff-4.0.0-d6461074febfec71e7e15235761a329a5dc7c520/node_modules/arr-diff/"),
            packageDependencies: new Map([
                ["arr-diff", "4.0.0"],
            ]),
        }],
    ])],
    ["array-unique", new Map([
        ["0.3.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-array-unique-0.3.2-a894b75d4bc4f6cd679ef3244a9fd8f46ae2d428/node_modules/array-unique/"),
            packageDependencies: new Map([
                ["array-unique", "0.3.2"],
            ]),
        }],
    ])],
    ["braces", new Map([
        ["2.3.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-braces-2.3.2-5979fd3f14cd531565e5fa2df1abfff1dfaee729/node_modules/braces/"),
            packageDependencies: new Map([
                ["arr-flatten", "1.1.0"],
                ["array-unique", "0.3.2"],
                ["extend-shallow", "2.0.1"],
                ["fill-range", "4.0.0"],
                ["isobject", "3.0.1"],
                ["repeat-element", "1.1.3"],
                ["snapdragon", "0.8.2"],
                ["snapdragon-node", "2.1.1"],
                ["split-string", "3.1.0"],
                ["to-regex", "3.0.2"],
                ["braces", "2.3.2"],
            ]),
        }],
    ])],
    ["arr-flatten", new Map([
        ["1.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-arr-flatten-1.1.0-36048bbff4e7b47e136644316c99669ea5ae91f1/node_modules/arr-flatten/"),
            packageDependencies: new Map([
                ["arr-flatten", "1.1.0"],
            ]),
        }],
    ])],
    ["extend-shallow", new Map([
        ["2.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-extend-shallow-2.0.1-51af7d614ad9a9f610ea1bafbb989d6b1c56890f/node_modules/extend-shallow/"),
            packageDependencies: new Map([
                ["is-extendable", "0.1.1"],
                ["extend-shallow", "2.0.1"],
            ]),
        }],
        ["3.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-extend-shallow-3.0.2-26a71aaf073b39fb2127172746131c2704028db8/node_modules/extend-shallow/"),
            packageDependencies: new Map([
                ["assign-symbols", "1.0.0"],
                ["is-extendable", "1.0.1"],
                ["extend-shallow", "3.0.2"],
            ]),
        }],
    ])],
    ["is-extendable", new Map([
        ["0.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-extendable-0.1.1-62b110e289a471418e3ec36a617d472e301dfc89/node_modules/is-extendable/"),
            packageDependencies: new Map([
                ["is-extendable", "0.1.1"],
            ]),
        }],
        ["1.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-extendable-1.0.1-a7470f9e426733d81bd81e1155264e3a3507cab4/node_modules/is-extendable/"),
            packageDependencies: new Map([
                ["is-plain-object", "2.0.4"],
                ["is-extendable", "1.0.1"],
            ]),
        }],
    ])],
    ["fill-range", new Map([
        ["4.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-fill-range-4.0.0-d544811d428f98eb06a63dc402d2403c328c38f7/node_modules/fill-range/"),
            packageDependencies: new Map([
                ["extend-shallow", "2.0.1"],
                ["is-number", "3.0.0"],
                ["repeat-string", "1.6.1"],
                ["to-regex-range", "2.1.1"],
                ["fill-range", "4.0.0"],
            ]),
        }],
    ])],
    ["is-number", new Map([
        ["3.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-number-3.0.0-24fd6201a4782cf50561c810276afc7d12d71195/node_modules/is-number/"),
            packageDependencies: new Map([
                ["kind-of", "3.2.2"],
                ["is-number", "3.0.0"],
            ]),
        }],
    ])],
    ["kind-of", new Map([
        ["3.2.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-kind-of-3.2.2-31ea21a734bab9bbb0f32466d893aea51e4a3c64/node_modules/kind-of/"),
            packageDependencies: new Map([
                ["is-buffer", "1.1.6"],
                ["kind-of", "3.2.2"],
            ]),
        }],
        ["4.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-kind-of-4.0.0-20813df3d712928b207378691a45066fae72dd57/node_modules/kind-of/"),
            packageDependencies: new Map([
                ["is-buffer", "1.1.6"],
                ["kind-of", "4.0.0"],
            ]),
        }],
        ["5.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-kind-of-5.1.0-729c91e2d857b7a419a1f9aa65685c4c33f5845d/node_modules/kind-of/"),
            packageDependencies: new Map([
                ["kind-of", "5.1.0"],
            ]),
        }],
        ["6.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-kind-of-6.0.2-01146b36a6218e64e58f3a8d66de5d7fc6f6d051/node_modules/kind-of/"),
            packageDependencies: new Map([
                ["kind-of", "6.0.2"],
            ]),
        }],
    ])],
    ["is-buffer", new Map([
        ["1.1.6", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-buffer-1.1.6-efaa2ea9daa0d7ab2ea13a97b2b8ad51fefbe8be/node_modules/is-buffer/"),
            packageDependencies: new Map([
                ["is-buffer", "1.1.6"],
            ]),
        }],
    ])],
    ["repeat-string", new Map([
        ["1.6.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-repeat-string-1.6.1-8dcae470e1c88abc2d600fff4a776286da75e637/node_modules/repeat-string/"),
            packageDependencies: new Map([
                ["repeat-string", "1.6.1"],
            ]),
        }],
    ])],
    ["to-regex-range", new Map([
        ["2.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-to-regex-range-2.1.1-7c80c17b9dfebe599e27367e0d4dd5590141db38/node_modules/to-regex-range/"),
            packageDependencies: new Map([
                ["is-number", "3.0.0"],
                ["repeat-string", "1.6.1"],
                ["to-regex-range", "2.1.1"],
            ]),
        }],
    ])],
    ["isobject", new Map([
        ["3.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-isobject-3.0.1-4e431e92b11a9731636aa1f9c8d1ccbcfdab78df/node_modules/isobject/"),
            packageDependencies: new Map([
                ["isobject", "3.0.1"],
            ]),
        }],
        ["2.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-isobject-2.1.0-f065561096a3f1da2ef46272f815c840d87e0c89/node_modules/isobject/"),
            packageDependencies: new Map([
                ["isarray", "1.0.0"],
                ["isobject", "2.1.0"],
            ]),
        }],
    ])],
    ["repeat-element", new Map([
        ["1.1.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-repeat-element-1.1.3-782e0d825c0c5a3bb39731f84efee6b742e6b1ce/node_modules/repeat-element/"),
            packageDependencies: new Map([
                ["repeat-element", "1.1.3"],
            ]),
        }],
    ])],
    ["snapdragon", new Map([
        ["0.8.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-snapdragon-0.8.2-64922e7c565b0e14204ba1aa7d6964278d25182d/node_modules/snapdragon/"),
            packageDependencies: new Map([
                ["base", "0.11.2"],
                ["debug", "2.6.9"],
                ["define-property", "0.2.5"],
                ["extend-shallow", "2.0.1"],
                ["map-cache", "0.2.2"],
                ["source-map", "0.5.7"],
                ["source-map-resolve", "0.5.2"],
                ["use", "3.1.1"],
                ["snapdragon", "0.8.2"],
            ]),
        }],
    ])],
    ["base", new Map([
        ["0.11.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-base-0.11.2-7bde5ced145b6d551a90db87f83c558b4eb48a8f/node_modules/base/"),
            packageDependencies: new Map([
                ["cache-base", "1.0.1"],
                ["class-utils", "0.3.6"],
                ["component-emitter", "1.3.0"],
                ["define-property", "1.0.0"],
                ["isobject", "3.0.1"],
                ["mixin-deep", "1.3.2"],
                ["pascalcase", "0.1.1"],
                ["base", "0.11.2"],
            ]),
        }],
    ])],
    ["cache-base", new Map([
        ["1.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-cache-base-1.0.1-0a7f46416831c8b662ee36fe4e7c59d76f666ab2/node_modules/cache-base/"),
            packageDependencies: new Map([
                ["collection-visit", "1.0.0"],
                ["component-emitter", "1.3.0"],
                ["get-value", "2.0.6"],
                ["has-value", "1.0.0"],
                ["isobject", "3.0.1"],
                ["set-value", "2.0.1"],
                ["to-object-path", "0.3.0"],
                ["union-value", "1.0.1"],
                ["unset-value", "1.0.0"],
                ["cache-base", "1.0.1"],
            ]),
        }],
    ])],
    ["collection-visit", new Map([
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-collection-visit-1.0.0-4bc0373c164bc3291b4d368c829cf1a80a59dca0/node_modules/collection-visit/"),
            packageDependencies: new Map([
                ["map-visit", "1.0.0"],
                ["object-visit", "1.0.1"],
                ["collection-visit", "1.0.0"],
            ]),
        }],
    ])],
    ["map-visit", new Map([
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-map-visit-1.0.0-ecdca8f13144e660f1b5bd41f12f3479d98dfb8f/node_modules/map-visit/"),
            packageDependencies: new Map([
                ["object-visit", "1.0.1"],
                ["map-visit", "1.0.0"],
            ]),
        }],
    ])],
    ["object-visit", new Map([
        ["1.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-object-visit-1.0.1-f79c4493af0c5377b59fe39d395e41042dd045bb/node_modules/object-visit/"),
            packageDependencies: new Map([
                ["isobject", "3.0.1"],
                ["object-visit", "1.0.1"],
            ]),
        }],
    ])],
    ["component-emitter", new Map([
        ["1.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-component-emitter-1.3.0-16e4070fba8ae29b679f2215853ee181ab2eabc0/node_modules/component-emitter/"),
            packageDependencies: new Map([
                ["component-emitter", "1.3.0"],
            ]),
        }],
    ])],
    ["get-value", new Map([
        ["2.0.6", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-get-value-2.0.6-dc15ca1c672387ca76bd37ac0a395ba2042a2c28/node_modules/get-value/"),
            packageDependencies: new Map([
                ["get-value", "2.0.6"],
            ]),
        }],
    ])],
    ["has-value", new Map([
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-has-value-1.0.0-18b281da585b1c5c51def24c930ed29a0be6b177/node_modules/has-value/"),
            packageDependencies: new Map([
                ["get-value", "2.0.6"],
                ["has-values", "1.0.0"],
                ["isobject", "3.0.1"],
                ["has-value", "1.0.0"],
            ]),
        }],
        ["0.3.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-has-value-0.3.1-7b1f58bada62ca827ec0a2078025654845995e1f/node_modules/has-value/"),
            packageDependencies: new Map([
                ["get-value", "2.0.6"],
                ["has-values", "0.1.4"],
                ["isobject", "2.1.0"],
                ["has-value", "0.3.1"],
            ]),
        }],
    ])],
    ["has-values", new Map([
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-has-values-1.0.0-95b0b63fec2146619a6fe57fe75628d5a39efe4f/node_modules/has-values/"),
            packageDependencies: new Map([
                ["is-number", "3.0.0"],
                ["kind-of", "4.0.0"],
                ["has-values", "1.0.0"],
            ]),
        }],
        ["0.1.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-has-values-0.1.4-6d61de95d91dfca9b9a02089ad384bff8f62b771/node_modules/has-values/"),
            packageDependencies: new Map([
                ["has-values", "0.1.4"],
            ]),
        }],
    ])],
    ["set-value", new Map([
        ["2.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-set-value-2.0.1-a18d40530e6f07de4228c7defe4227af8cad005b/node_modules/set-value/"),
            packageDependencies: new Map([
                ["extend-shallow", "2.0.1"],
                ["is-extendable", "0.1.1"],
                ["is-plain-object", "2.0.4"],
                ["split-string", "3.1.0"],
                ["set-value", "2.0.1"],
            ]),
        }],
    ])],
    ["is-plain-object", new Map([
        ["2.0.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-plain-object-2.0.4-2c163b3fafb1b606d9d17928f05c2a1c38e07677/node_modules/is-plain-object/"),
            packageDependencies: new Map([
                ["isobject", "3.0.1"],
                ["is-plain-object", "2.0.4"],
            ]),
        }],
    ])],
    ["split-string", new Map([
        ["3.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-split-string-3.1.0-7cb09dda3a86585705c64b39a6466038682e8fe2/node_modules/split-string/"),
            packageDependencies: new Map([
                ["extend-shallow", "3.0.2"],
                ["split-string", "3.1.0"],
            ]),
        }],
    ])],
    ["assign-symbols", new Map([
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-assign-symbols-1.0.0-59667f41fadd4f20ccbc2bb96b8d4f7f78ec0367/node_modules/assign-symbols/"),
            packageDependencies: new Map([
                ["assign-symbols", "1.0.0"],
            ]),
        }],
    ])],
    ["to-object-path", new Map([
        ["0.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-to-object-path-0.3.0-297588b7b0e7e0ac08e04e672f85c1f4999e17af/node_modules/to-object-path/"),
            packageDependencies: new Map([
                ["kind-of", "3.2.2"],
                ["to-object-path", "0.3.0"],
            ]),
        }],
    ])],
    ["union-value", new Map([
        ["1.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-union-value-1.0.1-0b6fe7b835aecda61c6ea4d4f02c14221e109847/node_modules/union-value/"),
            packageDependencies: new Map([
                ["arr-union", "3.1.0"],
                ["get-value", "2.0.6"],
                ["is-extendable", "0.1.1"],
                ["set-value", "2.0.1"],
                ["union-value", "1.0.1"],
            ]),
        }],
    ])],
    ["arr-union", new Map([
        ["3.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-arr-union-3.1.0-e39b09aea9def866a8f206e288af63919bae39c4/node_modules/arr-union/"),
            packageDependencies: new Map([
                ["arr-union", "3.1.0"],
            ]),
        }],
    ])],
    ["unset-value", new Map([
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-unset-value-1.0.0-8376873f7d2335179ffb1e6fc3a8ed0dfc8ab559/node_modules/unset-value/"),
            packageDependencies: new Map([
                ["has-value", "0.3.1"],
                ["isobject", "3.0.1"],
                ["unset-value", "1.0.0"],
            ]),
        }],
    ])],
    ["class-utils", new Map([
        ["0.3.6", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-class-utils-0.3.6-f93369ae8b9a7ce02fd41faad0ca83033190c463/node_modules/class-utils/"),
            packageDependencies: new Map([
                ["arr-union", "3.1.0"],
                ["define-property", "0.2.5"],
                ["isobject", "3.0.1"],
                ["static-extend", "0.1.2"],
                ["class-utils", "0.3.6"],
            ]),
        }],
    ])],
    ["define-property", new Map([
        ["0.2.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-define-property-0.2.5-c35b1ef918ec3c990f9a5bc57be04aacec5c8116/node_modules/define-property/"),
            packageDependencies: new Map([
                ["is-descriptor", "0.1.6"],
                ["define-property", "0.2.5"],
            ]),
        }],
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-define-property-1.0.0-769ebaaf3f4a63aad3af9e8d304c9bbe79bfb0e6/node_modules/define-property/"),
            packageDependencies: new Map([
                ["is-descriptor", "1.0.2"],
                ["define-property", "1.0.0"],
            ]),
        }],
        ["2.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-define-property-2.0.2-d459689e8d654ba77e02a817f8710d702cb16e9d/node_modules/define-property/"),
            packageDependencies: new Map([
                ["is-descriptor", "1.0.2"],
                ["isobject", "3.0.1"],
                ["define-property", "2.0.2"],
            ]),
        }],
    ])],
    ["is-descriptor", new Map([
        ["0.1.6", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-descriptor-0.1.6-366d8240dde487ca51823b1ab9f07a10a78251ca/node_modules/is-descriptor/"),
            packageDependencies: new Map([
                ["is-accessor-descriptor", "0.1.6"],
                ["is-data-descriptor", "0.1.4"],
                ["kind-of", "5.1.0"],
                ["is-descriptor", "0.1.6"],
            ]),
        }],
        ["1.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-descriptor-1.0.2-3b159746a66604b04f8c81524ba365c5f14d86ec/node_modules/is-descriptor/"),
            packageDependencies: new Map([
                ["is-accessor-descriptor", "1.0.0"],
                ["is-data-descriptor", "1.0.0"],
                ["kind-of", "6.0.2"],
                ["is-descriptor", "1.0.2"],
            ]),
        }],
    ])],
    ["is-accessor-descriptor", new Map([
        ["0.1.6", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-accessor-descriptor-0.1.6-a9e12cb3ae8d876727eeef3843f8a0897b5c98d6/node_modules/is-accessor-descriptor/"),
            packageDependencies: new Map([
                ["kind-of", "3.2.2"],
                ["is-accessor-descriptor", "0.1.6"],
            ]),
        }],
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-accessor-descriptor-1.0.0-169c2f6d3df1f992618072365c9b0ea1f6878656/node_modules/is-accessor-descriptor/"),
            packageDependencies: new Map([
                ["kind-of", "6.0.2"],
                ["is-accessor-descriptor", "1.0.0"],
            ]),
        }],
    ])],
    ["is-data-descriptor", new Map([
        ["0.1.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-data-descriptor-0.1.4-0b5ee648388e2c860282e793f1856fec3f301b56/node_modules/is-data-descriptor/"),
            packageDependencies: new Map([
                ["kind-of", "3.2.2"],
                ["is-data-descriptor", "0.1.4"],
            ]),
        }],
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-data-descriptor-1.0.0-d84876321d0e7add03990406abbbbd36ba9268c7/node_modules/is-data-descriptor/"),
            packageDependencies: new Map([
                ["kind-of", "6.0.2"],
                ["is-data-descriptor", "1.0.0"],
            ]),
        }],
    ])],
    ["static-extend", new Map([
        ["0.1.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-static-extend-0.1.2-60809c39cbff55337226fd5e0b520f341f1fb5c6/node_modules/static-extend/"),
            packageDependencies: new Map([
                ["define-property", "0.2.5"],
                ["object-copy", "0.1.0"],
                ["static-extend", "0.1.2"],
            ]),
        }],
    ])],
    ["object-copy", new Map([
        ["0.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-object-copy-0.1.0-7e7d858b781bd7c991a41ba975ed3812754e998c/node_modules/object-copy/"),
            packageDependencies: new Map([
                ["copy-descriptor", "0.1.1"],
                ["define-property", "0.2.5"],
                ["kind-of", "3.2.2"],
                ["object-copy", "0.1.0"],
            ]),
        }],
    ])],
    ["copy-descriptor", new Map([
        ["0.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-copy-descriptor-0.1.1-676f6eb3c39997c2ee1ac3a924fd6124748f578d/node_modules/copy-descriptor/"),
            packageDependencies: new Map([
                ["copy-descriptor", "0.1.1"],
            ]),
        }],
    ])],
    ["mixin-deep", new Map([
        ["1.3.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-mixin-deep-1.3.2-1120b43dc359a785dce65b55b82e257ccf479566/node_modules/mixin-deep/"),
            packageDependencies: new Map([
                ["for-in", "1.0.2"],
                ["is-extendable", "1.0.1"],
                ["mixin-deep", "1.3.2"],
            ]),
        }],
    ])],
    ["for-in", new Map([
        ["1.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-for-in-1.0.2-81068d295a8142ec0ac726c6e2200c30fb6d5e80/node_modules/for-in/"),
            packageDependencies: new Map([
                ["for-in", "1.0.2"],
            ]),
        }],
    ])],
    ["pascalcase", new Map([
        ["0.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-pascalcase-0.1.1-b363e55e8006ca6fe21784d2db22bd15d7917f14/node_modules/pascalcase/"),
            packageDependencies: new Map([
                ["pascalcase", "0.1.1"],
            ]),
        }],
    ])],
    ["map-cache", new Map([
        ["0.2.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-map-cache-0.2.2-c32abd0bd6525d9b051645bb4f26ac5dc98a0dbf/node_modules/map-cache/"),
            packageDependencies: new Map([
                ["map-cache", "0.2.2"],
            ]),
        }],
    ])],
    ["source-map-resolve", new Map([
        ["0.5.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-source-map-resolve-0.5.2-72e2cc34095543e43b2c62b2c4c10d4a9054f259/node_modules/source-map-resolve/"),
            packageDependencies: new Map([
                ["atob", "2.1.2"],
                ["decode-uri-component", "0.2.0"],
                ["resolve-url", "0.2.1"],
                ["source-map-url", "0.4.0"],
                ["urix", "0.1.0"],
                ["source-map-resolve", "0.5.2"],
            ]),
        }],
    ])],
    ["atob", new Map([
        ["2.1.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-atob-2.1.2-6d9517eb9e030d2436666651e86bd9f6f13533c9/node_modules/atob/"),
            packageDependencies: new Map([
                ["atob", "2.1.2"],
            ]),
        }],
    ])],
    ["decode-uri-component", new Map([
        ["0.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-decode-uri-component-0.2.0-eb3913333458775cb84cd1a1fae062106bb87545/node_modules/decode-uri-component/"),
            packageDependencies: new Map([
                ["decode-uri-component", "0.2.0"],
            ]),
        }],
    ])],
    ["resolve-url", new Map([
        ["0.2.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-resolve-url-0.2.1-2c637fe77c893afd2a663fe21aa9080068e2052a/node_modules/resolve-url/"),
            packageDependencies: new Map([
                ["resolve-url", "0.2.1"],
            ]),
        }],
    ])],
    ["source-map-url", new Map([
        ["0.4.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-source-map-url-0.4.0-3e935d7ddd73631b97659956d55128e87b5084a3/node_modules/source-map-url/"),
            packageDependencies: new Map([
                ["source-map-url", "0.4.0"],
            ]),
        }],
    ])],
    ["urix", new Map([
        ["0.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-urix-0.1.0-da937f7a62e21fec1fd18d49b35c2935067a6c72/node_modules/urix/"),
            packageDependencies: new Map([
                ["urix", "0.1.0"],
            ]),
        }],
    ])],
    ["use", new Map([
        ["3.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-use-3.1.1-d50c8cac79a19fbc20f2911f56eb973f4e10070f/node_modules/use/"),
            packageDependencies: new Map([
                ["use", "3.1.1"],
            ]),
        }],
    ])],
    ["snapdragon-node", new Map([
        ["2.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-snapdragon-node-2.1.1-6c175f86ff14bdb0724563e8f3c1b021a286853b/node_modules/snapdragon-node/"),
            packageDependencies: new Map([
                ["define-property", "1.0.0"],
                ["isobject", "3.0.1"],
                ["snapdragon-util", "3.0.1"],
                ["snapdragon-node", "2.1.1"],
            ]),
        }],
    ])],
    ["snapdragon-util", new Map([
        ["3.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-snapdragon-util-3.0.1-f956479486f2acd79700693f6f7b805e45ab56e2/node_modules/snapdragon-util/"),
            packageDependencies: new Map([
                ["kind-of", "3.2.2"],
                ["snapdragon-util", "3.0.1"],
            ]),
        }],
    ])],
    ["to-regex", new Map([
        ["3.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-to-regex-3.0.2-13cfdd9b336552f30b51f33a8ae1b42a7a7599ce/node_modules/to-regex/"),
            packageDependencies: new Map([
                ["define-property", "2.0.2"],
                ["extend-shallow", "3.0.2"],
                ["regex-not", "1.0.2"],
                ["safe-regex", "1.1.0"],
                ["to-regex", "3.0.2"],
            ]),
        }],
    ])],
    ["regex-not", new Map([
        ["1.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-regex-not-1.0.2-1f4ece27e00b0b65e0247a6810e6a85d83a5752c/node_modules/regex-not/"),
            packageDependencies: new Map([
                ["extend-shallow", "3.0.2"],
                ["safe-regex", "1.1.0"],
                ["regex-not", "1.0.2"],
            ]),
        }],
    ])],
    ["safe-regex", new Map([
        ["1.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-safe-regex-1.1.0-40a3669f3b077d1e943d44629e157dd48023bf2e/node_modules/safe-regex/"),
            packageDependencies: new Map([
                ["ret", "0.1.15"],
                ["safe-regex", "1.1.0"],
            ]),
        }],
    ])],
    ["ret", new Map([
        ["0.1.15", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ret-0.1.15-b8a4825d5bdb1fc3f6f53c2bc33f81388681c7bc/node_modules/ret/"),
            packageDependencies: new Map([
                ["ret", "0.1.15"],
            ]),
        }],
    ])],
    ["extglob", new Map([
        ["2.0.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-extglob-2.0.4-ad00fe4dc612a9232e8718711dc5cb5ab0285543/node_modules/extglob/"),
            packageDependencies: new Map([
                ["array-unique", "0.3.2"],
                ["define-property", "1.0.0"],
                ["expand-brackets", "2.1.4"],
                ["extend-shallow", "2.0.1"],
                ["fragment-cache", "0.2.1"],
                ["regex-not", "1.0.2"],
                ["snapdragon", "0.8.2"],
                ["to-regex", "3.0.2"],
                ["extglob", "2.0.4"],
            ]),
        }],
    ])],
    ["expand-brackets", new Map([
        ["2.1.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-expand-brackets-2.1.4-b77735e315ce30f6b6eff0f83b04151a22449622/node_modules/expand-brackets/"),
            packageDependencies: new Map([
                ["debug", "2.6.9"],
                ["define-property", "0.2.5"],
                ["extend-shallow", "2.0.1"],
                ["posix-character-classes", "0.1.1"],
                ["regex-not", "1.0.2"],
                ["snapdragon", "0.8.2"],
                ["to-regex", "3.0.2"],
                ["expand-brackets", "2.1.4"],
            ]),
        }],
    ])],
    ["posix-character-classes", new Map([
        ["0.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-posix-character-classes-0.1.1-01eac0fe3b5af71a2a6c02feabb8c1fef7e00eab/node_modules/posix-character-classes/"),
            packageDependencies: new Map([
                ["posix-character-classes", "0.1.1"],
            ]),
        }],
    ])],
    ["fragment-cache", new Map([
        ["0.2.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-fragment-cache-0.2.1-4290fad27f13e89be7f33799c6bc5a0abfff0d19/node_modules/fragment-cache/"),
            packageDependencies: new Map([
                ["map-cache", "0.2.2"],
                ["fragment-cache", "0.2.1"],
            ]),
        }],
    ])],
    ["nanomatch", new Map([
        ["1.2.13", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-nanomatch-1.2.13-b87a8aa4fc0de8fe6be88895b38983ff265bd119/node_modules/nanomatch/"),
            packageDependencies: new Map([
                ["arr-diff", "4.0.0"],
                ["array-unique", "0.3.2"],
                ["define-property", "2.0.2"],
                ["extend-shallow", "3.0.2"],
                ["fragment-cache", "0.2.1"],
                ["is-windows", "1.0.2"],
                ["kind-of", "6.0.2"],
                ["object.pick", "1.3.0"],
                ["regex-not", "1.0.2"],
                ["snapdragon", "0.8.2"],
                ["to-regex", "3.0.2"],
                ["nanomatch", "1.2.13"],
            ]),
        }],
    ])],
    ["is-windows", new Map([
        ["1.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-windows-1.0.2-d1850eb9791ecd18e6182ce12a30f396634bb19d/node_modules/is-windows/"),
            packageDependencies: new Map([
                ["is-windows", "1.0.2"],
            ]),
        }],
    ])],
    ["object.pick", new Map([
        ["1.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-object-pick-1.3.0-87a10ac4c1694bd2e1cbf53591a66141fb5dd747/node_modules/object.pick/"),
            packageDependencies: new Map([
                ["isobject", "3.0.1"],
                ["object.pick", "1.3.0"],
            ]),
        }],
    ])],
    ["resolve-dir", new Map([
        ["1.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-resolve-dir-1.0.1-79a40644c362be82f26effe739c9bb5382046f43/node_modules/resolve-dir/"),
            packageDependencies: new Map([
                ["expand-tilde", "2.0.2"],
                ["global-modules", "1.0.0"],
                ["resolve-dir", "1.0.1"],
            ]),
        }],
    ])],
    ["expand-tilde", new Map([
        ["2.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-expand-tilde-2.0.2-97e801aa052df02454de46b02bf621642cdc8502/node_modules/expand-tilde/"),
            packageDependencies: new Map([
                ["homedir-polyfill", "1.0.3"],
                ["expand-tilde", "2.0.2"],
            ]),
        }],
    ])],
    ["homedir-polyfill", new Map([
        ["1.0.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-homedir-polyfill-1.0.3-743298cef4e5af3e194161fbadcc2151d3a058e8/node_modules/homedir-polyfill/"),
            packageDependencies: new Map([
                ["parse-passwd", "1.0.0"],
                ["homedir-polyfill", "1.0.3"],
            ]),
        }],
    ])],
    ["parse-passwd", new Map([
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-parse-passwd-1.0.0-6d5b934a456993b23d37f40a382d6f1666a8e5c6/node_modules/parse-passwd/"),
            packageDependencies: new Map([
                ["parse-passwd", "1.0.0"],
            ]),
        }],
    ])],
    ["global-modules", new Map([
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-global-modules-1.0.0-6d770f0eb523ac78164d72b5e71a8877265cc3ea/node_modules/global-modules/"),
            packageDependencies: new Map([
                ["global-prefix", "1.0.2"],
                ["is-windows", "1.0.2"],
                ["resolve-dir", "1.0.1"],
                ["global-modules", "1.0.0"],
            ]),
        }],
        ["2.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-global-modules-2.0.0-997605ad2345f27f51539bea26574421215c7780/node_modules/global-modules/"),
            packageDependencies: new Map([
                ["global-prefix", "3.0.0"],
                ["global-modules", "2.0.0"],
            ]),
        }],
    ])],
    ["global-prefix", new Map([
        ["1.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-global-prefix-1.0.2-dbf743c6c14992593c655568cb66ed32c0122ebe/node_modules/global-prefix/"),
            packageDependencies: new Map([
                ["expand-tilde", "2.0.2"],
                ["homedir-polyfill", "1.0.3"],
                ["ini", "1.3.5"],
                ["is-windows", "1.0.2"],
                ["which", "1.3.1"],
                ["global-prefix", "1.0.2"],
            ]),
        }],
        ["3.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-global-prefix-3.0.0-fc85f73064df69f50421f47f883fe5b913ba9b97/node_modules/global-prefix/"),
            packageDependencies: new Map([
                ["ini", "1.3.5"],
                ["kind-of", "6.0.2"],
                ["which", "1.3.1"],
                ["global-prefix", "3.0.0"],
            ]),
        }],
    ])],
    ["ini", new Map([
        ["1.3.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ini-1.3.5-eee25f56db1c9ec6085e0c22778083f596abf927/node_modules/ini/"),
            packageDependencies: new Map([
                ["ini", "1.3.5"],
            ]),
        }],
    ])],
    ["import-local", new Map([
        ["2.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-import-local-2.0.0-55070be38a5993cf18ef6db7e961f5bee5c5a09d/node_modules/import-local/"),
            packageDependencies: new Map([
                ["pkg-dir", "3.0.0"],
                ["resolve-cwd", "2.0.0"],
                ["import-local", "2.0.0"],
            ]),
        }],
    ])],
    ["resolve-cwd", new Map([
        ["2.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-resolve-cwd-2.0.0-00a9f7387556e27038eae232caa372a6a59b665a/node_modules/resolve-cwd/"),
            packageDependencies: new Map([
                ["resolve-from", "3.0.0"],
                ["resolve-cwd", "2.0.0"],
            ]),
        }],
    ])],
    ["resolve-from", new Map([
        ["3.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-resolve-from-3.0.0-b22c7af7d9d6881bc8b6e653335eebcb0a188748/node_modules/resolve-from/"),
            packageDependencies: new Map([
                ["resolve-from", "3.0.0"],
            ]),
        }],
    ])],
    ["v8-compile-cache", new Map([
        ["2.0.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-v8-compile-cache-2.0.3-00f7494d2ae2b688cfe2899df6ed2c54bef91dbe/node_modules/v8-compile-cache/"),
            packageDependencies: new Map([
                ["v8-compile-cache", "2.0.3"],
            ]),
        }],
    ])],
    ["os-locale", new Map([
        ["3.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-os-locale-3.1.0-a802a6ee17f24c10483ab9935719cef4ed16bf1a/node_modules/os-locale/"),
            packageDependencies: new Map([
                ["execa", "1.0.0"],
                ["lcid", "2.0.0"],
                ["mem", "4.3.0"],
                ["os-locale", "3.1.0"],
            ]),
        }],
    ])],
    ["execa", new Map([
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-execa-1.0.0-c6236a5bb4df6d6f15e88e7f017798216749ddd8/node_modules/execa/"),
            packageDependencies: new Map([
                ["cross-spawn", "6.0.5"],
                ["get-stream", "4.1.0"],
                ["is-stream", "1.1.0"],
                ["npm-run-path", "2.0.2"],
                ["p-finally", "1.0.0"],
                ["signal-exit", "3.0.2"],
                ["strip-eof", "1.0.0"],
                ["execa", "1.0.0"],
            ]),
        }],
    ])],
    ["get-stream", new Map([
        ["4.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-get-stream-4.1.0-c1b255575f3dc21d59bfc79cd3d2b46b1c3a54b5/node_modules/get-stream/"),
            packageDependencies: new Map([
                ["pump", "3.0.0"],
                ["get-stream", "4.1.0"],
            ]),
        }],
    ])],
    ["pump", new Map([
        ["3.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-pump-3.0.0-b4a2116815bde2f4e1ea602354e8c75565107a64/node_modules/pump/"),
            packageDependencies: new Map([
                ["end-of-stream", "1.4.4"],
                ["once", "1.4.0"],
                ["pump", "3.0.0"],
            ]),
        }],
    ])],
    ["end-of-stream", new Map([
        ["1.4.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-end-of-stream-1.4.4-5ae64a5f45057baf3626ec14da0ca5e4b2431eb0/node_modules/end-of-stream/"),
            packageDependencies: new Map([
                ["once", "1.4.0"],
                ["end-of-stream", "1.4.4"],
            ]),
        }],
    ])],
    ["is-stream", new Map([
        ["1.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-stream-1.1.0-12d4a3dd4e68e0b79ceb8dbc84173ae80d91ca44/node_modules/is-stream/"),
            packageDependencies: new Map([
                ["is-stream", "1.1.0"],
            ]),
        }],
    ])],
    ["npm-run-path", new Map([
        ["2.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-npm-run-path-2.0.2-35a9232dfa35d7067b4cb2ddf2357b1871536c5f/node_modules/npm-run-path/"),
            packageDependencies: new Map([
                ["path-key", "2.0.1"],
                ["npm-run-path", "2.0.2"],
            ]),
        }],
    ])],
    ["p-finally", new Map([
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-p-finally-1.0.0-3fbcfb15b899a44123b34b6dcc18b724336a2cae/node_modules/p-finally/"),
            packageDependencies: new Map([
                ["p-finally", "1.0.0"],
            ]),
        }],
    ])],
    ["signal-exit", new Map([
        ["3.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-signal-exit-3.0.2-b5fdc08f1287ea1178628e415e25132b73646c6d/node_modules/signal-exit/"),
            packageDependencies: new Map([
                ["signal-exit", "3.0.2"],
            ]),
        }],
    ])],
    ["strip-eof", new Map([
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-strip-eof-1.0.0-bb43ff5598a6eb05d89b59fcd129c983313606bf/node_modules/strip-eof/"),
            packageDependencies: new Map([
                ["strip-eof", "1.0.0"],
            ]),
        }],
    ])],
    ["lcid", new Map([
        ["2.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-lcid-2.0.0-6ef5d2df60e52f82eb228a4c373e8d1f397253cf/node_modules/lcid/"),
            packageDependencies: new Map([
                ["invert-kv", "2.0.0"],
                ["lcid", "2.0.0"],
            ]),
        }],
    ])],
    ["invert-kv", new Map([
        ["2.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-invert-kv-2.0.0-7393f5afa59ec9ff5f67a27620d11c226e3eec02/node_modules/invert-kv/"),
            packageDependencies: new Map([
                ["invert-kv", "2.0.0"],
            ]),
        }],
    ])],
    ["mem", new Map([
        ["4.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-mem-4.3.0-461af497bc4ae09608cdb2e60eefb69bff744178/node_modules/mem/"),
            packageDependencies: new Map([
                ["map-age-cleaner", "0.1.3"],
                ["mimic-fn", "2.1.0"],
                ["p-is-promise", "2.1.0"],
                ["mem", "4.3.0"],
            ]),
        }],
    ])],
    ["map-age-cleaner", new Map([
        ["0.1.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-map-age-cleaner-0.1.3-7d583a7306434c055fe474b0f45078e6e1b4b92a/node_modules/map-age-cleaner/"),
            packageDependencies: new Map([
                ["p-defer", "1.0.0"],
                ["map-age-cleaner", "0.1.3"],
            ]),
        }],
    ])],
    ["p-defer", new Map([
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-p-defer-1.0.0-9f6eb182f6c9aa8cd743004a7d4f96b196b0fb0c/node_modules/p-defer/"),
            packageDependencies: new Map([
                ["p-defer", "1.0.0"],
            ]),
        }],
    ])],
    ["mimic-fn", new Map([
        ["2.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-mimic-fn-2.1.0-7ed2c2ccccaf84d3ffcb7a69b57711fc2083401b/node_modules/mimic-fn/"),
            packageDependencies: new Map([
                ["mimic-fn", "2.1.0"],
            ]),
        }],
    ])],
    ["p-is-promise", new Map([
        ["2.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-p-is-promise-2.1.0-918cebaea248a62cf7ffab8e3bca8c5f882fc42e/node_modules/p-is-promise/"),
            packageDependencies: new Map([
                ["p-is-promise", "2.1.0"],
            ]),
        }],
    ])],
    ["webpack-dev-server", new Map([
        ["3.9.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-webpack-dev-server-3.9.0-27c3b5d0f6b6677c4304465ac817623c8b27b89c/node_modules/webpack-dev-server/"),
            packageDependencies: new Map([
                ["webpack", "5.0.0-beta.7"],
                ["ansi-html", "0.0.7"],
                ["bonjour", "3.5.0"],
                ["chokidar", "2.1.8"],
                ["compression", "1.7.4"],
                ["connect-history-api-fallback", "1.6.0"],
                ["debug", "4.1.1"],
                ["del", "4.1.1"],
                ["express", "4.17.1"],
                ["html-entities", "1.2.1"],
                ["http-proxy-middleware", "0.19.1"],
                ["import-local", "2.0.0"],
                ["internal-ip", "4.3.0"],
                ["ip", "1.1.5"],
                ["is-absolute-url", "3.0.3"],
                ["killable", "1.0.1"],
                ["loglevel", "1.6.6"],
                ["opn", "5.5.0"],
                ["p-retry", "3.0.1"],
                ["portfinder", "1.0.25"],
                ["schema-utils", "1.0.0"],
                ["selfsigned", "1.10.7"],
                ["semver", "6.3.0"],
                ["serve-index", "1.9.1"],
                ["sockjs", "0.3.19"],
                ["sockjs-client", "1.4.0"],
                ["spdy", "4.0.1"],
                ["strip-ansi", "3.0.1"],
                ["supports-color", "6.1.0"],
                ["url", "0.11.0"],
                ["webpack-dev-middleware", "3.7.2"],
                ["webpack-log", "2.0.0"],
                ["ws", "6.2.1"],
                ["yargs", "12.0.5"],
                ["webpack-dev-server", "3.9.0"],
            ]),
        }],
    ])],
    ["ansi-html", new Map([
        ["0.0.7", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ansi-html-0.0.7-813584021962a9e9e6fd039f940d12f56ca7859e/node_modules/ansi-html/"),
            packageDependencies: new Map([
                ["ansi-html", "0.0.7"],
            ]),
        }],
    ])],
    ["bonjour", new Map([
        ["3.5.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-bonjour-3.5.0-8e890a183d8ee9a2393b3844c691a42bcf7bc9f5/node_modules/bonjour/"),
            packageDependencies: new Map([
                ["array-flatten", "2.1.2"],
                ["deep-equal", "1.1.1"],
                ["dns-equal", "1.0.0"],
                ["dns-txt", "2.0.2"],
                ["multicast-dns", "6.2.3"],
                ["multicast-dns-service-types", "1.1.0"],
                ["bonjour", "3.5.0"],
            ]),
        }],
    ])],
    ["deep-equal", new Map([
        ["1.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-deep-equal-1.1.1-b5c98c942ceffaf7cb051e24e1434a25a2e6076a/node_modules/deep-equal/"),
            packageDependencies: new Map([
                ["is-arguments", "1.0.4"],
                ["is-date-object", "1.0.1"],
                ["is-regex", "1.0.4"],
                ["object-is", "1.0.1"],
                ["object-keys", "1.1.1"],
                ["regexp.prototype.flags", "1.2.0"],
                ["deep-equal", "1.1.1"],
            ]),
        }],
    ])],
    ["is-arguments", new Map([
        ["1.0.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-arguments-1.0.4-3faf966c7cba0ff437fb31f6250082fcf0448cf3/node_modules/is-arguments/"),
            packageDependencies: new Map([
                ["is-arguments", "1.0.4"],
            ]),
        }],
    ])],
    ["object-is", new Map([
        ["1.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-object-is-1.0.1-0aa60ec9989a0b3ed795cf4d06f62cf1ad6539b6/node_modules/object-is/"),
            packageDependencies: new Map([
                ["object-is", "1.0.1"],
            ]),
        }],
    ])],
    ["regexp.prototype.flags", new Map([
        ["1.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-regexp-prototype-flags-1.2.0-6b30724e306a27833eeb171b66ac8890ba37e41c/node_modules/regexp.prototype.flags/"),
            packageDependencies: new Map([
                ["define-properties", "1.1.3"],
                ["regexp.prototype.flags", "1.2.0"],
            ]),
        }],
    ])],
    ["dns-equal", new Map([
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-dns-equal-1.0.0-b39e7f1da6eb0a75ba9c17324b34753c47e0654d/node_modules/dns-equal/"),
            packageDependencies: new Map([
                ["dns-equal", "1.0.0"],
            ]),
        }],
    ])],
    ["dns-txt", new Map([
        ["2.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-dns-txt-2.0.2-b91d806f5d27188e4ab3e7d107d881a1cc4642b6/node_modules/dns-txt/"),
            packageDependencies: new Map([
                ["buffer-indexof", "1.1.1"],
                ["dns-txt", "2.0.2"],
            ]),
        }],
    ])],
    ["buffer-indexof", new Map([
        ["1.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-buffer-indexof-1.1.1-52fabcc6a606d1a00302802648ef68f639da268c/node_modules/buffer-indexof/"),
            packageDependencies: new Map([
                ["buffer-indexof", "1.1.1"],
            ]),
        }],
    ])],
    ["multicast-dns", new Map([
        ["6.2.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-multicast-dns-6.2.3-a0ec7bd9055c4282f790c3c82f4e28db3b31b229/node_modules/multicast-dns/"),
            packageDependencies: new Map([
                ["dns-packet", "1.3.1"],
                ["thunky", "1.1.0"],
                ["multicast-dns", "6.2.3"],
            ]),
        }],
    ])],
    ["dns-packet", new Map([
        ["1.3.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-dns-packet-1.3.1-12aa426981075be500b910eedcd0b47dd7deda5a/node_modules/dns-packet/"),
            packageDependencies: new Map([
                ["ip", "1.1.5"],
                ["safe-buffer", "5.2.0"],
                ["dns-packet", "1.3.1"],
            ]),
        }],
    ])],
    ["ip", new Map([
        ["1.1.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ip-1.1.5-bdded70114290828c0a039e72ef25f5aaec4354a/node_modules/ip/"),
            packageDependencies: new Map([
                ["ip", "1.1.5"],
            ]),
        }],
    ])],
    ["thunky", new Map([
        ["1.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-thunky-1.1.0-5abaf714a9405db0504732bbccd2cedd9ef9537d/node_modules/thunky/"),
            packageDependencies: new Map([
                ["thunky", "1.1.0"],
            ]),
        }],
    ])],
    ["multicast-dns-service-types", new Map([
        ["1.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-multicast-dns-service-types-1.1.0-899f11d9686e5e05cb91b35d5f0e63b773cfc901/node_modules/multicast-dns-service-types/"),
            packageDependencies: new Map([
                ["multicast-dns-service-types", "1.1.0"],
            ]),
        }],
    ])],
    ["chokidar", new Map([
        ["2.1.8", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-chokidar-2.1.8-804b3a7b6a99358c3c5c61e71d8728f041cff917/node_modules/chokidar/"),
            packageDependencies: new Map([
                ["anymatch", "2.0.0"],
                ["async-each", "1.0.3"],
                ["braces", "2.3.2"],
                ["glob-parent", "3.1.0"],
                ["inherits", "2.0.4"],
                ["is-binary-path", "1.0.1"],
                ["is-glob", "4.0.1"],
                ["normalize-path", "3.0.0"],
                ["path-is-absolute", "1.0.1"],
                ["readdirp", "2.2.1"],
                ["upath", "1.2.0"],
                ["chokidar", "2.1.8"],
            ]),
        }],
    ])],
    ["anymatch", new Map([
        ["2.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-anymatch-2.0.0-bcb24b4f37934d9aa7ac17b4adaf89e7c76ef2eb/node_modules/anymatch/"),
            packageDependencies: new Map([
                ["micromatch", "3.1.10"],
                ["normalize-path", "2.1.1"],
                ["anymatch", "2.0.0"],
            ]),
        }],
    ])],
    ["normalize-path", new Map([
        ["2.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-normalize-path-2.1.1-1ab28b556e198363a8c1a6f7e6fa20137fe6aed9/node_modules/normalize-path/"),
            packageDependencies: new Map([
                ["remove-trailing-separator", "1.1.0"],
                ["normalize-path", "2.1.1"],
            ]),
        }],
        ["3.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-normalize-path-3.0.0-0dcd69ff23a1c9b11fd0978316644a0388216a65/node_modules/normalize-path/"),
            packageDependencies: new Map([
                ["normalize-path", "3.0.0"],
            ]),
        }],
    ])],
    ["remove-trailing-separator", new Map([
        ["1.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-remove-trailing-separator-1.1.0-c24bce2a283adad5bc3f58e0d48249b92379d8ef/node_modules/remove-trailing-separator/"),
            packageDependencies: new Map([
                ["remove-trailing-separator", "1.1.0"],
            ]),
        }],
    ])],
    ["async-each", new Map([
        ["1.0.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-async-each-1.0.3-b727dbf87d7651602f06f4d4ac387f47d91b0cbf/node_modules/async-each/"),
            packageDependencies: new Map([
                ["async-each", "1.0.3"],
            ]),
        }],
    ])],
    ["glob-parent", new Map([
        ["3.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-glob-parent-3.1.0-9e6af6299d8d3bd2bd40430832bd113df906c5ae/node_modules/glob-parent/"),
            packageDependencies: new Map([
                ["is-glob", "3.1.0"],
                ["path-dirname", "1.0.2"],
                ["glob-parent", "3.1.0"],
            ]),
        }],
    ])],
    ["path-dirname", new Map([
        ["1.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-path-dirname-1.0.2-cc33d24d525e099a5388c0336c6e32b9160609e0/node_modules/path-dirname/"),
            packageDependencies: new Map([
                ["path-dirname", "1.0.2"],
            ]),
        }],
    ])],
    ["is-binary-path", new Map([
        ["1.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-binary-path-1.0.1-75f16642b480f187a711c814161fd3a4a7655898/node_modules/is-binary-path/"),
            packageDependencies: new Map([
                ["binary-extensions", "1.13.1"],
                ["is-binary-path", "1.0.1"],
            ]),
        }],
    ])],
    ["binary-extensions", new Map([
        ["1.13.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-binary-extensions-1.13.1-598afe54755b2868a5330d2aff9d4ebb53209b65/node_modules/binary-extensions/"),
            packageDependencies: new Map([
                ["binary-extensions", "1.13.1"],
            ]),
        }],
    ])],
    ["readdirp", new Map([
        ["2.2.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-readdirp-2.2.1-0e87622a3325aa33e892285caf8b4e846529a525/node_modules/readdirp/"),
            packageDependencies: new Map([
                ["graceful-fs", "4.2.3"],
                ["micromatch", "3.1.10"],
                ["readable-stream", "2.3.6"],
                ["readdirp", "2.2.1"],
            ]),
        }],
    ])],
    ["upath", new Map([
        ["1.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-upath-1.2.0-8f66dbcd55a883acdae4408af8b035a5044c1894/node_modules/upath/"),
            packageDependencies: new Map([
                ["upath", "1.2.0"],
            ]),
        }],
    ])],
    ["compression", new Map([
        ["1.7.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-compression-1.7.4-95523eff170ca57c29a0ca41e6fe131f41e5bb8f/node_modules/compression/"),
            packageDependencies: new Map([
                ["accepts", "1.3.7"],
                ["bytes", "3.0.0"],
                ["compressible", "2.0.17"],
                ["debug", "2.6.9"],
                ["on-headers", "1.0.2"],
                ["safe-buffer", "5.1.2"],
                ["vary", "1.1.2"],
                ["compression", "1.7.4"],
            ]),
        }],
    ])],
    ["compressible", new Map([
        ["2.0.17", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-compressible-2.0.17-6e8c108a16ad58384a977f3a482ca20bff2f38c1/node_modules/compressible/"),
            packageDependencies: new Map([
                ["mime-db", "1.42.0"],
                ["compressible", "2.0.17"],
            ]),
        }],
    ])],
    ["on-headers", new Map([
        ["1.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-on-headers-1.0.2-772b0ae6aaa525c399e489adfad90c403eb3c28f/node_modules/on-headers/"),
            packageDependencies: new Map([
                ["on-headers", "1.0.2"],
            ]),
        }],
    ])],
    ["connect-history-api-fallback", new Map([
        ["1.6.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-connect-history-api-fallback-1.6.0-8b32089359308d111115d81cad3fceab888f97bc/node_modules/connect-history-api-fallback/"),
            packageDependencies: new Map([
                ["connect-history-api-fallback", "1.6.0"],
            ]),
        }],
    ])],
    ["del", new Map([
        ["4.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-del-4.1.1-9e8f117222ea44a31ff3a156c049b99052a9f0b4/node_modules/del/"),
            packageDependencies: new Map([
                ["@types/glob", "7.1.1"],
                ["globby", "6.1.0"],
                ["is-path-cwd", "2.2.0"],
                ["is-path-in-cwd", "2.1.0"],
                ["p-map", "2.1.0"],
                ["pify", "4.0.1"],
                ["rimraf", "2.7.1"],
                ["del", "4.1.1"],
            ]),
        }],
    ])],
    ["@types/glob", new Map([
        ["7.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@types-glob-7.1.1-aa59a1c6e3fbc421e07ccd31a944c30eba521575/node_modules/@types/glob/"),
            packageDependencies: new Map([
                ["@types/events", "3.0.0"],
                ["@types/minimatch", "3.0.3"],
                ["@types/node", "12.12.11"],
                ["@types/glob", "7.1.1"],
            ]),
        }],
    ])],
    ["@types/events", new Map([
        ["3.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@types-events-3.0.0-2862f3f58a9a7f7c3e78d79f130dd4d71c25c2a7/node_modules/@types/events/"),
            packageDependencies: new Map([
                ["@types/events", "3.0.0"],
            ]),
        }],
    ])],
    ["@types/minimatch", new Map([
        ["3.0.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@types-minimatch-3.0.3-3dca0e3f33b200fc7d1139c0cd96c1268cadfd9d/node_modules/@types/minimatch/"),
            packageDependencies: new Map([
                ["@types/minimatch", "3.0.3"],
            ]),
        }],
    ])],
    ["@types/node", new Map([
        ["12.12.11", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@types-node-12.12.11-bec2961975888d964196bf0016a2f984d793d3ce/node_modules/@types/node/"),
            packageDependencies: new Map([
                ["@types/node", "12.12.11"],
            ]),
        }],
    ])],
    ["globby", new Map([
        ["6.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-globby-6.1.0-f5a6d70e8395e21c858fb0489d64df02424d506c/node_modules/globby/"),
            packageDependencies: new Map([
                ["array-union", "1.0.2"],
                ["glob", "7.1.6"],
                ["object-assign", "4.1.1"],
                ["pify", "2.3.0"],
                ["pinkie-promise", "2.0.1"],
                ["globby", "6.1.0"],
            ]),
        }],
    ])],
    ["array-union", new Map([
        ["1.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-array-union-1.0.2-9a34410e4f4e3da23dea375be5be70f24778ec39/node_modules/array-union/"),
            packageDependencies: new Map([
                ["array-uniq", "1.0.3"],
                ["array-union", "1.0.2"],
            ]),
        }],
    ])],
    ["array-uniq", new Map([
        ["1.0.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-array-uniq-1.0.3-af6ac877a25cc7f74e058894753858dfdb24fdb6/node_modules/array-uniq/"),
            packageDependencies: new Map([
                ["array-uniq", "1.0.3"],
            ]),
        }],
    ])],
    ["object-assign", new Map([
        ["4.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-object-assign-4.1.1-2109adc7965887cfc05cbbd442cac8bfbb360863/node_modules/object-assign/"),
            packageDependencies: new Map([
                ["object-assign", "4.1.1"],
            ]),
        }],
    ])],
    ["pinkie-promise", new Map([
        ["2.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-pinkie-promise-2.0.1-2135d6dfa7a358c069ac9b178776288228450ffa/node_modules/pinkie-promise/"),
            packageDependencies: new Map([
                ["pinkie", "2.0.4"],
                ["pinkie-promise", "2.0.1"],
            ]),
        }],
    ])],
    ["pinkie", new Map([
        ["2.0.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-pinkie-2.0.4-72556b80cfa0d48a974e80e77248e80ed4f7f870/node_modules/pinkie/"),
            packageDependencies: new Map([
                ["pinkie", "2.0.4"],
            ]),
        }],
    ])],
    ["is-path-cwd", new Map([
        ["2.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-path-cwd-2.2.0-67d43b82664a7b5191fd9119127eb300048a9fdb/node_modules/is-path-cwd/"),
            packageDependencies: new Map([
                ["is-path-cwd", "2.2.0"],
            ]),
        }],
    ])],
    ["is-path-in-cwd", new Map([
        ["2.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-path-in-cwd-2.1.0-bfe2dca26c69f397265a4009963602935a053acb/node_modules/is-path-in-cwd/"),
            packageDependencies: new Map([
                ["is-path-inside", "2.1.0"],
                ["is-path-in-cwd", "2.1.0"],
            ]),
        }],
    ])],
    ["is-path-inside", new Map([
        ["2.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-path-inside-2.1.0-7c9810587d659a40d27bcdb4d5616eab059494b2/node_modules/is-path-inside/"),
            packageDependencies: new Map([
                ["path-is-inside", "1.0.2"],
                ["is-path-inside", "2.1.0"],
            ]),
        }],
    ])],
    ["path-is-inside", new Map([
        ["1.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-path-is-inside-1.0.2-365417dede44430d1c11af61027facf074bdfc53/node_modules/path-is-inside/"),
            packageDependencies: new Map([
                ["path-is-inside", "1.0.2"],
            ]),
        }],
    ])],
    ["html-entities", new Map([
        ["1.2.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-html-entities-1.2.1-0df29351f0721163515dfb9e5543e5f6eed5162f/node_modules/html-entities/"),
            packageDependencies: new Map([
                ["html-entities", "1.2.1"],
            ]),
        }],
    ])],
    ["http-proxy-middleware", new Map([
        ["0.19.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-http-proxy-middleware-0.19.1-183c7dc4aa1479150306498c210cdaf96080a43a/node_modules/http-proxy-middleware/"),
            packageDependencies: new Map([
                ["http-proxy", "1.18.0"],
                ["is-glob", "4.0.1"],
                ["lodash", "4.17.15"],
                ["micromatch", "3.1.10"],
                ["http-proxy-middleware", "0.19.1"],
            ]),
        }],
    ])],
    ["internal-ip", new Map([
        ["4.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-internal-ip-4.3.0-845452baad9d2ca3b69c635a137acb9a0dad0907/node_modules/internal-ip/"),
            packageDependencies: new Map([
                ["default-gateway", "4.2.0"],
                ["ipaddr.js", "1.9.1"],
                ["internal-ip", "4.3.0"],
            ]),
        }],
    ])],
    ["default-gateway", new Map([
        ["4.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-default-gateway-4.2.0-167104c7500c2115f6dd69b0a536bb8ed720552b/node_modules/default-gateway/"),
            packageDependencies: new Map([
                ["execa", "1.0.0"],
                ["ip-regex", "2.1.0"],
                ["default-gateway", "4.2.0"],
            ]),
        }],
    ])],
    ["ip-regex", new Map([
        ["2.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ip-regex-2.1.0-fa78bf5d2e6913c911ce9f819ee5146bb6d844e9/node_modules/ip-regex/"),
            packageDependencies: new Map([
                ["ip-regex", "2.1.0"],
            ]),
        }],
    ])],
    ["is-absolute-url", new Map([
        ["3.0.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-absolute-url-3.0.3-96c6a22b6a23929b11ea0afb1836c36ad4a5d698/node_modules/is-absolute-url/"),
            packageDependencies: new Map([
                ["is-absolute-url", "3.0.3"],
            ]),
        }],
    ])],
    ["killable", new Map([
        ["1.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-killable-1.0.1-4c8ce441187a061c7474fb87ca08e2a638194892/node_modules/killable/"),
            packageDependencies: new Map([
                ["killable", "1.0.1"],
            ]),
        }],
    ])],
    ["loglevel", new Map([
        ["1.6.6", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-loglevel-1.6.6-0ee6300cc058db6b3551fa1c4bf73b83bb771312/node_modules/loglevel/"),
            packageDependencies: new Map([
                ["loglevel", "1.6.6"],
            ]),
        }],
    ])],
    ["opn", new Map([
        ["5.5.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-opn-5.5.0-fc7164fab56d235904c51c3b27da6758ca3b9bfc/node_modules/opn/"),
            packageDependencies: new Map([
                ["is-wsl", "1.1.0"],
                ["opn", "5.5.0"],
            ]),
        }],
    ])],
    ["is-wsl", new Map([
        ["1.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-wsl-1.1.0-1f16e4aa22b04d1336b66188a66af3c600c3a66d/node_modules/is-wsl/"),
            packageDependencies: new Map([
                ["is-wsl", "1.1.0"],
            ]),
        }],
    ])],
    ["p-retry", new Map([
        ["3.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-p-retry-3.0.1-316b4c8893e2c8dc1cfa891f406c4b422bebf328/node_modules/p-retry/"),
            packageDependencies: new Map([
                ["retry", "0.12.0"],
                ["p-retry", "3.0.1"],
            ]),
        }],
    ])],
    ["retry", new Map([
        ["0.12.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-retry-0.12.0-1b42a6266a21f07421d1b0b54b7dc167b01c013b/node_modules/retry/"),
            packageDependencies: new Map([
                ["retry", "0.12.0"],
            ]),
        }],
    ])],
    ["ajv-errors", new Map([
        ["1.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ajv-errors-1.0.1-f35986aceb91afadec4102fbd85014950cefa64d/node_modules/ajv-errors/"),
            packageDependencies: new Map([
                ["ajv", "6.10.2"],
                ["ajv-errors", "1.0.1"],
            ]),
        }],
    ])],
    ["selfsigned", new Map([
        ["1.10.7", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-selfsigned-1.10.7-da5819fd049d5574f28e88a9bcc6dbc6e6f3906b/node_modules/selfsigned/"),
            packageDependencies: new Map([
                ["node-forge", "0.9.0"],
                ["selfsigned", "1.10.7"],
            ]),
        }],
    ])],
    ["node-forge", new Map([
        ["0.9.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-node-forge-0.9.0-d624050edbb44874adca12bb9a52ec63cb782579/node_modules/node-forge/"),
            packageDependencies: new Map([
                ["node-forge", "0.9.0"],
            ]),
        }],
    ])],
    ["serve-index", new Map([
        ["1.9.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-serve-index-1.9.1-d3768d69b1e7d82e5ce050fff5b453bea12a9239/node_modules/serve-index/"),
            packageDependencies: new Map([
                ["accepts", "1.3.7"],
                ["batch", "0.6.1"],
                ["debug", "2.6.9"],
                ["escape-html", "1.0.3"],
                ["http-errors", "1.6.3"],
                ["mime-types", "2.1.25"],
                ["parseurl", "1.3.3"],
                ["serve-index", "1.9.1"],
            ]),
        }],
    ])],
    ["batch", new Map([
        ["0.6.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-batch-0.6.1-dc34314f4e679318093fc760272525f94bf25c16/node_modules/batch/"),
            packageDependencies: new Map([
                ["batch", "0.6.1"],
            ]),
        }],
    ])],
    ["sockjs", new Map([
        ["0.3.19", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-sockjs-0.3.19-d976bbe800af7bd20ae08598d582393508993c0d/node_modules/sockjs/"),
            packageDependencies: new Map([
                ["faye-websocket", "0.10.0"],
                ["uuid", "3.3.3"],
                ["sockjs", "0.3.19"],
            ]),
        }],
    ])],
    ["faye-websocket", new Map([
        ["0.10.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-faye-websocket-0.10.0-4e492f8d04dfb6f89003507f6edbf2d501e7c6f4/node_modules/faye-websocket/"),
            packageDependencies: new Map([
                ["websocket-driver", "0.7.3"],
                ["faye-websocket", "0.10.0"],
            ]),
        }],
        ["0.11.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-faye-websocket-0.11.3-5c0e9a8968e8912c286639fde977a8b209f2508e/node_modules/faye-websocket/"),
            packageDependencies: new Map([
                ["websocket-driver", "0.7.3"],
                ["faye-websocket", "0.11.3"],
            ]),
        }],
    ])],
    ["websocket-driver", new Map([
        ["0.7.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-websocket-driver-0.7.3-a2d4e0d4f4f116f1e6297eba58b05d430100e9f9/node_modules/websocket-driver/"),
            packageDependencies: new Map([
                ["http-parser-js", "0.4.10"],
                ["safe-buffer", "5.2.0"],
                ["websocket-extensions", "0.1.3"],
                ["websocket-driver", "0.7.3"],
            ]),
        }],
    ])],
    ["http-parser-js", new Map([
        ["0.4.10", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-http-parser-js-0.4.10-92c9c1374c35085f75db359ec56cc257cbb93fa4/node_modules/http-parser-js/"),
            packageDependencies: new Map([
                ["http-parser-js", "0.4.10"],
            ]),
        }],
    ])],
    ["websocket-extensions", new Map([
        ["0.1.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-websocket-extensions-0.1.3-5d2ff22977003ec687a4b87073dfbbac146ccf29/node_modules/websocket-extensions/"),
            packageDependencies: new Map([
                ["websocket-extensions", "0.1.3"],
            ]),
        }],
    ])],
    ["uuid", new Map([
        ["3.3.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-uuid-3.3.3-4568f0216e78760ee1dbf3a4d2cf53e224112866/node_modules/uuid/"),
            packageDependencies: new Map([
                ["uuid", "3.3.3"],
            ]),
        }],
    ])],
    ["sockjs-client", new Map([
        ["1.4.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-sockjs-client-1.4.0-c9f2568e19c8fd8173b4997ea3420e0bb306c7d5/node_modules/sockjs-client/"),
            packageDependencies: new Map([
                ["debug", "3.2.6"],
                ["eventsource", "1.0.7"],
                ["faye-websocket", "0.11.3"],
                ["inherits", "2.0.4"],
                ["json3", "3.3.3"],
                ["url-parse", "1.4.7"],
                ["sockjs-client", "1.4.0"],
            ]),
        }],
    ])],
    ["eventsource", new Map([
        ["1.0.7", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-eventsource-1.0.7-8fbc72c93fcd34088090bc0a4e64f4b5cee6d8d0/node_modules/eventsource/"),
            packageDependencies: new Map([
                ["original", "1.0.2"],
                ["eventsource", "1.0.7"],
            ]),
        }],
    ])],
    ["original", new Map([
        ["1.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-original-1.0.2-e442a61cffe1c5fd20a65f3261c26663b303f25f/node_modules/original/"),
            packageDependencies: new Map([
                ["url-parse", "1.4.7"],
                ["original", "1.0.2"],
            ]),
        }],
    ])],
    ["url-parse", new Map([
        ["1.4.7", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-url-parse-1.4.7-a8a83535e8c00a316e403a5db4ac1b9b853ae278/node_modules/url-parse/"),
            packageDependencies: new Map([
                ["querystringify", "2.1.1"],
                ["requires-port", "1.0.0"],
                ["url-parse", "1.4.7"],
            ]),
        }],
    ])],
    ["querystringify", new Map([
        ["2.1.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-querystringify-2.1.1-60e5a5fd64a7f8bfa4d2ab2ed6fdf4c85bad154e/node_modules/querystringify/"),
            packageDependencies: new Map([
                ["querystringify", "2.1.1"],
            ]),
        }],
    ])],
    ["json3", new Map([
        ["3.3.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-json3-3.3.3-7fc10e375fc5ae42c4705a5cc0aa6f62be305b81/node_modules/json3/"),
            packageDependencies: new Map([
                ["json3", "3.3.3"],
            ]),
        }],
    ])],
    ["spdy", new Map([
        ["4.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-spdy-4.0.1-6f12ed1c5db7ea4f24ebb8b89ba58c87c08257f2/node_modules/spdy/"),
            packageDependencies: new Map([
                ["debug", "4.1.1"],
                ["handle-thing", "2.0.0"],
                ["http-deceiver", "1.2.7"],
                ["select-hose", "2.0.0"],
                ["spdy-transport", "3.0.0"],
                ["spdy", "4.0.1"],
            ]),
        }],
    ])],
    ["handle-thing", new Map([
        ["2.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-handle-thing-2.0.0-0e039695ff50c93fc288557d696f3c1dc6776754/node_modules/handle-thing/"),
            packageDependencies: new Map([
                ["handle-thing", "2.0.0"],
            ]),
        }],
    ])],
    ["http-deceiver", new Map([
        ["1.2.7", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-http-deceiver-1.2.7-fa7168944ab9a519d337cb0bec7284dc3e723d87/node_modules/http-deceiver/"),
            packageDependencies: new Map([
                ["http-deceiver", "1.2.7"],
            ]),
        }],
    ])],
    ["select-hose", new Map([
        ["2.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-select-hose-2.0.0-625d8658f865af43ec962bfc376a37359a4994ca/node_modules/select-hose/"),
            packageDependencies: new Map([
                ["select-hose", "2.0.0"],
            ]),
        }],
    ])],
    ["spdy-transport", new Map([
        ["3.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-spdy-transport-3.0.0-00d4863a6400ad75df93361a1608605e5dcdcf31/node_modules/spdy-transport/"),
            packageDependencies: new Map([
                ["debug", "4.1.1"],
                ["detect-node", "2.0.4"],
                ["hpack.js", "2.1.6"],
                ["obuf", "1.1.2"],
                ["readable-stream", "3.4.0"],
                ["wbuf", "1.7.3"],
                ["spdy-transport", "3.0.0"],
            ]),
        }],
    ])],
    ["detect-node", new Map([
        ["2.0.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-detect-node-2.0.4-014ee8f8f669c5c58023da64b8179c083a28c46c/node_modules/detect-node/"),
            packageDependencies: new Map([
                ["detect-node", "2.0.4"],
            ]),
        }],
    ])],
    ["hpack.js", new Map([
        ["2.1.6", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-hpack-js-2.1.6-87774c0949e513f42e84575b3c45681fade2a0b2/node_modules/hpack.js/"),
            packageDependencies: new Map([
                ["inherits", "2.0.4"],
                ["obuf", "1.1.2"],
                ["readable-stream", "2.3.6"],
                ["wbuf", "1.7.3"],
                ["hpack.js", "2.1.6"],
            ]),
        }],
    ])],
    ["obuf", new Map([
        ["1.1.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-obuf-1.1.2-09bea3343d41859ebd446292d11c9d4db619084e/node_modules/obuf/"),
            packageDependencies: new Map([
                ["obuf", "1.1.2"],
            ]),
        }],
    ])],
    ["wbuf", new Map([
        ["1.7.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-wbuf-1.7.3-c1d8d149316d3ea852848895cb6a0bfe887b87df/node_modules/wbuf/"),
            packageDependencies: new Map([
                ["minimalistic-assert", "1.0.1"],
                ["wbuf", "1.7.3"],
            ]),
        }],
    ])],
    ["minimalistic-assert", new Map([
        ["1.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-minimalistic-assert-1.0.1-2e194de044626d4a10e7f7fbc00ce73e83e4d5c7/node_modules/minimalistic-assert/"),
            packageDependencies: new Map([
                ["minimalistic-assert", "1.0.1"],
            ]),
        }],
    ])],
    ["url", new Map([
        ["0.11.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-url-0.11.0-3838e97cfc60521eb73c525a8e55bfdd9e2e28f1/node_modules/url/"),
            packageDependencies: new Map([
                ["punycode", "1.3.2"],
                ["querystring", "0.2.0"],
                ["url", "0.11.0"],
            ]),
        }],
    ])],
    ["querystring", new Map([
        ["0.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-querystring-0.2.0-b209849203bb25df820da756e747005878521620/node_modules/querystring/"),
            packageDependencies: new Map([
                ["querystring", "0.2.0"],
            ]),
        }],
    ])],
    ["webpack-dev-middleware", new Map([
        ["3.7.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-webpack-dev-middleware-3.7.2-0019c3db716e3fa5cecbf64f2ab88a74bab331f3/node_modules/webpack-dev-middleware/"),
            packageDependencies: new Map([
                ["webpack", "5.0.0-beta.7"],
                ["memory-fs", "0.4.1"],
                ["mime", "2.4.4"],
                ["mkdirp", "0.5.1"],
                ["range-parser", "1.2.1"],
                ["webpack-log", "2.0.0"],
                ["webpack-dev-middleware", "3.7.2"],
            ]),
        }],
    ])],
    ["webpack-log", new Map([
        ["2.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-webpack-log-2.0.0-5b7928e0637593f119d32f6227c1e0ac31e1b47f/node_modules/webpack-log/"),
            packageDependencies: new Map([
                ["ansi-colors", "3.2.4"],
                ["uuid", "3.3.3"],
                ["webpack-log", "2.0.0"],
            ]),
        }],
    ])],
    ["ansi-colors", new Map([
        ["3.2.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ansi-colors-3.2.4-e3a3da4bfbae6c86a9c285625de124a234026fbf/node_modules/ansi-colors/"),
            packageDependencies: new Map([
                ["ansi-colors", "3.2.4"],
            ]),
        }],
    ])],
    ["code-point-at", new Map([
        ["1.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-code-point-at-1.1.0-0d070b4d043a5bea33a2f1a40e2edb3d9a4ccf77/node_modules/code-point-at/"),
            packageDependencies: new Map([
                ["code-point-at", "1.1.0"],
            ]),
        }],
    ])],
    ["webpack-manifest-plugin", new Map([
        ["3.0.0-rc.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-webpack-manifest-plugin-3.0.0-rc.0-d488cc34d9509aa4ffcf98eee8559d9106195e2a/node_modules/webpack-manifest-plugin/"),
            packageDependencies: new Map([
                ["webpack", "5.0.0-beta.7"],
                ["fs-extra", "8.1.0"],
                ["lodash", "4.17.15"],
                ["tapable", "1.1.3"],
                ["webpack-manifest-plugin", "3.0.0-rc.0"],
            ]),
        }],
    ])],
    ["fs-extra", new Map([
        ["8.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-fs-extra-8.1.0-49d43c45a88cd9677668cb7be1b46efdb8d2e1c0/node_modules/fs-extra/"),
            packageDependencies: new Map([
                ["graceful-fs", "4.2.3"],
                ["jsonfile", "4.0.0"],
                ["universalify", "0.1.2"],
                ["fs-extra", "8.1.0"],
            ]),
        }],
    ])],
    ["jsonfile", new Map([
        ["4.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-jsonfile-4.0.0-8771aae0799b64076b76640fca058f9c10e33ecb/node_modules/jsonfile/"),
            packageDependencies: new Map([
                ["graceful-fs", "4.2.3"],
                ["jsonfile", "4.0.0"],
            ]),
        }],
    ])],
    ["universalify", new Map([
        ["0.1.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-universalify-0.1.2-b646f69be3942dabcecc9d6639c80dc105efaa66/node_modules/universalify/"),
            packageDependencies: new Map([
                ["universalify", "0.1.2"],
            ]),
        }],
    ])],
    ["webpack-merge", new Map([
        ["4.2.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-webpack-merge-4.2.2-a27c52ea783d1398afd2087f547d7b9d2f43634d/node_modules/webpack-merge/"),
            packageDependencies: new Map([
                ["lodash", "4.17.15"],
                ["webpack-merge", "4.2.2"],
            ]),
        }],
    ])],
    ["webpack-polyfill-injector", new Map([
        ["3.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-webpack-polyfill-injector-3.0.2-1e2028c03c346163810735d6b29ed23ee34782a9/node_modules/webpack-polyfill-injector/"),
            packageDependencies: new Map([
                ["webpack", "5.0.0-beta.7"],
                ["loader-utils", "1.2.3"],
                ["polyfill-library", "3.42.0"],
                ["webpack-sources", "1.4.3"],
                ["webpack-polyfill-injector", "3.0.2"],
            ]),
        }],
    ])],
    ["polyfill-library", new Map([
        ["3.42.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-polyfill-library-3.42.0-36589ecaf8e970b23d8cc47a272b2aa543586502/node_modules/polyfill-library/"),
            packageDependencies: new Map([
                ["@financial-times/polyfill-useragent-normaliser", "1.5.0"],
                ["@iarna/toml", "2.2.3"],
                ["@webcomponents/template", "1.4.1"],
                ["Base64", "1.1.0"],
                ["abort-controller", "2.0.3"],
                ["audio-context-polyfill", "1.0.0"],
                ["diff", "1.4.0"],
                ["event-source-polyfill", "0.0.9"],
                ["from2-string", "1.1.0"],
                ["glob", "7.1.6"],
                ["graceful-fs", "4.2.3"],
                ["html5shiv", "3.7.3"],
                ["intersection-observer", "0.4.3"],
                ["intl", "1.2.5"],
                ["js-polyfills", "0.1.42"],
                ["json3", "3.3.3"],
                ["lazystream", "1.0.0"],
                ["merge2", "1.3.0"],
                ["mkdirp", "0.5.1"],
                ["mnemonist", "0.27.2"],
                ["mutationobserver-shim", "0.3.3"],
                ["picturefill", "3.0.3"],
                ["resize-observer-polyfill", "1.5.1"],
                ["rimraf", "2.7.1"],
                ["smoothscroll-polyfill", "0.4.4"],
                ["spdx-licenses", "1.0.0"],
                ["stream-cache", "0.0.2"],
                ["stream-from-promise", "1.0.0"],
                ["stream-to-string", "1.2.0"],
                ["toposort", "2.0.2"],
                ["uglify-js", "2.8.29"],
                ["unorm", "1.6.0"],
                ["usertiming", "0.1.8"],
                ["web-animations-js", "2.3.2"],
                ["whatwg-fetch", "3.0.0"],
                ["wicg-inert", "2.2.1"],
                ["yaku", "0.18.6"],
                ["polyfill-library", "3.42.0"],
            ]),
        }],
    ])],
    ["@financial-times/polyfill-useragent-normaliser", new Map([
        ["1.5.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@financial-times-polyfill-useragent-normaliser-1.5.0-a7aa88dba9844bc1fdaaa0c7ebaf9bab5fd8f939/node_modules/@financial-times/polyfill-useragent-normaliser/"),
            packageDependencies: new Map([
                ["@financial-times/useragent_parser", "1.3.1"],
                ["semver", "5.7.1"],
                ["@financial-times/polyfill-useragent-normaliser", "1.5.0"],
            ]),
        }],
    ])],
    ["@financial-times/useragent_parser", new Map([
        ["1.3.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@financial-times-useragent-parser-1.3.1-1c94068435a2dd40006f780f116cc72824ff6c02/node_modules/@financial-times/useragent_parser/"),
            packageDependencies: new Map([
                ["@financial-times/useragent_parser", "1.3.1"],
            ]),
        }],
    ])],
    ["@iarna/toml", new Map([
        ["2.2.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@iarna-toml-2.2.3-f060bf6eaafae4d56a7dac618980838b0696e2ab/node_modules/@iarna/toml/"),
            packageDependencies: new Map([
                ["@iarna/toml", "2.2.3"],
            ]),
        }],
    ])],
    ["@webcomponents/template", new Map([
        ["1.4.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webcomponents-template-1.4.1-0ac6fa2053701e067829bf20c8304888472c7382/node_modules/@webcomponents/template/"),
            packageDependencies: new Map([
                ["@webcomponents/template", "1.4.1"],
            ]),
        }],
    ])],
    ["Base64", new Map([
        ["1.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ase64-1.1.0-810ef21afa8357df92ad7b5389188c446b9cb956/node_modules/Base64/"),
            packageDependencies: new Map([
                ["Base64", "1.1.0"],
            ]),
        }],
    ])],
    ["abort-controller", new Map([
        ["2.0.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-abort-controller-2.0.3-b174827a732efadff81227ed4b8d1cc569baf20a/node_modules/abort-controller/"),
            packageDependencies: new Map([
                ["event-target-shim", "5.0.1"],
                ["abort-controller", "2.0.3"],
            ]),
        }],
    ])],
    ["event-target-shim", new Map([
        ["5.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-event-target-shim-5.0.1-5d4d3ebdf9583d63a5333ce2deb7480ab2b05789/node_modules/event-target-shim/"),
            packageDependencies: new Map([
                ["event-target-shim", "5.0.1"],
            ]),
        }],
    ])],
    ["audio-context-polyfill", new Map([
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-audio-context-polyfill-1.0.0-4b728faf0a19555194d4fbd05582f833fdcd137b/node_modules/audio-context-polyfill/"),
            packageDependencies: new Map([
                ["audio-context-polyfill", "1.0.0"],
            ]),
        }],
    ])],
    ["event-source-polyfill", new Map([
        ["0.0.9", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-event-source-polyfill-0.0.9-18c6205d170ab09db889ffceaa33f0e493f14a50/node_modules/event-source-polyfill/"),
            packageDependencies: new Map([
                ["event-source-polyfill", "0.0.9"],
            ]),
        }],
    ])],
    ["from2-string", new Map([
        ["1.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-from2-string-1.1.0-18282b27d08a267cb3030cd2b8b4b0f212af752a/node_modules/from2-string/"),
            packageDependencies: new Map([
                ["from2", "2.3.0"],
                ["from2-string", "1.1.0"],
            ]),
        }],
    ])],
    ["from2", new Map([
        ["2.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-from2-2.3.0-8bfb5502bde4a4d36cfdeea007fcca21d7e382af/node_modules/from2/"),
            packageDependencies: new Map([
                ["inherits", "2.0.4"],
                ["readable-stream", "2.3.6"],
                ["from2", "2.3.0"],
            ]),
        }],
    ])],
    ["html5shiv", new Map([
        ["3.7.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-html5shiv-3.7.3-d78a84a367bcb9a710100d57802c387b084631d2/node_modules/html5shiv/"),
            packageDependencies: new Map([
                ["html5shiv", "3.7.3"],
            ]),
        }],
    ])],
    ["intersection-observer", new Map([
        ["0.4.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-intersection-observer-0.4.3-22ff07442269d8be694551a782e0b081ecd4adfd/node_modules/intersection-observer/"),
            packageDependencies: new Map([
                ["intersection-observer", "0.4.3"],
            ]),
        }],
    ])],
    ["intl", new Map([
        ["1.2.5", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-intl-1.2.5-82244a2190c4e419f8371f5aa34daa3420e2abde/node_modules/intl/"),
            packageDependencies: new Map([
                ["intl", "1.2.5"],
            ]),
        }],
    ])],
    ["js-polyfills", new Map([
        ["0.1.42", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-js-polyfills-0.1.42-5d484902b361e3cf601fd23ad0f30bafcc93f148/node_modules/js-polyfills/"),
            packageDependencies: new Map([
                ["js-polyfills", "0.1.42"],
            ]),
        }],
    ])],
    ["lazystream", new Map([
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-lazystream-1.0.0-f6995fe0f820392f61396be89462407bb77168e4/node_modules/lazystream/"),
            packageDependencies: new Map([
                ["readable-stream", "2.3.6"],
                ["lazystream", "1.0.0"],
            ]),
        }],
    ])],
    ["merge2", new Map([
        ["1.3.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-merge2-1.3.0-5b366ee83b2f1582c48f87e47cf1a9352103ca81/node_modules/merge2/"),
            packageDependencies: new Map([
                ["merge2", "1.3.0"],
            ]),
        }],
    ])],
    ["mnemonist", new Map([
        ["0.27.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-mnemonist-0.27.2-c56a8ad5345b9089604a1aa0af8610480717e40a/node_modules/mnemonist/"),
            packageDependencies: new Map([
                ["obliterator", "1.5.0"],
                ["mnemonist", "0.27.2"],
            ]),
        }],
    ])],
    ["obliterator", new Map([
        ["1.5.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-obliterator-1.5.0-f3535e5be192473ef59efb2d30396738f7c645c6/node_modules/obliterator/"),
            packageDependencies: new Map([
                ["obliterator", "1.5.0"],
            ]),
        }],
    ])],
    ["mutationobserver-shim", new Map([
        ["0.3.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-mutationobserver-shim-0.3.3-65869630bc89d7bf8c9cd9cb82188cd955aacd2b/node_modules/mutationobserver-shim/"),
            packageDependencies: new Map([
                ["mutationobserver-shim", "0.3.3"],
            ]),
        }],
    ])],
    ["picturefill", new Map([
        ["3.0.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-picturefill-3.0.3-a5c38eeb02d74def38e1790ff61e166166b4f224/node_modules/picturefill/"),
            packageDependencies: new Map([
                ["picturefill", "3.0.3"],
            ]),
        }],
    ])],
    ["resize-observer-polyfill", new Map([
        ["1.5.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-resize-observer-polyfill-1.5.1-0e9020dd3d21024458d4ebd27e23e40269810464/node_modules/resize-observer-polyfill/"),
            packageDependencies: new Map([
                ["resize-observer-polyfill", "1.5.1"],
            ]),
        }],
    ])],
    ["smoothscroll-polyfill", new Map([
        ["0.4.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-smoothscroll-polyfill-0.4.4-3a259131dc6930e6ca80003e1cb03b603b69abf8/node_modules/smoothscroll-polyfill/"),
            packageDependencies: new Map([
                ["smoothscroll-polyfill", "0.4.4"],
            ]),
        }],
    ])],
    ["spdx-licenses", new Map([
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-spdx-licenses-1.0.0-e883cc8fab52cbfea9acc5cf6cb01244b08eff79/node_modules/spdx-licenses/"),
            packageDependencies: new Map([
                ["debug", "4.1.1"],
                ["is2", "2.0.1"],
                ["spdx-licenses", "1.0.0"],
            ]),
        }],
    ])],
    ["is2", new Map([
        ["2.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is2-2.0.1-8ac355644840921ce435d94f05d3a94634d3481a/node_modules/is2/"),
            packageDependencies: new Map([
                ["deep-is", "0.1.3"],
                ["ip-regex", "2.1.0"],
                ["is-url", "1.2.4"],
                ["is2", "2.0.1"],
            ]),
        }],
    ])],
    ["deep-is", new Map([
        ["0.1.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-deep-is-0.1.3-b369d6fb5dbc13eecf524f91b070feedc357cf34/node_modules/deep-is/"),
            packageDependencies: new Map([
                ["deep-is", "0.1.3"],
            ]),
        }],
    ])],
    ["is-url", new Map([
        ["1.2.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-url-1.2.4-04a4df46d28c4cff3d73d01ff06abeb318a1aa52/node_modules/is-url/"),
            packageDependencies: new Map([
                ["is-url", "1.2.4"],
            ]),
        }],
    ])],
    ["stream-cache", new Map([
        ["0.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-stream-cache-0.0.2-1ac5ad6832428ca55667dbdee395dad4e6db118f/node_modules/stream-cache/"),
            packageDependencies: new Map([
                ["stream-cache", "0.0.2"],
            ]),
        }],
    ])],
    ["stream-from-promise", new Map([
        ["1.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-stream-from-promise-1.0.0-763687f7dd777e4c894f6408333fc6b3fc8a61bb/node_modules/stream-from-promise/"),
            packageDependencies: new Map([
                ["stream-from-promise", "1.0.0"],
            ]),
        }],
    ])],
    ["stream-to-string", new Map([
        ["1.2.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-stream-to-string-1.2.0-3ca506a097ecbf78b0e0aee0b6fa5c4565412a15/node_modules/stream-to-string/"),
            packageDependencies: new Map([
                ["promise-polyfill", "1.1.6"],
                ["stream-to-string", "1.2.0"],
            ]),
        }],
    ])],
    ["promise-polyfill", new Map([
        ["1.1.6", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-promise-polyfill-1.1.6-cd04eff46f5c95c3a7d045591d79b5e3e01f12d7/node_modules/promise-polyfill/"),
            packageDependencies: new Map([
                ["promise-polyfill", "1.1.6"],
            ]),
        }],
    ])],
    ["toposort", new Map([
        ["2.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-toposort-2.0.2-ae21768175d1559d48bef35420b2f4962f09c330/node_modules/toposort/"),
            packageDependencies: new Map([
                ["toposort", "2.0.2"],
            ]),
        }],
    ])],
    ["center-align", new Map([
        ["0.1.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-center-align-0.1.3-aa0d32629b6ee972200411cbd4461c907bc2b7ad/node_modules/center-align/"),
            packageDependencies: new Map([
                ["align-text", "0.1.4"],
                ["lazy-cache", "1.0.4"],
                ["center-align", "0.1.3"],
            ]),
        }],
    ])],
    ["align-text", new Map([
        ["0.1.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-align-text-0.1.4-0cd90a561093f35d0a99256c22b7069433fad117/node_modules/align-text/"),
            packageDependencies: new Map([
                ["kind-of", "3.2.2"],
                ["longest", "1.0.1"],
                ["repeat-string", "1.6.1"],
                ["align-text", "0.1.4"],
            ]),
        }],
    ])],
    ["longest", new Map([
        ["1.0.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-longest-1.0.1-30a0b2da38f73770e8294a0d22e6625ed77d0097/node_modules/longest/"),
            packageDependencies: new Map([
                ["longest", "1.0.1"],
            ]),
        }],
    ])],
    ["lazy-cache", new Map([
        ["1.0.4", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-lazy-cache-1.0.4-a1d78fc3a50474cb80845d3b3b6e1da49a446e8e/node_modules/lazy-cache/"),
            packageDependencies: new Map([
                ["lazy-cache", "1.0.4"],
            ]),
        }],
    ])],
    ["right-align", new Map([
        ["0.1.3", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-right-align-0.1.3-61339b722fe6a3515689210d24e14c96148613ef/node_modules/right-align/"),
            packageDependencies: new Map([
                ["align-text", "0.1.4"],
                ["right-align", "0.1.3"],
            ]),
        }],
    ])],
    ["window-size", new Map([
        ["0.1.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-window-size-0.1.0-5438cd2ea93b202efa3a19fe8887aee7c94f9c9d/node_modules/window-size/"),
            packageDependencies: new Map([
                ["window-size", "0.1.0"],
            ]),
        }],
    ])],
    ["uglify-to-browserify", new Map([
        ["1.0.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-uglify-to-browserify-1.0.2-6e0924d6bda6b5afe349e39a6d632850a0f882b7/node_modules/uglify-to-browserify/"),
            packageDependencies: new Map([
                ["uglify-to-browserify", "1.0.2"],
            ]),
        }],
    ])],
    ["unorm", new Map([
        ["1.6.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-unorm-1.6.0-029b289661fba714f1a9af439eb51d9b16c205af/node_modules/unorm/"),
            packageDependencies: new Map([
                ["unorm", "1.6.0"],
            ]),
        }],
    ])],
    ["usertiming", new Map([
        ["0.1.8", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-usertiming-0.1.8-35378e7f41a248d40e658d05f80423469a7b0650/node_modules/usertiming/"),
            packageDependencies: new Map([
                ["usertiming", "0.1.8"],
            ]),
        }],
    ])],
    ["web-animations-js", new Map([
        ["2.3.2", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-web-animations-js-2.3.2-a51963a359c543f97b47c7d4bc2d811f9fc9e153/node_modules/web-animations-js/"),
            packageDependencies: new Map([
                ["web-animations-js", "2.3.2"],
            ]),
        }],
    ])],
    ["whatwg-fetch", new Map([
        ["3.0.0", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-whatwg-fetch-3.0.0-fc804e458cc460009b1a2b966bc8817d2578aefb/node_modules/whatwg-fetch/"),
            packageDependencies: new Map([
                ["whatwg-fetch", "3.0.0"],
            ]),
        }],
    ])],
    ["wicg-inert", new Map([
        ["2.2.1", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-wicg-inert-2.2.1-8128c0f05f0608415ed19ae2c97b925925159804/node_modules/wicg-inert/"),
            packageDependencies: new Map([
                ["wicg-inert", "2.2.1"],
            ]),
        }],
    ])],
    ["yaku", new Map([
        ["0.18.6", {
            packageLocation: path.resolve(__dirname, "../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-yaku-0.18.6-3840096629774c5c0756a4105a545e441087f9da/node_modules/yaku/"),
            packageDependencies: new Map([
                ["yaku", "0.18.6"],
            ]),
        }],
    ])],
    [null, new Map([
        [null, {
            packageLocation: path.resolve(__dirname, "./"),
            packageDependencies: new Map([
                ["@babel/core", "7.7.2"],
                ["@babel/plugin-proposal-class-properties", "7.7.0"],
                ["@babel/plugin-proposal-decorators", "7.7.0"],
                ["@babel/plugin-proposal-export-default-from", "7.5.2"],
                ["@babel/plugin-proposal-export-namespace-from", "7.5.2"],
                ["@babel/plugin-proposal-function-sent", "7.7.0"],
                ["@babel/plugin-proposal-json-strings", "pnp:95b7255d806e48378a73c6255b1d4c3917494842"],
                ["@babel/plugin-proposal-numeric-separator", "7.2.0"],
                ["@babel/plugin-proposal-object-rest-spread", "7.7.4"],
                ["@babel/plugin-proposal-optional-chaining", "7.6.0"],
                ["@babel/plugin-proposal-private-methods", "7.7.4"],
                ["@babel/plugin-proposal-throw-expressions", "7.2.0"],
                ["@babel/plugin-syntax-dynamic-import", "pnp:dca2d6f7fc46ba4c77c5e8686a6350625873747d"],
                ["@babel/plugin-syntax-flow", "7.7.4"],
                ["@babel/plugin-syntax-import-meta", "7.2.0"],
                ["@babel/plugin-transform-flow-strip-types", "pnp:968d630ee766ba18b9af0c11cba1fb8f929ca617"],
                ["@babel/plugin-transform-runtime", "7.6.2"],
                ["@babel/preset-env", "7.7.1"],
                ["@babel/preset-flow", "7.0.0"],
                ["@babel/runtime", "7.7.2"],
                ["babel-loader", "8.0.6"],
                ["babel-minify", "0.5.1"],
                ["babel-minify-webpack-plugin", "0.3.1"],
                ["babel-preset-minify", "0.5.1"],
                ["circular-dependency-plugin", "5.2.0"],
                ["copyfiles", "2.1.1"],
                ["diff", "4.0.1"],
                ["duplicate-package-checker-webpack-plugin", "3.0.0"],
                ["eslint-plugin-flowtype", "4.5.2"],
                ["flow-bin", "0.112.0"],
                ["html-webpack-plugin", "4.0.0-beta.8"],
                ["http-server", "0.11.1"],
                ["parallel-webpack", "2.4.0"],
                ["rimraf", "3.0.0"],
                ["script-ext-html-webpack-plugin", "2.1.4"],
                ["webpack", "5.0.0-beta.7"],
                ["webpack-bundle-analyzer", "3.6.0"],
                ["webpack-cli", "3.3.10"],
                ["webpack-dev-server", "3.9.0"],
                ["webpack-manifest-plugin", "3.0.0-rc.0"],
                ["webpack-merge", "4.2.2"],
                ["webpack-polyfill-injector", "3.0.2"],
                ["querystring", "0.2.0"],
            ]),
        }],
    ])],
]);

let locatorsByLocations = new Map([
    ["./.pnp/externals/pnp-95b7255d806e48378a73c6255b1d4c3917494842/node_modules/@babel/plugin-proposal-json-strings/", blacklistedLocator],
    ["./.pnp/externals/pnp-dca2d6f7fc46ba4c77c5e8686a6350625873747d/node_modules/@babel/plugin-syntax-dynamic-import/", blacklistedLocator],
    ["./.pnp/externals/pnp-968d630ee766ba18b9af0c11cba1fb8f929ca617/node_modules/@babel/plugin-transform-flow-strip-types/", blacklistedLocator],
    ["./.pnp/externals/pnp-83fed53edb56c6d4a44663771c2953b964853068/node_modules/@babel/helper-create-class-features-plugin/", blacklistedLocator],
    ["./.pnp/externals/pnp-f2d928359c86b6fd803fa60b9c6c5e57b0d39a07/node_modules/@babel/helper-create-class-features-plugin/", blacklistedLocator],
    ["./.pnp/externals/pnp-b070ab5530b4c80bc1fc46ce2024e469e5d7fbdb/node_modules/@babel/plugin-syntax-json-strings/", blacklistedLocator],
    ["./.pnp/externals/pnp-1ced04ae106d776a5bb9c7c6b8070f960b5cccbb/node_modules/@babel/plugin-proposal-json-strings/", blacklistedLocator],
    ["./.pnp/externals/pnp-c3762f2effb1ef896fed6137769e7cbce250079e/node_modules/@babel/plugin-syntax-async-generators/", blacklistedLocator],
    ["./.pnp/externals/pnp-4c795551df188e40f630a551aca3f0b67d712d91/node_modules/@babel/plugin-syntax-dynamic-import/", blacklistedLocator],
    ["./.pnp/externals/pnp-2830c17de82a10d46b198a052d8defa1fc4566a1/node_modules/@babel/plugin-syntax-json-strings/", blacklistedLocator],
    ["./.pnp/externals/pnp-f74e4a3f79bc77f6007dc94310a63c1df2a4ed04/node_modules/@babel/plugin-syntax-object-rest-spread/", blacklistedLocator],
    ["./.pnp/externals/pnp-1535a3cdab988c4b77ae582ee936d0c8523246dc/node_modules/@babel/plugin-syntax-optional-catch-binding/", blacklistedLocator],
    ["./.pnp/externals/pnp-7647dcedd7cea865fe6006a2ceae5b654356fc45/node_modules/@babel/plugin-syntax-async-generators/", blacklistedLocator],
    ["./.pnp/externals/pnp-3c1bc8676e7033b9f0989a5079b420b93d99b950/node_modules/@babel/plugin-syntax-dynamic-import/", blacklistedLocator],
    ["./.pnp/externals/pnp-fd98af3495c3c6f1203613fc06648c76c2b60d3b/node_modules/@babel/plugin-syntax-json-strings/", blacklistedLocator],
    ["./.pnp/externals/pnp-38603f6e818eb5a82002bf59036b8fdb0abb4079/node_modules/@babel/plugin-syntax-object-rest-spread/", blacklistedLocator],
    ["./.pnp/externals/pnp-3370d07367235b9c5a1cb9b71ec55425520b8884/node_modules/@babel/plugin-syntax-optional-catch-binding/", blacklistedLocator],
    ["./.pnp/externals/pnp-da3fcd7cc0d19352a9f0005ab0a3aba6e38e1da6/node_modules/@babel/helper-create-regexp-features-plugin/", blacklistedLocator],
    ["./.pnp/externals/pnp-c1d07d59eb251071bf95817fbc2720a2de9825c5/node_modules/@babel/helper-create-regexp-features-plugin/", blacklistedLocator],
    ["./.pnp/externals/pnp-73743d202a8c421645fe70f62867b9ce94402827/node_modules/@babel/helper-create-regexp-features-plugin/", blacklistedLocator],
    ["./.pnp/externals/pnp-1551b6ba428967d7f74de1808a8877b6e3775e6f/node_modules/@babel/helper-create-regexp-features-plugin/", blacklistedLocator],
    ["./.pnp/externals/pnp-55946e8417942779578fc39ee8c25e17593ac269/node_modules/@babel/plugin-transform-flow-strip-types/", blacklistedLocator],
    ["./.pnp/externals/pnp-b05430443ee7aa37b1a8425db8c1975689445330/node_modules/ajv-keywords/", blacklistedLocator],
    ["./.pnp/externals/pnp-98617499d4d50a8cd551a218fe8b73ef64f99afe/node_modules/ajv-keywords/", blacklistedLocator],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-core-7.7.2-ea5b99693bcfc058116f42fa1dd54da412b29d91/node_modules/@babel/core/", {
        "name": "@babel/core",
        "reference": "7.7.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-code-frame-7.5.5-bc0782f6d69f7b7d49531219699b988f669a8f9d/node_modules/@babel/code-frame/", {
        "name": "@babel/code-frame",
        "reference": "7.5.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-highlight-7.5.0-56d11312bd9248fa619591d02472be6e8cb32540/node_modules/@babel/highlight/", {
        "name": "@babel/highlight",
        "reference": "7.5.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-chalk-2.4.2-cd42541677a54333cf541a49108c1432b44c9424/node_modules/chalk/", {
        "name": "chalk",
        "reference": "2.4.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-chalk-1.1.3-a8115c55e4a702fe4d150abd3872822a7e09fc98/node_modules/chalk/", {
        "name": "chalk",
        "reference": "1.1.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ansi-styles-3.2.1-41fbb20243e50b12be0f04b8dedbf07520ce841d/node_modules/ansi-styles/", {
        "name": "ansi-styles",
        "reference": "3.2.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ansi-styles-2.2.1-b432dd3358b634cf75e1e4664368240533c1ddbe/node_modules/ansi-styles/", {
        "name": "ansi-styles",
        "reference": "2.2.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-color-convert-1.9.3-bb71850690e1f136567de629d2d5471deda4c1e8/node_modules/color-convert/", {
        "name": "color-convert",
        "reference": "1.9.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-color-name-1.1.3-a7d0558bd89c42f795dd42328f740831ca53bc25/node_modules/color-name/", {
        "name": "color-name",
        "reference": "1.1.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-escape-string-regexp-1.0.5-1b61c0562190a8dff6ae3bb2cf0200ca130b86d4/node_modules/escape-string-regexp/", {
        "name": "escape-string-regexp",
        "reference": "1.0.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-supports-color-5.5.0-e2e69a44ac8772f78a1ec0b35b689df6530efc8f/node_modules/supports-color/", {
        "name": "supports-color",
        "reference": "5.5.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-supports-color-2.0.0-535d045ce6b6363fa40117084629995e9df324c7/node_modules/supports-color/", {
        "name": "supports-color",
        "reference": "2.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-supports-color-3.2.3-65ac0504b3954171d8a64946b2ae3cbb8a5f54f6/node_modules/supports-color/", {
        "name": "supports-color",
        "reference": "3.2.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-supports-color-6.1.0-0764abc69c63d5ac842dd4867e8d025e880df8f3/node_modules/supports-color/", {
        "name": "supports-color",
        "reference": "6.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-has-flag-3.0.0-b5d454dc2199ae225699f3467e5a07f3b955bafd/node_modules/has-flag/", {
        "name": "has-flag",
        "reference": "3.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-has-flag-1.0.0-9d9e793165ce017a00f00418c43f942a7b1d11fa/node_modules/has-flag/", {
        "name": "has-flag",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-esutils-2.0.3-74d2eb4de0b8da1293711910d50775b9b710ef64/node_modules/esutils/", {
        "name": "esutils",
        "reference": "2.0.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-js-tokens-4.0.0-19203fb59991df98e3a287050d4647cdeaf32499/node_modules/js-tokens/", {
        "name": "js-tokens",
        "reference": "4.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-js-tokens-3.0.2-9866df395102130e38f7f996bceb65443209c25b/node_modules/js-tokens/", {
        "name": "js-tokens",
        "reference": "3.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-generator-7.7.2-2f4852d04131a5e17ea4f6645488b5da66ebf3af/node_modules/@babel/generator/", {
        "name": "@babel/generator",
        "reference": "7.7.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-generator-7.7.4-db651e2840ca9aa66f327dcec1dc5f5fa9611369/node_modules/@babel/generator/", {
        "name": "@babel/generator",
        "reference": "7.7.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-types-7.7.2-550b82e5571dcd174af576e23f0adba7ffc683f7/node_modules/@babel/types/", {
        "name": "@babel/types",
        "reference": "7.7.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-types-7.7.4-516570d539e44ddf308c07569c258ff94fde9193/node_modules/@babel/types/", {
        "name": "@babel/types",
        "reference": "7.7.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-lodash-4.17.15-b447f6670a0455bbfeedd11392eff330ea097548/node_modules/lodash/", {
        "name": "lodash",
        "reference": "4.17.15"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-to-fast-properties-2.0.0-dc5e698cbd079265bc73e0377681a4e4e83f616e/node_modules/to-fast-properties/", {
        "name": "to-fast-properties",
        "reference": "2.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-to-fast-properties-1.0.3-b83571fa4d8c25b82e231b06e3a3055de4ca1a47/node_modules/to-fast-properties/", {
        "name": "to-fast-properties",
        "reference": "1.0.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-jsesc-2.5.2-80564d2e483dacf6e8ef209650a67df3f0c283a4/node_modules/jsesc/", {
        "name": "jsesc",
        "reference": "2.5.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-jsesc-0.5.0-e7dee66e35d6fc16f710fe91d5cf69f70f08911d/node_modules/jsesc/", {
        "name": "jsesc",
        "reference": "0.5.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-jsesc-1.3.0-46c3fec8c1892b12b0833db9bc7622176dbab34b/node_modules/jsesc/", {
        "name": "jsesc",
        "reference": "1.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-source-map-0.5.7-8a039d2d1021d22d1ea14c80d8ea468ba2ef3fcc/node_modules/source-map/", {
        "name": "source-map",
        "reference": "0.5.7"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-source-map-0.6.1-74722af32e9614e9c287a8d0bbde48b5e2f1a263/node_modules/source-map/", {
        "name": "source-map",
        "reference": "0.6.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helpers-7.7.0-359bb5ac3b4726f7c1fde0ec75f64b3f4275d60b/node_modules/@babel/helpers/", {
        "name": "@babel/helpers",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-template-7.7.0-4fadc1b8e734d97f56de39c77de76f2562e597d0/node_modules/@babel/template/", {
        "name": "@babel/template",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-template-7.7.4-428a7d9eecffe27deac0a98e23bf8e3675d2a77b/node_modules/@babel/template/", {
        "name": "@babel/template",
        "reference": "7.7.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-parser-7.7.3-5fad457c2529de476a248f75b0f090b3060af043/node_modules/@babel/parser/", {
        "name": "@babel/parser",
        "reference": "7.7.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-parser-7.7.4-75ab2d7110c2cf2fa949959afb05fa346d2231bb/node_modules/@babel/parser/", {
        "name": "@babel/parser",
        "reference": "7.7.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-traverse-7.7.2-ef0a65e07a2f3c550967366b3d9b62a2dcbeae09/node_modules/@babel/traverse/", {
        "name": "@babel/traverse",
        "reference": "7.7.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-traverse-7.7.4-9c1e7c60fb679fe4fcfaa42500833333c2058558/node_modules/@babel/traverse/", {
        "name": "@babel/traverse",
        "reference": "7.7.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-function-name-7.7.0-44a5ad151cfff8ed2599c91682dda2ec2c8430a3/node_modules/@babel/helper-function-name/", {
        "name": "@babel/helper-function-name",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-function-name-7.7.4-ab6e041e7135d436d8f0a3eca15de5b67a341a2e/node_modules/@babel/helper-function-name/", {
        "name": "@babel/helper-function-name",
        "reference": "7.7.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-get-function-arity-7.7.0-c604886bc97287a1d1398092bc666bc3d7d7aa2d/node_modules/@babel/helper-get-function-arity/", {
        "name": "@babel/helper-get-function-arity",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-get-function-arity-7.7.4-cb46348d2f8808e632f0ab048172130e636005f0/node_modules/@babel/helper-get-function-arity/", {
        "name": "@babel/helper-get-function-arity",
        "reference": "7.7.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-split-export-declaration-7.7.0-1365e74ea6c614deeb56ebffabd71006a0eb2300/node_modules/@babel/helper-split-export-declaration/", {
        "name": "@babel/helper-split-export-declaration",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-split-export-declaration-7.7.4-57292af60443c4a3622cf74040ddc28e68336fd8/node_modules/@babel/helper-split-export-declaration/", {
        "name": "@babel/helper-split-export-declaration",
        "reference": "7.7.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-debug-4.1.1-3b72260255109c6b589cee050f1d516139664791/node_modules/debug/", {
        "name": "debug",
        "reference": "4.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-debug-2.6.9-5d128515df134ff327e90a4c93f4e077a536341f/node_modules/debug/", {
        "name": "debug",
        "reference": "2.6.9"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-debug-3.2.6-e83d17de16d8a7efb7717edbe5fb10135eee629b/node_modules/debug/", {
        "name": "debug",
        "reference": "3.2.6"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ms-2.1.2-d09d1f357b443f493382a8eb3ccd183872ae6009/node_modules/ms/", {
        "name": "ms",
        "reference": "2.1.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ms-2.0.0-5608aeadfc00be6c2901df5f9861788de0d597c8/node_modules/ms/", {
        "name": "ms",
        "reference": "2.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ms-2.1.1-30a5864eb3ebb0a66f2ebe6d727af06a09d86e0a/node_modules/ms/", {
        "name": "ms",
        "reference": "2.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-globals-11.12.0-ab8795338868a0babd8525758018c2a7eb95c42e/node_modules/globals/", {
        "name": "globals",
        "reference": "11.12.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-globals-9.18.0-aa3896b3e69b487f17e31ed2143d69a8e30c2d8a/node_modules/globals/", {
        "name": "globals",
        "reference": "9.18.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-convert-source-map-1.7.0-17a2cb882d7f77d3490585e2ce6c524424a3a442/node_modules/convert-source-map/", {
        "name": "convert-source-map",
        "reference": "1.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-safe-buffer-5.1.2-991ec69d296e0313747d59bdfd2b745c35f8828d/node_modules/safe-buffer/", {
        "name": "safe-buffer",
        "reference": "5.1.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-safe-buffer-5.2.0-b74daec49b1148f88c64b68d49b1e815c1f2f519/node_modules/safe-buffer/", {
        "name": "safe-buffer",
        "reference": "5.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-json5-2.1.1-81b6cb04e9ba496f1c7005d07b4368a2638f90b6/node_modules/json5/", {
        "name": "json5",
        "reference": "2.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-json5-1.0.1-779fb0018604fa854eacbf6252180d83543e3dbe/node_modules/json5/", {
        "name": "json5",
        "reference": "1.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-json5-0.5.1-1eade7acc012034ad84e2396767ead9fa5495821/node_modules/json5/", {
        "name": "json5",
        "reference": "0.5.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-minimist-1.2.0-a35008b20f41383eec1fb914f4cd5df79a264284/node_modules/minimist/", {
        "name": "minimist",
        "reference": "1.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-minimist-0.0.8-857fcabfc3397d2625b8228262e86aa7a011b05d/node_modules/minimist/", {
        "name": "minimist",
        "reference": "0.0.8"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-minimist-0.0.10-de3f98543dbf96082be48ad1a0c7cda836301dcf/node_modules/minimist/", {
        "name": "minimist",
        "reference": "0.0.10"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-resolve-1.12.0-3fc644a35c84a48554609ff26ec52b66fa577df6/node_modules/resolve/", {
        "name": "resolve",
        "reference": "1.12.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-path-parse-1.0.6-d62dbb5679405d72c4737ec58600e9ddcf06d24c/node_modules/path-parse/", {
        "name": "path-parse",
        "reference": "1.0.6"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-semver-5.7.1-a954f931aeba508d307bbf069eff0c01c96116f7/node_modules/semver/", {
        "name": "semver",
        "reference": "5.7.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-semver-6.3.0-ee0a64c8af5e8ceea67687b133761e1becbd1d3d/node_modules/semver/", {
        "name": "semver",
        "reference": "6.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-class-properties-7.7.0-ac54e728ecf81d90e8f4d2a9c05a890457107917/node_modules/@babel/plugin-proposal-class-properties/", {
        "name": "@babel/plugin-proposal-class-properties",
        "reference": "7.7.0"
    }],
    ["./.pnp/externals/pnp-83fed53edb56c6d4a44663771c2953b964853068/node_modules/@babel/helper-create-class-features-plugin/", {
        "name": "@babel/helper-create-class-features-plugin",
        "reference": "pnp:83fed53edb56c6d4a44663771c2953b964853068"
    }],
    ["./.pnp/externals/pnp-f2d928359c86b6fd803fa60b9c6c5e57b0d39a07/node_modules/@babel/helper-create-class-features-plugin/", {
        "name": "@babel/helper-create-class-features-plugin",
        "reference": "pnp:f2d928359c86b6fd803fa60b9c6c5e57b0d39a07"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-create-class-features-plugin-7.7.4-fce60939fd50618610942320a8d951b3b639da2d/node_modules/@babel/helper-create-class-features-plugin/", {
        "name": "@babel/helper-create-class-features-plugin",
        "reference": "7.7.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-member-expression-to-functions-7.7.0-472b93003a57071f95a541ea6c2b098398bcad8a/node_modules/@babel/helper-member-expression-to-functions/", {
        "name": "@babel/helper-member-expression-to-functions",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-member-expression-to-functions-7.7.4-356438e2569df7321a8326644d4b790d2122cb74/node_modules/@babel/helper-member-expression-to-functions/", {
        "name": "@babel/helper-member-expression-to-functions",
        "reference": "7.7.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-optimise-call-expression-7.7.0-4f66a216116a66164135dc618c5d8b7a959f9365/node_modules/@babel/helper-optimise-call-expression/", {
        "name": "@babel/helper-optimise-call-expression",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-optimise-call-expression-7.7.4-034af31370d2995242aa4df402c3b7794b2dcdf2/node_modules/@babel/helper-optimise-call-expression/", {
        "name": "@babel/helper-optimise-call-expression",
        "reference": "7.7.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-plugin-utils-7.0.0-bbb3fbee98661c569034237cc03967ba99b4f250/node_modules/@babel/helper-plugin-utils/", {
        "name": "@babel/helper-plugin-utils",
        "reference": "7.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-replace-supers-7.7.0-d5365c8667fe7cbd13b8ddddceb9bd7f2b387512/node_modules/@babel/helper-replace-supers/", {
        "name": "@babel/helper-replace-supers",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-replace-supers-7.7.4-3c881a6a6a7571275a72d82e6107126ec9e2cdd2/node_modules/@babel/helper-replace-supers/", {
        "name": "@babel/helper-replace-supers",
        "reference": "7.7.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-decorators-7.7.0-d386a45730a4eb8c03e23a80b6d3dbefd761c9c9/node_modules/@babel/plugin-proposal-decorators/", {
        "name": "@babel/plugin-proposal-decorators",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-syntax-decorators-7.2.0-c50b1b957dcc69e4b1127b65e1c33eef61570c1b/node_modules/@babel/plugin-syntax-decorators/", {
        "name": "@babel/plugin-syntax-decorators",
        "reference": "7.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-export-default-from-7.5.2-2c0ac2dcc36e3b2443fead2c3c5fc796fb1b5145/node_modules/@babel/plugin-proposal-export-default-from/", {
        "name": "@babel/plugin-proposal-export-default-from",
        "reference": "7.5.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-syntax-export-default-from-7.2.0-edd83b7adc2e0d059e2467ca96c650ab6d2f3820/node_modules/@babel/plugin-syntax-export-default-from/", {
        "name": "@babel/plugin-syntax-export-default-from",
        "reference": "7.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-export-namespace-from-7.5.2-ccd5ed05b06d700688ff1db01a9dd27155e0d2a0/node_modules/@babel/plugin-proposal-export-namespace-from/", {
        "name": "@babel/plugin-proposal-export-namespace-from",
        "reference": "7.5.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-syntax-export-namespace-from-7.2.0-8d257838c6b3b779db52c0224443459bd27fb039/node_modules/@babel/plugin-syntax-export-namespace-from/", {
        "name": "@babel/plugin-syntax-export-namespace-from",
        "reference": "7.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-function-sent-7.7.0-590fcf28b55832459d9a747625c563d8abba4d13/node_modules/@babel/plugin-proposal-function-sent/", {
        "name": "@babel/plugin-proposal-function-sent",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-wrap-function-7.7.0-15af3d3e98f8417a60554acbb6c14e75e0b33b74/node_modules/@babel/helper-wrap-function/", {
        "name": "@babel/helper-wrap-function",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-syntax-function-sent-7.2.0-91474d4d400604e4c6cbd4d77cd6cb3b8565576c/node_modules/@babel/plugin-syntax-function-sent/", {
        "name": "@babel/plugin-syntax-function-sent",
        "reference": "7.2.0"
    }],
    ["./.pnp/externals/pnp-95b7255d806e48378a73c6255b1d4c3917494842/node_modules/@babel/plugin-proposal-json-strings/", {
        "name": "@babel/plugin-proposal-json-strings",
        "reference": "pnp:95b7255d806e48378a73c6255b1d4c3917494842"
    }],
    ["./.pnp/externals/pnp-1ced04ae106d776a5bb9c7c6b8070f960b5cccbb/node_modules/@babel/plugin-proposal-json-strings/", {
        "name": "@babel/plugin-proposal-json-strings",
        "reference": "pnp:1ced04ae106d776a5bb9c7c6b8070f960b5cccbb"
    }],
    ["./.pnp/externals/pnp-b070ab5530b4c80bc1fc46ce2024e469e5d7fbdb/node_modules/@babel/plugin-syntax-json-strings/", {
        "name": "@babel/plugin-syntax-json-strings",
        "reference": "pnp:b070ab5530b4c80bc1fc46ce2024e469e5d7fbdb"
    }],
    ["./.pnp/externals/pnp-fd98af3495c3c6f1203613fc06648c76c2b60d3b/node_modules/@babel/plugin-syntax-json-strings/", {
        "name": "@babel/plugin-syntax-json-strings",
        "reference": "pnp:fd98af3495c3c6f1203613fc06648c76c2b60d3b"
    }],
    ["./.pnp/externals/pnp-2830c17de82a10d46b198a052d8defa1fc4566a1/node_modules/@babel/plugin-syntax-json-strings/", {
        "name": "@babel/plugin-syntax-json-strings",
        "reference": "pnp:2830c17de82a10d46b198a052d8defa1fc4566a1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-numeric-separator-7.2.0-646854daf4cd22fd6733f6076013a936310443ac/node_modules/@babel/plugin-proposal-numeric-separator/", {
        "name": "@babel/plugin-proposal-numeric-separator",
        "reference": "7.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-syntax-numeric-separator-7.2.0-7470fe070c2944469a756752a69a6963135018be/node_modules/@babel/plugin-syntax-numeric-separator/", {
        "name": "@babel/plugin-syntax-numeric-separator",
        "reference": "7.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-object-rest-spread-7.7.4-cc57849894a5c774214178c8ab64f6334ec8af71/node_modules/@babel/plugin-proposal-object-rest-spread/", {
        "name": "@babel/plugin-proposal-object-rest-spread",
        "reference": "7.7.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-object-rest-spread-7.6.2-8ffccc8f3a6545e9f78988b6bf4fe881b88e8096/node_modules/@babel/plugin-proposal-object-rest-spread/", {
        "name": "@babel/plugin-proposal-object-rest-spread",
        "reference": "7.6.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-syntax-object-rest-spread-7.7.4-47cf220d19d6d0d7b154304701f468fc1cc6ff46/node_modules/@babel/plugin-syntax-object-rest-spread/", {
        "name": "@babel/plugin-syntax-object-rest-spread",
        "reference": "7.7.4"
    }],
    ["./.pnp/externals/pnp-38603f6e818eb5a82002bf59036b8fdb0abb4079/node_modules/@babel/plugin-syntax-object-rest-spread/", {
        "name": "@babel/plugin-syntax-object-rest-spread",
        "reference": "pnp:38603f6e818eb5a82002bf59036b8fdb0abb4079"
    }],
    ["./.pnp/externals/pnp-f74e4a3f79bc77f6007dc94310a63c1df2a4ed04/node_modules/@babel/plugin-syntax-object-rest-spread/", {
        "name": "@babel/plugin-syntax-object-rest-spread",
        "reference": "pnp:f74e4a3f79bc77f6007dc94310a63c1df2a4ed04"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-optional-chaining-7.6.0-e9bf1f9b9ba10c77c033082da75f068389041af8/node_modules/@babel/plugin-proposal-optional-chaining/", {
        "name": "@babel/plugin-proposal-optional-chaining",
        "reference": "7.6.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-syntax-optional-chaining-7.2.0-a59d6ae8c167e7608eaa443fda9fa8fa6bf21dff/node_modules/@babel/plugin-syntax-optional-chaining/", {
        "name": "@babel/plugin-syntax-optional-chaining",
        "reference": "7.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-private-methods-7.7.4-2531e747064df7a2d9162eac47d713c7b26340b9/node_modules/@babel/plugin-proposal-private-methods/", {
        "name": "@babel/plugin-proposal-private-methods",
        "reference": "7.7.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-throw-expressions-7.2.0-2d9e452d370f139000e51db65d0a85dc60c64739/node_modules/@babel/plugin-proposal-throw-expressions/", {
        "name": "@babel/plugin-proposal-throw-expressions",
        "reference": "7.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-syntax-throw-expressions-7.2.0-79001ee2afe1b174b1733cdc2fc69c9a46a0f1f8/node_modules/@babel/plugin-syntax-throw-expressions/", {
        "name": "@babel/plugin-syntax-throw-expressions",
        "reference": "7.2.0"
    }],
    ["./.pnp/externals/pnp-dca2d6f7fc46ba4c77c5e8686a6350625873747d/node_modules/@babel/plugin-syntax-dynamic-import/", {
        "name": "@babel/plugin-syntax-dynamic-import",
        "reference": "pnp:dca2d6f7fc46ba4c77c5e8686a6350625873747d"
    }],
    ["./.pnp/externals/pnp-3c1bc8676e7033b9f0989a5079b420b93d99b950/node_modules/@babel/plugin-syntax-dynamic-import/", {
        "name": "@babel/plugin-syntax-dynamic-import",
        "reference": "pnp:3c1bc8676e7033b9f0989a5079b420b93d99b950"
    }],
    ["./.pnp/externals/pnp-4c795551df188e40f630a551aca3f0b67d712d91/node_modules/@babel/plugin-syntax-dynamic-import/", {
        "name": "@babel/plugin-syntax-dynamic-import",
        "reference": "pnp:4c795551df188e40f630a551aca3f0b67d712d91"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-syntax-flow-7.7.4-6d91b59e1a0e4c17f36af2e10dd64ef220919d7b/node_modules/@babel/plugin-syntax-flow/", {
        "name": "@babel/plugin-syntax-flow",
        "reference": "7.7.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-syntax-flow-7.7.0-5c9465bcd26354d5215294ea90ab1c706a571386/node_modules/@babel/plugin-syntax-flow/", {
        "name": "@babel/plugin-syntax-flow",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-syntax-import-meta-7.2.0-2333ef4b875553a3bcd1e93f8ebc09f5b9213a40/node_modules/@babel/plugin-syntax-import-meta/", {
        "name": "@babel/plugin-syntax-import-meta",
        "reference": "7.2.0"
    }],
    ["./.pnp/externals/pnp-968d630ee766ba18b9af0c11cba1fb8f929ca617/node_modules/@babel/plugin-transform-flow-strip-types/", {
        "name": "@babel/plugin-transform-flow-strip-types",
        "reference": "pnp:968d630ee766ba18b9af0c11cba1fb8f929ca617"
    }],
    ["./.pnp/externals/pnp-55946e8417942779578fc39ee8c25e17593ac269/node_modules/@babel/plugin-transform-flow-strip-types/", {
        "name": "@babel/plugin-transform-flow-strip-types",
        "reference": "pnp:55946e8417942779578fc39ee8c25e17593ac269"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-runtime-7.6.2-2669f67c1fae0ae8d8bf696e4263ad52cb98b6f8/node_modules/@babel/plugin-transform-runtime/", {
        "name": "@babel/plugin-transform-runtime",
        "reference": "7.6.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-module-imports-7.7.0-99c095889466e5f7b6d66d98dffc58baaf42654d/node_modules/@babel/helper-module-imports/", {
        "name": "@babel/helper-module-imports",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-preset-env-7.7.1-04a2ff53552c5885cf1083e291c8dd5490f744bb/node_modules/@babel/preset-env/", {
        "name": "@babel/preset-env",
        "reference": "7.7.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-async-generator-functions-7.7.0-83ef2d6044496b4c15d8b4904e2219e6dccc6971/node_modules/@babel/plugin-proposal-async-generator-functions/", {
        "name": "@babel/plugin-proposal-async-generator-functions",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-remap-async-to-generator-7.7.0-4d69ec653e8bff5bce62f5d33fc1508f223c75a7/node_modules/@babel/helper-remap-async-to-generator/", {
        "name": "@babel/helper-remap-async-to-generator",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-annotate-as-pure-7.7.0-efc54032d43891fe267679e63f6860aa7dbf4a5e/node_modules/@babel/helper-annotate-as-pure/", {
        "name": "@babel/helper-annotate-as-pure",
        "reference": "7.7.0"
    }],
    ["./.pnp/externals/pnp-7647dcedd7cea865fe6006a2ceae5b654356fc45/node_modules/@babel/plugin-syntax-async-generators/", {
        "name": "@babel/plugin-syntax-async-generators",
        "reference": "pnp:7647dcedd7cea865fe6006a2ceae5b654356fc45"
    }],
    ["./.pnp/externals/pnp-c3762f2effb1ef896fed6137769e7cbce250079e/node_modules/@babel/plugin-syntax-async-generators/", {
        "name": "@babel/plugin-syntax-async-generators",
        "reference": "pnp:c3762f2effb1ef896fed6137769e7cbce250079e"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-dynamic-import-7.7.0-dc02a8bad8d653fb59daf085516fa416edd2aa7f/node_modules/@babel/plugin-proposal-dynamic-import/", {
        "name": "@babel/plugin-proposal-dynamic-import",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-optional-catch-binding-7.2.0-135d81edb68a081e55e56ec48541ece8065c38f5/node_modules/@babel/plugin-proposal-optional-catch-binding/", {
        "name": "@babel/plugin-proposal-optional-catch-binding",
        "reference": "7.2.0"
    }],
    ["./.pnp/externals/pnp-3370d07367235b9c5a1cb9b71ec55425520b8884/node_modules/@babel/plugin-syntax-optional-catch-binding/", {
        "name": "@babel/plugin-syntax-optional-catch-binding",
        "reference": "pnp:3370d07367235b9c5a1cb9b71ec55425520b8884"
    }],
    ["./.pnp/externals/pnp-1535a3cdab988c4b77ae582ee936d0c8523246dc/node_modules/@babel/plugin-syntax-optional-catch-binding/", {
        "name": "@babel/plugin-syntax-optional-catch-binding",
        "reference": "pnp:1535a3cdab988c4b77ae582ee936d0c8523246dc"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-proposal-unicode-property-regex-7.7.0-549fe1717a1bd0a2a7e63163841cb37e78179d5d/node_modules/@babel/plugin-proposal-unicode-property-regex/", {
        "name": "@babel/plugin-proposal-unicode-property-regex",
        "reference": "7.7.0"
    }],
    ["./.pnp/externals/pnp-da3fcd7cc0d19352a9f0005ab0a3aba6e38e1da6/node_modules/@babel/helper-create-regexp-features-plugin/", {
        "name": "@babel/helper-create-regexp-features-plugin",
        "reference": "pnp:da3fcd7cc0d19352a9f0005ab0a3aba6e38e1da6"
    }],
    ["./.pnp/externals/pnp-c1d07d59eb251071bf95817fbc2720a2de9825c5/node_modules/@babel/helper-create-regexp-features-plugin/", {
        "name": "@babel/helper-create-regexp-features-plugin",
        "reference": "pnp:c1d07d59eb251071bf95817fbc2720a2de9825c5"
    }],
    ["./.pnp/externals/pnp-73743d202a8c421645fe70f62867b9ce94402827/node_modules/@babel/helper-create-regexp-features-plugin/", {
        "name": "@babel/helper-create-regexp-features-plugin",
        "reference": "pnp:73743d202a8c421645fe70f62867b9ce94402827"
    }],
    ["./.pnp/externals/pnp-1551b6ba428967d7f74de1808a8877b6e3775e6f/node_modules/@babel/helper-create-regexp-features-plugin/", {
        "name": "@babel/helper-create-regexp-features-plugin",
        "reference": "pnp:1551b6ba428967d7f74de1808a8877b6e3775e6f"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-regex-7.5.5-0aa6824f7100a2e0e89c1527c23936c152cab351/node_modules/@babel/helper-regex/", {
        "name": "@babel/helper-regex",
        "reference": "7.5.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-regexpu-core-4.6.0-2037c18b327cfce8a6fea2a4ec441f2432afb8b6/node_modules/regexpu-core/", {
        "name": "regexpu-core",
        "reference": "4.6.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-regenerate-1.4.0-4a856ec4b56e4077c557589cae85e7a4c8869a11/node_modules/regenerate/", {
        "name": "regenerate",
        "reference": "1.4.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-regenerate-unicode-properties-8.1.0-ef51e0f0ea4ad424b77bf7cb41f3e015c70a3f0e/node_modules/regenerate-unicode-properties/", {
        "name": "regenerate-unicode-properties",
        "reference": "8.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-regjsgen-0.5.1-48f0bf1a5ea205196929c0d9798b42d1ed98443c/node_modules/regjsgen/", {
        "name": "regjsgen",
        "reference": "0.5.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-regjsparser-0.6.0-f1e6ae8b7da2bae96c99399b868cd6c933a2ba9c/node_modules/regjsparser/", {
        "name": "regjsparser",
        "reference": "0.6.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-unicode-match-property-ecmascript-1.0.4-8ed2a32569961bce9227d09cd3ffbb8fed5f020c/node_modules/unicode-match-property-ecmascript/", {
        "name": "unicode-match-property-ecmascript",
        "reference": "1.0.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-unicode-canonical-property-names-ecmascript-1.0.4-2619800c4c825800efdd8343af7dd9933cbe2818/node_modules/unicode-canonical-property-names-ecmascript/", {
        "name": "unicode-canonical-property-names-ecmascript",
        "reference": "1.0.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-unicode-property-aliases-ecmascript-1.0.5-a9cc6cc7ce63a0a3023fc99e341b94431d405a57/node_modules/unicode-property-aliases-ecmascript/", {
        "name": "unicode-property-aliases-ecmascript",
        "reference": "1.0.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-unicode-match-property-value-ecmascript-1.1.0-5b4b426e08d13a80365e0d657ac7a6c1ec46a277/node_modules/unicode-match-property-value-ecmascript/", {
        "name": "unicode-match-property-value-ecmascript",
        "reference": "1.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-syntax-top-level-await-7.7.0-f5699549f50bbe8d12b1843a4e82f0a37bb65f4d/node_modules/@babel/plugin-syntax-top-level-await/", {
        "name": "@babel/plugin-syntax-top-level-await",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-arrow-functions-7.2.0-9aeafbe4d6ffc6563bf8f8372091628f00779550/node_modules/@babel/plugin-transform-arrow-functions/", {
        "name": "@babel/plugin-transform-arrow-functions",
        "reference": "7.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-async-to-generator-7.7.0-e2b84f11952cf5913fe3438b7d2585042772f492/node_modules/@babel/plugin-transform-async-to-generator/", {
        "name": "@babel/plugin-transform-async-to-generator",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-block-scoped-functions-7.2.0-5d3cc11e8d5ddd752aa64c9148d0db6cb79fd190/node_modules/@babel/plugin-transform-block-scoped-functions/", {
        "name": "@babel/plugin-transform-block-scoped-functions",
        "reference": "7.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-block-scoping-7.6.3-6e854e51fbbaa84351b15d4ddafe342f3a5d542a/node_modules/@babel/plugin-transform-block-scoping/", {
        "name": "@babel/plugin-transform-block-scoping",
        "reference": "7.6.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-classes-7.7.0-b411ecc1b8822d24b81e5d184f24149136eddd4a/node_modules/@babel/plugin-transform-classes/", {
        "name": "@babel/plugin-transform-classes",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-define-map-7.7.0-60b0e9fd60def9de5054c38afde8c8ee409c7529/node_modules/@babel/helper-define-map/", {
        "name": "@babel/helper-define-map",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-computed-properties-7.2.0-83a7df6a658865b1c8f641d510c6f3af220216da/node_modules/@babel/plugin-transform-computed-properties/", {
        "name": "@babel/plugin-transform-computed-properties",
        "reference": "7.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-destructuring-7.6.0-44bbe08b57f4480094d57d9ffbcd96d309075ba6/node_modules/@babel/plugin-transform-destructuring/", {
        "name": "@babel/plugin-transform-destructuring",
        "reference": "7.6.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-dotall-regex-7.7.0-c5c9ecacab3a5e0c11db6981610f0c32fd698b3b/node_modules/@babel/plugin-transform-dotall-regex/", {
        "name": "@babel/plugin-transform-dotall-regex",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-duplicate-keys-7.5.0-c5dbf5106bf84cdf691222c0974c12b1df931853/node_modules/@babel/plugin-transform-duplicate-keys/", {
        "name": "@babel/plugin-transform-duplicate-keys",
        "reference": "7.5.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-exponentiation-operator-7.2.0-a63868289e5b4007f7054d46491af51435766008/node_modules/@babel/plugin-transform-exponentiation-operator/", {
        "name": "@babel/plugin-transform-exponentiation-operator",
        "reference": "7.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-builder-binary-assignment-operator-visitor-7.7.0-32dd9551d6ed3a5fc2edc50d6912852aa18274d9/node_modules/@babel/helper-builder-binary-assignment-operator-visitor/", {
        "name": "@babel/helper-builder-binary-assignment-operator-visitor",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-explode-assignable-expression-7.7.0-db2a6705555ae1f9f33b4b8212a546bc7f9dc3ef/node_modules/@babel/helper-explode-assignable-expression/", {
        "name": "@babel/helper-explode-assignable-expression",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-for-of-7.4.4-0267fc735e24c808ba173866c6c4d1440fc3c556/node_modules/@babel/plugin-transform-for-of/", {
        "name": "@babel/plugin-transform-for-of",
        "reference": "7.4.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-function-name-7.7.0-0fa786f1eef52e3b7d4fc02e54b2129de8a04c2a/node_modules/@babel/plugin-transform-function-name/", {
        "name": "@babel/plugin-transform-function-name",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-literals-7.2.0-690353e81f9267dad4fd8cfd77eafa86aba53ea1/node_modules/@babel/plugin-transform-literals/", {
        "name": "@babel/plugin-transform-literals",
        "reference": "7.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-member-expression-literals-7.2.0-fa10aa5c58a2cb6afcf2c9ffa8cb4d8b3d489a2d/node_modules/@babel/plugin-transform-member-expression-literals/", {
        "name": "@babel/plugin-transform-member-expression-literals",
        "reference": "7.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-modules-amd-7.5.0-ef00435d46da0a5961aa728a1d2ecff063e4fb91/node_modules/@babel/plugin-transform-modules-amd/", {
        "name": "@babel/plugin-transform-modules-amd",
        "reference": "7.5.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-module-transforms-7.7.0-154a69f0c5b8fd4d39e49750ff7ac4faa3f36786/node_modules/@babel/helper-module-transforms/", {
        "name": "@babel/helper-module-transforms",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-simple-access-7.7.0-97a8b6c52105d76031b86237dc1852b44837243d/node_modules/@babel/helper-simple-access/", {
        "name": "@babel/helper-simple-access",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-dynamic-import-node-2.3.0-f00f507bdaa3c3e3ff6e7e5e98d90a7acab96f7f/node_modules/babel-plugin-dynamic-import-node/", {
        "name": "babel-plugin-dynamic-import-node",
        "reference": "2.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-object-assign-4.1.0-968bf1100d7956bb3ca086f006f846b3bc4008da/node_modules/object.assign/", {
        "name": "object.assign",
        "reference": "4.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-define-properties-1.1.3-cf88da6cbee26fe6db7094f61d870cbd84cee9f1/node_modules/define-properties/", {
        "name": "define-properties",
        "reference": "1.1.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-object-keys-1.1.1-1c47f272df277f3b1daf061677d9c82e2322c60e/node_modules/object-keys/", {
        "name": "object-keys",
        "reference": "1.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-function-bind-1.1.1-a56899d3ea3c9bab874bb9773b7c5ede92f4895d/node_modules/function-bind/", {
        "name": "function-bind",
        "reference": "1.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-has-symbols-1.0.1-9f5214758a44196c406d9bd76cebf81ec2dd31e8/node_modules/has-symbols/", {
        "name": "has-symbols",
        "reference": "1.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-modules-commonjs-7.7.0-3e5ffb4fd8c947feede69cbe24c9554ab4113fe3/node_modules/@babel/plugin-transform-modules-commonjs/", {
        "name": "@babel/plugin-transform-modules-commonjs",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-modules-systemjs-7.7.0-9baf471213af9761c1617bb12fd278e629041417/node_modules/@babel/plugin-transform-modules-systemjs/", {
        "name": "@babel/plugin-transform-modules-systemjs",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-hoist-variables-7.7.0-b4552e4cfe5577d7de7b183e193e84e4ec538c81/node_modules/@babel/helper-hoist-variables/", {
        "name": "@babel/helper-hoist-variables",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-modules-umd-7.7.0-d62c7da16670908e1d8c68ca0b5d4c0097b69966/node_modules/@babel/plugin-transform-modules-umd/", {
        "name": "@babel/plugin-transform-modules-umd",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-named-capturing-groups-regex-7.7.0-358e6fd869b9a4d8f5cbc79e4ed4fc340e60dcaf/node_modules/@babel/plugin-transform-named-capturing-groups-regex/", {
        "name": "@babel/plugin-transform-named-capturing-groups-regex",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-new-target-7.4.4-18d120438b0cc9ee95a47f2c72bc9768fbed60a5/node_modules/@babel/plugin-transform-new-target/", {
        "name": "@babel/plugin-transform-new-target",
        "reference": "7.4.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-object-super-7.5.5-c70021df834073c65eb613b8679cc4a381d1a9f9/node_modules/@babel/plugin-transform-object-super/", {
        "name": "@babel/plugin-transform-object-super",
        "reference": "7.5.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-parameters-7.4.4-7556cf03f318bd2719fe4c922d2d808be5571e16/node_modules/@babel/plugin-transform-parameters/", {
        "name": "@babel/plugin-transform-parameters",
        "reference": "7.4.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-helper-call-delegate-7.7.0-df8942452c2c1a217335ca7e393b9afc67f668dc/node_modules/@babel/helper-call-delegate/", {
        "name": "@babel/helper-call-delegate",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-property-literals-7.2.0-03e33f653f5b25c4eb572c98b9485055b389e905/node_modules/@babel/plugin-transform-property-literals/", {
        "name": "@babel/plugin-transform-property-literals",
        "reference": "7.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-regenerator-7.7.0-f1b20b535e7716b622c99e989259d7dd942dd9cc/node_modules/@babel/plugin-transform-regenerator/", {
        "name": "@babel/plugin-transform-regenerator",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-regenerator-transform-0.14.1-3b2fce4e1ab7732c08f665dfdb314749c7ddd2fb/node_modules/regenerator-transform/", {
        "name": "regenerator-transform",
        "reference": "0.14.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-private-0.1.8-2381edb3689f7a53d653190060fcf822d2f368ff/node_modules/private/", {
        "name": "private",
        "reference": "0.1.8"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-reserved-words-7.2.0-4792af87c998a49367597d07fedf02636d2e1634/node_modules/@babel/plugin-transform-reserved-words/", {
        "name": "@babel/plugin-transform-reserved-words",
        "reference": "7.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-shorthand-properties-7.2.0-6333aee2f8d6ee7e28615457298934a3b46198f0/node_modules/@babel/plugin-transform-shorthand-properties/", {
        "name": "@babel/plugin-transform-shorthand-properties",
        "reference": "7.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-spread-7.6.2-fc77cf798b24b10c46e1b51b1b88c2bf661bb8dd/node_modules/@babel/plugin-transform-spread/", {
        "name": "@babel/plugin-transform-spread",
        "reference": "7.6.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-sticky-regex-7.2.0-a1e454b5995560a9c1e0d537dfc15061fd2687e1/node_modules/@babel/plugin-transform-sticky-regex/", {
        "name": "@babel/plugin-transform-sticky-regex",
        "reference": "7.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-template-literals-7.4.4-9d28fea7bbce637fb7612a0750989d8321d4bcb0/node_modules/@babel/plugin-transform-template-literals/", {
        "name": "@babel/plugin-transform-template-literals",
        "reference": "7.4.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-typeof-symbol-7.2.0-117d2bcec2fbf64b4b59d1f9819894682d29f2b2/node_modules/@babel/plugin-transform-typeof-symbol/", {
        "name": "@babel/plugin-transform-typeof-symbol",
        "reference": "7.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-plugin-transform-unicode-regex-7.7.0-743d9bcc44080e3cc7d49259a066efa30f9187a3/node_modules/@babel/plugin-transform-unicode-regex/", {
        "name": "@babel/plugin-transform-unicode-regex",
        "reference": "7.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-browserslist-4.7.3-02341f162b6bcc1e1028e30624815d4924442dc3/node_modules/browserslist/", {
        "name": "browserslist",
        "reference": "4.7.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-caniuse-lite-1.0.30001011-0d6c4549c78c4a800bb043a83ca0cbe0aee6c6e1/node_modules/caniuse-lite/", {
        "name": "caniuse-lite",
        "reference": "1.0.30001011"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-electron-to-chromium-1.3.307-e9b98901371d20164af7c0ca5bc820bd4305ccd3/node_modules/electron-to-chromium/", {
        "name": "electron-to-chromium",
        "reference": "1.3.307"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-node-releases-1.1.40-a94facfa8e2d612302601ca1361741d529c4515a/node_modules/node-releases/", {
        "name": "node-releases",
        "reference": "1.1.40"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-core-js-compat-3.4.1-e12c5a3ef9fcb50fd9d9a32805bfe674f9139246/node_modules/core-js-compat/", {
        "name": "core-js-compat",
        "reference": "3.4.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-invariant-2.2.4-610f3c92c9359ce1db616e538008d23ff35158e6/node_modules/invariant/", {
        "name": "invariant",
        "reference": "2.2.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-loose-envify-1.4.0-71ee51fa7be4caec1a63839f7e682d8132d30caf/node_modules/loose-envify/", {
        "name": "loose-envify",
        "reference": "1.4.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-js-levenshtein-1.1.6-c6cee58eb3550372df8deb85fad5ce66ce01d59d/node_modules/js-levenshtein/", {
        "name": "js-levenshtein",
        "reference": "1.1.6"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-preset-flow-7.0.0-afd764835d9535ec63d8c7d4caf1c06457263da2/node_modules/@babel/preset-flow/", {
        "name": "@babel/preset-flow",
        "reference": "7.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@babel-runtime-7.7.2-111a78002a5c25fc8e3361bedc9529c696b85a6a/node_modules/@babel/runtime/", {
        "name": "@babel/runtime",
        "reference": "7.7.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-regenerator-runtime-0.13.3-7cf6a77d8f5c6f60eb73c5fc1955b2ceb01e6bf5/node_modules/regenerator-runtime/", {
        "name": "regenerator-runtime",
        "reference": "0.13.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-regenerator-runtime-0.11.1-be05ad7f9bf7d22e056f9726cee5017fbf19e2e9/node_modules/regenerator-runtime/", {
        "name": "regenerator-runtime",
        "reference": "0.11.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-loader-8.0.6-e33bdb6f362b03f4bb141a0c21ab87c501b70dfb/node_modules/babel-loader/", {
        "name": "babel-loader",
        "reference": "8.0.6"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-find-cache-dir-2.1.0-8d0f94cd13fe43c6c7c261a0d86115ca918c05f7/node_modules/find-cache-dir/", {
        "name": "find-cache-dir",
        "reference": "2.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-find-cache-dir-3.1.0-9935894999debef4cf9f677fdf646d002c4cdecb/node_modules/find-cache-dir/", {
        "name": "find-cache-dir",
        "reference": "3.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-commondir-1.0.1-ddd800da0c66127393cca5950ea968a3aaf1253b/node_modules/commondir/", {
        "name": "commondir",
        "reference": "1.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-make-dir-2.1.0-5f0310e18b8be898cc07009295a30ae41e91e6f5/node_modules/make-dir/", {
        "name": "make-dir",
        "reference": "2.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-make-dir-3.0.0-1b5f39f6b9270ed33f9f054c5c0f84304989f801/node_modules/make-dir/", {
        "name": "make-dir",
        "reference": "3.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-pify-4.0.1-4b2cd25c50d598735c50292224fd8c6df41e3231/node_modules/pify/", {
        "name": "pify",
        "reference": "4.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-pify-2.3.0-ed141a6ac043a849ea588498e7dca8b15330e90c/node_modules/pify/", {
        "name": "pify",
        "reference": "2.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-pkg-dir-3.0.0-2749020f239ed990881b1f71210d51eb6523bea3/node_modules/pkg-dir/", {
        "name": "pkg-dir",
        "reference": "3.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-pkg-dir-4.2.0-f099133df7ede422e81d1d8448270eeb3e4261f3/node_modules/pkg-dir/", {
        "name": "pkg-dir",
        "reference": "4.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-find-up-3.0.0-49169f1d7993430646da61ecc5ae355c21c97b73/node_modules/find-up/", {
        "name": "find-up",
        "reference": "3.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-find-up-4.1.0-97afe7d6cdc0bc5928584b7c8d7b16e8a9aa5d19/node_modules/find-up/", {
        "name": "find-up",
        "reference": "4.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-locate-path-3.0.0-dbec3b3ab759758071b58fe59fc41871af21400e/node_modules/locate-path/", {
        "name": "locate-path",
        "reference": "3.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-locate-path-5.0.0-1afba396afd676a6d42504d0a67a3a7eb9f62aa0/node_modules/locate-path/", {
        "name": "locate-path",
        "reference": "5.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-p-locate-3.0.0-322d69a05c0264b25997d9f40cd8a891ab0064a4/node_modules/p-locate/", {
        "name": "p-locate",
        "reference": "3.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-p-locate-4.1.0-a3428bb7088b3a60292f66919278b7c297ad4f07/node_modules/p-locate/", {
        "name": "p-locate",
        "reference": "4.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-p-limit-2.2.1-aa07a788cc3151c939b5131f63570f0dd2009537/node_modules/p-limit/", {
        "name": "p-limit",
        "reference": "2.2.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-p-try-2.2.0-cb2868540e313d61de58fafbe35ce9004d5540e6/node_modules/p-try/", {
        "name": "p-try",
        "reference": "2.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-path-exists-3.0.0-ce0ebeaa5f78cb18925ea7d810d7b59b010fd515/node_modules/path-exists/", {
        "name": "path-exists",
        "reference": "3.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-path-exists-4.0.0-513bdbe2d3b95d7762e8c1137efa195c6c61b5b3/node_modules/path-exists/", {
        "name": "path-exists",
        "reference": "4.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-loader-utils-1.2.3-1ff5dc6911c9f0a062531a4c04b609406108c2c7/node_modules/loader-utils/", {
        "name": "loader-utils",
        "reference": "1.2.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-big-js-5.2.2-65f0af382f578bcdc742bd9c281e9cb2d7768328/node_modules/big.js/", {
        "name": "big.js",
        "reference": "5.2.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-emojis-list-2.1.0-4daa4d9db00f9819880c79fa457ae5b09a1fd389/node_modules/emojis-list/", {
        "name": "emojis-list",
        "reference": "2.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-mkdirp-0.5.1-30057438eac6cf7f8c4767f38648d6697d75c903/node_modules/mkdirp/", {
        "name": "mkdirp",
        "reference": "0.5.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-minify-0.5.1-dcb8bfe22fcf4bb911dac97ba2987464ee59eeed/node_modules/babel-minify/", {
        "name": "babel-minify",
        "reference": "0.5.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-preset-minify-0.5.1-25f5d0bce36ec818be80338d0e594106e21eaa9f/node_modules/babel-preset-minify/", {
        "name": "babel-preset-minify",
        "reference": "0.5.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-preset-minify-0.3.0-7db64afa75f16f6e06c0aa5f25195f6f36784d77/node_modules/babel-preset-minify/", {
        "name": "babel-preset-minify",
        "reference": "0.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-builtins-0.5.0-31eb82ed1a0d0efdc31312f93b6e4741ce82c36b/node_modules/babel-plugin-minify-builtins/", {
        "name": "babel-plugin-minify-builtins",
        "reference": "0.5.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-builtins-0.3.0-4740117a6a784063aaf8f092989cf9e4bd484860/node_modules/babel-plugin-minify-builtins/", {
        "name": "babel-plugin-minify-builtins",
        "reference": "0.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-constant-folding-0.5.0-f84bc8dbf6a561e5e350ff95ae216b0ad5515b6e/node_modules/babel-plugin-minify-constant-folding/", {
        "name": "babel-plugin-minify-constant-folding",
        "reference": "0.5.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-constant-folding-0.3.0-687e40336bd4ddd921e0e197f0006235ac184bb9/node_modules/babel-plugin-minify-constant-folding/", {
        "name": "babel-plugin-minify-constant-folding",
        "reference": "0.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-helper-evaluate-path-0.5.0-a62fa9c4e64ff7ea5cea9353174ef023a900a67c/node_modules/babel-helper-evaluate-path/", {
        "name": "babel-helper-evaluate-path",
        "reference": "0.5.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-helper-evaluate-path-0.3.0-2439545e0b6eae5b7f49b790acbebd6b9a73df20/node_modules/babel-helper-evaluate-path/", {
        "name": "babel-helper-evaluate-path",
        "reference": "0.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-dead-code-elimination-0.5.1-1a0c68e44be30de4976ca69ffc535e08be13683f/node_modules/babel-plugin-minify-dead-code-elimination/", {
        "name": "babel-plugin-minify-dead-code-elimination",
        "reference": "0.5.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-dead-code-elimination-0.3.0-a323f686c404b824186ba5583cf7996cac81719e/node_modules/babel-plugin-minify-dead-code-elimination/", {
        "name": "babel-plugin-minify-dead-code-elimination",
        "reference": "0.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-helper-mark-eval-scopes-0.4.3-d244a3bef9844872603ffb46e22ce8acdf551562/node_modules/babel-helper-mark-eval-scopes/", {
        "name": "babel-helper-mark-eval-scopes",
        "reference": "0.4.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-helper-mark-eval-scopes-0.3.0-b4731314fdd7a89091271a5213b4e12d236e29e8/node_modules/babel-helper-mark-eval-scopes/", {
        "name": "babel-helper-mark-eval-scopes",
        "reference": "0.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-helper-remove-or-void-0.4.3-a4f03b40077a0ffe88e45d07010dee241ff5ae60/node_modules/babel-helper-remove-or-void/", {
        "name": "babel-helper-remove-or-void",
        "reference": "0.4.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-helper-remove-or-void-0.3.0-f43c86147c8fcc395a9528cbb31e7ff49d7e16e3/node_modules/babel-helper-remove-or-void/", {
        "name": "babel-helper-remove-or-void",
        "reference": "0.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-flip-comparisons-0.4.3-00ca870cb8f13b45c038b3c1ebc0f227293c965a/node_modules/babel-plugin-minify-flip-comparisons/", {
        "name": "babel-plugin-minify-flip-comparisons",
        "reference": "0.4.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-flip-comparisons-0.3.0-6627893a409c9f30ef7f2c89e0c6eea7ee97ddc4/node_modules/babel-plugin-minify-flip-comparisons/", {
        "name": "babel-plugin-minify-flip-comparisons",
        "reference": "0.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-helper-is-void-0-0.4.3-7d9c01b4561e7b95dbda0f6eee48f5b60e67313e/node_modules/babel-helper-is-void-0/", {
        "name": "babel-helper-is-void-0",
        "reference": "0.4.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-helper-is-void-0-0.3.0-95570d20bd27b2206f68083ae9980ee7003d8fe7/node_modules/babel-helper-is-void-0/", {
        "name": "babel-helper-is-void-0",
        "reference": "0.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-guarded-expressions-0.4.4-818960f64cc08aee9d6c75bec6da974c4d621135/node_modules/babel-plugin-minify-guarded-expressions/", {
        "name": "babel-plugin-minify-guarded-expressions",
        "reference": "0.4.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-guarded-expressions-0.3.0-2552d96189ef45d9a463f1a6b5e4fa110703ac8d/node_modules/babel-plugin-minify-guarded-expressions/", {
        "name": "babel-plugin-minify-guarded-expressions",
        "reference": "0.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-helper-flip-expressions-0.4.3-3696736a128ac18bc25254b5f40a22ceb3c1d3fd/node_modules/babel-helper-flip-expressions/", {
        "name": "babel-helper-flip-expressions",
        "reference": "0.4.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-helper-flip-expressions-0.3.0-f5b6394bd5219b43cf8f7b201535ed540c6e7fa2/node_modules/babel-helper-flip-expressions/", {
        "name": "babel-helper-flip-expressions",
        "reference": "0.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-infinity-0.4.3-dfb876a1b08a06576384ef3f92e653ba607b39ca/node_modules/babel-plugin-minify-infinity/", {
        "name": "babel-plugin-minify-infinity",
        "reference": "0.4.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-infinity-0.3.0-c5ec0edd433517cf31b3af17077c202beb48bbe7/node_modules/babel-plugin-minify-infinity/", {
        "name": "babel-plugin-minify-infinity",
        "reference": "0.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-mangle-names-0.5.0-bcddb507c91d2c99e138bd6b17a19c3c271e3fd3/node_modules/babel-plugin-minify-mangle-names/", {
        "name": "babel-plugin-minify-mangle-names",
        "reference": "0.5.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-mangle-names-0.3.0-f28561bad0dd2f0380816816bb946e219b3b6135/node_modules/babel-plugin-minify-mangle-names/", {
        "name": "babel-plugin-minify-mangle-names",
        "reference": "0.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-numeric-literals-0.4.3-8e4fd561c79f7801286ff60e8c5fd9deee93c0bc/node_modules/babel-plugin-minify-numeric-literals/", {
        "name": "babel-plugin-minify-numeric-literals",
        "reference": "0.4.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-numeric-literals-0.3.0-b57734a612e8a592005407323c321119f27d4b40/node_modules/babel-plugin-minify-numeric-literals/", {
        "name": "babel-plugin-minify-numeric-literals",
        "reference": "0.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-replace-0.5.0-d3e2c9946c9096c070efc96761ce288ec5c3f71c/node_modules/babel-plugin-minify-replace/", {
        "name": "babel-plugin-minify-replace",
        "reference": "0.5.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-replace-0.3.0-980125bbf7cbb5a637439de9d0b1b030a4693893/node_modules/babel-plugin-minify-replace/", {
        "name": "babel-plugin-minify-replace",
        "reference": "0.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-simplify-0.5.1-f21613c8b95af3450a2ca71502fdbd91793c8d6a/node_modules/babel-plugin-minify-simplify/", {
        "name": "babel-plugin-minify-simplify",
        "reference": "0.5.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-simplify-0.3.0-14574cc74d21c81d3060fafa041010028189f11b/node_modules/babel-plugin-minify-simplify/", {
        "name": "babel-plugin-minify-simplify",
        "reference": "0.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-helper-is-nodes-equiv-0.0.1-34e9b300b1479ddd98ec77ea0bbe9342dfe39684/node_modules/babel-helper-is-nodes-equiv/", {
        "name": "babel-helper-is-nodes-equiv",
        "reference": "0.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-helper-to-multiple-sequence-expressions-0.5.0-a3f924e3561882d42fcf48907aa98f7979a4588d/node_modules/babel-helper-to-multiple-sequence-expressions/", {
        "name": "babel-helper-to-multiple-sequence-expressions",
        "reference": "0.5.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-helper-to-multiple-sequence-expressions-0.3.0-8da2275ccc26995566118f7213abfd9af7214427/node_modules/babel-helper-to-multiple-sequence-expressions/", {
        "name": "babel-helper-to-multiple-sequence-expressions",
        "reference": "0.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-type-constructors-0.4.3-1bc6f15b87f7ab1085d42b330b717657a2156500/node_modules/babel-plugin-minify-type-constructors/", {
        "name": "babel-plugin-minify-type-constructors",
        "reference": "0.4.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-minify-type-constructors-0.3.0-7f5a86ef322c4746364e3c591b8514eeafea6ad4/node_modules/babel-plugin-minify-type-constructors/", {
        "name": "babel-plugin-minify-type-constructors",
        "reference": "0.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-transform-inline-consecutive-adds-0.4.3-323d47a3ea63a83a7ac3c811ae8e6941faf2b0d1/node_modules/babel-plugin-transform-inline-consecutive-adds/", {
        "name": "babel-plugin-transform-inline-consecutive-adds",
        "reference": "0.4.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-transform-inline-consecutive-adds-0.3.0-f07d93689c0002ed2b2b62969bdd99f734e03f57/node_modules/babel-plugin-transform-inline-consecutive-adds/", {
        "name": "babel-plugin-transform-inline-consecutive-adds",
        "reference": "0.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-transform-member-expression-literals-6.9.4-37039c9a0c3313a39495faac2ff3a6b5b9d038bf/node_modules/babel-plugin-transform-member-expression-literals/", {
        "name": "babel-plugin-transform-member-expression-literals",
        "reference": "6.9.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-transform-merge-sibling-variables-6.9.4-85b422fc3377b449c9d1cde44087203532401dae/node_modules/babel-plugin-transform-merge-sibling-variables/", {
        "name": "babel-plugin-transform-merge-sibling-variables",
        "reference": "6.9.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-transform-minify-booleans-6.9.4-acbb3e56a3555dd23928e4b582d285162dd2b198/node_modules/babel-plugin-transform-minify-booleans/", {
        "name": "babel-plugin-transform-minify-booleans",
        "reference": "6.9.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-transform-property-literals-6.9.4-98c1d21e255736573f93ece54459f6ce24985d39/node_modules/babel-plugin-transform-property-literals/", {
        "name": "babel-plugin-transform-property-literals",
        "reference": "6.9.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-transform-regexp-constructors-0.4.3-58b7775b63afcf33328fae9a5f88fbd4fb0b4965/node_modules/babel-plugin-transform-regexp-constructors/", {
        "name": "babel-plugin-transform-regexp-constructors",
        "reference": "0.4.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-transform-regexp-constructors-0.3.0-9bb2c8dd082271a5cb1b3a441a7c52e8fd07e0f5/node_modules/babel-plugin-transform-regexp-constructors/", {
        "name": "babel-plugin-transform-regexp-constructors",
        "reference": "0.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-transform-remove-console-6.9.4-b980360c067384e24b357a588d807d3c83527780/node_modules/babel-plugin-transform-remove-console/", {
        "name": "babel-plugin-transform-remove-console",
        "reference": "6.9.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-transform-remove-debugger-6.9.4-42b727631c97978e1eb2d199a7aec84a18339ef2/node_modules/babel-plugin-transform-remove-debugger/", {
        "name": "babel-plugin-transform-remove-debugger",
        "reference": "6.9.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-transform-remove-undefined-0.5.0-80208b31225766c630c97fa2d288952056ea22dd/node_modules/babel-plugin-transform-remove-undefined/", {
        "name": "babel-plugin-transform-remove-undefined",
        "reference": "0.5.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-transform-remove-undefined-0.3.0-03f5f0071867781e9beabbc7b77bf8095fd3f3ec/node_modules/babel-plugin-transform-remove-undefined/", {
        "name": "babel-plugin-transform-remove-undefined",
        "reference": "0.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-transform-simplify-comparison-operators-6.9.4-f62afe096cab0e1f68a2d753fdf283888471ceb9/node_modules/babel-plugin-transform-simplify-comparison-operators/", {
        "name": "babel-plugin-transform-simplify-comparison-operators",
        "reference": "6.9.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-plugin-transform-undefined-to-void-6.9.4-be241ca81404030678b748717322b89d0c8fe280/node_modules/babel-plugin-transform-undefined-to-void/", {
        "name": "babel-plugin-transform-undefined-to-void",
        "reference": "6.9.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-fs-readdir-recursive-1.1.0-e32fc030a2ccee44a6b5371308da54be0b397d27/node_modules/fs-readdir-recursive/", {
        "name": "fs-readdir-recursive",
        "reference": "1.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-util-promisify-1.0.0-440f7165a459c9a16dc145eb8e72f35687097030/node_modules/util.promisify/", {
        "name": "util.promisify",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-object-getownpropertydescriptors-2.0.3-8758c846f5b407adab0f236e0986f14b051caa16/node_modules/object.getownpropertydescriptors/", {
        "name": "object.getownpropertydescriptors",
        "reference": "2.0.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-es-abstract-1.16.0-d3a26dc9c3283ac9750dca569586e976d9dcc06d/node_modules/es-abstract/", {
        "name": "es-abstract",
        "reference": "1.16.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-es-to-primitive-1.2.1-e55cd4c9cdc188bcefb03b366c736323fc5c898a/node_modules/es-to-primitive/", {
        "name": "es-to-primitive",
        "reference": "1.2.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-callable-1.1.4-1e1adf219e1eeb684d691f9d6a05ff0d30a24d75/node_modules/is-callable/", {
        "name": "is-callable",
        "reference": "1.1.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-date-object-1.0.1-9aa20eb6aeebbff77fbd33e74ca01b33581d3a16/node_modules/is-date-object/", {
        "name": "is-date-object",
        "reference": "1.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-symbol-1.0.3-38e1014b9e6329be0de9d24a414fd7441ec61937/node_modules/is-symbol/", {
        "name": "is-symbol",
        "reference": "1.0.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-has-1.0.3-722d7cbfc1f6aa8241f16dd814e011e1f41e8796/node_modules/has/", {
        "name": "has",
        "reference": "1.0.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-regex-1.0.4-5517489b547091b0930e095654ced25ee97e9491/node_modules/is-regex/", {
        "name": "is-regex",
        "reference": "1.0.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-object-inspect-1.7.0-f4f6bd181ad77f006b5ece60bd0b6f398ff74a67/node_modules/object-inspect/", {
        "name": "object-inspect",
        "reference": "1.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-string-prototype-trimleft-2.1.0-6cc47f0d7eb8d62b0f3701611715a3954591d634/node_modules/string.prototype.trimleft/", {
        "name": "string.prototype.trimleft",
        "reference": "2.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-string-prototype-trimright-2.1.0-669d164be9df9b6f7559fa8e89945b168a5a6c58/node_modules/string.prototype.trimright/", {
        "name": "string.prototype.trimright",
        "reference": "2.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-yargs-parser-10.1.0-7202265b89f7e9e9f2e5765e0fe735a905edbaa8/node_modules/yargs-parser/", {
        "name": "yargs-parser",
        "reference": "10.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-yargs-parser-13.1.1-d26058532aa06d365fe091f6a1fc06b2f7e5eca0/node_modules/yargs-parser/", {
        "name": "yargs-parser",
        "reference": "13.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-yargs-parser-11.1.1-879a0865973bca9f6bab5cbdf3b1c67ec7d3bcf4/node_modules/yargs-parser/", {
        "name": "yargs-parser",
        "reference": "11.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-camelcase-4.1.0-d545635be1e33c542649c69173e5de6acfae34dd/node_modules/camelcase/", {
        "name": "camelcase",
        "reference": "4.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-camelcase-5.3.1-e3c9b31569e106811df242f715725a1f4c494320/node_modules/camelcase/", {
        "name": "camelcase",
        "reference": "5.3.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-camelcase-1.2.1-9bb5304d2e0b56698b2c758b08a3eaa9daa58a39/node_modules/camelcase/", {
        "name": "camelcase",
        "reference": "1.2.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-minify-webpack-plugin-0.3.1-292aa240af190e2dcadf4f684d6d84d179b6d5a4/node_modules/babel-minify-webpack-plugin/", {
        "name": "babel-minify-webpack-plugin",
        "reference": "0.3.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-core-6.26.3-b2e2f09e342d0f0c88e2f02e067794125e75c207/node_modules/babel-core/", {
        "name": "babel-core",
        "reference": "6.26.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-code-frame-6.26.0-63fd43f7dc1e3bb7ce35947db8fe369a3f58c74b/node_modules/babel-code-frame/", {
        "name": "babel-code-frame",
        "reference": "6.26.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-has-ansi-2.0.0-34f5049ce1ecdf2b0649af3ef24e45ed35416d91/node_modules/has-ansi/", {
        "name": "has-ansi",
        "reference": "2.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ansi-regex-2.1.1-c3b33ab5ee360d86e0e628f0468ae7ef27d654df/node_modules/ansi-regex/", {
        "name": "ansi-regex",
        "reference": "2.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ansi-regex-4.1.0-8b9f8f08cf1acb843756a839ca8c7e3168c51997/node_modules/ansi-regex/", {
        "name": "ansi-regex",
        "reference": "4.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ansi-regex-3.0.0-ed0317c322064f79466c02966bddb605ab37d998/node_modules/ansi-regex/", {
        "name": "ansi-regex",
        "reference": "3.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-strip-ansi-3.0.1-6a385fb8853d952d5ff05d0e8aaf94278dc63dcf/node_modules/strip-ansi/", {
        "name": "strip-ansi",
        "reference": "3.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-strip-ansi-5.2.0-8c9a536feb6afc962bdfa5b104a5091c1ad9c0ae/node_modules/strip-ansi/", {
        "name": "strip-ansi",
        "reference": "5.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-strip-ansi-4.0.0-a8479022eb1ac368a871389b635262c505ee368f/node_modules/strip-ansi/", {
        "name": "strip-ansi",
        "reference": "4.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-generator-6.26.1-1844408d3b8f0d35a404ea7ac180f087a601bd90/node_modules/babel-generator/", {
        "name": "babel-generator",
        "reference": "6.26.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-messages-6.23.0-f3cdf4703858035b2a2951c6ec5edf6c62f2630e/node_modules/babel-messages/", {
        "name": "babel-messages",
        "reference": "6.23.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-runtime-6.26.0-965c7058668e82b55d7bfe04ff2337bc8b5647fe/node_modules/babel-runtime/", {
        "name": "babel-runtime",
        "reference": "6.26.0"
    }],
    ["./.pnp/unplugged/npm-core-js-2.6.10-8a5b8391f8cc7013da703411ce5b585706300d7f/node_modules/core-js/", {
        "name": "core-js",
        "reference": "2.6.10"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-types-6.26.0-a3b073f94ab49eb6fa55cd65227a334380632497/node_modules/babel-types/", {
        "name": "babel-types",
        "reference": "6.26.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-detect-indent-4.0.0-f76d064352cdf43a1cb6ce619c4ee3a9475de208/node_modules/detect-indent/", {
        "name": "detect-indent",
        "reference": "4.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-repeating-2.0.1-5214c53a926d3552707527fbab415dbc08d06dda/node_modules/repeating/", {
        "name": "repeating",
        "reference": "2.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-finite-1.0.2-cc6677695602be550ef11e8b4aa6305342b6d0aa/node_modules/is-finite/", {
        "name": "is-finite",
        "reference": "1.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-number-is-nan-1.0.1-097b602b53422a522c1afb8790318336941a011d/node_modules/number-is-nan/", {
        "name": "number-is-nan",
        "reference": "1.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-trim-right-1.0.1-cb2e1203067e0c8de1f614094b9fe45704ea6003/node_modules/trim-right/", {
        "name": "trim-right",
        "reference": "1.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-helpers-6.24.1-3471de9caec388e5c850e597e58a26ddf37602b2/node_modules/babel-helpers/", {
        "name": "babel-helpers",
        "reference": "6.24.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-template-6.26.0-de03e2d16396b069f46dd9fff8521fb1a0e35e02/node_modules/babel-template/", {
        "name": "babel-template",
        "reference": "6.26.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-traverse-6.26.0-46a9cbd7edcc62c8e5c064e2d2d8d0f4035766ee/node_modules/babel-traverse/", {
        "name": "babel-traverse",
        "reference": "6.26.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babylon-6.18.0-af2f3b88fa6f5c1e4c634d1a0f8eac4f55b395e3/node_modules/babylon/", {
        "name": "babylon",
        "reference": "6.18.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-babel-register-6.26.0-6ed021173e2fcb486d7acb45c6009a856f647071/node_modules/babel-register/", {
        "name": "babel-register",
        "reference": "6.26.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-home-or-tmp-2.0.0-e36c3f2d2cae7d746a857e38d18d5f32a7882db8/node_modules/home-or-tmp/", {
        "name": "home-or-tmp",
        "reference": "2.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-os-homedir-1.0.2-ffbc4988336e0e833de0c168c7ef152121aa7fb3/node_modules/os-homedir/", {
        "name": "os-homedir",
        "reference": "1.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-os-tmpdir-1.0.2-bbe67406c79aa85c5cfec766fe5734555dfa1274/node_modules/os-tmpdir/", {
        "name": "os-tmpdir",
        "reference": "1.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-source-map-support-0.4.18-0286a6de8be42641338594e97ccea75f0a2c585f/node_modules/source-map-support/", {
        "name": "source-map-support",
        "reference": "0.4.18"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-source-map-support-0.5.16-0ae069e7fe3ba7538c64c98515e35339eac5a042/node_modules/source-map-support/", {
        "name": "source-map-support",
        "reference": "0.5.16"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-minimatch-3.0.4-5166e286457f03306064be5497e8dbb0c3d32083/node_modules/minimatch/", {
        "name": "minimatch",
        "reference": "3.0.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-brace-expansion-1.1.11-3c7fcbf529d87226f3d2f52b966ff5271eb441dd/node_modules/brace-expansion/", {
        "name": "brace-expansion",
        "reference": "1.1.11"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-balanced-match-1.0.0-89b4d199ab2bee49de164ea02b89ce462d71b767/node_modules/balanced-match/", {
        "name": "balanced-match",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-concat-map-0.0.1-d8a96bd77fd68df7793a73036a3ba0d5405d477b/node_modules/concat-map/", {
        "name": "concat-map",
        "reference": "0.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-path-is-absolute-1.0.1-174b9268735534ffbc7ace6bf53a5a9e1b5c5f5f/node_modules/path-is-absolute/", {
        "name": "path-is-absolute",
        "reference": "1.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-slash-1.0.0-c41f2f6c39fc16d1cd17ad4b5d896114ae470d55/node_modules/slash/", {
        "name": "slash",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-lodash-some-4.6.0-1bb9f314ef6b8baded13b549169b2a945eb68e4d/node_modules/lodash.some/", {
        "name": "lodash.some",
        "reference": "4.6.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-lodash-isplainobject-4.0.6-7c526a52d89b45c45cc690b88163be0497f550cb/node_modules/lodash.isplainobject/", {
        "name": "lodash.isplainobject",
        "reference": "4.0.6"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-webpack-sources-1.4.3-eedd8ec0b928fbf1cbfe994e22d2d890f330a933/node_modules/webpack-sources/", {
        "name": "webpack-sources",
        "reference": "1.4.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-webpack-sources-2.0.0-beta.8-0fc292239f6767cf4e9b47becfaa340ce6d7ea4f/node_modules/webpack-sources/", {
        "name": "webpack-sources",
        "reference": "2.0.0-beta.8"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-source-list-map-2.0.1-3993bd873bfc48479cca9ea3a547835c7c154b34/node_modules/source-list-map/", {
        "name": "source-list-map",
        "reference": "2.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-circular-dependency-plugin-5.2.0-e09dbc2dd3e2928442403e2d45b41cea06bc0a93/node_modules/circular-dependency-plugin/", {
        "name": "circular-dependency-plugin",
        "reference": "5.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-copyfiles-2.1.1-d430e122d7880f92c45d372208b0af03b0c39db6/node_modules/copyfiles/", {
        "name": "copyfiles",
        "reference": "2.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-glob-7.1.6-141f33b81a7c2492e125594307480c46679278a6/node_modules/glob/", {
        "name": "glob",
        "reference": "7.1.6"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-fs-realpath-1.0.0-1504ad2523158caa40db4a2787cb01411994ea4f/node_modules/fs.realpath/", {
        "name": "fs.realpath",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-inflight-1.0.6-49bd6331d7d02d0c09bc910a1075ba8165b56df9/node_modules/inflight/", {
        "name": "inflight",
        "reference": "1.0.6"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-once-1.4.0-583b1aa775961d4b113ac17d9c50baef9dd76bd1/node_modules/once/", {
        "name": "once",
        "reference": "1.4.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-wrappy-1.0.2-b5243d8f3ec1aa35f1364605bc0d1036e30ab69f/node_modules/wrappy/", {
        "name": "wrappy",
        "reference": "1.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-inherits-2.0.4-0fa2c64f932917c3433a0ded55363aae37416b7c/node_modules/inherits/", {
        "name": "inherits",
        "reference": "2.0.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-inherits-2.0.3-633c2c83e3da42a502f52466022480f4208261de/node_modules/inherits/", {
        "name": "inherits",
        "reference": "2.0.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-noms-0.0.0-da8ebd9f3af9d6760919b27d9cdc8092a7332859/node_modules/noms/", {
        "name": "noms",
        "reference": "0.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-readable-stream-1.0.34-125820e34bc842d2f2aaafafe4c2916ee32c157c/node_modules/readable-stream/", {
        "name": "readable-stream",
        "reference": "1.0.34"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-readable-stream-2.3.6-b11c27d88b8ff1fbe070643cf94b0c79ae1b0aaf/node_modules/readable-stream/", {
        "name": "readable-stream",
        "reference": "2.3.6"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-readable-stream-3.4.0-a51c26754658e0a3c21dbf59163bd45ba6f447fc/node_modules/readable-stream/", {
        "name": "readable-stream",
        "reference": "3.4.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-core-util-is-1.0.2-b5fd54220aa2bc5ab57aab7140c940754503c1a7/node_modules/core-util-is/", {
        "name": "core-util-is",
        "reference": "1.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-isarray-0.0.1-8a18acfca9a8f4177e09abfc6038939b05d1eedf/node_modules/isarray/", {
        "name": "isarray",
        "reference": "0.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-isarray-1.0.0-bb935d48582cba168c06834957a54a3e07124f11/node_modules/isarray/", {
        "name": "isarray",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-string-decoder-0.10.31-62e203bc41766c6c28c9fc84301dab1c5310fa94/node_modules/string_decoder/", {
        "name": "string_decoder",
        "reference": "0.10.31"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-string-decoder-1.1.1-9cf1611ba62685d7030ae9e4ba34149c3af03fc8/node_modules/string_decoder/", {
        "name": "string_decoder",
        "reference": "1.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-string-decoder-1.3.0-42f114594a46cf1a8e30b0a84f56c78c3edac21e/node_modules/string_decoder/", {
        "name": "string_decoder",
        "reference": "1.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-through2-2.0.5-01c1e39eb31d07cb7d03a96a70823260b23132cd/node_modules/through2/", {
        "name": "through2",
        "reference": "2.0.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-process-nextick-args-2.0.1-7820d9b16120cc55ca9ae7792680ae7dba6d7fe2/node_modules/process-nextick-args/", {
        "name": "process-nextick-args",
        "reference": "2.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-util-deprecate-1.0.2-450d4dc9fa70de732762fbd2d4a28981419a0ccf/node_modules/util-deprecate/", {
        "name": "util-deprecate",
        "reference": "1.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-xtend-4.0.2-bb72779f5fa465186b1f438f674fa347fdb5db54/node_modules/xtend/", {
        "name": "xtend",
        "reference": "4.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-yargs-13.3.0-4c657a55e07e5f2cf947f8a366567c04a0dedc83/node_modules/yargs/", {
        "name": "yargs",
        "reference": "13.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-yargs-13.2.4-0b562b794016eb9651b98bd37acf364aa5d6dc83/node_modules/yargs/", {
        "name": "yargs",
        "reference": "13.2.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-yargs-12.0.5-05f5997b609647b64f66b81e3b4b10a368e7ad13/node_modules/yargs/", {
        "name": "yargs",
        "reference": "12.0.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-yargs-3.10.0-f7ee7bd857dd7c1d2d38c0e74efbd681d1431fd1/node_modules/yargs/", {
        "name": "yargs",
        "reference": "3.10.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-cliui-5.0.0-deefcfdb2e800784aa34f46fa08e06851c7bbbc5/node_modules/cliui/", {
        "name": "cliui",
        "reference": "5.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-cliui-4.1.0-348422dbe82d800b3022eef4f6ac10bf2e4d1b49/node_modules/cliui/", {
        "name": "cliui",
        "reference": "4.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-cliui-2.1.0-4b475760ff80264c762c3a1719032e91c7fea0d1/node_modules/cliui/", {
        "name": "cliui",
        "reference": "2.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-string-width-3.1.0-22767be21b62af1081574306f69ac51b62203961/node_modules/string-width/", {
        "name": "string-width",
        "reference": "3.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-string-width-2.1.1-ab93f27a8dc13d28cac815c462143a6d9012ae9e/node_modules/string-width/", {
        "name": "string-width",
        "reference": "2.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-string-width-1.0.2-118bdf5b8cdc51a2a7e70d211e07e2b0b9b107d3/node_modules/string-width/", {
        "name": "string-width",
        "reference": "1.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-emoji-regex-7.0.3-933a04052860c85e83c122479c4748a8e4c72156/node_modules/emoji-regex/", {
        "name": "emoji-regex",
        "reference": "7.0.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-fullwidth-code-point-2.0.0-a3b30a5c4f199183167aaab93beefae3ddfb654f/node_modules/is-fullwidth-code-point/", {
        "name": "is-fullwidth-code-point",
        "reference": "2.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-fullwidth-code-point-1.0.0-ef9e31386f031a7f0d643af82fde50c457ef00cb/node_modules/is-fullwidth-code-point/", {
        "name": "is-fullwidth-code-point",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-wrap-ansi-5.1.0-1fd1f67235d5b6d0fee781056001bfb694c03b09/node_modules/wrap-ansi/", {
        "name": "wrap-ansi",
        "reference": "5.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-wrap-ansi-2.1.0-d8fc3d284dd05794fe84973caecdd1cf824fdd85/node_modules/wrap-ansi/", {
        "name": "wrap-ansi",
        "reference": "2.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-get-caller-file-2.0.5-4f94412a82db32f36e3b0b9741f8a97feb031f7e/node_modules/get-caller-file/", {
        "name": "get-caller-file",
        "reference": "2.0.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-get-caller-file-1.0.3-f978fa4c90d1dfe7ff2d6beda2a515e713bdcf4a/node_modules/get-caller-file/", {
        "name": "get-caller-file",
        "reference": "1.0.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-require-directory-2.1.1-8c64ad5fd30dab1c976e2344ffe7f792a6a6df42/node_modules/require-directory/", {
        "name": "require-directory",
        "reference": "2.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-require-main-filename-2.0.0-d0b329ecc7cc0f61649f62215be69af54aa8989b/node_modules/require-main-filename/", {
        "name": "require-main-filename",
        "reference": "2.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-require-main-filename-1.0.1-97f717b69d48784f5f526a6c5aa8ffdda055a4d1/node_modules/require-main-filename/", {
        "name": "require-main-filename",
        "reference": "1.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-set-blocking-2.0.0-045f9782d011ae9a6803ddd382b24392b3d890f7/node_modules/set-blocking/", {
        "name": "set-blocking",
        "reference": "2.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-which-module-2.0.0-d9ef07dce77b9902b8a3a8fa4b31c3e3f7e6e87a/node_modules/which-module/", {
        "name": "which-module",
        "reference": "2.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-y18n-4.0.0-95ef94f85ecc81d007c264e190a120f0a3c8566b/node_modules/y18n/", {
        "name": "y18n",
        "reference": "4.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-decamelize-1.2.0-f6534d15148269b20352e7bee26f501f9a191290/node_modules/decamelize/", {
        "name": "decamelize",
        "reference": "1.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-diff-4.0.1-0c667cb467ebbb5cea7f14f135cc2dba7780a8ff/node_modules/diff/", {
        "name": "diff",
        "reference": "4.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-diff-1.4.0-7f28d2eb9ee7b15a97efd89ce63dcfdaa3ccbabf/node_modules/diff/", {
        "name": "diff",
        "reference": "1.4.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-duplicate-package-checker-webpack-plugin-3.0.0-78bb89e625fa7cf8c2a59c53f62b495fda9ba287/node_modules/duplicate-package-checker-webpack-plugin/", {
        "name": "duplicate-package-checker-webpack-plugin",
        "reference": "3.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-find-root-1.1.0-abcfc8ba76f708c42a97b3d685b7e9450bfb9ce4/node_modules/find-root/", {
        "name": "find-root",
        "reference": "1.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-eslint-plugin-flowtype-4.5.2-5353449692663ef70e8fc8c2386cebdecac7e86b/node_modules/eslint-plugin-flowtype/", {
        "name": "eslint-plugin-flowtype",
        "reference": "4.5.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-flow-bin-0.112.0-6a21c31937c4a2f23a750056a364c598a95ea216/node_modules/flow-bin/", {
        "name": "flow-bin",
        "reference": "0.112.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-html-webpack-plugin-4.0.0-beta.8-db1e0cb7aa89d23212cd87a8958566420002c24d/node_modules/html-webpack-plugin/", {
        "name": "html-webpack-plugin",
        "reference": "4.0.0-beta.8"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-html-minifier-4.0.0-cca9aad8bce1175e02e17a8c33e46d8988889f56/node_modules/html-minifier/", {
        "name": "html-minifier",
        "reference": "4.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-camel-case-3.0.0-ca3c3688a4e9cf3a4cda777dc4dcbc713249cf73/node_modules/camel-case/", {
        "name": "camel-case",
        "reference": "3.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-no-case-2.3.2-60b813396be39b3f1288a4c1ed5d1e7d28b464ac/node_modules/no-case/", {
        "name": "no-case",
        "reference": "2.3.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-lower-case-1.1.4-9a2cabd1b9e8e0ae993a4bf7d5875c39c42e8eac/node_modules/lower-case/", {
        "name": "lower-case",
        "reference": "1.1.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-upper-case-1.1.3-f6b4501c2ec4cdd26ba78be7222961de77621598/node_modules/upper-case/", {
        "name": "upper-case",
        "reference": "1.1.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-clean-css-4.2.1-2d411ef76b8569b6d0c84068dabe85b0aa5e5c17/node_modules/clean-css/", {
        "name": "clean-css",
        "reference": "4.2.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-commander-2.20.3-fd485e84c03eb4881c20722ba48035e8531aeb33/node_modules/commander/", {
        "name": "commander",
        "reference": "2.20.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-he-1.2.0-84ae65fa7eafb165fddb61566ae14baf05664f0f/node_modules/he/", {
        "name": "he",
        "reference": "1.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-param-case-2.1.1-df94fd8cf6531ecf75e6bef9a0858fbc72be2247/node_modules/param-case/", {
        "name": "param-case",
        "reference": "2.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-relateurl-0.2.7-54dbf377e51440aca90a4cd274600d3ff2d888a9/node_modules/relateurl/", {
        "name": "relateurl",
        "reference": "0.2.7"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-uglify-js-3.7.0-14b854003386b7a7c045910f43afbc96d2aa5307/node_modules/uglify-js/", {
        "name": "uglify-js",
        "reference": "3.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-uglify-js-2.8.29-29c5733148057bb4e1f75df35b7a9cb72e6a59dd/node_modules/uglify-js/", {
        "name": "uglify-js",
        "reference": "2.8.29"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-pretty-error-2.1.1-5f4f87c8f91e5ae3f3ba87ab4cf5e03b1a17f1a3/node_modules/pretty-error/", {
        "name": "pretty-error",
        "reference": "2.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-renderkid-2.0.3-380179c2ff5ae1365c522bf2fcfcff01c5b74149/node_modules/renderkid/", {
        "name": "renderkid",
        "reference": "2.0.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-css-select-1.2.0-2b3a110539c5355f1cd8d314623e870b121ec858/node_modules/css-select/", {
        "name": "css-select",
        "reference": "1.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-boolbase-1.0.0-68dff5fbe60c51eb37725ea9e3ed310dcc1e776e/node_modules/boolbase/", {
        "name": "boolbase",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-css-what-2.1.3-a6d7604573365fe74686c3f311c56513d88285f2/node_modules/css-what/", {
        "name": "css-what",
        "reference": "2.1.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-domutils-1.5.1-dcd8488a26f563d61079e48c9f7b7e32373682cf/node_modules/domutils/", {
        "name": "domutils",
        "reference": "1.5.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-domutils-1.7.0-56ea341e834e06e6748af7a1cb25da67ea9f8c2a/node_modules/domutils/", {
        "name": "domutils",
        "reference": "1.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-dom-serializer-0.2.2-1afb81f533717175d478655debc5e332d9f9bb51/node_modules/dom-serializer/", {
        "name": "dom-serializer",
        "reference": "0.2.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-domelementtype-2.0.1-1f8bdfe91f5a78063274e803b4bdcedf6e94f94d/node_modules/domelementtype/", {
        "name": "domelementtype",
        "reference": "2.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-domelementtype-1.3.1-d048c44b37b0d10a7f2a3d5fee3f4333d790481f/node_modules/domelementtype/", {
        "name": "domelementtype",
        "reference": "1.3.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-entities-2.0.0-68d6084cab1b079767540d80e56a39b423e4abf4/node_modules/entities/", {
        "name": "entities",
        "reference": "2.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-entities-1.1.2-bdfa735299664dfafd34529ed4f8522a275fea56/node_modules/entities/", {
        "name": "entities",
        "reference": "1.1.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-nth-check-1.0.2-b2bd295c37e3dd58a3bf0700376663ba4d9cf05c/node_modules/nth-check/", {
        "name": "nth-check",
        "reference": "1.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-dom-converter-0.2.0-6721a9daee2e293682955b6afe416771627bb768/node_modules/dom-converter/", {
        "name": "dom-converter",
        "reference": "0.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-utila-0.4.0-8a16a05d445657a3aea5eecc5b12a4fa5379772c/node_modules/utila/", {
        "name": "utila",
        "reference": "0.4.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-htmlparser2-3.10.1-bd679dc3f59897b6a34bb10749c855bb53a9392f/node_modules/htmlparser2/", {
        "name": "htmlparser2",
        "reference": "3.10.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-domhandler-2.4.2-8805097e933d65e85546f726d60f5eb88b44f803/node_modules/domhandler/", {
        "name": "domhandler",
        "reference": "2.4.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-tapable-1.1.3-a1fccc06b58db61fd7a45da2da44f5f3a3e67ba2/node_modules/tapable/", {
        "name": "tapable",
        "reference": "1.1.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-tapable-2.0.0-beta.8-0a8d42f6895d43d5a895de15d9a9e3e425f72a0a/node_modules/tapable/", {
        "name": "tapable",
        "reference": "2.0.0-beta.8"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-http-server-0.11.1-2302a56a6ffef7f9abea0147d838a5e9b6b6a79b/node_modules/http-server/", {
        "name": "http-server",
        "reference": "0.11.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-colors-1.0.3-0433f44d809680fdeb60ed260f1b0c262e82a40b/node_modules/colors/", {
        "name": "colors",
        "reference": "1.0.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-corser-2.0.1-8eda252ecaab5840dcd975ceb90d9370c819ff87/node_modules/corser/", {
        "name": "corser",
        "reference": "2.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ecstatic-3.3.2-6d1dd49814d00594682c652adb66076a69d46c48/node_modules/ecstatic/", {
        "name": "ecstatic",
        "reference": "3.3.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-mime-1.6.0-32cd9e5c64553bd58d19a568af452acff04981b1/node_modules/mime/", {
        "name": "mime",
        "reference": "1.6.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-mime-2.4.4-bd7b91135fc6b01cde3e9bae33d659b63d8857e5/node_modules/mime/", {
        "name": "mime",
        "reference": "2.4.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-url-join-2.0.5-5af22f18c052a000a48d7b82c5e9c2e2feeda728/node_modules/url-join/", {
        "name": "url-join",
        "reference": "2.0.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-http-proxy-1.18.0-dbe55f63e75a347db7f3d99974f2692a314a6a3a/node_modules/http-proxy/", {
        "name": "http-proxy",
        "reference": "1.18.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-eventemitter3-4.0.0-d65176163887ee59f386d64c82610b696a4a74eb/node_modules/eventemitter3/", {
        "name": "eventemitter3",
        "reference": "4.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-follow-redirects-1.9.0-8d5bcdc65b7108fe1508649c79c12d732dcedb4f/node_modules/follow-redirects/", {
        "name": "follow-redirects",
        "reference": "1.9.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-requires-port-1.0.0-925d2601d39ac485e091cf0da5c6e694dc3dcaff/node_modules/requires-port/", {
        "name": "requires-port",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-opener-1.4.3-5c6da2c5d7e5831e8ffa3964950f8d6674ac90b8/node_modules/opener/", {
        "name": "opener",
        "reference": "1.4.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-opener-1.5.1-6d2f0e77f1a0af0032aca716c2c1fbb8e7e8abed/node_modules/opener/", {
        "name": "opener",
        "reference": "1.5.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-optimist-0.6.1-da3ea74686fa21a19a111c326e90eb15a0196686/node_modules/optimist/", {
        "name": "optimist",
        "reference": "0.6.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-wordwrap-0.0.3-a3d5da6cd5c0bc0008d37234bbaf1bed63059107/node_modules/wordwrap/", {
        "name": "wordwrap",
        "reference": "0.0.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-wordwrap-0.0.2-b79669bb42ecb409f83d583cad52ca17eaa1643f/node_modules/wordwrap/", {
        "name": "wordwrap",
        "reference": "0.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-portfinder-1.0.25-254fd337ffba869f4b9d37edc298059cb4d35eca/node_modules/portfinder/", {
        "name": "portfinder",
        "reference": "1.0.25"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-async-2.6.3-d72625e2344a3656e3a3ad4fa749fa83299d82ff/node_modules/async/", {
        "name": "async",
        "reference": "2.6.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-union-0.4.6-198fbdaeba254e788b0efcb630bc11f24a2959e0/node_modules/union/", {
        "name": "union",
        "reference": "0.4.6"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-qs-2.3.3-e9e85adbe75da0bbe4c8e0476a086290f863b404/node_modules/qs/", {
        "name": "qs",
        "reference": "2.3.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-qs-6.7.0-41dc1a015e3d581f1621776be31afb2876a9b1bc/node_modules/qs/", {
        "name": "qs",
        "reference": "6.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-parallel-webpack-2.4.0-37b06e6018cfeaccf713c969a19ae31b77b0474c/node_modules/parallel-webpack/", {
        "name": "parallel-webpack",
        "reference": "2.4.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ajv-4.11.8-82ffb02b29e662ae53bdc20af15947706739c536/node_modules/ajv/", {
        "name": "ajv",
        "reference": "4.11.8"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ajv-6.10.2-d3cea04d6b017b2894ad69040fec8b623eb4bd52/node_modules/ajv/", {
        "name": "ajv",
        "reference": "6.10.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-co-4.6.0-6ea6bdf3d853ae54ccb8e47bfa0bf3f9031fb184/node_modules/co/", {
        "name": "co",
        "reference": "4.6.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-json-stable-stringify-1.0.1-9a759d39c5f2ff503fd5300646ed445f88c4f9af/node_modules/json-stable-stringify/", {
        "name": "json-stable-stringify",
        "reference": "1.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-jsonify-0.0.0-2c74b6ee41d93ca51b7b5aaee8f503631d252a73/node_modules/jsonify/", {
        "name": "jsonify",
        "reference": "0.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-bluebird-3.7.1-df70e302b471d7473489acf26a93d63b53f874de/node_modules/bluebird/", {
        "name": "bluebird",
        "reference": "3.7.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-interpret-1.2.0-d5061a6224be58e8083985f5014d844359576296/node_modules/interpret/", {
        "name": "interpret",
        "reference": "1.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-lodash-assign-4.2.0-0d99f3ccd7a6d261d19bdaeb9245005d285808e7/node_modules/lodash.assign/", {
        "name": "lodash.assign",
        "reference": "4.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-lodash-endswith-4.2.1-fed59ac1738ed3e236edd7064ec456448b37bc09/node_modules/lodash.endswith/", {
        "name": "lodash.endswith",
        "reference": "4.2.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-lodash-flatten-4.4.0-f31c22225a9632d2bbf8e4addbef240aa765a61f/node_modules/lodash.flatten/", {
        "name": "lodash.flatten",
        "reference": "4.4.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-node-ipc-9.1.1-4e245ed6938e65100e595ebc5dc34b16e8dd5d69/node_modules/node-ipc/", {
        "name": "node-ipc",
        "reference": "9.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-event-pubsub-4.3.0-f68d816bc29f1ec02c539dc58c8dd40ce72cb36e/node_modules/event-pubsub/", {
        "name": "event-pubsub",
        "reference": "4.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-js-message-1.0.5-2300d24b1af08e89dd095bc1a4c9c9cfcb892d15/node_modules/js-message/", {
        "name": "js-message",
        "reference": "1.0.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-js-queue-2.0.0-362213cf860f468f0125fc6c96abc1742531f948/node_modules/js-queue/", {
        "name": "js-queue",
        "reference": "2.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-easy-stack-1.0.0-12c91b3085a37f0baa336e9486eac4bf94e3e788/node_modules/easy-stack/", {
        "name": "easy-stack",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-pluralize-1.2.1-d1a21483fd22bb41e58a12fa3421823140897c45/node_modules/pluralize/", {
        "name": "pluralize",
        "reference": "1.2.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-worker-farm-1.7.0-26a94c5391bbca926152002f69b84a4bf772e5a8/node_modules/worker-farm/", {
        "name": "worker-farm",
        "reference": "1.7.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-errno-0.1.7-4684d71779ad39af177e3f007996f7c67c852618/node_modules/errno/", {
        "name": "errno",
        "reference": "0.1.7"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-prr-1.0.1-d3fc114ba06995a45ec6893f484ceb1d78f5f476/node_modules/prr/", {
        "name": "prr",
        "reference": "1.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-rimraf-3.0.0-614176d4b3010b75e5c390eb0ee96f6dc0cebb9b/node_modules/rimraf/", {
        "name": "rimraf",
        "reference": "3.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-rimraf-2.7.1-35797f13a7fdadc566142c29d4f07ccad483e3ec/node_modules/rimraf/", {
        "name": "rimraf",
        "reference": "2.7.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-script-ext-html-webpack-plugin-2.1.4-7c309354e310bf78523e1b84ca96fd374ceb9880/node_modules/script-ext-html-webpack-plugin/", {
        "name": "script-ext-html-webpack-plugin",
        "reference": "2.1.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-webpack-5.0.0-beta.7-e2dc0ed0543c71e97524be0fcb68a80de50aa898/node_modules/webpack/", {
        "name": "webpack",
        "reference": "5.0.0-beta.7"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-ast-1.8.5-51b1c5fe6576a34953bf4b253df9f0d490d9e359/node_modules/@webassemblyjs/ast/", {
        "name": "@webassemblyjs/ast",
        "reference": "1.8.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-helper-module-context-1.8.5-def4b9927b0101dc8cbbd8d1edb5b7b9c82eb245/node_modules/@webassemblyjs/helper-module-context/", {
        "name": "@webassemblyjs/helper-module-context",
        "reference": "1.8.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-mamacro-0.0.3-ad2c9576197c9f1abf308d0787865bd975a3f3e4/node_modules/mamacro/", {
        "name": "mamacro",
        "reference": "0.0.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-helper-wasm-bytecode-1.8.5-537a750eddf5c1e932f3744206551c91c1b93e61/node_modules/@webassemblyjs/helper-wasm-bytecode/", {
        "name": "@webassemblyjs/helper-wasm-bytecode",
        "reference": "1.8.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-wast-parser-1.8.5-e10eecd542d0e7bd394f6827c49f3df6d4eefb8c/node_modules/@webassemblyjs/wast-parser/", {
        "name": "@webassemblyjs/wast-parser",
        "reference": "1.8.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-floating-point-hex-parser-1.8.5-1ba926a2923613edce496fd5b02e8ce8a5f49721/node_modules/@webassemblyjs/floating-point-hex-parser/", {
        "name": "@webassemblyjs/floating-point-hex-parser",
        "reference": "1.8.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-helper-api-error-1.8.5-c49dad22f645227c5edb610bdb9697f1aab721f7/node_modules/@webassemblyjs/helper-api-error/", {
        "name": "@webassemblyjs/helper-api-error",
        "reference": "1.8.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-helper-code-frame-1.8.5-9a740ff48e3faa3022b1dff54423df9aa293c25e/node_modules/@webassemblyjs/helper-code-frame/", {
        "name": "@webassemblyjs/helper-code-frame",
        "reference": "1.8.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-wast-printer-1.8.5-114bbc481fd10ca0e23b3560fa812748b0bae5bc/node_modules/@webassemblyjs/wast-printer/", {
        "name": "@webassemblyjs/wast-printer",
        "reference": "1.8.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@xtuc-long-4.2.2-d291c6a4e97989b5c61d9acf396ae4fe133a718d/node_modules/@xtuc/long/", {
        "name": "@xtuc/long",
        "reference": "4.2.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-helper-fsm-1.8.5-ba0b7d3b3f7e4733da6059c9332275d860702452/node_modules/@webassemblyjs/helper-fsm/", {
        "name": "@webassemblyjs/helper-fsm",
        "reference": "1.8.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-wasm-edit-1.8.5-962da12aa5acc1c131c81c4232991c82ce56e01a/node_modules/@webassemblyjs/wasm-edit/", {
        "name": "@webassemblyjs/wasm-edit",
        "reference": "1.8.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-helper-buffer-1.8.5-fea93e429863dd5e4338555f42292385a653f204/node_modules/@webassemblyjs/helper-buffer/", {
        "name": "@webassemblyjs/helper-buffer",
        "reference": "1.8.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-helper-wasm-section-1.8.5-74ca6a6bcbe19e50a3b6b462847e69503e6bfcbf/node_modules/@webassemblyjs/helper-wasm-section/", {
        "name": "@webassemblyjs/helper-wasm-section",
        "reference": "1.8.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-wasm-gen-1.8.5-54840766c2c1002eb64ed1abe720aded714f98bc/node_modules/@webassemblyjs/wasm-gen/", {
        "name": "@webassemblyjs/wasm-gen",
        "reference": "1.8.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-ieee754-1.8.5-712329dbef240f36bf57bd2f7b8fb9bf4154421e/node_modules/@webassemblyjs/ieee754/", {
        "name": "@webassemblyjs/ieee754",
        "reference": "1.8.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@xtuc-ieee754-1.2.0-eef014a3145ae477a1cbc00cd1e552336dceb790/node_modules/@xtuc/ieee754/", {
        "name": "@xtuc/ieee754",
        "reference": "1.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-leb128-1.8.5-044edeb34ea679f3e04cd4fd9824d5e35767ae10/node_modules/@webassemblyjs/leb128/", {
        "name": "@webassemblyjs/leb128",
        "reference": "1.8.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-utf8-1.8.5-a8bf3b5d8ffe986c7c1e373ccbdc2a0915f0cedc/node_modules/@webassemblyjs/utf8/", {
        "name": "@webassemblyjs/utf8",
        "reference": "1.8.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-wasm-opt-1.8.5-b24d9f6ba50394af1349f510afa8ffcb8a63d264/node_modules/@webassemblyjs/wasm-opt/", {
        "name": "@webassemblyjs/wasm-opt",
        "reference": "1.8.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webassemblyjs-wasm-parser-1.8.5-21576f0ec88b91427357b8536383668ef7c66b8d/node_modules/@webassemblyjs/wasm-parser/", {
        "name": "@webassemblyjs/wasm-parser",
        "reference": "1.8.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-acorn-7.1.0-949d36f2c292535da602283586c2477c57eb2d6c/node_modules/acorn/", {
        "name": "acorn",
        "reference": "7.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-acorn-6.3.0-0087509119ffa4fc0a0041d1e93a417e68cb856e/node_modules/acorn/", {
        "name": "acorn",
        "reference": "6.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-chrome-trace-event-1.0.2-234090ee97c7d4ad1a2c4beae27505deffc608a4/node_modules/chrome-trace-event/", {
        "name": "chrome-trace-event",
        "reference": "1.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-tslib-1.10.0-c3c19f95973fb0a62973fb09d90d961ee43e5c8a/node_modules/tslib/", {
        "name": "tslib",
        "reference": "1.10.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-enhanced-resolve-5.0.0-beta.4-a14a799c098c2c43ec2cd0b718b14a2eadec7301/node_modules/enhanced-resolve/", {
        "name": "enhanced-resolve",
        "reference": "5.0.0-beta.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-enhanced-resolve-4.1.0-41c7e0bfdfe74ac1ffe1e57ad6a5c6c9f3742a7f/node_modules/enhanced-resolve/", {
        "name": "enhanced-resolve",
        "reference": "4.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-graceful-fs-4.2.3-4a12ff1b60376ef09862c2093edd908328be8423/node_modules/graceful-fs/", {
        "name": "graceful-fs",
        "reference": "4.2.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-eslint-scope-5.0.0-e87c8887c73e8d1ec84f1ca591645c358bfc8fb9/node_modules/eslint-scope/", {
        "name": "eslint-scope",
        "reference": "5.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-esrecurse-4.2.1-007a3b9fdbc2b3bb87e4879ea19c92fdbd3942cf/node_modules/esrecurse/", {
        "name": "esrecurse",
        "reference": "4.2.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-estraverse-4.3.0-398ad3f3c5a24948be7725e83d11a7de28cdbd1d/node_modules/estraverse/", {
        "name": "estraverse",
        "reference": "4.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-events-3.0.0-9a0a0dfaf62893d92b875b8f2698ca4114973e88/node_modules/events/", {
        "name": "events",
        "reference": "3.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-glob-to-regexp-0.4.1-c75297087c851b9a578bd217dd59a92f59fe546e/node_modules/glob-to-regexp/", {
        "name": "glob-to-regexp",
        "reference": "0.4.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-json-parse-better-errors-1.0.2-bb867cfb3450e69107c131d1c514bab3dc8bcaa9/node_modules/json-parse-better-errors/", {
        "name": "json-parse-better-errors",
        "reference": "1.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-loader-runner-3.0.0-c86f303af2dacbd27eabd2ea3aaa957291562e23/node_modules/loader-runner/", {
        "name": "loader-runner",
        "reference": "3.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-neo-async-2.6.1-ac27ada66167fa8849a6addd837f6b189ad2081c/node_modules/neo-async/", {
        "name": "neo-async",
        "reference": "2.6.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-schema-utils-2.5.0-8f254f618d402cc80257486213c8970edfd7c22f/node_modules/schema-utils/", {
        "name": "schema-utils",
        "reference": "2.5.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-schema-utils-1.0.0-0b79a93204d7b600d4b2850d1f66c2a34951c770/node_modules/schema-utils/", {
        "name": "schema-utils",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-fast-deep-equal-2.0.1-7b05218ddf9667bf7f370bf7fdb2cb15fdd0aa49/node_modules/fast-deep-equal/", {
        "name": "fast-deep-equal",
        "reference": "2.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-fast-json-stable-stringify-2.0.0-d5142c0caee6b1189f87d3a76111064f86c8bbf2/node_modules/fast-json-stable-stringify/", {
        "name": "fast-json-stable-stringify",
        "reference": "2.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-json-schema-traverse-0.4.1-69f6a87d9513ab8bb8fe63bdb0979c448e684660/node_modules/json-schema-traverse/", {
        "name": "json-schema-traverse",
        "reference": "0.4.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-uri-js-4.2.2-94c540e1ff772956e2299507c010aea6c8838eb0/node_modules/uri-js/", {
        "name": "uri-js",
        "reference": "4.2.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-punycode-2.1.1-b58b010ac40c22c5657616c8d2c2c02c7bf479ec/node_modules/punycode/", {
        "name": "punycode",
        "reference": "2.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-punycode-1.3.2-9653a036fb7c1ee42342f2325cceefea3926c48d/node_modules/punycode/", {
        "name": "punycode",
        "reference": "1.3.2"
    }],
    ["./.pnp/externals/pnp-b05430443ee7aa37b1a8425db8c1975689445330/node_modules/ajv-keywords/", {
        "name": "ajv-keywords",
        "reference": "pnp:b05430443ee7aa37b1a8425db8c1975689445330"
    }],
    ["./.pnp/externals/pnp-98617499d4d50a8cd551a218fe8b73ef64f99afe/node_modules/ajv-keywords/", {
        "name": "ajv-keywords",
        "reference": "pnp:98617499d4d50a8cd551a218fe8b73ef64f99afe"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-terser-webpack-plugin-2.2.1-5569e6c7d8be79e5e43d6da23acc3b6ba77d22bd/node_modules/terser-webpack-plugin/", {
        "name": "terser-webpack-plugin",
        "reference": "2.2.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-cacache-13.0.1-a8000c21697089082f85287a1aec6e382024a71c/node_modules/cacache/", {
        "name": "cacache",
        "reference": "13.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-chownr-1.1.3-42d837d5239688d55f303003a508230fa6727142/node_modules/chownr/", {
        "name": "chownr",
        "reference": "1.1.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-figgy-pudding-3.5.1-862470112901c727a0e495a80744bd5baa1d6790/node_modules/figgy-pudding/", {
        "name": "figgy-pudding",
        "reference": "3.5.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-fs-minipass-2.0.0-a6415edab02fae4b9e9230bc87ee2e4472003cd1/node_modules/fs-minipass/", {
        "name": "fs-minipass",
        "reference": "2.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-minipass-3.1.1-7607ce778472a185ad6d89082aa2070f79cedcd5/node_modules/minipass/", {
        "name": "minipass",
        "reference": "3.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-yallist-4.0.0-9bb92790d9c0effec63be73519e11a35019a3a72/node_modules/yallist/", {
        "name": "yallist",
        "reference": "4.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-yallist-3.1.1-dbb7daf9bfd8bac9ab45ebf602b8cbad0d5d08fd/node_modules/yallist/", {
        "name": "yallist",
        "reference": "3.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-infer-owner-1.0.4-c4cefcaa8e51051c2a40ba2ce8a3d27295af9467/node_modules/infer-owner/", {
        "name": "infer-owner",
        "reference": "1.0.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-lru-cache-5.1.1-1da27e6710271947695daf6848e847f01d84b920/node_modules/lru-cache/", {
        "name": "lru-cache",
        "reference": "5.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-minipass-collect-1.0.2-22b813bf745dc6edba2576b940022ad6edc8c617/node_modules/minipass-collect/", {
        "name": "minipass-collect",
        "reference": "1.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-minipass-flush-1.0.5-82e7135d7e89a50ffe64610a787953c4c4cbb373/node_modules/minipass-flush/", {
        "name": "minipass-flush",
        "reference": "1.0.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-minipass-pipeline-1.2.2-3dcb6bb4a546e32969c7ad710f2c79a86abba93a/node_modules/minipass-pipeline/", {
        "name": "minipass-pipeline",
        "reference": "1.2.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-move-concurrently-1.0.1-be2c005fda32e0b29af1f05d7c4b33214c701f92/node_modules/move-concurrently/", {
        "name": "move-concurrently",
        "reference": "1.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-aproba-1.2.0-6802e6264efd18c790a1b0d517f0f2627bf2c94a/node_modules/aproba/", {
        "name": "aproba",
        "reference": "1.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-copy-concurrently-1.0.5-92297398cae34937fcafd6ec8139c18051f0b5e0/node_modules/copy-concurrently/", {
        "name": "copy-concurrently",
        "reference": "1.0.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-fs-write-stream-atomic-1.0.10-b47df53493ef911df75731e70a9ded0189db40c9/node_modules/fs-write-stream-atomic/", {
        "name": "fs-write-stream-atomic",
        "reference": "1.0.10"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-iferr-0.1.5-c60eed69e6d8fdb6b3104a1fcbca1c192dc5b501/node_modules/iferr/", {
        "name": "iferr",
        "reference": "0.1.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-imurmurhash-0.1.4-9218b9b2b928a238b13dc4fb6b6d576f231453ea/node_modules/imurmurhash/", {
        "name": "imurmurhash",
        "reference": "0.1.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-run-queue-1.0.3-e848396f057d223f24386924618e25694161ec47/node_modules/run-queue/", {
        "name": "run-queue",
        "reference": "1.0.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-p-map-3.0.0-d704d9af8a2ba684e2600d9a215983d4141a979d/node_modules/p-map/", {
        "name": "p-map",
        "reference": "3.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-p-map-2.1.0-310928feef9c9ecc65b68b17693018a665cea175/node_modules/p-map/", {
        "name": "p-map",
        "reference": "2.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-aggregate-error-3.0.1-db2fe7246e536f40d9b5442a39e117d7dd6a24e0/node_modules/aggregate-error/", {
        "name": "aggregate-error",
        "reference": "3.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-clean-stack-2.2.0-ee8472dbb129e727b31e8a10a427dee9dfe4008b/node_modules/clean-stack/", {
        "name": "clean-stack",
        "reference": "2.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-indent-string-4.0.0-624f8f4497d619b2d9768531d58f4122854d7251/node_modules/indent-string/", {
        "name": "indent-string",
        "reference": "4.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-promise-inflight-1.0.1-98472870bf228132fcbdd868129bad12c3c029e3/node_modules/promise-inflight/", {
        "name": "promise-inflight",
        "reference": "1.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ssri-7.1.0-92c241bf6de82365b5c7fb4bd76e975522e1294d/node_modules/ssri/", {
        "name": "ssri",
        "reference": "7.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-unique-filename-1.1.1-1d69769369ada0583103a1e6ae87681b56573230/node_modules/unique-filename/", {
        "name": "unique-filename",
        "reference": "1.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-unique-slug-2.0.2-baabce91083fc64e945b0f3ad613e264f7cd4e6c/node_modules/unique-slug/", {
        "name": "unique-slug",
        "reference": "2.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-jest-worker-24.9.0-5dbfdb5b2d322e98567898238a9697bcce67b3e5/node_modules/jest-worker/", {
        "name": "jest-worker",
        "reference": "24.9.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-merge-stream-2.0.0-52823629a14dd00c9770fb6ad47dc6310f2c1f60/node_modules/merge-stream/", {
        "name": "merge-stream",
        "reference": "2.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-serialize-javascript-2.1.0-9310276819efd0eb128258bb341957f6eb2fc570/node_modules/serialize-javascript/", {
        "name": "serialize-javascript",
        "reference": "2.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-terser-4.4.0-22c46b4817cf4c9565434bfe6ad47336af259ac3/node_modules/terser/", {
        "name": "terser",
        "reference": "4.4.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-buffer-from-1.1.1-32713bc028f75c02fdb710d7c7bcec1f2c6070ef/node_modules/buffer-from/", {
        "name": "buffer-from",
        "reference": "1.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-watchpack-2.0.0-beta.10-6e4a5b16bda08a5a3ce9851f166a45a8860066bb/node_modules/watchpack/", {
        "name": "watchpack",
        "reference": "2.0.0-beta.10"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-webpack-bundle-analyzer-3.6.0-39b3a8f829ca044682bc6f9e011c95deb554aefd/node_modules/webpack-bundle-analyzer/", {
        "name": "webpack-bundle-analyzer",
        "reference": "3.6.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-acorn-walk-6.2.0-123cb8f3b84c2171f1f7fb252615b1c78a6b1a8c/node_modules/acorn-walk/", {
        "name": "acorn-walk",
        "reference": "6.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-bfj-6.1.2-325c861a822bcb358a41c78a33b8e6e2086dde7f/node_modules/bfj/", {
        "name": "bfj",
        "reference": "6.1.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-check-types-8.0.3-3356cca19c889544f2d7a95ed49ce508a0ecf552/node_modules/check-types/", {
        "name": "check-types",
        "reference": "8.0.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-hoopy-0.1.4-609207d661100033a9a9402ad3dea677381c1b1d/node_modules/hoopy/", {
        "name": "hoopy",
        "reference": "0.1.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-tryer-1.0.1-f2c85406800b9b0f74c9f7465b81eaad241252f8/node_modules/tryer/", {
        "name": "tryer",
        "reference": "1.0.1"
    }],
    ["./.pnp/unplugged/npm-ejs-2.7.4-48661287573dcc53e366c7a1ae52c3a120eec9ba/node_modules/ejs/", {
        "name": "ejs",
        "reference": "2.7.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-express-4.17.1-4491fc38605cf51f8629d39c2b5d026f98a4c134/node_modules/express/", {
        "name": "express",
        "reference": "4.17.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-accepts-1.3.7-531bc726517a3b2b41f850021c6cc15eaab507cd/node_modules/accepts/", {
        "name": "accepts",
        "reference": "1.3.7"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-mime-types-2.1.25-39772d46621f93e2a80a856c53b86a62156a6437/node_modules/mime-types/", {
        "name": "mime-types",
        "reference": "2.1.25"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-mime-db-1.42.0-3e252907b4c7adb906597b4b65636272cf9e7bac/node_modules/mime-db/", {
        "name": "mime-db",
        "reference": "1.42.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-negotiator-0.6.2-feacf7ccf525a77ae9634436a64883ffeca346fb/node_modules/negotiator/", {
        "name": "negotiator",
        "reference": "0.6.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-array-flatten-1.1.1-9a5f699051b1e7073328f2a008968b64ea2955d2/node_modules/array-flatten/", {
        "name": "array-flatten",
        "reference": "1.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-array-flatten-2.1.2-24ef80a28c1a893617e2149b0c6d0d788293b099/node_modules/array-flatten/", {
        "name": "array-flatten",
        "reference": "2.1.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-body-parser-1.19.0-96b2709e57c9c4e09a6fd66a8fd979844f69f08a/node_modules/body-parser/", {
        "name": "body-parser",
        "reference": "1.19.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-bytes-3.1.0-f6cf7933a360e0588fa9fde85651cdc7f805d1f6/node_modules/bytes/", {
        "name": "bytes",
        "reference": "3.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-bytes-3.0.0-d32815404d689699f85a4ea4fa8755dd13a96048/node_modules/bytes/", {
        "name": "bytes",
        "reference": "3.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-content-type-1.0.4-e138cc75e040c727b1966fe5e5f8c9aee256fe3b/node_modules/content-type/", {
        "name": "content-type",
        "reference": "1.0.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-depd-1.1.2-9bcd52e14c097763e749b274c4346ed2e560b5a9/node_modules/depd/", {
        "name": "depd",
        "reference": "1.1.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-http-errors-1.7.2-4f5029cf13239f31036e5b2e55292bcfbcc85c8f/node_modules/http-errors/", {
        "name": "http-errors",
        "reference": "1.7.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-http-errors-1.7.3-6c619e4f9c60308c38519498c14fbb10aacebb06/node_modules/http-errors/", {
        "name": "http-errors",
        "reference": "1.7.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-http-errors-1.6.3-8b55680bb4be283a0b5bf4ea2e38580be1d9320d/node_modules/http-errors/", {
        "name": "http-errors",
        "reference": "1.6.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-setprototypeof-1.1.1-7e95acb24aa92f5885e0abef5ba131330d4ae683/node_modules/setprototypeof/", {
        "name": "setprototypeof",
        "reference": "1.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-setprototypeof-1.1.0-d0bd85536887b6fe7c0d818cb962d9d91c54e656/node_modules/setprototypeof/", {
        "name": "setprototypeof",
        "reference": "1.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-statuses-1.5.0-161c7dac177659fd9811f43771fa99381478628c/node_modules/statuses/", {
        "name": "statuses",
        "reference": "1.5.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-toidentifier-1.0.0-7e1be3470f1e77948bc43d94a3c8f4d7752ba553/node_modules/toidentifier/", {
        "name": "toidentifier",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-iconv-lite-0.4.24-2022b4b25fbddc21d2f524974a474aafe733908b/node_modules/iconv-lite/", {
        "name": "iconv-lite",
        "reference": "0.4.24"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-safer-buffer-2.1.2-44fa161b0187b9549dd84bb91802f9bd8385cd6a/node_modules/safer-buffer/", {
        "name": "safer-buffer",
        "reference": "2.1.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-on-finished-2.3.0-20f1336481b083cd75337992a16971aa2d906947/node_modules/on-finished/", {
        "name": "on-finished",
        "reference": "2.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ee-first-1.1.1-590c61156b0ae2f4f0255732a158b266bc56b21d/node_modules/ee-first/", {
        "name": "ee-first",
        "reference": "1.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-raw-body-2.4.0-a1ce6fb9c9bc356ca52e89256ab59059e13d0332/node_modules/raw-body/", {
        "name": "raw-body",
        "reference": "2.4.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-unpipe-1.0.0-b2bf4ee8514aae6165b4817829d21b2ef49904ec/node_modules/unpipe/", {
        "name": "unpipe",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-type-is-1.6.18-4e552cd05df09467dcbc4ef739de89f2cf37c131/node_modules/type-is/", {
        "name": "type-is",
        "reference": "1.6.18"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-media-typer-0.3.0-8710d7af0aa626f8fffa1ce00168545263255748/node_modules/media-typer/", {
        "name": "media-typer",
        "reference": "0.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-content-disposition-0.5.3-e130caf7e7279087c5616c2007d0485698984fbd/node_modules/content-disposition/", {
        "name": "content-disposition",
        "reference": "0.5.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-cookie-0.4.0-beb437e7022b3b6d49019d088665303ebe9c14ba/node_modules/cookie/", {
        "name": "cookie",
        "reference": "0.4.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-cookie-signature-1.0.6-e303a882b342cc3ee8ca513a79999734dab3ae2c/node_modules/cookie-signature/", {
        "name": "cookie-signature",
        "reference": "1.0.6"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-encodeurl-1.0.2-ad3ff4c86ec2d029322f5a02c3a9a606c95b3f59/node_modules/encodeurl/", {
        "name": "encodeurl",
        "reference": "1.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-escape-html-1.0.3-0258eae4d3d0c0974de1c169188ef0051d1d1988/node_modules/escape-html/", {
        "name": "escape-html",
        "reference": "1.0.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-etag-1.8.1-41ae2eeb65efa62268aebfea83ac7d79299b0887/node_modules/etag/", {
        "name": "etag",
        "reference": "1.8.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-finalhandler-1.1.2-b7e7d000ffd11938d0fdb053506f6ebabe9f587d/node_modules/finalhandler/", {
        "name": "finalhandler",
        "reference": "1.1.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-parseurl-1.3.3-9da19e7bee8d12dff0513ed5b76957793bc2e8d4/node_modules/parseurl/", {
        "name": "parseurl",
        "reference": "1.3.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-fresh-0.5.2-3d8cadd90d976569fa835ab1f8e4b23a105605a7/node_modules/fresh/", {
        "name": "fresh",
        "reference": "0.5.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-merge-descriptors-1.0.1-b00aaa556dd8b44568150ec9d1b953f3f90cbb61/node_modules/merge-descriptors/", {
        "name": "merge-descriptors",
        "reference": "1.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-methods-1.1.2-5529a4d67654134edcc5266656835b0f851afcee/node_modules/methods/", {
        "name": "methods",
        "reference": "1.1.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-path-to-regexp-0.1.7-df604178005f522f15eb4490e7247a1bfaa67f8c/node_modules/path-to-regexp/", {
        "name": "path-to-regexp",
        "reference": "0.1.7"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-proxy-addr-2.0.5-34cbd64a2d81f4b1fd21e76f9f06c8a45299ee34/node_modules/proxy-addr/", {
        "name": "proxy-addr",
        "reference": "2.0.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-forwarded-0.1.2-98c23dab1175657b8c0573e8ceccd91b0ff18c84/node_modules/forwarded/", {
        "name": "forwarded",
        "reference": "0.1.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ipaddr-js-1.9.0-37df74e430a0e47550fe54a2defe30d8acd95f65/node_modules/ipaddr.js/", {
        "name": "ipaddr.js",
        "reference": "1.9.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ipaddr-js-1.9.1-bff38543eeb8984825079ff3a2a8e6cbd46781b3/node_modules/ipaddr.js/", {
        "name": "ipaddr.js",
        "reference": "1.9.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-range-parser-1.2.1-3cf37023d199e1c24d1a55b84800c2f3e6468031/node_modules/range-parser/", {
        "name": "range-parser",
        "reference": "1.2.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-send-0.17.1-c1d8b059f7900f7466dd4938bdc44e11ddb376c8/node_modules/send/", {
        "name": "send",
        "reference": "0.17.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-destroy-1.0.4-978857442c44749e4206613e37946205826abd80/node_modules/destroy/", {
        "name": "destroy",
        "reference": "1.0.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-serve-static-1.14.1-666e636dc4f010f7ef29970a88a674320898b2f9/node_modules/serve-static/", {
        "name": "serve-static",
        "reference": "1.14.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-utils-merge-1.0.1-9f95710f50a267947b2ccc124741c1028427e713/node_modules/utils-merge/", {
        "name": "utils-merge",
        "reference": "1.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-vary-1.1.2-2299f02c6ded30d4a5961b0b9f74524a18f634fc/node_modules/vary/", {
        "name": "vary",
        "reference": "1.1.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-filesize-3.6.1-090bb3ee01b6f801a8a8be99d31710b3422bb317/node_modules/filesize/", {
        "name": "filesize",
        "reference": "3.6.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-gzip-size-5.1.1-cb9bee692f87c0612b232840a873904e4c135274/node_modules/gzip-size/", {
        "name": "gzip-size",
        "reference": "5.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-duplexer-0.1.1-ace6ff808c1ce66b57d1ebf97977acb02334cfc1/node_modules/duplexer/", {
        "name": "duplexer",
        "reference": "0.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ws-6.2.1-442fdf0a47ed64f59b6a5d8ff130f4748ed524fb/node_modules/ws/", {
        "name": "ws",
        "reference": "6.2.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-async-limiter-1.0.1-dd379e94f0db8310b08291f9d64c3209766617fd/node_modules/async-limiter/", {
        "name": "async-limiter",
        "reference": "1.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-webpack-cli-3.3.10-17b279267e9b4fb549023fae170da8e6e766da13/node_modules/webpack-cli/", {
        "name": "webpack-cli",
        "reference": "3.3.10"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-cross-spawn-6.0.5-4a5ec7c64dfae22c3a14124dbacdee846d80cbc4/node_modules/cross-spawn/", {
        "name": "cross-spawn",
        "reference": "6.0.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-nice-try-1.0.5-a3378a7696ce7d223e88fc9b764bd7ef1089e366/node_modules/nice-try/", {
        "name": "nice-try",
        "reference": "1.0.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-path-key-2.0.1-411cadb574c5a140d3a4b1910d40d80cc9f40b40/node_modules/path-key/", {
        "name": "path-key",
        "reference": "2.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-shebang-command-1.2.0-44aac65b695b03398968c39f363fee5deafdf1ea/node_modules/shebang-command/", {
        "name": "shebang-command",
        "reference": "1.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-shebang-regex-1.0.0-da42f49740c0b42db2ca9728571cb190c98efea3/node_modules/shebang-regex/", {
        "name": "shebang-regex",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-which-1.3.1-a45043d54f5805316da8d62f9f50918d3da70b0a/node_modules/which/", {
        "name": "which",
        "reference": "1.3.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-isexe-2.0.0-e8fbf374dc556ff8947a10dcb0572d633f2cfa10/node_modules/isexe/", {
        "name": "isexe",
        "reference": "2.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-memory-fs-0.4.1-3a9a20b8462523e447cfbc7e8bb80ed667bfc552/node_modules/memory-fs/", {
        "name": "memory-fs",
        "reference": "0.4.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-findup-sync-3.0.0-17b108f9ee512dfb7a5c7f3c8b27ea9e1a9c08d1/node_modules/findup-sync/", {
        "name": "findup-sync",
        "reference": "3.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-detect-file-1.0.0-f0d66d03672a825cb1b73bdb3fe62310c8e552b7/node_modules/detect-file/", {
        "name": "detect-file",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-glob-4.0.1-7567dbe9f2f5e2467bc77ab83c4a29482407a5dc/node_modules/is-glob/", {
        "name": "is-glob",
        "reference": "4.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-glob-3.1.0-7ba5ae24217804ac70707b96922567486cc3e84a/node_modules/is-glob/", {
        "name": "is-glob",
        "reference": "3.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-extglob-2.1.1-a88c02535791f02ed37c76a1b9ea9773c833f8c2/node_modules/is-extglob/", {
        "name": "is-extglob",
        "reference": "2.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-micromatch-3.1.10-70859bc95c9840952f359a068a3fc49f9ecfac23/node_modules/micromatch/", {
        "name": "micromatch",
        "reference": "3.1.10"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-arr-diff-4.0.0-d6461074febfec71e7e15235761a329a5dc7c520/node_modules/arr-diff/", {
        "name": "arr-diff",
        "reference": "4.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-array-unique-0.3.2-a894b75d4bc4f6cd679ef3244a9fd8f46ae2d428/node_modules/array-unique/", {
        "name": "array-unique",
        "reference": "0.3.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-braces-2.3.2-5979fd3f14cd531565e5fa2df1abfff1dfaee729/node_modules/braces/", {
        "name": "braces",
        "reference": "2.3.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-arr-flatten-1.1.0-36048bbff4e7b47e136644316c99669ea5ae91f1/node_modules/arr-flatten/", {
        "name": "arr-flatten",
        "reference": "1.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-extend-shallow-2.0.1-51af7d614ad9a9f610ea1bafbb989d6b1c56890f/node_modules/extend-shallow/", {
        "name": "extend-shallow",
        "reference": "2.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-extend-shallow-3.0.2-26a71aaf073b39fb2127172746131c2704028db8/node_modules/extend-shallow/", {
        "name": "extend-shallow",
        "reference": "3.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-extendable-0.1.1-62b110e289a471418e3ec36a617d472e301dfc89/node_modules/is-extendable/", {
        "name": "is-extendable",
        "reference": "0.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-extendable-1.0.1-a7470f9e426733d81bd81e1155264e3a3507cab4/node_modules/is-extendable/", {
        "name": "is-extendable",
        "reference": "1.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-fill-range-4.0.0-d544811d428f98eb06a63dc402d2403c328c38f7/node_modules/fill-range/", {
        "name": "fill-range",
        "reference": "4.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-number-3.0.0-24fd6201a4782cf50561c810276afc7d12d71195/node_modules/is-number/", {
        "name": "is-number",
        "reference": "3.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-kind-of-3.2.2-31ea21a734bab9bbb0f32466d893aea51e4a3c64/node_modules/kind-of/", {
        "name": "kind-of",
        "reference": "3.2.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-kind-of-4.0.0-20813df3d712928b207378691a45066fae72dd57/node_modules/kind-of/", {
        "name": "kind-of",
        "reference": "4.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-kind-of-5.1.0-729c91e2d857b7a419a1f9aa65685c4c33f5845d/node_modules/kind-of/", {
        "name": "kind-of",
        "reference": "5.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-kind-of-6.0.2-01146b36a6218e64e58f3a8d66de5d7fc6f6d051/node_modules/kind-of/", {
        "name": "kind-of",
        "reference": "6.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-buffer-1.1.6-efaa2ea9daa0d7ab2ea13a97b2b8ad51fefbe8be/node_modules/is-buffer/", {
        "name": "is-buffer",
        "reference": "1.1.6"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-repeat-string-1.6.1-8dcae470e1c88abc2d600fff4a776286da75e637/node_modules/repeat-string/", {
        "name": "repeat-string",
        "reference": "1.6.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-to-regex-range-2.1.1-7c80c17b9dfebe599e27367e0d4dd5590141db38/node_modules/to-regex-range/", {
        "name": "to-regex-range",
        "reference": "2.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-isobject-3.0.1-4e431e92b11a9731636aa1f9c8d1ccbcfdab78df/node_modules/isobject/", {
        "name": "isobject",
        "reference": "3.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-isobject-2.1.0-f065561096a3f1da2ef46272f815c840d87e0c89/node_modules/isobject/", {
        "name": "isobject",
        "reference": "2.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-repeat-element-1.1.3-782e0d825c0c5a3bb39731f84efee6b742e6b1ce/node_modules/repeat-element/", {
        "name": "repeat-element",
        "reference": "1.1.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-snapdragon-0.8.2-64922e7c565b0e14204ba1aa7d6964278d25182d/node_modules/snapdragon/", {
        "name": "snapdragon",
        "reference": "0.8.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-base-0.11.2-7bde5ced145b6d551a90db87f83c558b4eb48a8f/node_modules/base/", {
        "name": "base",
        "reference": "0.11.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-cache-base-1.0.1-0a7f46416831c8b662ee36fe4e7c59d76f666ab2/node_modules/cache-base/", {
        "name": "cache-base",
        "reference": "1.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-collection-visit-1.0.0-4bc0373c164bc3291b4d368c829cf1a80a59dca0/node_modules/collection-visit/", {
        "name": "collection-visit",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-map-visit-1.0.0-ecdca8f13144e660f1b5bd41f12f3479d98dfb8f/node_modules/map-visit/", {
        "name": "map-visit",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-object-visit-1.0.1-f79c4493af0c5377b59fe39d395e41042dd045bb/node_modules/object-visit/", {
        "name": "object-visit",
        "reference": "1.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-component-emitter-1.3.0-16e4070fba8ae29b679f2215853ee181ab2eabc0/node_modules/component-emitter/", {
        "name": "component-emitter",
        "reference": "1.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-get-value-2.0.6-dc15ca1c672387ca76bd37ac0a395ba2042a2c28/node_modules/get-value/", {
        "name": "get-value",
        "reference": "2.0.6"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-has-value-1.0.0-18b281da585b1c5c51def24c930ed29a0be6b177/node_modules/has-value/", {
        "name": "has-value",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-has-value-0.3.1-7b1f58bada62ca827ec0a2078025654845995e1f/node_modules/has-value/", {
        "name": "has-value",
        "reference": "0.3.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-has-values-1.0.0-95b0b63fec2146619a6fe57fe75628d5a39efe4f/node_modules/has-values/", {
        "name": "has-values",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-has-values-0.1.4-6d61de95d91dfca9b9a02089ad384bff8f62b771/node_modules/has-values/", {
        "name": "has-values",
        "reference": "0.1.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-set-value-2.0.1-a18d40530e6f07de4228c7defe4227af8cad005b/node_modules/set-value/", {
        "name": "set-value",
        "reference": "2.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-plain-object-2.0.4-2c163b3fafb1b606d9d17928f05c2a1c38e07677/node_modules/is-plain-object/", {
        "name": "is-plain-object",
        "reference": "2.0.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-split-string-3.1.0-7cb09dda3a86585705c64b39a6466038682e8fe2/node_modules/split-string/", {
        "name": "split-string",
        "reference": "3.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-assign-symbols-1.0.0-59667f41fadd4f20ccbc2bb96b8d4f7f78ec0367/node_modules/assign-symbols/", {
        "name": "assign-symbols",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-to-object-path-0.3.0-297588b7b0e7e0ac08e04e672f85c1f4999e17af/node_modules/to-object-path/", {
        "name": "to-object-path",
        "reference": "0.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-union-value-1.0.1-0b6fe7b835aecda61c6ea4d4f02c14221e109847/node_modules/union-value/", {
        "name": "union-value",
        "reference": "1.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-arr-union-3.1.0-e39b09aea9def866a8f206e288af63919bae39c4/node_modules/arr-union/", {
        "name": "arr-union",
        "reference": "3.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-unset-value-1.0.0-8376873f7d2335179ffb1e6fc3a8ed0dfc8ab559/node_modules/unset-value/", {
        "name": "unset-value",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-class-utils-0.3.6-f93369ae8b9a7ce02fd41faad0ca83033190c463/node_modules/class-utils/", {
        "name": "class-utils",
        "reference": "0.3.6"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-define-property-0.2.5-c35b1ef918ec3c990f9a5bc57be04aacec5c8116/node_modules/define-property/", {
        "name": "define-property",
        "reference": "0.2.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-define-property-1.0.0-769ebaaf3f4a63aad3af9e8d304c9bbe79bfb0e6/node_modules/define-property/", {
        "name": "define-property",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-define-property-2.0.2-d459689e8d654ba77e02a817f8710d702cb16e9d/node_modules/define-property/", {
        "name": "define-property",
        "reference": "2.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-descriptor-0.1.6-366d8240dde487ca51823b1ab9f07a10a78251ca/node_modules/is-descriptor/", {
        "name": "is-descriptor",
        "reference": "0.1.6"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-descriptor-1.0.2-3b159746a66604b04f8c81524ba365c5f14d86ec/node_modules/is-descriptor/", {
        "name": "is-descriptor",
        "reference": "1.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-accessor-descriptor-0.1.6-a9e12cb3ae8d876727eeef3843f8a0897b5c98d6/node_modules/is-accessor-descriptor/", {
        "name": "is-accessor-descriptor",
        "reference": "0.1.6"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-accessor-descriptor-1.0.0-169c2f6d3df1f992618072365c9b0ea1f6878656/node_modules/is-accessor-descriptor/", {
        "name": "is-accessor-descriptor",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-data-descriptor-0.1.4-0b5ee648388e2c860282e793f1856fec3f301b56/node_modules/is-data-descriptor/", {
        "name": "is-data-descriptor",
        "reference": "0.1.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-data-descriptor-1.0.0-d84876321d0e7add03990406abbbbd36ba9268c7/node_modules/is-data-descriptor/", {
        "name": "is-data-descriptor",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-static-extend-0.1.2-60809c39cbff55337226fd5e0b520f341f1fb5c6/node_modules/static-extend/", {
        "name": "static-extend",
        "reference": "0.1.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-object-copy-0.1.0-7e7d858b781bd7c991a41ba975ed3812754e998c/node_modules/object-copy/", {
        "name": "object-copy",
        "reference": "0.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-copy-descriptor-0.1.1-676f6eb3c39997c2ee1ac3a924fd6124748f578d/node_modules/copy-descriptor/", {
        "name": "copy-descriptor",
        "reference": "0.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-mixin-deep-1.3.2-1120b43dc359a785dce65b55b82e257ccf479566/node_modules/mixin-deep/", {
        "name": "mixin-deep",
        "reference": "1.3.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-for-in-1.0.2-81068d295a8142ec0ac726c6e2200c30fb6d5e80/node_modules/for-in/", {
        "name": "for-in",
        "reference": "1.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-pascalcase-0.1.1-b363e55e8006ca6fe21784d2db22bd15d7917f14/node_modules/pascalcase/", {
        "name": "pascalcase",
        "reference": "0.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-map-cache-0.2.2-c32abd0bd6525d9b051645bb4f26ac5dc98a0dbf/node_modules/map-cache/", {
        "name": "map-cache",
        "reference": "0.2.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-source-map-resolve-0.5.2-72e2cc34095543e43b2c62b2c4c10d4a9054f259/node_modules/source-map-resolve/", {
        "name": "source-map-resolve",
        "reference": "0.5.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-atob-2.1.2-6d9517eb9e030d2436666651e86bd9f6f13533c9/node_modules/atob/", {
        "name": "atob",
        "reference": "2.1.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-decode-uri-component-0.2.0-eb3913333458775cb84cd1a1fae062106bb87545/node_modules/decode-uri-component/", {
        "name": "decode-uri-component",
        "reference": "0.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-resolve-url-0.2.1-2c637fe77c893afd2a663fe21aa9080068e2052a/node_modules/resolve-url/", {
        "name": "resolve-url",
        "reference": "0.2.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-source-map-url-0.4.0-3e935d7ddd73631b97659956d55128e87b5084a3/node_modules/source-map-url/", {
        "name": "source-map-url",
        "reference": "0.4.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-urix-0.1.0-da937f7a62e21fec1fd18d49b35c2935067a6c72/node_modules/urix/", {
        "name": "urix",
        "reference": "0.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-use-3.1.1-d50c8cac79a19fbc20f2911f56eb973f4e10070f/node_modules/use/", {
        "name": "use",
        "reference": "3.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-snapdragon-node-2.1.1-6c175f86ff14bdb0724563e8f3c1b021a286853b/node_modules/snapdragon-node/", {
        "name": "snapdragon-node",
        "reference": "2.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-snapdragon-util-3.0.1-f956479486f2acd79700693f6f7b805e45ab56e2/node_modules/snapdragon-util/", {
        "name": "snapdragon-util",
        "reference": "3.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-to-regex-3.0.2-13cfdd9b336552f30b51f33a8ae1b42a7a7599ce/node_modules/to-regex/", {
        "name": "to-regex",
        "reference": "3.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-regex-not-1.0.2-1f4ece27e00b0b65e0247a6810e6a85d83a5752c/node_modules/regex-not/", {
        "name": "regex-not",
        "reference": "1.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-safe-regex-1.1.0-40a3669f3b077d1e943d44629e157dd48023bf2e/node_modules/safe-regex/", {
        "name": "safe-regex",
        "reference": "1.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ret-0.1.15-b8a4825d5bdb1fc3f6f53c2bc33f81388681c7bc/node_modules/ret/", {
        "name": "ret",
        "reference": "0.1.15"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-extglob-2.0.4-ad00fe4dc612a9232e8718711dc5cb5ab0285543/node_modules/extglob/", {
        "name": "extglob",
        "reference": "2.0.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-expand-brackets-2.1.4-b77735e315ce30f6b6eff0f83b04151a22449622/node_modules/expand-brackets/", {
        "name": "expand-brackets",
        "reference": "2.1.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-posix-character-classes-0.1.1-01eac0fe3b5af71a2a6c02feabb8c1fef7e00eab/node_modules/posix-character-classes/", {
        "name": "posix-character-classes",
        "reference": "0.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-fragment-cache-0.2.1-4290fad27f13e89be7f33799c6bc5a0abfff0d19/node_modules/fragment-cache/", {
        "name": "fragment-cache",
        "reference": "0.2.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-nanomatch-1.2.13-b87a8aa4fc0de8fe6be88895b38983ff265bd119/node_modules/nanomatch/", {
        "name": "nanomatch",
        "reference": "1.2.13"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-windows-1.0.2-d1850eb9791ecd18e6182ce12a30f396634bb19d/node_modules/is-windows/", {
        "name": "is-windows",
        "reference": "1.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-object-pick-1.3.0-87a10ac4c1694bd2e1cbf53591a66141fb5dd747/node_modules/object.pick/", {
        "name": "object.pick",
        "reference": "1.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-resolve-dir-1.0.1-79a40644c362be82f26effe739c9bb5382046f43/node_modules/resolve-dir/", {
        "name": "resolve-dir",
        "reference": "1.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-expand-tilde-2.0.2-97e801aa052df02454de46b02bf621642cdc8502/node_modules/expand-tilde/", {
        "name": "expand-tilde",
        "reference": "2.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-homedir-polyfill-1.0.3-743298cef4e5af3e194161fbadcc2151d3a058e8/node_modules/homedir-polyfill/", {
        "name": "homedir-polyfill",
        "reference": "1.0.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-parse-passwd-1.0.0-6d5b934a456993b23d37f40a382d6f1666a8e5c6/node_modules/parse-passwd/", {
        "name": "parse-passwd",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-global-modules-1.0.0-6d770f0eb523ac78164d72b5e71a8877265cc3ea/node_modules/global-modules/", {
        "name": "global-modules",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-global-modules-2.0.0-997605ad2345f27f51539bea26574421215c7780/node_modules/global-modules/", {
        "name": "global-modules",
        "reference": "2.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-global-prefix-1.0.2-dbf743c6c14992593c655568cb66ed32c0122ebe/node_modules/global-prefix/", {
        "name": "global-prefix",
        "reference": "1.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-global-prefix-3.0.0-fc85f73064df69f50421f47f883fe5b913ba9b97/node_modules/global-prefix/", {
        "name": "global-prefix",
        "reference": "3.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ini-1.3.5-eee25f56db1c9ec6085e0c22778083f596abf927/node_modules/ini/", {
        "name": "ini",
        "reference": "1.3.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-import-local-2.0.0-55070be38a5993cf18ef6db7e961f5bee5c5a09d/node_modules/import-local/", {
        "name": "import-local",
        "reference": "2.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-resolve-cwd-2.0.0-00a9f7387556e27038eae232caa372a6a59b665a/node_modules/resolve-cwd/", {
        "name": "resolve-cwd",
        "reference": "2.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-resolve-from-3.0.0-b22c7af7d9d6881bc8b6e653335eebcb0a188748/node_modules/resolve-from/", {
        "name": "resolve-from",
        "reference": "3.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-v8-compile-cache-2.0.3-00f7494d2ae2b688cfe2899df6ed2c54bef91dbe/node_modules/v8-compile-cache/", {
        "name": "v8-compile-cache",
        "reference": "2.0.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-os-locale-3.1.0-a802a6ee17f24c10483ab9935719cef4ed16bf1a/node_modules/os-locale/", {
        "name": "os-locale",
        "reference": "3.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-execa-1.0.0-c6236a5bb4df6d6f15e88e7f017798216749ddd8/node_modules/execa/", {
        "name": "execa",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-get-stream-4.1.0-c1b255575f3dc21d59bfc79cd3d2b46b1c3a54b5/node_modules/get-stream/", {
        "name": "get-stream",
        "reference": "4.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-pump-3.0.0-b4a2116815bde2f4e1ea602354e8c75565107a64/node_modules/pump/", {
        "name": "pump",
        "reference": "3.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-end-of-stream-1.4.4-5ae64a5f45057baf3626ec14da0ca5e4b2431eb0/node_modules/end-of-stream/", {
        "name": "end-of-stream",
        "reference": "1.4.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-stream-1.1.0-12d4a3dd4e68e0b79ceb8dbc84173ae80d91ca44/node_modules/is-stream/", {
        "name": "is-stream",
        "reference": "1.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-npm-run-path-2.0.2-35a9232dfa35d7067b4cb2ddf2357b1871536c5f/node_modules/npm-run-path/", {
        "name": "npm-run-path",
        "reference": "2.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-p-finally-1.0.0-3fbcfb15b899a44123b34b6dcc18b724336a2cae/node_modules/p-finally/", {
        "name": "p-finally",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-signal-exit-3.0.2-b5fdc08f1287ea1178628e415e25132b73646c6d/node_modules/signal-exit/", {
        "name": "signal-exit",
        "reference": "3.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-strip-eof-1.0.0-bb43ff5598a6eb05d89b59fcd129c983313606bf/node_modules/strip-eof/", {
        "name": "strip-eof",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-lcid-2.0.0-6ef5d2df60e52f82eb228a4c373e8d1f397253cf/node_modules/lcid/", {
        "name": "lcid",
        "reference": "2.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-invert-kv-2.0.0-7393f5afa59ec9ff5f67a27620d11c226e3eec02/node_modules/invert-kv/", {
        "name": "invert-kv",
        "reference": "2.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-mem-4.3.0-461af497bc4ae09608cdb2e60eefb69bff744178/node_modules/mem/", {
        "name": "mem",
        "reference": "4.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-map-age-cleaner-0.1.3-7d583a7306434c055fe474b0f45078e6e1b4b92a/node_modules/map-age-cleaner/", {
        "name": "map-age-cleaner",
        "reference": "0.1.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-p-defer-1.0.0-9f6eb182f6c9aa8cd743004a7d4f96b196b0fb0c/node_modules/p-defer/", {
        "name": "p-defer",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-mimic-fn-2.1.0-7ed2c2ccccaf84d3ffcb7a69b57711fc2083401b/node_modules/mimic-fn/", {
        "name": "mimic-fn",
        "reference": "2.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-p-is-promise-2.1.0-918cebaea248a62cf7ffab8e3bca8c5f882fc42e/node_modules/p-is-promise/", {
        "name": "p-is-promise",
        "reference": "2.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-webpack-dev-server-3.9.0-27c3b5d0f6b6677c4304465ac817623c8b27b89c/node_modules/webpack-dev-server/", {
        "name": "webpack-dev-server",
        "reference": "3.9.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ansi-html-0.0.7-813584021962a9e9e6fd039f940d12f56ca7859e/node_modules/ansi-html/", {
        "name": "ansi-html",
        "reference": "0.0.7"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-bonjour-3.5.0-8e890a183d8ee9a2393b3844c691a42bcf7bc9f5/node_modules/bonjour/", {
        "name": "bonjour",
        "reference": "3.5.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-deep-equal-1.1.1-b5c98c942ceffaf7cb051e24e1434a25a2e6076a/node_modules/deep-equal/", {
        "name": "deep-equal",
        "reference": "1.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-arguments-1.0.4-3faf966c7cba0ff437fb31f6250082fcf0448cf3/node_modules/is-arguments/", {
        "name": "is-arguments",
        "reference": "1.0.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-object-is-1.0.1-0aa60ec9989a0b3ed795cf4d06f62cf1ad6539b6/node_modules/object-is/", {
        "name": "object-is",
        "reference": "1.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-regexp-prototype-flags-1.2.0-6b30724e306a27833eeb171b66ac8890ba37e41c/node_modules/regexp.prototype.flags/", {
        "name": "regexp.prototype.flags",
        "reference": "1.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-dns-equal-1.0.0-b39e7f1da6eb0a75ba9c17324b34753c47e0654d/node_modules/dns-equal/", {
        "name": "dns-equal",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-dns-txt-2.0.2-b91d806f5d27188e4ab3e7d107d881a1cc4642b6/node_modules/dns-txt/", {
        "name": "dns-txt",
        "reference": "2.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-buffer-indexof-1.1.1-52fabcc6a606d1a00302802648ef68f639da268c/node_modules/buffer-indexof/", {
        "name": "buffer-indexof",
        "reference": "1.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-multicast-dns-6.2.3-a0ec7bd9055c4282f790c3c82f4e28db3b31b229/node_modules/multicast-dns/", {
        "name": "multicast-dns",
        "reference": "6.2.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-dns-packet-1.3.1-12aa426981075be500b910eedcd0b47dd7deda5a/node_modules/dns-packet/", {
        "name": "dns-packet",
        "reference": "1.3.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ip-1.1.5-bdded70114290828c0a039e72ef25f5aaec4354a/node_modules/ip/", {
        "name": "ip",
        "reference": "1.1.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-thunky-1.1.0-5abaf714a9405db0504732bbccd2cedd9ef9537d/node_modules/thunky/", {
        "name": "thunky",
        "reference": "1.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-multicast-dns-service-types-1.1.0-899f11d9686e5e05cb91b35d5f0e63b773cfc901/node_modules/multicast-dns-service-types/", {
        "name": "multicast-dns-service-types",
        "reference": "1.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-chokidar-2.1.8-804b3a7b6a99358c3c5c61e71d8728f041cff917/node_modules/chokidar/", {
        "name": "chokidar",
        "reference": "2.1.8"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-anymatch-2.0.0-bcb24b4f37934d9aa7ac17b4adaf89e7c76ef2eb/node_modules/anymatch/", {
        "name": "anymatch",
        "reference": "2.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-normalize-path-2.1.1-1ab28b556e198363a8c1a6f7e6fa20137fe6aed9/node_modules/normalize-path/", {
        "name": "normalize-path",
        "reference": "2.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-normalize-path-3.0.0-0dcd69ff23a1c9b11fd0978316644a0388216a65/node_modules/normalize-path/", {
        "name": "normalize-path",
        "reference": "3.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-remove-trailing-separator-1.1.0-c24bce2a283adad5bc3f58e0d48249b92379d8ef/node_modules/remove-trailing-separator/", {
        "name": "remove-trailing-separator",
        "reference": "1.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-async-each-1.0.3-b727dbf87d7651602f06f4d4ac387f47d91b0cbf/node_modules/async-each/", {
        "name": "async-each",
        "reference": "1.0.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-glob-parent-3.1.0-9e6af6299d8d3bd2bd40430832bd113df906c5ae/node_modules/glob-parent/", {
        "name": "glob-parent",
        "reference": "3.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-path-dirname-1.0.2-cc33d24d525e099a5388c0336c6e32b9160609e0/node_modules/path-dirname/", {
        "name": "path-dirname",
        "reference": "1.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-binary-path-1.0.1-75f16642b480f187a711c814161fd3a4a7655898/node_modules/is-binary-path/", {
        "name": "is-binary-path",
        "reference": "1.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-binary-extensions-1.13.1-598afe54755b2868a5330d2aff9d4ebb53209b65/node_modules/binary-extensions/", {
        "name": "binary-extensions",
        "reference": "1.13.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-readdirp-2.2.1-0e87622a3325aa33e892285caf8b4e846529a525/node_modules/readdirp/", {
        "name": "readdirp",
        "reference": "2.2.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-upath-1.2.0-8f66dbcd55a883acdae4408af8b035a5044c1894/node_modules/upath/", {
        "name": "upath",
        "reference": "1.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-compression-1.7.4-95523eff170ca57c29a0ca41e6fe131f41e5bb8f/node_modules/compression/", {
        "name": "compression",
        "reference": "1.7.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-compressible-2.0.17-6e8c108a16ad58384a977f3a482ca20bff2f38c1/node_modules/compressible/", {
        "name": "compressible",
        "reference": "2.0.17"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-on-headers-1.0.2-772b0ae6aaa525c399e489adfad90c403eb3c28f/node_modules/on-headers/", {
        "name": "on-headers",
        "reference": "1.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-connect-history-api-fallback-1.6.0-8b32089359308d111115d81cad3fceab888f97bc/node_modules/connect-history-api-fallback/", {
        "name": "connect-history-api-fallback",
        "reference": "1.6.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-del-4.1.1-9e8f117222ea44a31ff3a156c049b99052a9f0b4/node_modules/del/", {
        "name": "del",
        "reference": "4.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@types-glob-7.1.1-aa59a1c6e3fbc421e07ccd31a944c30eba521575/node_modules/@types/glob/", {
        "name": "@types/glob",
        "reference": "7.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@types-events-3.0.0-2862f3f58a9a7f7c3e78d79f130dd4d71c25c2a7/node_modules/@types/events/", {
        "name": "@types/events",
        "reference": "3.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@types-minimatch-3.0.3-3dca0e3f33b200fc7d1139c0cd96c1268cadfd9d/node_modules/@types/minimatch/", {
        "name": "@types/minimatch",
        "reference": "3.0.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@types-node-12.12.11-bec2961975888d964196bf0016a2f984d793d3ce/node_modules/@types/node/", {
        "name": "@types/node",
        "reference": "12.12.11"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-globby-6.1.0-f5a6d70e8395e21c858fb0489d64df02424d506c/node_modules/globby/", {
        "name": "globby",
        "reference": "6.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-array-union-1.0.2-9a34410e4f4e3da23dea375be5be70f24778ec39/node_modules/array-union/", {
        "name": "array-union",
        "reference": "1.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-array-uniq-1.0.3-af6ac877a25cc7f74e058894753858dfdb24fdb6/node_modules/array-uniq/", {
        "name": "array-uniq",
        "reference": "1.0.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-object-assign-4.1.1-2109adc7965887cfc05cbbd442cac8bfbb360863/node_modules/object-assign/", {
        "name": "object-assign",
        "reference": "4.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-pinkie-promise-2.0.1-2135d6dfa7a358c069ac9b178776288228450ffa/node_modules/pinkie-promise/", {
        "name": "pinkie-promise",
        "reference": "2.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-pinkie-2.0.4-72556b80cfa0d48a974e80e77248e80ed4f7f870/node_modules/pinkie/", {
        "name": "pinkie",
        "reference": "2.0.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-path-cwd-2.2.0-67d43b82664a7b5191fd9119127eb300048a9fdb/node_modules/is-path-cwd/", {
        "name": "is-path-cwd",
        "reference": "2.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-path-in-cwd-2.1.0-bfe2dca26c69f397265a4009963602935a053acb/node_modules/is-path-in-cwd/", {
        "name": "is-path-in-cwd",
        "reference": "2.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-path-inside-2.1.0-7c9810587d659a40d27bcdb4d5616eab059494b2/node_modules/is-path-inside/", {
        "name": "is-path-inside",
        "reference": "2.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-path-is-inside-1.0.2-365417dede44430d1c11af61027facf074bdfc53/node_modules/path-is-inside/", {
        "name": "path-is-inside",
        "reference": "1.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-html-entities-1.2.1-0df29351f0721163515dfb9e5543e5f6eed5162f/node_modules/html-entities/", {
        "name": "html-entities",
        "reference": "1.2.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-http-proxy-middleware-0.19.1-183c7dc4aa1479150306498c210cdaf96080a43a/node_modules/http-proxy-middleware/", {
        "name": "http-proxy-middleware",
        "reference": "0.19.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-internal-ip-4.3.0-845452baad9d2ca3b69c635a137acb9a0dad0907/node_modules/internal-ip/", {
        "name": "internal-ip",
        "reference": "4.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-default-gateway-4.2.0-167104c7500c2115f6dd69b0a536bb8ed720552b/node_modules/default-gateway/", {
        "name": "default-gateway",
        "reference": "4.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ip-regex-2.1.0-fa78bf5d2e6913c911ce9f819ee5146bb6d844e9/node_modules/ip-regex/", {
        "name": "ip-regex",
        "reference": "2.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-absolute-url-3.0.3-96c6a22b6a23929b11ea0afb1836c36ad4a5d698/node_modules/is-absolute-url/", {
        "name": "is-absolute-url",
        "reference": "3.0.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-killable-1.0.1-4c8ce441187a061c7474fb87ca08e2a638194892/node_modules/killable/", {
        "name": "killable",
        "reference": "1.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-loglevel-1.6.6-0ee6300cc058db6b3551fa1c4bf73b83bb771312/node_modules/loglevel/", {
        "name": "loglevel",
        "reference": "1.6.6"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-opn-5.5.0-fc7164fab56d235904c51c3b27da6758ca3b9bfc/node_modules/opn/", {
        "name": "opn",
        "reference": "5.5.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-wsl-1.1.0-1f16e4aa22b04d1336b66188a66af3c600c3a66d/node_modules/is-wsl/", {
        "name": "is-wsl",
        "reference": "1.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-p-retry-3.0.1-316b4c8893e2c8dc1cfa891f406c4b422bebf328/node_modules/p-retry/", {
        "name": "p-retry",
        "reference": "3.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-retry-0.12.0-1b42a6266a21f07421d1b0b54b7dc167b01c013b/node_modules/retry/", {
        "name": "retry",
        "reference": "0.12.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ajv-errors-1.0.1-f35986aceb91afadec4102fbd85014950cefa64d/node_modules/ajv-errors/", {
        "name": "ajv-errors",
        "reference": "1.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-selfsigned-1.10.7-da5819fd049d5574f28e88a9bcc6dbc6e6f3906b/node_modules/selfsigned/", {
        "name": "selfsigned",
        "reference": "1.10.7"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-node-forge-0.9.0-d624050edbb44874adca12bb9a52ec63cb782579/node_modules/node-forge/", {
        "name": "node-forge",
        "reference": "0.9.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-serve-index-1.9.1-d3768d69b1e7d82e5ce050fff5b453bea12a9239/node_modules/serve-index/", {
        "name": "serve-index",
        "reference": "1.9.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-batch-0.6.1-dc34314f4e679318093fc760272525f94bf25c16/node_modules/batch/", {
        "name": "batch",
        "reference": "0.6.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-sockjs-0.3.19-d976bbe800af7bd20ae08598d582393508993c0d/node_modules/sockjs/", {
        "name": "sockjs",
        "reference": "0.3.19"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-faye-websocket-0.10.0-4e492f8d04dfb6f89003507f6edbf2d501e7c6f4/node_modules/faye-websocket/", {
        "name": "faye-websocket",
        "reference": "0.10.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-faye-websocket-0.11.3-5c0e9a8968e8912c286639fde977a8b209f2508e/node_modules/faye-websocket/", {
        "name": "faye-websocket",
        "reference": "0.11.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-websocket-driver-0.7.3-a2d4e0d4f4f116f1e6297eba58b05d430100e9f9/node_modules/websocket-driver/", {
        "name": "websocket-driver",
        "reference": "0.7.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-http-parser-js-0.4.10-92c9c1374c35085f75db359ec56cc257cbb93fa4/node_modules/http-parser-js/", {
        "name": "http-parser-js",
        "reference": "0.4.10"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-websocket-extensions-0.1.3-5d2ff22977003ec687a4b87073dfbbac146ccf29/node_modules/websocket-extensions/", {
        "name": "websocket-extensions",
        "reference": "0.1.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-uuid-3.3.3-4568f0216e78760ee1dbf3a4d2cf53e224112866/node_modules/uuid/", {
        "name": "uuid",
        "reference": "3.3.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-sockjs-client-1.4.0-c9f2568e19c8fd8173b4997ea3420e0bb306c7d5/node_modules/sockjs-client/", {
        "name": "sockjs-client",
        "reference": "1.4.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-eventsource-1.0.7-8fbc72c93fcd34088090bc0a4e64f4b5cee6d8d0/node_modules/eventsource/", {
        "name": "eventsource",
        "reference": "1.0.7"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-original-1.0.2-e442a61cffe1c5fd20a65f3261c26663b303f25f/node_modules/original/", {
        "name": "original",
        "reference": "1.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-url-parse-1.4.7-a8a83535e8c00a316e403a5db4ac1b9b853ae278/node_modules/url-parse/", {
        "name": "url-parse",
        "reference": "1.4.7"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-querystringify-2.1.1-60e5a5fd64a7f8bfa4d2ab2ed6fdf4c85bad154e/node_modules/querystringify/", {
        "name": "querystringify",
        "reference": "2.1.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-json3-3.3.3-7fc10e375fc5ae42c4705a5cc0aa6f62be305b81/node_modules/json3/", {
        "name": "json3",
        "reference": "3.3.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-spdy-4.0.1-6f12ed1c5db7ea4f24ebb8b89ba58c87c08257f2/node_modules/spdy/", {
        "name": "spdy",
        "reference": "4.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-handle-thing-2.0.0-0e039695ff50c93fc288557d696f3c1dc6776754/node_modules/handle-thing/", {
        "name": "handle-thing",
        "reference": "2.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-http-deceiver-1.2.7-fa7168944ab9a519d337cb0bec7284dc3e723d87/node_modules/http-deceiver/", {
        "name": "http-deceiver",
        "reference": "1.2.7"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-select-hose-2.0.0-625d8658f865af43ec962bfc376a37359a4994ca/node_modules/select-hose/", {
        "name": "select-hose",
        "reference": "2.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-spdy-transport-3.0.0-00d4863a6400ad75df93361a1608605e5dcdcf31/node_modules/spdy-transport/", {
        "name": "spdy-transport",
        "reference": "3.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-detect-node-2.0.4-014ee8f8f669c5c58023da64b8179c083a28c46c/node_modules/detect-node/", {
        "name": "detect-node",
        "reference": "2.0.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-hpack-js-2.1.6-87774c0949e513f42e84575b3c45681fade2a0b2/node_modules/hpack.js/", {
        "name": "hpack.js",
        "reference": "2.1.6"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-obuf-1.1.2-09bea3343d41859ebd446292d11c9d4db619084e/node_modules/obuf/", {
        "name": "obuf",
        "reference": "1.1.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-wbuf-1.7.3-c1d8d149316d3ea852848895cb6a0bfe887b87df/node_modules/wbuf/", {
        "name": "wbuf",
        "reference": "1.7.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-minimalistic-assert-1.0.1-2e194de044626d4a10e7f7fbc00ce73e83e4d5c7/node_modules/minimalistic-assert/", {
        "name": "minimalistic-assert",
        "reference": "1.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-url-0.11.0-3838e97cfc60521eb73c525a8e55bfdd9e2e28f1/node_modules/url/", {
        "name": "url",
        "reference": "0.11.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-querystring-0.2.0-b209849203bb25df820da756e747005878521620/node_modules/querystring/", {
        "name": "querystring",
        "reference": "0.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-webpack-dev-middleware-3.7.2-0019c3db716e3fa5cecbf64f2ab88a74bab331f3/node_modules/webpack-dev-middleware/", {
        "name": "webpack-dev-middleware",
        "reference": "3.7.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-webpack-log-2.0.0-5b7928e0637593f119d32f6227c1e0ac31e1b47f/node_modules/webpack-log/", {
        "name": "webpack-log",
        "reference": "2.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ansi-colors-3.2.4-e3a3da4bfbae6c86a9c285625de124a234026fbf/node_modules/ansi-colors/", {
        "name": "ansi-colors",
        "reference": "3.2.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-code-point-at-1.1.0-0d070b4d043a5bea33a2f1a40e2edb3d9a4ccf77/node_modules/code-point-at/", {
        "name": "code-point-at",
        "reference": "1.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-webpack-manifest-plugin-3.0.0-rc.0-d488cc34d9509aa4ffcf98eee8559d9106195e2a/node_modules/webpack-manifest-plugin/", {
        "name": "webpack-manifest-plugin",
        "reference": "3.0.0-rc.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-fs-extra-8.1.0-49d43c45a88cd9677668cb7be1b46efdb8d2e1c0/node_modules/fs-extra/", {
        "name": "fs-extra",
        "reference": "8.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-jsonfile-4.0.0-8771aae0799b64076b76640fca058f9c10e33ecb/node_modules/jsonfile/", {
        "name": "jsonfile",
        "reference": "4.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-universalify-0.1.2-b646f69be3942dabcecc9d6639c80dc105efaa66/node_modules/universalify/", {
        "name": "universalify",
        "reference": "0.1.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-webpack-merge-4.2.2-a27c52ea783d1398afd2087f547d7b9d2f43634d/node_modules/webpack-merge/", {
        "name": "webpack-merge",
        "reference": "4.2.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-webpack-polyfill-injector-3.0.2-1e2028c03c346163810735d6b29ed23ee34782a9/node_modules/webpack-polyfill-injector/", {
        "name": "webpack-polyfill-injector",
        "reference": "3.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-polyfill-library-3.42.0-36589ecaf8e970b23d8cc47a272b2aa543586502/node_modules/polyfill-library/", {
        "name": "polyfill-library",
        "reference": "3.42.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@financial-times-polyfill-useragent-normaliser-1.5.0-a7aa88dba9844bc1fdaaa0c7ebaf9bab5fd8f939/node_modules/@financial-times/polyfill-useragent-normaliser/", {
        "name": "@financial-times/polyfill-useragent-normaliser",
        "reference": "1.5.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@financial-times-useragent-parser-1.3.1-1c94068435a2dd40006f780f116cc72824ff6c02/node_modules/@financial-times/useragent_parser/", {
        "name": "@financial-times/useragent_parser",
        "reference": "1.3.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@iarna-toml-2.2.3-f060bf6eaafae4d56a7dac618980838b0696e2ab/node_modules/@iarna/toml/", {
        "name": "@iarna/toml",
        "reference": "2.2.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-@webcomponents-template-1.4.1-0ac6fa2053701e067829bf20c8304888472c7382/node_modules/@webcomponents/template/", {
        "name": "@webcomponents/template",
        "reference": "1.4.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-ase64-1.1.0-810ef21afa8357df92ad7b5389188c446b9cb956/node_modules/Base64/", {
        "name": "Base64",
        "reference": "1.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-abort-controller-2.0.3-b174827a732efadff81227ed4b8d1cc569baf20a/node_modules/abort-controller/", {
        "name": "abort-controller",
        "reference": "2.0.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-event-target-shim-5.0.1-5d4d3ebdf9583d63a5333ce2deb7480ab2b05789/node_modules/event-target-shim/", {
        "name": "event-target-shim",
        "reference": "5.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-audio-context-polyfill-1.0.0-4b728faf0a19555194d4fbd05582f833fdcd137b/node_modules/audio-context-polyfill/", {
        "name": "audio-context-polyfill",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-event-source-polyfill-0.0.9-18c6205d170ab09db889ffceaa33f0e493f14a50/node_modules/event-source-polyfill/", {
        "name": "event-source-polyfill",
        "reference": "0.0.9"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-from2-string-1.1.0-18282b27d08a267cb3030cd2b8b4b0f212af752a/node_modules/from2-string/", {
        "name": "from2-string",
        "reference": "1.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-from2-2.3.0-8bfb5502bde4a4d36cfdeea007fcca21d7e382af/node_modules/from2/", {
        "name": "from2",
        "reference": "2.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-html5shiv-3.7.3-d78a84a367bcb9a710100d57802c387b084631d2/node_modules/html5shiv/", {
        "name": "html5shiv",
        "reference": "3.7.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-intersection-observer-0.4.3-22ff07442269d8be694551a782e0b081ecd4adfd/node_modules/intersection-observer/", {
        "name": "intersection-observer",
        "reference": "0.4.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-intl-1.2.5-82244a2190c4e419f8371f5aa34daa3420e2abde/node_modules/intl/", {
        "name": "intl",
        "reference": "1.2.5"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-js-polyfills-0.1.42-5d484902b361e3cf601fd23ad0f30bafcc93f148/node_modules/js-polyfills/", {
        "name": "js-polyfills",
        "reference": "0.1.42"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-lazystream-1.0.0-f6995fe0f820392f61396be89462407bb77168e4/node_modules/lazystream/", {
        "name": "lazystream",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-merge2-1.3.0-5b366ee83b2f1582c48f87e47cf1a9352103ca81/node_modules/merge2/", {
        "name": "merge2",
        "reference": "1.3.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-mnemonist-0.27.2-c56a8ad5345b9089604a1aa0af8610480717e40a/node_modules/mnemonist/", {
        "name": "mnemonist",
        "reference": "0.27.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-obliterator-1.5.0-f3535e5be192473ef59efb2d30396738f7c645c6/node_modules/obliterator/", {
        "name": "obliterator",
        "reference": "1.5.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-mutationobserver-shim-0.3.3-65869630bc89d7bf8c9cd9cb82188cd955aacd2b/node_modules/mutationobserver-shim/", {
        "name": "mutationobserver-shim",
        "reference": "0.3.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-picturefill-3.0.3-a5c38eeb02d74def38e1790ff61e166166b4f224/node_modules/picturefill/", {
        "name": "picturefill",
        "reference": "3.0.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-resize-observer-polyfill-1.5.1-0e9020dd3d21024458d4ebd27e23e40269810464/node_modules/resize-observer-polyfill/", {
        "name": "resize-observer-polyfill",
        "reference": "1.5.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-smoothscroll-polyfill-0.4.4-3a259131dc6930e6ca80003e1cb03b603b69abf8/node_modules/smoothscroll-polyfill/", {
        "name": "smoothscroll-polyfill",
        "reference": "0.4.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-spdx-licenses-1.0.0-e883cc8fab52cbfea9acc5cf6cb01244b08eff79/node_modules/spdx-licenses/", {
        "name": "spdx-licenses",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is2-2.0.1-8ac355644840921ce435d94f05d3a94634d3481a/node_modules/is2/", {
        "name": "is2",
        "reference": "2.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-deep-is-0.1.3-b369d6fb5dbc13eecf524f91b070feedc357cf34/node_modules/deep-is/", {
        "name": "deep-is",
        "reference": "0.1.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-is-url-1.2.4-04a4df46d28c4cff3d73d01ff06abeb318a1aa52/node_modules/is-url/", {
        "name": "is-url",
        "reference": "1.2.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-stream-cache-0.0.2-1ac5ad6832428ca55667dbdee395dad4e6db118f/node_modules/stream-cache/", {
        "name": "stream-cache",
        "reference": "0.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-stream-from-promise-1.0.0-763687f7dd777e4c894f6408333fc6b3fc8a61bb/node_modules/stream-from-promise/", {
        "name": "stream-from-promise",
        "reference": "1.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-stream-to-string-1.2.0-3ca506a097ecbf78b0e0aee0b6fa5c4565412a15/node_modules/stream-to-string/", {
        "name": "stream-to-string",
        "reference": "1.2.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-promise-polyfill-1.1.6-cd04eff46f5c95c3a7d045591d79b5e3e01f12d7/node_modules/promise-polyfill/", {
        "name": "promise-polyfill",
        "reference": "1.1.6"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-toposort-2.0.2-ae21768175d1559d48bef35420b2f4962f09c330/node_modules/toposort/", {
        "name": "toposort",
        "reference": "2.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-center-align-0.1.3-aa0d32629b6ee972200411cbd4461c907bc2b7ad/node_modules/center-align/", {
        "name": "center-align",
        "reference": "0.1.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-align-text-0.1.4-0cd90a561093f35d0a99256c22b7069433fad117/node_modules/align-text/", {
        "name": "align-text",
        "reference": "0.1.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-longest-1.0.1-30a0b2da38f73770e8294a0d22e6625ed77d0097/node_modules/longest/", {
        "name": "longest",
        "reference": "1.0.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-lazy-cache-1.0.4-a1d78fc3a50474cb80845d3b3b6e1da49a446e8e/node_modules/lazy-cache/", {
        "name": "lazy-cache",
        "reference": "1.0.4"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-right-align-0.1.3-61339b722fe6a3515689210d24e14c96148613ef/node_modules/right-align/", {
        "name": "right-align",
        "reference": "0.1.3"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-window-size-0.1.0-5438cd2ea93b202efa3a19fe8887aee7c94f9c9d/node_modules/window-size/", {
        "name": "window-size",
        "reference": "0.1.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-uglify-to-browserify-1.0.2-6e0924d6bda6b5afe349e39a6d632850a0f882b7/node_modules/uglify-to-browserify/", {
        "name": "uglify-to-browserify",
        "reference": "1.0.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-unorm-1.6.0-029b289661fba714f1a9af439eb51d9b16c205af/node_modules/unorm/", {
        "name": "unorm",
        "reference": "1.6.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-usertiming-0.1.8-35378e7f41a248d40e658d05f80423469a7b0650/node_modules/usertiming/", {
        "name": "usertiming",
        "reference": "0.1.8"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-web-animations-js-2.3.2-a51963a359c543f97b47c7d4bc2d811f9fc9e153/node_modules/web-animations-js/", {
        "name": "web-animations-js",
        "reference": "2.3.2"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-whatwg-fetch-3.0.0-fc804e458cc460009b1a2b966bc8817d2578aefb/node_modules/whatwg-fetch/", {
        "name": "whatwg-fetch",
        "reference": "3.0.0"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-wicg-inert-2.2.1-8128c0f05f0608415ed19ae2c97b925925159804/node_modules/wicg-inert/", {
        "name": "wicg-inert",
        "reference": "2.2.1"
    }],
    ["../../Users/spice/AppData/Local/Yarn/Cache/v4/npm-yaku-0.18.6-3840096629774c5c0756a4105a545e441087f9da/node_modules/yaku/", {
        "name": "yaku",
        "reference": "0.18.6"
    }],
    ["./", topLevelLocator],
]);
exports.findPackageLocator = function findPackageLocator(location) {
    let relativeLocation = normalizePath(path.relative(__dirname, location));

    if (!relativeLocation.match(isStrictRegExp))
        relativeLocation = `./${relativeLocation}`;

    if (location.match(isDirRegExp) && relativeLocation.charAt(relativeLocation.length - 1) !== '/')
        relativeLocation = `${relativeLocation}/`;

    let match;

    if (relativeLocation.length >= 224 && relativeLocation[223] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 224)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 216 && relativeLocation[215] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 216)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 212 && relativeLocation[211] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 212)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 210 && relativeLocation[209] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 210)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 208 && relativeLocation[207] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 208)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 206 && relativeLocation[205] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 206)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 204 && relativeLocation[203] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 204)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 202 && relativeLocation[201] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 202)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 200 && relativeLocation[199] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 200)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 198 && relativeLocation[197] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 198)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 196 && relativeLocation[195] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 196)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 194 && relativeLocation[193] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 194)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 192 && relativeLocation[191] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 192)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 190 && relativeLocation[189] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 190)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 188 && relativeLocation[187] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 188)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 186 && relativeLocation[185] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 186)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 184 && relativeLocation[183] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 184)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 182 && relativeLocation[181] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 182)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 180 && relativeLocation[179] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 180)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 178 && relativeLocation[177] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 178)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 176 && relativeLocation[175] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 176)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 174 && relativeLocation[173] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 174)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 172 && relativeLocation[171] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 172)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 170 && relativeLocation[169] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 170)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 168 && relativeLocation[167] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 168)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 166 && relativeLocation[165] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 166)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 164 && relativeLocation[163] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 164)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 163 && relativeLocation[162] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 163)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 162 && relativeLocation[161] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 162)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 160 && relativeLocation[159] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 160)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 158 && relativeLocation[157] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 158)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 157 && relativeLocation[156] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 157)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 156 && relativeLocation[155] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 156)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 155 && relativeLocation[154] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 155)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 154 && relativeLocation[153] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 154)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 152 && relativeLocation[151] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 152)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 151 && relativeLocation[150] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 151)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 150 && relativeLocation[149] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 150)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 149 && relativeLocation[148] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 149)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 148 && relativeLocation[147] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 148)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 147 && relativeLocation[146] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 147)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 146 && relativeLocation[145] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 146)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 145 && relativeLocation[144] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 145)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 144 && relativeLocation[143] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 144)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 143 && relativeLocation[142] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 143)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 142 && relativeLocation[141] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 142)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 141 && relativeLocation[140] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 141)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 140 && relativeLocation[139] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 140)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 139 && relativeLocation[138] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 139)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 138 && relativeLocation[137] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 138)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 137 && relativeLocation[136] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 137)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 136 && relativeLocation[135] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 136)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 135 && relativeLocation[134] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 135)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 134 && relativeLocation[133] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 134)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 133 && relativeLocation[132] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 133)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 132 && relativeLocation[131] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 132)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 131 && relativeLocation[130] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 131)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 130 && relativeLocation[129] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 130)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 129 && relativeLocation[128] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 129)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 128 && relativeLocation[127] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 128)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 127 && relativeLocation[126] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 127)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 126 && relativeLocation[125] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 126)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 125 && relativeLocation[124] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 125)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 124 && relativeLocation[123] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 124)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 123 && relativeLocation[122] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 123)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 122 && relativeLocation[121] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 122)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 121 && relativeLocation[120] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 121)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 120 && relativeLocation[119] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 120)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 119 && relativeLocation[118] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 119)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 118 && relativeLocation[117] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 118)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 116 && relativeLocation[115] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 116)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 115 && relativeLocation[114] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 115)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 113 && relativeLocation[112] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 113)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 111 && relativeLocation[110] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 111)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 109 && relativeLocation[108] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 109)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 98 && relativeLocation[97] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 98)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 89 && relativeLocation[88] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 89)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 88 && relativeLocation[87] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 88)))
            return blacklistCheck(match);

    if (relativeLocation.length >= 2 && relativeLocation[1] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 2)))
            return blacklistCheck(match);

    return null;
};


/**
 * Returns the module that should be used to resolve require calls. It's usually the direct parent, except if we're
 * inside an eval expression.
 */

function getIssuerModule(parent) {
    let issuer = parent;

    while (issuer && (issuer.id === '[eval]' || issuer.id === '<repl>' || !issuer.filename)) {
        issuer = issuer.parent;
    }

    return issuer;
}

/**
 * Returns information about a package in a safe way (will throw if they cannot be retrieved)
 */

function getPackageInformationSafe(packageLocator) {
    const packageInformation = exports.getPackageInformation(packageLocator);

    if (!packageInformation) {
        throw makeError(
            `INTERNAL`,
            `Couldn't find a matching entry in the dependency tree for the specified parent (this is probably an internal error)`
        );
    }

    return packageInformation;
}

/**
 * Implements the node resolution for folder access and extension selection
 */

function applyNodeExtensionResolution(unqualifiedPath, {extensions}) {
    // We use this "infinite while" so that we can restart the process as long as we hit package folders
    while (true) {
        let stat;

        try {
            stat = statSync(unqualifiedPath);
        } catch (error) {
        }

        // If the file exists and is a file, we can stop right there

        if (stat && !stat.isDirectory()) {
            // If the very last component of the resolved path is a symlink to a file, we then resolve it to a file. We only
            // do this first the last component, and not the rest of the path! This allows us to support the case of bin
            // symlinks, where a symlink in "/xyz/pkg-name/.bin/bin-name" will point somewhere else (like "/xyz/pkg-name/index.js").
            // In such a case, we want relative requires to be resolved relative to "/xyz/pkg-name/" rather than "/xyz/pkg-name/.bin/".
            //
            // Also note that the reason we must use readlink on the last component (instead of realpath on the whole path)
            // is that we must preserve the other symlinks, in particular those used by pnp to deambiguate packages using
            // peer dependencies. For example, "/xyz/.pnp/local/pnp-01234569/.bin/bin-name" should see its relative requires
            // be resolved relative to "/xyz/.pnp/local/pnp-0123456789/" rather than "/xyz/pkg-with-peers/", because otherwise
            // we would lose the information that would tell us what are the dependencies of pkg-with-peers relative to its
            // ancestors.

            if (lstatSync(unqualifiedPath).isSymbolicLink()) {
                unqualifiedPath = path.normalize(path.resolve(path.dirname(unqualifiedPath), readlinkSync(unqualifiedPath)));
            }

            return unqualifiedPath;
        }

        // If the file is a directory, we must check if it contains a package.json with a "main" entry

        if (stat && stat.isDirectory()) {
            let pkgJson;

            try {
                pkgJson = JSON.parse(readFileSync(`${unqualifiedPath}/package.json`, 'utf-8'));
            } catch (error) {
            }

            let nextUnqualifiedPath;

            if (pkgJson && pkgJson.main) {
                nextUnqualifiedPath = path.resolve(unqualifiedPath, pkgJson.main);
            }

            // If the "main" field changed the path, we start again from this new location

            if (nextUnqualifiedPath && nextUnqualifiedPath !== unqualifiedPath) {
                const resolution = applyNodeExtensionResolution(nextUnqualifiedPath, {extensions});

                if (resolution !== null) {
                    return resolution;
                }
            }
        }

        // Otherwise we check if we find a file that match one of the supported extensions

        const qualifiedPath = extensions
            .map(extension => {
                return `${unqualifiedPath}${extension}`;
            })
            .find(candidateFile => {
                return existsSync(candidateFile);
            });

        if (qualifiedPath) {
            return qualifiedPath;
        }

        // Otherwise, we check if the path is a folder - in such a case, we try to use its index

        if (stat && stat.isDirectory()) {
            const indexPath = extensions
                .map(extension => {
                    return `${unqualifiedPath}/index${extension}`;
                })
                .find(candidateFile => {
                    return existsSync(candidateFile);
                });

            if (indexPath) {
                return indexPath;
            }
        }

        // Otherwise there's nothing else we can do :(

        return null;
    }
}

/**
 * This function creates fake modules that can be used with the _resolveFilename function.
 * Ideally it would be nice to be able to avoid this, since it causes useless allocations
 * and cannot be cached efficiently (we recompute the nodeModulePaths every time).
 *
 * Fortunately, this should only affect the fallback, and there hopefully shouldn't be a
 * lot of them.
 */

function makeFakeModule(path) {
    const fakeModule = new Module(path, false);
    fakeModule.filename = path;
    fakeModule.paths = Module._nodeModulePaths(path);
    return fakeModule;
}

/**
 * Normalize path to posix format.
 */

function normalizePath(fsPath) {
    fsPath = path.normalize(fsPath);

    if (process.platform === 'win32') {
        fsPath = fsPath.replace(backwardSlashRegExp, '/');
    }

    return fsPath;
}

/**
 * Forward the resolution to the next resolver (usually the native one)
 */

function callNativeResolution(request, issuer) {
    if (issuer.endsWith('/')) {
        issuer += 'internal.js';
    }

    try {
        enableNativeHooks = false;

        // Since we would need to create a fake module anyway (to call _resolveLookupPath that
        // would give us the paths to give to _resolveFilename), we can as well not use
        // the {paths} option at all, since it internally makes _resolveFilename create another
        // fake module anyway.
        return Module._resolveFilename(request, makeFakeModule(issuer), false);
    } finally {
        enableNativeHooks = true;
    }
}

/**
 * This key indicates which version of the standard is implemented by this resolver. The `std` key is the
 * Plug'n'Play standard, and any other key are third-party extensions. Third-party extensions are not allowed
 * to override the standard, and can only offer new methods.
 *
 * If an new version of the Plug'n'Play standard is released and some extensions conflict with newly added
 * functions, they'll just have to fix the conflicts and bump their own version number.
 */

exports.VERSIONS = {std: 1};

/**
 * Useful when used together with getPackageInformation to fetch information about the top-level package.
 */

exports.topLevel = {name: null, reference: null};

/**
 * Gets the package information for a given locator. Returns null if they cannot be retrieved.
 */

exports.getPackageInformation = function getPackageInformation({name, reference}) {
    const packageInformationStore = packageInformationStores.get(name);

    if (!packageInformationStore) {
        return null;
    }

    const packageInformation = packageInformationStore.get(reference);

    if (!packageInformation) {
        return null;
    }

    return packageInformation;
};

/**
 * Transforms a request (what's typically passed as argument to the require function) into an unqualified path.
 * This path is called "unqualified" because it only changes the package name to the package location on the disk,
 * which means that the end result still cannot be directly accessed (for example, it doesn't try to resolve the
 * file extension, or to resolve directories to their "index.js" content). Use the "resolveUnqualified" function
 * to convert them to fully-qualified paths, or just use "resolveRequest" that do both operations in one go.
 *
 * Note that it is extremely important that the `issuer` path ends with a forward slash if the issuer is to be
 * treated as a folder (ie. "/tmp/foo/" rather than "/tmp/foo" if "foo" is a directory). Otherwise relative
 * imports won't be computed correctly (they'll get resolved relative to "/tmp/" instead of "/tmp/foo/").
 */

exports.resolveToUnqualified = function resolveToUnqualified(request, issuer, {considerBuiltins = true} = {}) {
    // The 'pnpapi' request is reserved and will always return the path to the PnP file, from everywhere

    if (request === `pnpapi`) {
        return pnpFile;
    }

    // Bailout if the request is a native module

    if (considerBuiltins && builtinModules.has(request)) {
        return null;
    }

    // We allow disabling the pnp resolution for some subpaths. This is because some projects, often legacy,
    // contain multiple levels of dependencies (ie. a yarn.lock inside a subfolder of a yarn.lock). This is
    // typically solved using workspaces, but not all of them have been converted already.

    if (ignorePattern && ignorePattern.test(normalizePath(issuer))) {
        const result = callNativeResolution(request, issuer);

        if (result === false) {
            throw makeError(
                `BUILTIN_NODE_RESOLUTION_FAIL`,
                `The builtin node resolution algorithm was unable to resolve the module referenced by "${request}" and requested from "${issuer}" (it didn't go through the pnp resolver because the issuer was explicitely ignored by the regexp "null")`,
                {
                    request,
                    issuer,
                }
            );
        }

        return result;
    }

    let unqualifiedPath;

    // If the request is a relative or absolute path, we just return it normalized

    const dependencyNameMatch = request.match(pathRegExp);

    if (!dependencyNameMatch) {
        if (path.isAbsolute(request)) {
            unqualifiedPath = path.normalize(request);
        } else if (issuer.match(isDirRegExp)) {
            unqualifiedPath = path.normalize(path.resolve(issuer, request));
        } else {
            unqualifiedPath = path.normalize(path.resolve(path.dirname(issuer), request));
        }
    }

    // Things are more hairy if it's a package require - we then need to figure out which package is needed, and in
    // particular the exact version for the given location on the dependency tree

    if (dependencyNameMatch) {
        const [, dependencyName, subPath] = dependencyNameMatch;

        const issuerLocator = exports.findPackageLocator(issuer);

        // If the issuer file doesn't seem to be owned by a package managed through pnp, then we resort to using the next
        // resolution algorithm in the chain, usually the native Node resolution one

        if (!issuerLocator) {
            const result = callNativeResolution(request, issuer);

            if (result === false) {
                throw makeError(
                    `BUILTIN_NODE_RESOLUTION_FAIL`,
                    `The builtin node resolution algorithm was unable to resolve the module referenced by "${request}" and requested from "${issuer}" (it didn't go through the pnp resolver because the issuer doesn't seem to be part of the Yarn-managed dependency tree)`,
                    {
                        request,
                        issuer,
                    }
                );
            }

            return result;
        }

        const issuerInformation = getPackageInformationSafe(issuerLocator);

        // We obtain the dependency reference in regard to the package that request it

        let dependencyReference = issuerInformation.packageDependencies.get(dependencyName);

        // If we can't find it, we check if we can potentially load it from the packages that have been defined as potential fallbacks.
        // It's a bit of a hack, but it improves compatibility with the existing Node ecosystem. Hopefully we should eventually be able
        // to kill this logic and become stricter once pnp gets enough traction and the affected packages fix themselves.

        if (issuerLocator !== topLevelLocator) {
            for (let t = 0, T = fallbackLocators.length; dependencyReference === undefined && t < T; ++t) {
                const fallbackInformation = getPackageInformationSafe(fallbackLocators[t]);
                dependencyReference = fallbackInformation.packageDependencies.get(dependencyName);
            }
        }

        // If we can't find the path, and if the package making the request is the top-level, we can offer nicer error messages

        if (!dependencyReference) {
            if (dependencyReference === null) {
                if (issuerLocator === topLevelLocator) {
                    throw makeError(
                        `MISSING_PEER_DEPENDENCY`,
                        `You seem to be requiring a peer dependency ("${dependencyName}"), but it is not installed (which might be because you're the top-level package)`,
                        {request, issuer, dependencyName}
                    );
                } else {
                    throw makeError(
                        `MISSING_PEER_DEPENDENCY`,
                        `Package "${issuerLocator.name}@${issuerLocator.reference}" is trying to access a peer dependency ("${dependencyName}") that should be provided by its direct ancestor but isn't`,
                        {request, issuer, issuerLocator: Object.assign({}, issuerLocator), dependencyName}
                    );
                }
            } else {
                if (issuerLocator === topLevelLocator) {
                    throw makeError(
                        `UNDECLARED_DEPENDENCY`,
                        `You cannot require a package ("${dependencyName}") that is not declared in your dependencies (via "${issuer}")`,
                        {request, issuer, dependencyName}
                    );
                } else {
                    const candidates = Array.from(issuerInformation.packageDependencies.keys());
                    throw makeError(
                        `UNDECLARED_DEPENDENCY`,
                        `Package "${issuerLocator.name}@${issuerLocator.reference}" (via "${issuer}") is trying to require the package "${dependencyName}" (via "${request}") without it being listed in its dependencies (${candidates.join(
                            `, `
                        )})`,
                        {request, issuer, issuerLocator: Object.assign({}, issuerLocator), dependencyName, candidates}
                    );
                }
            }
        }

        // We need to check that the package exists on the filesystem, because it might not have been installed

        const dependencyLocator = {name: dependencyName, reference: dependencyReference};
        const dependencyInformation = exports.getPackageInformation(dependencyLocator);
        const dependencyLocation = path.resolve(__dirname, dependencyInformation.packageLocation);

        if (!dependencyLocation) {
            throw makeError(
                `MISSING_DEPENDENCY`,
                `Package "${dependencyLocator.name}@${dependencyLocator.reference}" is a valid dependency, but hasn't been installed and thus cannot be required (it might be caused if you install a partial tree, such as on production environments)`,
                {request, issuer, dependencyLocator: Object.assign({}, dependencyLocator)}
            );
        }

        // Now that we know which package we should resolve to, we only have to find out the file location

        if (subPath) {
            unqualifiedPath = path.resolve(dependencyLocation, subPath);
        } else {
            unqualifiedPath = dependencyLocation;
        }
    }

    return path.normalize(unqualifiedPath);
};

/**
 * Transforms an unqualified path into a qualified path by using the Node resolution algorithm (which automatically
 * appends ".js" / ".json", and transforms directory accesses into "index.js").
 */

exports.resolveUnqualified = function resolveUnqualified(
    unqualifiedPath,
    {extensions = Object.keys(Module._extensions)} = {}
) {
    const qualifiedPath = applyNodeExtensionResolution(unqualifiedPath, {extensions});

    if (qualifiedPath) {
        return path.normalize(qualifiedPath);
    } else {
        throw makeError(
            `QUALIFIED_PATH_RESOLUTION_FAILED`,
            `Couldn't find a suitable Node resolution for unqualified path "${unqualifiedPath}"`,
            {unqualifiedPath}
        );
    }
};

/**
 * Transforms a request into a fully qualified path.
 *
 * Note that it is extremely important that the `issuer` path ends with a forward slash if the issuer is to be
 * treated as a folder (ie. "/tmp/foo/" rather than "/tmp/foo" if "foo" is a directory). Otherwise relative
 * imports won't be computed correctly (they'll get resolved relative to "/tmp/" instead of "/tmp/foo/").
 */

exports.resolveRequest = function resolveRequest(request, issuer, {considerBuiltins, extensions} = {}) {
    let unqualifiedPath;

    try {
        unqualifiedPath = exports.resolveToUnqualified(request, issuer, {considerBuiltins});
    } catch (originalError) {
        // If we get a BUILTIN_NODE_RESOLUTION_FAIL error there, it means that we've had to use the builtin node
        // resolution, which usually shouldn't happen. It might be because the user is trying to require something
        // from a path loaded through a symlink (which is not possible, because we need something normalized to
        // figure out which package is making the require call), so we try to make the same request using a fully
        // resolved issuer and throws a better and more actionable error if it works.
        if (originalError.code === `BUILTIN_NODE_RESOLUTION_FAIL`) {
            let realIssuer;

            try {
                realIssuer = realpathSync(issuer);
            } catch (error) {
            }

            if (realIssuer) {
                if (issuer.endsWith(`/`)) {
                    realIssuer = realIssuer.replace(/\/?$/, `/`);
                }

                try {
                    exports.resolveToUnqualified(request, realIssuer, {considerBuiltins});
                } catch (error) {
                    // If an error was thrown, the problem doesn't seem to come from a path not being normalized, so we
                    // can just throw the original error which was legit.
                    throw originalError;
                }

                // If we reach this stage, it means that resolveToUnqualified didn't fail when using the fully resolved
                // file path, which is very likely caused by a module being invoked through Node with a path not being
                // correctly normalized (ie you should use "node $(realpath script.js)" instead of "node script.js").
                throw makeError(
                    `SYMLINKED_PATH_DETECTED`,
                    `A pnp module ("${request}") has been required from what seems to be a symlinked path ("${issuer}"). This is not possible, you must ensure that your modules are invoked through their fully resolved path on the filesystem (in this case "${realIssuer}").`,
                    {
                        request,
                        issuer,
                        realIssuer,
                    }
                );
            }
        }
        throw originalError;
    }

    if (unqualifiedPath === null) {
        return null;
    }

    try {
        return exports.resolveUnqualified(unqualifiedPath, {extensions});
    } catch (resolutionError) {
        if (resolutionError.code === 'QUALIFIED_PATH_RESOLUTION_FAILED') {
            Object.assign(resolutionError.data, {request, issuer});
        }
        throw resolutionError;
    }
};

/**
 * Setups the hook into the Node environment.
 *
 * From this point on, any call to `require()` will go through the "resolveRequest" function, and the result will
 * be used as path of the file to load.
 */

exports.setup = function setup() {
    // A small note: we don't replace the cache here (and instead use the native one). This is an effort to not
    // break code similar to "delete require.cache[require.resolve(FOO)]", where FOO is a package located outside
    // of the Yarn dependency tree. In this case, we defer the load to the native loader. If we were to replace the
    // cache by our own, the native loader would populate its own cache, which wouldn't be exposed anymore, so the
    // delete call would be broken.

    const originalModuleLoad = Module._load;

    Module._load = function (request, parent, isMain) {
        if (!enableNativeHooks) {
            return originalModuleLoad.call(Module, request, parent, isMain);
        }

        // Builtins are managed by the regular Node loader

        if (builtinModules.has(request)) {
            try {
                enableNativeHooks = false;
                return originalModuleLoad.call(Module, request, parent, isMain);
            } finally {
                enableNativeHooks = true;
            }
        }

        // The 'pnpapi' name is reserved to return the PnP api currently in use by the program

        if (request === `pnpapi`) {
            return pnpModule.exports;
        }

        // Request `Module._resolveFilename` (ie. `resolveRequest`) to tell us which file we should load

        const modulePath = Module._resolveFilename(request, parent, isMain);

        // Check if the module has already been created for the given file

        const cacheEntry = Module._cache[modulePath];

        if (cacheEntry) {
            return cacheEntry.exports;
        }

        // Create a new module and store it into the cache

        const module = new Module(modulePath, parent);
        Module._cache[modulePath] = module;

        // The main module is exposed as global variable

        if (isMain) {
            process.mainModule = module;
            module.id = '.';
        }

        // Try to load the module, and remove it from the cache if it fails

        let hasThrown = true;

        try {
            module.load(modulePath);
            hasThrown = false;
        } finally {
            if (hasThrown) {
                delete Module._cache[modulePath];
            }
        }

        // Some modules might have to be patched for compatibility purposes

        for (const [filter, patchFn] of patchedModules) {
            if (filter.test(request)) {
                module.exports = patchFn(exports.findPackageLocator(parent.filename), module.exports);
            }
        }

        return module.exports;
    };

    const originalModuleResolveFilename = Module._resolveFilename;

    Module._resolveFilename = function (request, parent, isMain, options) {
        if (!enableNativeHooks) {
            return originalModuleResolveFilename.call(Module, request, parent, isMain, options);
        }

        let issuers;

        if (options) {
            const optionNames = new Set(Object.keys(options));
            optionNames.delete('paths');

            if (optionNames.size > 0) {
                throw makeError(
                    `UNSUPPORTED`,
                    `Some options passed to require() aren't supported by PnP yet (${Array.from(optionNames).join(', ')})`
                );
            }

            if (options.paths) {
                issuers = options.paths.map(entry => `${path.normalize(entry)}/`);
            }
        }

        if (!issuers) {
            const issuerModule = getIssuerModule(parent);
            const issuer = issuerModule ? issuerModule.filename : `${process.cwd()}/`;

            issuers = [issuer];
        }

        let firstError;

        for (const issuer of issuers) {
            let resolution;

            try {
                resolution = exports.resolveRequest(request, issuer);
            } catch (error) {
                firstError = firstError || error;
                continue;
            }

            return resolution !== null ? resolution : request;
        }

        throw firstError;
    };

    const originalFindPath = Module._findPath;

    Module._findPath = function (request, paths, isMain) {
        if (!enableNativeHooks) {
            return originalFindPath.call(Module, request, paths, isMain);
        }

        for (const path of paths) {
            let resolution;

            try {
                resolution = exports.resolveRequest(request, path);
            } catch (error) {
                continue;
            }

            if (resolution) {
                return resolution;
            }
        }

        return false;
    };

    process.versions.pnp = String(exports.VERSIONS.std);
};

exports.setupCompatibilityLayer = () => {
    // ESLint currently doesn't have any portable way for shared configs to specify their own
    // plugins that should be used (https://github.com/eslint/eslint/issues/10125). This will
    // likely get fixed at some point, but it'll take time and in the meantime we'll just add
    // additional fallback entries for common shared configs.

    for (const name of [`react-scripts`]) {
        const packageInformationStore = packageInformationStores.get(name);
        if (packageInformationStore) {
            for (const reference of packageInformationStore.keys()) {
                fallbackLocators.push({name, reference});
            }
        }
    }

    // Modern versions of `resolve` support a specific entry point that custom resolvers can use
    // to inject a specific resolution logic without having to patch the whole package.
    //
    // Cf: https://github.com/browserify/resolve/pull/174

    patchedModules.push([
        /^\.\/normalize-options\.js$/,
        (issuer, normalizeOptions) => {
            if (!issuer || issuer.name !== 'resolve') {
                return normalizeOptions;
            }

            return (request, opts) => {
                opts = opts || {};

                if (opts.forceNodeResolution) {
                    return opts;
                }

                opts.preserveSymlinks = true;
                opts.paths = function (request, basedir, getNodeModulesDir, opts) {
                    // Extract the name of the package being requested (1=full name, 2=scope name, 3=local name)
                    const parts = request.match(/^((?:(@[^\/]+)\/)?([^\/]+))/);

                    // make sure that basedir ends with a slash
                    if (basedir.charAt(basedir.length - 1) !== '/') {
                        basedir = path.join(basedir, '/');
                    }
                    // This is guaranteed to return the path to the "package.json" file from the given package
                    const manifestPath = exports.resolveToUnqualified(`${parts[1]}/package.json`, basedir);

                    // The first dirname strips the package.json, the second strips the local named folder
                    let nodeModules = path.dirname(path.dirname(manifestPath));

                    // Strips the scope named folder if needed
                    if (parts[2]) {
                        nodeModules = path.dirname(nodeModules);
                    }

                    return [nodeModules];
                };

                return opts;
            };
        },
    ]);
};

if (module.parent && module.parent.id === 'internal/preload') {
    exports.setupCompatibilityLayer();

    exports.setup();
}

if (process.mainModule === module) {
    exports.setupCompatibilityLayer();

    const reportError = (code, message, data) => {
        process.stdout.write(`${JSON.stringify([{code, message, data}, null])}\n`);
    };

    const reportSuccess = resolution => {
        process.stdout.write(`${JSON.stringify([null, resolution])}\n`);
    };

    const processResolution = (request, issuer) => {
        try {
            reportSuccess(exports.resolveRequest(request, issuer));
        } catch (error) {
            reportError(error.code, error.message, error.data);
        }
    };

    const processRequest = data => {
        try {
            const [request, issuer] = JSON.parse(data);
            processResolution(request, issuer);
        } catch (error) {
            reportError(`INVALID_JSON`, error.message, error.data);
        }
    };

    if (process.argv.length > 2) {
        if (process.argv.length !== 4) {
            process.stderr.write(`Usage: ${process.argv[0]} ${process.argv[1]} <request> <issuer>\n`);
            process.exitCode = 64; /* EX_USAGE */
        } else {
            processResolution(process.argv[2], process.argv[3]);
        }
    } else {
        let buffer = '';
        const decoder = new StringDecoder.StringDecoder();

        process.stdin.on('data', chunk => {
            buffer += decoder.write(chunk);

            do {
                const index = buffer.indexOf('\n');
                if (index === -1) {
                    break;
                }

                const line = buffer.slice(0, index);
                buffer = buffer.slice(index + 1);

                processRequest(line);
            } while (true);
        });
    }
}
