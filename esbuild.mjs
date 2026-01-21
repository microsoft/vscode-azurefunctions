import { autoEsbuildOrWatch, autoSelectEsbuildConfig } from '@microsoft/vscode-azext-eng/esbuild';

const baseConfig = autoSelectEsbuildConfig();

/** @type {import('esbuild').BuildOptions} */

await autoEsbuildOrWatch(baseConfig);
