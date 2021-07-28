/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * This is the external face of extension.bundle.js, the main webpack bundle for the extension.
 * Anything needing to be exposed outside of the extension sources must be exported from here, because
 * everything else will be in private modules in extension.bundle.js.
 */

// Exports for tests
// The tests are not packaged with the webpack bundle and therefore only have access to code exported from this file.
//
// The tests should import '../extension.bundle'. At design-time they live in tests/ and so will pick up this file (extension.bundle.ts).
// At runtime the tests live in dist/tests and will therefore pick up the main webpack bundle at dist/extension.bundle.js.
export * from 'vscode-azureappservice';
export * from 'vscode-azureextensionui';
export * from './src/commands/addBinding/addBinding';
export * from './src/commands/copyFunctionUrl';
export * from './src/commands/createFunction/createFunction';
export * from './src/commands/createFunction/dotnetSteps/DotnetNamespaceStep';
export * from './src/commands/createFunctionApp/createFunctionApp';
export * from './src/commands/createNewProject/createNewProject';
export * from './src/commands/createNewProject/ProjectCreateStep/JavaScriptProjectCreateStep';
export * from './src/commands/deleteFunctionApp';
export * from './src/commands/deploy/deploy';
export * from './src/commands/deploy/verifyAppSettings';
export * from './src/commands/initProjectForVSCode/initProjectForVSCode';
export * from './src/constants';
// Export activate/deactivate for main.js
export { activateInternal, deactivateInternal } from './src/extension';
export * from './src/extensionVariables';
export * from './src/funcConfig/function';
export * from './src/funcCoreTools/hasMinFuncCliVersion';
export * from './src/FuncVersion';
export * from './src/templates/CentralTemplateProvider';
export * from './src/templates/IFunctionTemplate';
export * from './src/templates/script/getScriptResourcesLanguage';
export * from './src/templates/TemplateProviderBase';
export * from './src/tree/AzureAccountTreeItemWithProjects';
export * from './src/utils/cpUtils';
export * from './src/utils/delay';
export * from './src/utils/envUtils';
export * from './src/utils/fs';
export * from './src/utils/nonNull';
export * from './src/utils/nugetUtils';
export * from './src/utils/parseJson';
export * from './src/utils/requestUtils';
export * from './src/utils/venvUtils';
export * from './src/utils/workspace';
export * from './src/vsCodeConfig/extensions';
export * from './src/vsCodeConfig/launch';
export * from './src/vsCodeConfig/settings';
export * from './src/vsCodeConfig/tasks';

// NOTE: The auto-fix action "source.organizeImports" does weird things with this file, but there doesn't seem to be a way to disable it on a per-file basis so we'll just let it happen
