/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * This is the external face of extension.bundle.js, the main webpack bundle for the extension.
 * Anything needing to be exposed outside of the extension sources must be exported from here, because
 * everything else will be in private modules in extension.bundle.js.
 */

// Export activate/deactivate for main.js
export { activateInternal, deactivateInternal } from './src/extension';

// Exports for tests
// The tests are not packaged with the webpack bundle and therefore only have access to code exported from this file.
//
// The tests should import '../extension.bundle'. At design-time they live in tests/ and so will pick up this file (extension.bundle.ts).
// At runtime the tests live in dist/tests and will therefore pick up the main webpack bundle at dist/extension.bundle.js.
export * from './src/commands/createFunction/dotnetSteps/DotnetNamespaceStep';
export * from './src/commands/createNewProject/createNewProject';
export * from './src/commands/initProjectForVSCode/initProjectForVSCode';
export * from './src/constants';
export * from './src/extensionVariables';
export * from './src/FunctionConfig';
export * from './src/ProjectSettings';
export * from './src/templates/IFunctionTemplate';
export * from './src/templates/ScriptTemplateRetriever';
export * from './src/templates/TemplateProvider';
export * from './src/tree/FunctionAppProvider';
export * from './src/utils/fs';
export * from './src/utils/cpUtils';
export * from './src/utils/venvUtils';
export * from 'vscode-azureappservice';
export * from 'vscode-azureextensionui';
