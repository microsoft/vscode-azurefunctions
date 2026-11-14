/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizard, UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as fs from 'fs';
import * as jsonc from 'jsonc-parser';
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';
import * as vscode from 'vscode';
import { type ConnectorTriggerOutputMetadata } from '../../connectorTrigger/connectorTriggerOutputSchema';
import { isConnectorTriggerAuthoringContext, type ConnectorTriggerAuthoringContext, type ConnectorTriggerSelections } from '../../connectorTrigger/connectorTriggerSelection';
import { findConnectorTriggerRegistrations, findPollingConnectorBindings } from '../../connectorTrigger/connectorTriggerBindings';
import { getConnectorTriggerEventIdentity } from '../../connectorTrigger/connectorTriggerEventIdentity';
import { retargetConnectorTriggerProject } from '../../connectorTrigger/connectorTriggerTargetFramework';
import { ensureConnectorTriggerPollProjects, validateConnectorTriggerSelections } from '../../connectorTrigger/ensureConnectorTriggerPollProject';
import { findConnectorSampleFunctionPaths, getConnectorSampleOperationFunctions, resolveConnectorSampleProjectFolder } from '../../connectorTrigger/connectorSampleProject';
import { prepareConnectorSampleDeployment, type ConnectorSampleDeploymentPreparation, type ConnectorSampleHookIssue } from '../../connectorTrigger/connectorSampleDeployment';
import { isGenericConnectorTriggerTemplate } from '../../connectorTrigger/genericConnectorTriggerTemplates';
import { materializeGenericConnectorTriggerProject } from '../../connectorTrigger/materializeGenericConnectorTriggerProject';
import { hostFileName, localSettingsFileName, packageJsonFileName, ProjectLanguage, vscodeFolderName, workerRuntimeKey } from '../../constants';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { type IHostJsonV2 } from '../../funcConfig/host';
import { getLocalSettingsJson } from '../../funcConfig/local.settings';
import { cloneProjectTemplate } from '../../templates/projectTemplates/cloneProjectTemplate';
import { type IProjectTemplate } from '../../templates/projectTemplates/IProjectTemplate';
import { gitUtils } from '../../utils/gitUtils';
import { requestUtils } from '../../utils/requestUtils';
import { parseJson } from '../../utils/parseJson';
import { extractZip } from '../../utils/zipUtils';
import { tryGetFunctionsWorkerRuntimeForProject } from '../../vsCodeConfig/settings';
import { initProjectForVSCodeAtProjectRoot } from '../initProjectForVSCode/initProjectForVSCode';
import { promptAndOpenProject } from './OpenFolderStep';
import { ProjectPrepareStep, type IProjectPrepareContext } from './ProjectPrepareStep';
import { ensureScriptProjectIgnoreFiles } from './ProjectCreateStep/scriptProjectIgnoreFiles';
import { type IPythonVenvWizardContext } from './pythonSteps/IPythonVenvWizardContext';

const connectorSampleBranch = 'main';
const localSettingsExampleFileName = 'local.settings.example.json';
const sampleRepositoryFolderName = 'repository';

export interface ProjectTemplateCreatorCallbacks {
    onProjectCreated?(): void;
    reportProgress?(detail: string): void;
}

export interface ConnectorProjectCreationOptions {
    selection: ConnectorTriggerSelections;
    azureContext?: ConnectorTriggerAuthoringContext;
    outputMetadata?: ReadonlyMap<string, ConnectorTriggerOutputMetadata>;
    cancellationToken: vscode.CancellationToken;
    /** .NET target framework to apply to the C# starter, such as "net8.0". */
    targetFramework?: string;
}

export class ProjectTemplateCreator {
    public constructor(private readonly callbacks: ProjectTemplateCreatorCallbacks = {}) { }

    public async createProject(
        context: IActionContext, template: IProjectTemplate, language: ProjectLanguage,
        projectPath: string, options: ConnectorProjectCreationOptions,
    ): Promise<void> {
        const selections = validateConnectorTriggerSelections(options.selection);
        const azureContext = options.azureContext;
        if (azureContext !== undefined && !isConnectorTriggerAuthoringContext(azureContext)) {
            throw new Error(localize('connectorAuthoringContextInvalid', 'Select a valid Azure subscription and region again before creating the Connector Trigger project.'));
        }
        const savedContext = azureContext ? {
            subscriptionId: azureContext.subscriptionId,
            ...(azureContext.accountId ? { accountId: azureContext.accountId } : {}),
            tenantId: azureContext.tenantId,
            environmentName: azureContext.environmentName,
            region: azureContext.region,
        } : undefined;
        const generic = isGenericConnectorTriggerTemplate(template, language);
        context.valuesToMask.push(projectPath);
        context.telemetry.properties.connectorTriggerTemplate = generic ? 'generic' : 'specialized';
        context.telemetry.properties.language = language;
        const temporaryDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'azfunc-template-'));
        try {
            const source = await this.downloadTemplate(context, template, temporaryDirectory);
            // Before Poll scaffolding, which would otherwise create missing ignore files with only local.settings.json.
            await ensureScriptProjectIgnoreFiles(source, language);
            this.checkCancellation(options);
            this.reportProgress(localize('preparingConnectorFunctions', 'Preparing selected Connector Trigger functions...'));
            await this.copyLocalSettingsExample(source);
            // Function names generated by this extension; sample-provided functions are kept as published.
            let generatedFunctionNames: string[];
            let handlerPath: string | undefined;
            if (generic) {
                handlerPath = (await materializeGenericConnectorTriggerProject(source, language, options.selection, options.outputMetadata))[0];
                generatedFunctionNames = selections.map(selection =>
                    getConnectorTriggerEventIdentity(selection.connectorId, selection.operationId).functionName);
            } else {
                const sampleOperations = await getConnectorSampleOperationFunctions(source);
                const sampleFunctions = await findConnectorSampleFunctionPaths(source, [...sampleOperations.values()]);
                const selectedFunctionNames = selections.map(selection => {
                    const functionName = sampleOperations.get(selection.operationId.toLowerCase());
                    return functionName && sampleFunctions.has(functionName) ? functionName :
                        getConnectorTriggerEventIdentity(selection.connectorId, selection.operationId).functionName;
                });
                if (new Set(selectedFunctionNames.map(name => name.toLowerCase())).size !== selectedFunctionNames.length) {
                    throw new Error(localize('connectorTemplateFunctionCollision', 'The selected events would register the same template function. Choose a different combination of events.'));
                }
                const additionalIds = selections.map(selection => selection.operationId).filter(operationId => {
                    const functionName = sampleOperations.get(operationId.toLowerCase());
                    return !functionName || !sampleFunctions.has(functionName);
                });
                context.telemetry.measurements.connectorSampleCoveredEvents = selections.length - additionalIds.length;
                context.telemetry.measurements.connectorGeneratedEvents = additionalIds.length;
                generatedFunctionNames = additionalIds.map(operationId =>
                    getConnectorTriggerEventIdentity(options.selection.connectorId, operationId).functionName);
                const primaryFunction = sampleOperations.get(selections[0].operationId.toLowerCase());
                handlerPath = primaryFunction ? sampleFunctions.get(primaryFunction) : undefined;
                if (additionalIds.length > 0) {
                    const additionalPaths = await ensureConnectorTriggerPollProjects(source, language,
                        { connectorId: options.selection.connectorId, operationIds: additionalIds }, options.outputMetadata);
                    const primaryIndex = additionalIds.indexOf(selections[0].operationId);
                    if (primaryIndex >= 0) {
                        handlerPath = additionalPaths[primaryIndex];
                    }
                }
            }
            await this.prepareScriptRuntime(source, language);
            const registrations = await findConnectorTriggerRegistrations(source);
            const bindings = await findPollingConnectorBindings(source);
            if ((generic && (registrations.length !== selections.length || bindings.length !== selections.length)) ||
                generatedFunctionNames.some(name => registrations.filter(registration => registration === name).length !== 1 ||
                    bindings.filter(binding => binding.functionName === name).length !== 1)) {
                throw new Error(localize('connectorProjectBatchInvalid', 'The project template did not produce exactly one Poll function for each selected event.'));
            }
            if (language === ProjectLanguage.CSharp && options.targetFramework) {
                await retargetConnectorTriggerProject(source, options.targetFramework);
                context.telemetry.properties.targetFramework = options.targetFramework;
            }
            await this.prepareLocalSettings(context, source, language);
            if (bindings.length > 1 && !generic) {
                const readmePath = path.join(source, 'README.md');
                const readme = await AzExtFsExtra.pathExists(readmePath) ? await AzExtFsExtra.readFile(readmePath) : '';
                await AzExtFsExtra.writeFile(readmePath, `${readme.trimEnd()}

## Connector Trigger functions

${bindings.sort((left, right) => (left.functionName ?? '').localeCompare(right.functionName ?? '')).map(binding =>
                    `- Function \`${binding.functionName}\`: connection \`${binding.connectionSettingName}\`, trigger configuration \`${binding.triggerConfigSettingName}\`.`).join('\n')}

Configure every event separately before running or deploying. Authoring does not create Azure resources or authorize connector connections. Multi-event F5 setup is not included.

Deployment behavior is defined by this sample's \`azure.yaml\` hooks and \`infra\` files. Review those files for the sample's setup and authorization steps; generated functions may need additional infrastructure configuration. Static file checks do not execute or verify deployment hooks.
`);
            }
            this.checkCancellation(options);
            this.reportProgress(localize('settingUpConnectorProject', 'Setting up project files...'));
            const { issues: hookIssues, bundledFiles } = await this.copyPreparedProject(source, projectPath, options,
                path.join(temporaryDirectory, sampleRepositoryFolderName));
            context.telemetry.measurements.connectorSampleHookMissingFiles = hookIssues.length;
            context.telemetry.measurements.connectorSampleHookBundledFiles = bundledFiles.length;
            for (const file of bundledFiles) {
                ext.outputChannel.appendLog(localize('connectorSampleHookBundled',
                    'Copied deployment hook helper "{0}" from the connector sample into the project.', file));
            }
            if (hookIssues.length) {
                warnConnectorSampleHookIssues(hookIssues);
            }
            this.checkCancellation(options);
            this.reportProgress(localize('initializingConnectorProject', 'Initializing the project for VS Code...'));
            const initializationContext: IActionContext & Partial<IPythonVenvWizardContext> = Object.assign({}, context);
            await initProjectForVSCodeAtProjectRoot(initializationContext, projectPath, language, {
                preserveExistingConfig: true,
                connectorTriggerEvents: selections.map(event => ({
                    ...event, ...(savedContext ? { azureContext: savedContext } : {}),
                })),
            });
            this.checkCancellation(options);
            this.reportProgress(localize('preparingConnectorDependencies', 'Installing dependencies and preparing the project...'));
            const prepareContext: IProjectPrepareContext = Object.assign({}, context, {
                projectPath, language, cancellationToken: options.cancellationToken,
                venvName: initializationContext.venvName,
            });
            const prepareWizard = new AzureWizard(prepareContext, {
                title: localize('preparingConnectorProject', 'Prepare Connector Trigger project'),
                executeSteps: [new ProjectPrepareStep()],
            });
            await prepareWizard.execute();
            this.checkCancellation(options);
            context.telemetry.properties.result = 'Succeeded';
            this.callbacks.onProjectCreated?.();
            if (hookIssues.length) {
                void vscode.window.showWarningMessage(localize('connectorSampleHookIssuesMessage',
                    'Connector Trigger project created, but {0} file reference(s) from deployment hooks in azure.yaml are missing from the project. Deployment hooks may fail. See the output window for details.',
                    hookIssues.length));
            } else {
                void vscode.window.showInformationMessage(localize('connectorProjectCreated', 'Connector Trigger project created.'));
            }
            await promptAndOpenProject(context, projectPath, handlerPath && path.join(projectPath, path.relative(source, handlerPath)));
        } finally {
            await AzExtFsExtra.deleteResource(temporaryDirectory, { recursive: true, useTrash: false });
        }
    }

    private checkCancellation(options: ConnectorProjectCreationOptions): void {
        if (options.cancellationToken.isCancellationRequested) {
            throw new UserCancelledError('connectorProjectCreation');
        }
    }

    private reportProgress(detail: string): void {
        this.callbacks.reportProgress?.(detail);
    }

    private async prepareScriptRuntime(source: string, language: ProjectLanguage): Promise<void> {
        if (language !== ProjectLanguage.TypeScript && language !== ProjectLanguage.Python) {
            return;
        }
        const bundleId = 'Microsoft.Azure.Functions.ExtensionBundle.Preview';
        const minimumBundleVersion = '4.50.0';
        const hostPath = path.join(source, hostFileName);
        const hostText = await AzExtFsExtra.readFile(hostPath);
        const host = parseJson<IHostJsonV2>(hostText);
        const lowerBound = host.extensionBundle?.version?.match(/^[[(]\s*([^,]+),/)?.[1].trim();
        const currentMinimum = lowerBound && semver.validRange(lowerBound) ? semver.coerce(lowerBound) : undefined;
        if (host.extensionBundle?.id !== bundleId || !currentMinimum || semver.lt(currentMinimum, minimumBundleVersion)) {
            await this.updateTemplateJson(hostPath, hostText, ['extensionBundle'], {
                id: bundleId, version: `[${minimumBundleVersion},5.0.0)`,
            });
        }
        if (language === ProjectLanguage.TypeScript) {
            const configPath = path.join(source, 'tsconfig.json');
            const configText = await AzExtFsExtra.pathExists(configPath) ? await AzExtFsExtra.readFile(configPath) : '{}';
            const config = parseJson<{ compilerOptions?: { types?: string[] } }>(configText);
            const types = config.compilerOptions?.types ?? [];
            if (!Array.isArray(types) || types.some(type => typeof type !== 'string')) {
                throw new Error(localize('connectorTemplateTypesInvalid', 'The connector project template must define TypeScript compiler types as an array of names.'));
            }
            if (!types.includes('node')) {
                await this.updateTemplateJson(configPath, configText, ['compilerOptions', 'types'], [...types, 'node']);
            }
        }
    }

    private async updateTemplateJson(file: string, original: string, property: string[], value: object): Promise<void> {
        const bom = original.startsWith('\uFEFF') ? '\uFEFF' : '';
        const contents = original.slice(bom.length);
        const edits = jsonc.modify(contents, property, value, {
            formattingOptions: { insertSpaces: true, tabSize: 4, eol: original.includes('\r\n') ? '\r\n' : '\n' },
        });
        await AzExtFsExtra.writeFile(file, bom + jsonc.applyEdits(contents, edits));
    }

    private async copyLocalSettingsExample(source: string): Promise<void> {
        const settingsPath = path.join(source, localSettingsFileName);
        const examplePath = path.join(source, localSettingsExampleFileName);
        if (!await AzExtFsExtra.pathExists(settingsPath) && await AzExtFsExtra.pathExists(examplePath)) {
            await AzExtFsExtra.copy(examplePath, settingsPath, { overwrite: false });
        }
    }

    private async prepareLocalSettings(context: IActionContext, source: string, language: ProjectLanguage): Promise<void> {
        const bindings = await findPollingConnectorBindings(source);
        const configNames = bindings.map(binding => binding.triggerConfigSettingName.toLowerCase());
        if (new Set(configNames).size !== configNames.length) {
            throw new Error(localize('connectorTriggerConfigCollision', 'Each selected event must have its own trigger configuration setting.'));
        }
        const settingsPath = path.join(source, localSettingsFileName);
        await this.copyLocalSettingsExample(source);
        const settings = await getLocalSettingsJson(context, settingsPath);
        if (settings.IsEncrypted) {
            throw new Error(localize('connectorTemplateSettingsEncrypted', 'The connector project template must contain unencrypted example settings.'));
        }
        settings.Values ??= {};
        if (!settings.Values[workerRuntimeKey]) {
            const runtime = await tryGetFunctionsWorkerRuntimeForProject(context, language, source);
            if (!runtime) {
                throw new Error(localize('connectorProjectWorkerRuntimeUnknown', 'Unable to determine the worker runtime for the Connector Trigger project.'));
            }
            settings.Values[workerRuntimeKey] = runtime;
        }
        // Template values name provisioning examples, not resources that exist for this project.
        for (const binding of bindings) {
            settings.Values[binding.triggerConfigSettingName] = '';
            settings.Values[`${binding.connectionSettingName}__pollingEndpoint`] = '';
        }
        await AzExtFsExtra.writeJSON(settingsPath, settings);
    }

    private async downloadTemplate(context: IActionContext, template: IProjectTemplate, temporaryDirectory: string): Promise<string> {
        // Connector samples are published from their default branch; manifest tags lag behind the working samples.
        const rawRef = template.branch?.trim() || connectorSampleBranch;
        const repositoryPath = path.join(temporaryDirectory, sampleRepositoryFolderName);
        const relative = template.folderPath && template.folderPath !== '.' ? template.folderPath : template.subdirectory ?? '.';
        const folder = path.resolve(repositoryPath, relative);
        const normalized = path.relative(repositoryPath, folder);
        if (normalized.startsWith(`..${path.sep}`) || normalized === '..' || path.isAbsolute(normalized)) {
            throw new Error(localize('connectorTemplateFolderInvalid', 'The connector project template does not contain a valid Functions project folder.'));
        }
        // Older manifests name a template folder that newer samples replaced with polling/webhook folders.
        const parentFolder = path.basename(folder).toLowerCase() === 'template' ? path.dirname(folder) : undefined;
        const checkoutFolder = parentFolder ? path.relative(repositoryPath, parentFolder).split(path.sep).join('/') : template.folderPath;
        const gitAvailable = await gitUtils.isGitInstalled(temporaryDirectory);
        context.telemetry.properties.connectorTemplateDownload = gitAvailable ? 'git' : 'zip';
        if (gitAvailable) {
            this.reportProgress(localize('cloningConnectorTemplate', 'Downloading the connector project template...'));
            await cloneProjectTemplate(template.repositoryUrl, rawRef, repositoryPath, checkoutFolder);
        } else {
            const archiveRef = rawRef.startsWith('refs/') ? rawRef : `refs/heads/${rawRef}`;
            const url = `${template.repositoryUrl.replace(/\.git$/, '').replace(/\/$/, '')}/archive/${archiveRef}.zip`;
            const zipPath = path.join(temporaryDirectory, 'template.zip');
            const extractionPath = path.join(temporaryDirectory, 'extracted');
            await requestUtils.downloadFile(context, url, zipPath, requestUtils.allowCrossOriginRedirectsOptions);
            await AzExtFsExtra.ensureDir(extractionPath);
            await extractZip(zipPath, extractionPath);
            const entries = await AzExtFsExtra.readDirectory(extractionPath);
            if (entries.length !== 1 || entries[0].type !== vscode.FileType.Directory) {
                throw new Error(localize('connectorTemplateArchiveInvalid', 'The connector project template archive has an unexpected layout.'));
            }
            await AzExtFsExtra.copy(path.join(extractionPath, entries[0].name), repositoryPath, { overwrite: false });
        }
        let source: string | undefined;
        for (const candidate of parentFolder ? [folder, parentFolder] : [folder]) {
            if (await AzExtFsExtra.pathExists(candidate)) {
                source = await resolveConnectorSampleProjectFolder(candidate);
                if (source) {
                    break;
                }
            }
        }
        if (!source) {
            throw new Error(localize('connectorTemplateFolderInvalid', 'The connector project template does not contain a valid Functions project folder.'));
        }
        return source;
    }

    private async copyPreparedProject(
        source: string, destination: string, options: ConnectorProjectCreationOptions, sampleRoot: string = source,
    ): Promise<ConnectorSampleDeploymentPreparation> {
        const preparation = await prepareConnectorSampleDeployment(source, sampleRoot);
        const files: { source: string; destination: string }[] = [];
        const visit = async (directory: string, relative: string): Promise<void> => {
            for (const entry of await AzExtFsExtra.readDirectory(directory)) {
                if (entry.name === '.git') {
                    continue;
                }
                const sourcePath = path.join(directory, entry.name);
                const destinationPath = path.join(destination, relative, entry.name);
                if (entry.type === vscode.FileType.Directory) {
                    await visit(sourcePath, path.join(relative, entry.name));
                } else if (entry.type === vscode.FileType.File) {
                    if (await AzExtFsExtra.pathExists(destinationPath)) {
                        // npm install updates the starter lockfile; retain it when retrying the same project.
                        if (relative === '' && entry.name === 'package-lock.json' &&
                            await AzExtFsExtra.pathExists(path.join(destination, packageJsonFileName)) &&
                            (await fs.promises.readFile(path.join(source, packageJsonFileName))).equals(
                                await fs.promises.readFile(path.join(destination, packageJsonFileName)))) {
                            continue;
                        }
                        if (entry.name.startsWith('.') || relative.split(path.sep)[0] === vscodeFolderName ||
                            (relative === '' && entry.name === localSettingsFileName)) {
                            continue;
                        }
                        const [sourceContent, destinationContent] = await Promise.all([
                            fs.promises.readFile(sourcePath), fs.promises.readFile(destinationPath),
                        ]);
                        if (!sourceContent.equals(destinationContent)) {
                            throw new Error(localize(
                                'connectorProjectTargetConflict',
                                'The destination contains conflicting project files. Choose an empty folder or retry with the same event selection. No existing files were overwritten.',
                            ));
                        }
                        continue;
                    }
                    files.push({ source: sourcePath, destination: destinationPath });
                }
            }
        };
        await visit(source, '');
        this.checkCancellation(options);
        for (const file of files) {
            this.checkCancellation(options);
            await AzExtFsExtra.ensureDir(path.dirname(file.destination));
            await AzExtFsExtra.copy(file.source, file.destination, { overwrite: false });
        }
        return preparation;
    }

}

/**
 * Logs hook files that are missing from the copied project. Only sample-relative references are shown;
 * none of them are added to telemetry.
 */
function warnConnectorSampleHookIssues(issues: ConnectorSampleHookIssue[]): void {
    ext.outputChannel.appendLog(localize('connectorSampleHookIssuesHeader',
        'WARNING: The connector sample deployment hooks in azure.yaml reference files that are missing from the created project and could not be copied from the sample. These deployment hooks may fail until the files are added or the hooks are updated:'));
    for (const issue of issues) {
        ext.outputChannel.appendLog(localize('connectorSampleHookIssue', '  Hook "{0}": "{1}" (referenced by "{2}")',
            issue.hook, issue.reference, issue.referencedBy));
    }
}
