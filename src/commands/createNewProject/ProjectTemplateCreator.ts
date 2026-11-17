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
import { getConnectorTriggerSelections, isConnectorTriggerAuthoringContext, type ConnectorTriggerAuthoringContext, type ConnectorTriggerDeliveryMode, type ConnectorTriggerSelections } from '../../connectorTrigger/connectorTriggerSelection';
import { findConnectorTriggerRegistrations, findPollingConnectorBindings } from '../../connectorTrigger/connectorTriggerBindings';
import { getConnectorTriggerEventIdentity } from '../../connectorTrigger/connectorTriggerEventIdentity';
import { retargetConnectorTriggerProject } from '../../connectorTrigger/connectorTriggerTargetFramework';
import { addConnectorTriggerPollProjects, ensureConnectorTriggerPollProjects, validateConnectorTriggerSelections } from '../../connectorTrigger/ensureConnectorTriggerPollProject';
import { addConnectorTriggerWebhookProjects, ensureConnectorTriggerWebhookProjects } from '../../connectorTrigger/ensureConnectorTriggerWebhookProject';
import { readConnectorTriggerProjectEvents } from '../../connectorTrigger/connectorTriggerProjectMetadata';
import { findConnectorSampleFunctionPaths, getConnectorSampleOperationFunctions, resolveConnectorSampleProjectFolder } from '../../connectorTrigger/connectorSampleProject';
import { pruneConnectorSampleDeploymentHook, pruneConnectorSampleFunctions } from '../../connectorTrigger/connectorSamplePruning';
import { prepareConnectorSampleDeployment, type ConnectorSampleHookIssue } from '../../connectorTrigger/connectorSampleDeployment';
import { isGenericConnectorTriggerTemplate } from '../../connectorTrigger/genericConnectorTriggerTemplates';
import { materializeGenericConnectorTriggerProject } from '../../connectorTrigger/materializeGenericConnectorTriggerProject';
import { addTypeScriptEntryImports, getSingleTypeScriptEntryPoint } from '../../connectorTrigger/typescriptEntryPoint';
import { hostFileName, localSettingsFileName, packageJsonFileName, ProjectLanguage, vscodeFolderName, workerRuntimeKey } from '../../constants';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { getLocalSettingsJson, getLocalSettingsJsonWithDefaults } from '../../funcConfig/local.settings';
import { acquireProjectTemplateRepository } from '../../templates/projectTemplates/acquireProjectTemplate';
import { type IProjectTemplate } from '../../templates/projectTemplates/IProjectTemplate';
import { gitUtils } from '../../utils/gitUtils';
import { cpUtils } from '../../utils/cpUtils';
import { dotnetUtils } from '../../utils/dotnetUtils';
import { isPathEqual } from '../../utils/fs';
import { parseJson } from '../../utils/parseJson';
import { tryGetFunctionsWorkerRuntimeForProject } from '../../vsCodeConfig/settings';
import { initProjectForVSCodeAtProjectRoot } from '../initProjectForVSCode/initProjectForVSCode';
import { detectProjectLanguage, detectProjectLanguageModel } from '../initProjectForVSCode/detectProjectLanguage';
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
    /** Selects the sample's `polling` or `webhook` project. Defaults to Poll. */
    deliveryMode?: ConnectorTriggerDeliveryMode;
    /** Adds the selected events to the Functions project already at the project path. */
    addToExistingProject?: boolean;
}

type AddedConnectorFunctions = Awaited<ReturnType<typeof addConnectorTriggerPollProjects>>;

export class ProjectTemplateCreator {
    private pendingAddition: {
        key: string;
        functions: AddedConnectorFunctions;
        finishing?: { item: AddedConnectorFunctions[number]; finish: () => Promise<void> };
    } | undefined;

    public constructor(private readonly callbacks: ProjectTemplateCreatorCallbacks = {}) { }

    public async createProject(
        context: IActionContext, template: IProjectTemplate, language: ProjectLanguage,
        projectPath: string, options: ConnectorProjectCreationOptions,
    ): Promise<void> {
        if (options.addToExistingProject) {
            await this.addToProject(context, language, projectPath, options);
            return;
        }
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
        const deliveryMode = options.deliveryMode ?? 'poll';
        const webhook = deliveryMode === 'webhook';
        context.valuesToMask.push(projectPath);
        context.telemetry.properties.connectorTriggerTemplate = generic ? 'generic' : 'specialized';
        context.telemetry.properties.language = language;
        const temporaryDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'azfunc-template-'));
        try {
            const source = await this.downloadTemplate(context, template, temporaryDirectory, deliveryMode);
            // Before Poll scaffolding, which would otherwise create missing ignore files with only local.settings.json.
            await ensureScriptProjectIgnoreFiles(source, language);
            this.checkCancellation(options);
            this.reportProgress(localize('preparingConnectorFunctions', 'Preparing selected Connector Trigger functions...'));
            await this.copyLocalSettingsExample(source, webhook);
            // Shared deployment helpers also contain operation-to-function mappings.
            const { issues: hookIssues, bundledFiles } = await prepareConnectorSampleDeployment(source,
                path.join(temporaryDirectory, sampleRepositoryFolderName));
            // Function names generated by this extension; unselected sample functions are pruned where safely recognizable.
            let generatedFunctionNames: string[];
            let handlerPath: string | undefined;
            let prunedNames = new Set<string>();
            if (generic) {
                handlerPath = (await materializeGenericConnectorTriggerProject(source, language, options.selection, options.outputMetadata, deliveryMode))[0];
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
                const selectedNames = new Set(selectedFunctionNames.map(name => name.toLowerCase()));
                const unselectedNames = [...new Set(sampleOperations.values())]
                    .filter(name => sampleFunctions.has(name) && !selectedNames.has(name.toLowerCase()));
                // Webhook deployment hooks register every sample function, so unselected functions are kept.
                if (!webhook) {
                    const triggerConfigSettingNames = new Map((await findPollingConnectorBindings(source)).flatMap(binding =>
                        binding.functionName ? [[binding.functionName, binding.triggerConfigSettingName] as [string, string]] : []));
                    prunedNames = await pruneConnectorSampleFunctions(source, sampleFunctions, unselectedNames, triggerConfigSettingNames);
                }
                context.telemetry.measurements.connectorSamplePrunedFunctions = prunedNames.size;
                context.telemetry.measurements.connectorSampleKeptUnselectedFunctions = unselectedNames.length - prunedNames.size;
                context.telemetry.measurements.connectorSampleCoveredEvents = selections.length - additionalIds.length;
                context.telemetry.measurements.connectorGeneratedEvents = additionalIds.length;
                generatedFunctionNames = additionalIds.map(operationId =>
                    getConnectorTriggerEventIdentity(options.selection.connectorId, operationId).functionName);
                const primaryFunction = sampleOperations.get(selections[0].operationId.toLowerCase());
                handlerPath = primaryFunction ? sampleFunctions.get(primaryFunction) : undefined;
                if (additionalIds.length > 0) {
                    const additionalSelection = { connectorId: options.selection.connectorId, operationIds: additionalIds };
                    const additionalPaths = webhook ?
                        await ensureConnectorTriggerWebhookProjects(source, language, additionalSelection) :
                        await ensureConnectorTriggerPollProjects(source, language, additionalSelection, options.outputMetadata);
                    const primaryIndex = additionalIds.indexOf(selections[0].operationId);
                    if (primaryIndex >= 0) {
                        handlerPath = additionalPaths[primaryIndex];
                    }
                }
            }
            const registrations = await findConnectorTriggerRegistrations(source);
            const bindings = await findPollingConnectorBindings(source);
            if (webhook) {
                if ((generic && registrations.length !== selections.length) ||
                    generatedFunctionNames.some(name => registrations.filter(registration => registration === name).length !== 1)) {
                    throw new Error(localize('connectorProjectWebhookBatchInvalid', 'The project template did not produce exactly one webhook function for each selected event.'));
                }
            } else if ((generic && (registrations.length !== selections.length || bindings.length !== selections.length)) ||
                generatedFunctionNames.some(name => registrations.filter(registration => registration === name).length !== 1 ||
                    bindings.filter(binding => binding.functionName === name).length !== 1)) {
                throw new Error(localize('connectorProjectBatchInvalid', 'The project template did not produce exactly one Poll function for each selected event.'));
            }
            if (language === ProjectLanguage.CSharp && options.targetFramework) {
                await retargetConnectorTriggerProject(source, options.targetFramework);
                context.telemetry.properties.targetFramework = options.targetFramework;
            }
            await this.prepareLocalSettings(context, source, language, deliveryMode);
            if (bindings.length > 1 && !generic && !webhook) {
                const readmePath = path.join(source, 'README.md');
                const readme = await AzExtFsExtra.pathExists(readmePath) ? await AzExtFsExtra.readFile(readmePath) : '';
                await AzExtFsExtra.writeFile(readmePath, `${readme.trimEnd()}

## Connector Trigger functions

${bindings.sort((left, right) => (left.functionName ?? '').localeCompare(right.functionName ?? '')).map(binding =>
                    `- Function \`${binding.functionName}\`: connection \`${binding.connectionSettingName}\`, trigger configuration \`${binding.triggerConfigSettingName}\`.`).join('\n')}

Configure every event separately before running or deploying. Authoring does not create Azure resources or authorize connector connections. F5 setup configures each event in turn; choose the event from the **Event trigger to configure** list at the top of the setup screen.

Deployment behavior is defined by this sample's \`azure.yaml\` hooks and \`infra\` files. Review those files for the sample's setup and authorization steps; generated functions may need additional infrastructure configuration. Static file checks do not execute or verify deployment hooks.
`);
            }
            this.checkCancellation(options);
            this.reportProgress(localize('settingUpConnectorProject', 'Setting up project files...'));
            await this.copyPreparedProject(source, projectPath, options);
            const deploymentHookPath = language === ProjectLanguage.Python ? path.join(projectPath, 'infra', 'scripts', 'setup.py') :
                language === ProjectLanguage.CSharp ? path.join(projectPath, 'infra', 'scripts', 'postdeploy.ps1') : undefined;
            if (deploymentHookPath && prunedNames.size && await AzExtFsExtra.pathExists(deploymentHookPath)) {
                const hook = await AzExtFsExtra.readFile(deploymentHookPath);
                const prunedHook = pruneConnectorSampleDeploymentHook(hook, path.extname(deploymentHookPath), prunedNames);
                if (prunedHook !== hook) {
                    await AzExtFsExtra.writeFile(deploymentHookPath, prunedHook);
                }
            }
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
            // F5 Connector setup provisions Poll events only; webhook events let F5 show setup guidance instead.
            await initProjectForVSCodeAtProjectRoot(initializationContext, projectPath, language, {
                preserveExistingConfig: true,
                connectorTriggerEvents: selections.map(event => ({
                    ...event, ...(savedContext ? { azureContext: savedContext } : {}), deliveryMode,
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

    private async addToProject(
        context: IActionContext, language: ProjectLanguage, projectPath: string, options: ConnectorProjectCreationOptions,
    ): Promise<void> {
        context.valuesToMask.push(projectPath);
        context.telemetry.properties.language = language;
        if (await getExistingConnectorProjectLanguage(context, projectPath) !== language) {
            throw new Error(localize('connectorExistingProjectChanged', 'The selected Functions project has changed. Select the workspace again.'));
        }
        if (options.azureContext !== undefined && !isConnectorTriggerAuthoringContext(options.azureContext)) {
            throw new Error(localize('connectorAuthoringContextInvalid', 'Select a valid Azure subscription and region again before creating the Connector Trigger project.'));
        }
        validateConnectorTriggerSelections(options.selection, true);
        const typeScriptEntry = language === ProjectLanguage.TypeScript ? await getSingleTypeScriptEntryPoint(projectPath) : undefined;
        const previousEvents = await readConnectorTriggerProjectEvents(projectPath);
        this.checkCancellation(options);
        await this.prepareExistingDependencies(context, projectPath, language);
        this.checkCancellation(options);
        const webhook = options.deliveryMode === 'webhook';
        context.telemetry.properties.connectorTriggerTemplate = 'existingProject';
        const key = JSON.stringify([projectPath, language, options.deliveryMode ?? 'poll', options.selection]);
        // Checkpoint each completed event so a failed batch can resume without adding duplicates.
        if (this.pendingAddition?.key !== key) {
            this.pendingAddition = { key, functions: [] };
        }
        const functions = this.pendingAddition.functions;
        const selections = getConnectorTriggerSelections(options.selection);
        if (this.pendingAddition.finishing) {
            await this.pendingAddition.finishing.finish();
            functions.push(this.pendingAddition.finishing.item);
            this.pendingAddition.finishing = undefined;
        }
        for (const selection of selections.slice(functions.length)) {
            this.checkCancellation(options);
            const checkpoint = (item: AddedConnectorFunctions[number], finish: () => Promise<void>): void => {
                if (this.pendingAddition) {
                    this.pendingAddition.finishing = { item, finish };
                }
            };
            const added = webhook ?
                await addConnectorTriggerWebhookProjects(projectPath, language, selection, options.cancellationToken, checkpoint) :
                await addConnectorTriggerPollProjects(projectPath, language, selection, options.cancellationToken, checkpoint);
            functions.push(...added);
            this.pendingAddition.finishing = undefined;
        }
        if (typeScriptEntry) {
            await addTypeScriptEntryImports(typeScriptEntry, functions.map(item => item.handlerPath));
        }
        const initializationContext: IActionContext & Partial<IPythonVenvWizardContext> = Object.assign({}, context);
        const addedEvents = functions.filter(({ functionName }) =>
            !previousEvents.some(event => event.functionName === functionName)).map(({ event, functionName }) => ({
            ...event, functionName, deliveryMode: options.deliveryMode ?? 'poll',
            ...(options.azureContext ? { azureContext: options.azureContext } : {}),
        }));
        await initProjectForVSCodeAtProjectRoot(initializationContext, projectPath, language, {
            preserveExistingConfig: true,
            detectLanguageModel: true,
            ...(previousEvents.length || addedEvents.length ? {
                connectorTriggerEvents: [
                    ...previousEvents.map(({ connectorId, operationId, functionName, azureContext, deliveryMode }) => ({
                        connectorId, operationId, deliveryMode, ...(functionName ? { functionName } : {}), ...(azureContext ? { azureContext } : {}),
                    })),
                    ...addedEvents,
                ],
            } : {}),
        });
        this.checkCancellation(options);
        const prepareContext: IProjectPrepareContext = Object.assign({}, context, {
            projectPath, language, cancellationToken: options.cancellationToken, venvName: initializationContext.venvName,
        });
        await new AzureWizard(prepareContext, {
            title: localize('preparingConnectorProject', 'Prepare Connector Trigger project'),
            executeSteps: [new ProjectPrepareStep()],
        }).execute();
        this.checkCancellation(options);
        this.pendingAddition = undefined;
        context.telemetry.properties.result = 'Succeeded';
        this.callbacks.onProjectCreated?.();
        void vscode.window.showInformationMessage(localize('connectorFunctionsAdded', 'Connector Trigger functions added to the existing project.'));
        await promptAndOpenProject(context, projectPath, functions[0]?.handlerPath);
    }

    private async prepareExistingDependencies(context: IActionContext, projectPath: string, language: ProjectLanguage): Promise<void> {
        if (language === ProjectLanguage.CSharp) {
            const [project] = await dotnetUtils.getProjFiles(context, language, projectPath);
            if (!/Include="Microsoft\.Azure\.Functions\.Worker\.Extensions\.Connector"/i.test(await project.getContents())) {
                await cpUtils.executeCommand(ext.outputChannel, projectPath, 'dotnet', [
                    'add', project.name, 'package', 'Microsoft.Azure.Functions.Worker.Extensions.Connector', '--version', '1.0.0',
                ]);
            }
        } else if (language === ProjectLanguage.TypeScript) {
            const packagePath = path.join(projectPath, packageJsonFileName);
            const text = await AzExtFsExtra.readFile(packagePath);
            const contents = parseJson<{ dependencies?: Record<string, string> }>(text);
            const current = contents.dependencies?.['@azure/functions'];
            const minimum = current && semver.validRange(current) ? semver.coerce(current) : undefined;
            if (!minimum || semver.lt(minimum, '4.17.1')) {
                await this.updateTemplateJson(packagePath, text, ['dependencies', '@azure/functions'], '^4.17.1');
            }
        } else if (language === ProjectLanguage.Python) {
            const requirementsPath = path.join(projectPath, 'requirements.txt');
            const text = await AzExtFsExtra.readFile(requirementsPath);
            const dependency = /^azure-functions\s*(?:[<>=!~].*)?$/mi;
            const required = 'azure-functions>=2.4.0';
            const existing = text.match(dependency)?.[0];
            const minimum = existing && semver.coerce(existing);
            const updated = minimum && semver.gte(minimum, '2.4.0') ? text :
                dependency.test(text) ? text.replace(dependency, required) : `${text.trimEnd()}\n${required}\n`;
            if (updated !== text) {
                await AzExtFsExtra.writeFile(requirementsPath, updated);
            }
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

    private async updateTemplateJson(file: string, original: string, property: string[], value: object | string): Promise<void> {
        const bom = original.startsWith('\uFEFF') ? '\uFEFF' : '';
        const contents = original.slice(bom.length);
        const edits = jsonc.modify(contents, property, value, {
            formattingOptions: { insertSpaces: true, tabSize: 4, eol: original.includes('\r\n') ? '\r\n' : '\n' },
        });
        await AzExtFsExtra.writeFile(file, bom + jsonc.applyEdits(contents, edits));
    }

    /** Copies the sample's example settings; with `merge`, also adds example keys missing from existing settings. */
    private async copyLocalSettingsExample(source: string, merge: boolean = false): Promise<void> {
        const settingsPath = path.join(source, localSettingsFileName);
        const examplePath = path.join(source, localSettingsExampleFileName);
        if (!await AzExtFsExtra.pathExists(examplePath)) {
            return;
        }
        if (!await AzExtFsExtra.pathExists(settingsPath)) {
            await AzExtFsExtra.copy(examplePath, settingsPath, { overwrite: false });
        } else if (merge) {
            const example = parseJson<{ Values?: Record<string, unknown> }>(await AzExtFsExtra.readFile(examplePath));
            const settings = parseJson<{ Values?: Record<string, unknown> }>(await AzExtFsExtra.readFile(settingsPath));
            const missing = Object.entries(example.Values ?? {}).filter(([key]) => !Object.prototype.hasOwnProperty.call(settings.Values ?? {}, key));
            if (missing.length) {
                settings.Values = { ...settings.Values, ...Object.fromEntries(missing) };
                await AzExtFsExtra.writeJSON(settingsPath, settings);
            }
        }
    }

    private async prepareLocalSettings(context: IActionContext, source: string, language: ProjectLanguage, deliveryMode: ConnectorTriggerDeliveryMode): Promise<void> {
        const bindings = deliveryMode === 'webhook' ? [] : await findPollingConnectorBindings(source);
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
        if (deliveryMode === 'webhook') {
            for (const [key, value] of Object.entries(settings.Values)) {
                if (typeof value === 'string' && /^<[^<>]*>$/.test(value.trim())) {
                    settings.Values[key] = '';
                }
            }
        }
        for (const binding of bindings) {
            settings.Values[binding.triggerConfigSettingName] = '';
            settings.Values[`${binding.connectionSettingName}__pollingEndpoint`] = '';
        }
        await AzExtFsExtra.writeJSON(settingsPath, settings);
    }

    private async downloadTemplate(
        context: IActionContext, template: IProjectTemplate, temporaryDirectory: string, deliveryMode: ConnectorTriggerDeliveryMode,
    ): Promise<string> {
        // Connector samples are published from their default branch; manifest tags lag behind the working samples.
        const rawRef = template.branch?.trim() || connectorSampleBranch;
        const repositoryPath = path.join(temporaryDirectory, sampleRepositoryFolderName);
        const relative = template.folderPath && template.folderPath !== '.' ? template.folderPath : template.subdirectory ?? '.';
        const folder = path.resolve(repositoryPath, relative);
        const normalized = path.relative(repositoryPath, folder);
        if (normalized.startsWith(`..${path.sep}`) || normalized === '..' || path.isAbsolute(normalized)) {
            throw new Error(localize('connectorTemplateFolderInvalid', 'The connector project template does not contain a valid Functions project folder.'));
        }
        // Include sibling delivery modes and shared deployment helpers even for mode-specific manifests.
        const parentFolder = ['template', 'polling', 'webhook'].includes(path.basename(folder).toLowerCase()) ? path.dirname(folder) : undefined;
        const checkoutFolder = path.relative(repositoryPath, parentFolder ?? folder).split(path.sep).join('/') || '.';
        const gitAvailable = await gitUtils.isGitInstalled(temporaryDirectory);
        context.telemetry.properties.connectorTemplateDownload = gitAvailable ? 'git' : 'zip';
        if (gitAvailable) {
            this.reportProgress(localize('cloningConnectorTemplate', 'Downloading the connector project template...'));
        }
        await acquireProjectTemplateRepository(context, template.repositoryUrl, rawRef, repositoryPath, {
            gitInstalled: gitAvailable, checkoutFolder,
        });
        let source: string | undefined;
        for (const candidate of parentFolder ? (deliveryMode === 'webhook' ? [parentFolder] : [folder, parentFolder]) : [folder]) {
            if (await AzExtFsExtra.pathExists(candidate)) {
                source = await resolveConnectorSampleProjectFolder(candidate, deliveryMode);
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
        source: string, destination: string, options: ConnectorProjectCreationOptions,
    ): Promise<void> {
        const files: { source: string; destination: string }[] = [];
        const settingsPath = path.join(destination, localSettingsFileName);
        let settingsUpdate: { original: string; content: string } | undefined;
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
                        if (relative === '' && entry.name === localSettingsFileName) {
                            const defaults = (await getLocalSettingsJsonWithDefaults(sourcePath, {})).Values ?? {};
                            if (Object.keys(defaults).length) {
                                const settings = await getLocalSettingsJsonWithDefaults(destinationPath, {});
                                const missing = Object.entries(defaults).filter(([key]) =>
                                    !Object.prototype.hasOwnProperty.call(settings.Values, key));
                                if (missing.length) {
                                    if (vscode.workspace.textDocuments.some(document =>
                                        document.isDirty && document.uri.scheme === 'file' && isPathEqual(document.uri.fsPath, settingsPath))) {
                                        throw new Error(localize('connectorSettingsUnsaved', 'Save local.settings.json before creating the Connector Trigger project.'));
                                    }
                                    const original = await AzExtFsExtra.readFile(destinationPath);
                                    const bom = original.startsWith('\uFEFF') ? '\uFEFF' : '';
                                    let content = original.slice(bom.length);
                                    for (const [key, value] of missing) {
                                        content = jsonc.applyEdits(content, jsonc.modify(content, ['Values', key], value, {
                                            formattingOptions: { insertSpaces: true, tabSize: 4, eol: original.includes('\r\n') ? '\r\n' : '\n' },
                                        }));
                                    }
                                    settingsUpdate = { original, content: bom + content };
                                }
                            }
                            continue;
                        }
                        // npm install updates the starter lockfile; retain it when retrying the same project.
                        if (relative === '' && entry.name === 'package-lock.json' &&
                            await AzExtFsExtra.pathExists(path.join(destination, packageJsonFileName)) &&
                            (await fs.promises.readFile(path.join(source, packageJsonFileName))).equals(
                                await fs.promises.readFile(path.join(destination, packageJsonFileName)))) {
                            continue;
                        }
                        if (entry.name.startsWith('.') || relative.split(path.sep)[0] === vscodeFolderName) {
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
        if (settingsUpdate) {
            this.checkCancellation(options);
            if (vscode.workspace.textDocuments.some(document =>
                document.isDirty && document.uri.scheme === 'file' && isPathEqual(document.uri.fsPath, settingsPath)) ||
                await AzExtFsExtra.readFile(settingsPath) !== settingsUpdate.original) {
                throw new Error(localize('connectorSettingsChanged', 'local.settings.json changed during project creation. Save the file and retry; existing settings were not overwritten.'));
            }
            await AzExtFsExtra.writeFile(settingsPath, settingsUpdate.content);
        }
    }

}

export async function getExistingConnectorProjectLanguage(context: IActionContext, projectPath: string): Promise<ProjectLanguage | undefined> {
    if (!await AzExtFsExtra.pathExists(path.join(projectPath, hostFileName))) {
        return undefined;
    }
    const language = await detectProjectLanguage(context, projectPath);
    const model = language && await detectProjectLanguageModel(language, projectPath);
    if (language === ProjectLanguage.TypeScript && model === 4 ||
        language === ProjectLanguage.Python && model === 2) {
        return language;
    }
    if (language === ProjectLanguage.CSharp) {
        const projects = await dotnetUtils.getProjFiles(context, language, projectPath);
        if (projects.length === 1 && await dotnetUtils.getIsIsolated(projects[0])) {
            return language;
        }
    }
    throw new Error(localize('connectorExistingProjectUnsupported',
        'Select a Python v2, TypeScript v4, or C# isolated Functions project, or choose a folder for a new project.'));
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
