/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizard, UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { type ConnectorTriggerOutputMetadata } from '../../connectorTrigger/connectorTriggerOutputSchema';
import { isConnectorTriggerAuthoringContext, type ConnectorTriggerAuthoringContext, type ConnectorTriggerSelections } from '../../connectorTrigger/connectorTriggerSelection';
import { findConnectorTriggerRegistrations, findPollingConnectorBindings, getFunctionDisabledSettingName, isFunctionDisabledSettingValue } from '../../connectorTrigger/connectorTriggerBindings';
import { getConnectorTriggerEventIdentity } from '../../connectorTrigger/connectorTriggerEventIdentity';
import { retargetConnectorTriggerProject } from '../../connectorTrigger/connectorTriggerTargetFramework';
import { ensureConnectorTriggerPollProjects, readConnectorPollSample, validateConnectorTriggerSelections } from '../../connectorTrigger/ensureConnectorTriggerPollProject';
import { findConnectorSampleFunctionPaths, getConnectorSampleOperationFunctions, resolveConnectorSampleProjectFolder, validateConnectorSampleFiles } from '../../connectorTrigger/connectorSampleProject';
import { prepareConnectorSampleDeployment, type ConnectorSampleDeploymentPreparation, type ConnectorSampleHookIssue } from '../../connectorTrigger/connectorSampleDeployment';
import { getGenericConnectorTriggerTemplate, isGenericConnectorTriggerTemplate } from '../../connectorTrigger/genericConnectorTriggerTemplates';
import { materializeGenericConnectorTriggerProject } from '../../connectorTrigger/materializeGenericConnectorTriggerProject';
import { localSettingsFileName, packageJsonFileName, ProjectLanguage, vscodeFolderName, workerRuntimeKey } from '../../constants';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { ensureLocalSettingsIgnored, getLocalSettingsJson, getLocalSettingsJsonWithDefaults } from '../../funcConfig/local.settings';
import { acquireProjectTemplateRepository } from '../../templates/projectTemplates/acquireProjectTemplate';
import { type IProjectTemplate } from '../../templates/projectTemplates/IProjectTemplate';
import { gitUtils } from '../../utils/gitUtils';
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
            // Preserve sample ignore files while keeping local settings out of source control and deployments.
            await ensureScriptProjectIgnoreFiles(source, language);
            await ensureLocalSettingsIgnored(source, language);
            this.checkCancellation(options);
            this.reportProgress(localize('preparingConnectorFunctions', 'Preparing selected Connector Trigger functions...'));
            await this.copyLocalSettingsExample(source);
            let selectedFunctionNames: string[];
            let handlerPath: string | undefined;
            if (generic) {
                handlerPath = (await materializeGenericConnectorTriggerProject(source, language, options.selection, options.outputMetadata, options.cancellationToken))[0];
                selectedFunctionNames = selections.map(selection =>
                    getConnectorTriggerEventIdentity(selection.connectorId, selection.operationId).functionName);
            } else {
                const sampleOperations = await getConnectorSampleOperationFunctions(source);
                const sampleFunctions = await findConnectorSampleFunctionPaths(source, [...sampleOperations.values()]);
                selectedFunctionNames = selections.map(selection => {
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
                context.telemetry.measurements.connectorSamplePrunedFunctions = 0;
                context.telemetry.measurements.connectorSampleKeptUnselectedFunctions = unselectedNames.length;
                context.telemetry.measurements.connectorSampleCoveredEvents = selections.length - additionalIds.length;
                context.telemetry.measurements.connectorGeneratedEvents = additionalIds.length;
                const primaryFunction = sampleOperations.get(selections[0].operationId.toLowerCase());
                handlerPath = primaryFunction ? sampleFunctions.get(primaryFunction) : undefined;
                if (additionalIds.length > 0) {
                    const genericTemplate = getGenericConnectorTriggerTemplate(language);
                    const genericFolder = genericTemplate?.folderPath &&
                        path.join(temporaryDirectory, sampleRepositoryFolderName, genericTemplate.folderPath);
                    const genericSource = genericFolder && await AzExtFsExtra.pathExists(genericFolder) ?
                        await resolveConnectorSampleProjectFolder(genericFolder) : undefined;
                    if (!genericSource) {
                        throw new Error(localize('connectorGenericSampleMissing',
                            'The downloaded connector samples do not include the generic Poll project required for the selected events.'));
                    }
                    await validateConnectorSampleFiles(genericSource, path.join(temporaryDirectory, sampleRepositoryFolderName));
                    const sample = await readConnectorPollSample(genericSource, language);
                    const additionalPaths = await ensureConnectorTriggerPollProjects(source, language,
                        { connectorId: options.selection.connectorId, operationIds: additionalIds }, options.outputMetadata, options.cancellationToken, sample);
                    const primaryIndex = additionalIds.indexOf(selections[0].operationId);
                    if (primaryIndex >= 0) {
                        handlerPath = additionalPaths[primaryIndex];
                    }
                }
            }
            const registrations = await findConnectorTriggerRegistrations(source);
            const bindings = await findPollingConnectorBindings(source);
            const selectedNames = new Set(selectedFunctionNames.map(name => name.toLowerCase()));
            const unselectedFunctions = [...new Set(bindings.flatMap(binding =>
                binding.functionName && !selectedNames.has(binding.functionName.toLowerCase()) ? [binding.functionName] : []))];
            if ((generic && (registrations.length !== selections.length || bindings.length !== selections.length)) ||
                selectedFunctionNames.some(name => registrations.filter(registration => registration.toLowerCase() === name.toLowerCase()).length !== 1 ||
                    bindings.filter(binding => binding.functionName?.toLowerCase() === name.toLowerCase()).length !== 1)) {
                throw new Error(localize('connectorProjectBatchInvalid', 'The project template did not produce exactly one Poll function for each selected event.'));
            }
            if (language === ProjectLanguage.CSharp && options.targetFramework) {
                await retargetConnectorTriggerProject(source, options.targetFramework);
                context.telemetry.properties.targetFramework = options.targetFramework;
            }
            await this.prepareLocalSettings(context, source, language, selectedFunctionNames);
            this.checkCancellation(options);
            this.reportProgress(localize('settingUpConnectorProject', 'Setting up project files...'));
            const { issues: hookIssues, bundledFiles } = await this.copyPreparedProject(source, projectPath, options,
                path.join(temporaryDirectory, sampleRepositoryFolderName), unselectedFunctions);
            await ensureLocalSettingsIgnored(projectPath, language);
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
            const warnings: string[] = [];
            if (hookIssues.length) {
                warnings.push(localize('connectorSampleHookIssuesMessage',
                    'Connector Trigger project created, but {0} file reference(s) from deployment hooks in azure.yaml are missing from the project. Deployment hooks may fail. See the output window for details.',
                    hookIssues.length));
            }
            if (unselectedFunctions.length) {
                warnings.push(localize('connectorSampleUnselectedDeploymentWarning',
                    'Unselected sample functions are disabled locally. Existing Azure app settings or the sample deployment scripts may enable or provision additional events; review them before deploying.'));
            }
            if (warnings.length) {
                void vscode.window.showWarningMessage(warnings.join(' '));
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

    private async copyLocalSettingsExample(source: string): Promise<void> {
        const settingsPath = path.join(source, localSettingsFileName);
        const examplePath = path.join(source, localSettingsExampleFileName);
        if (!await AzExtFsExtra.pathExists(settingsPath) && await AzExtFsExtra.pathExists(examplePath)) {
            await AzExtFsExtra.copy(examplePath, settingsPath, { overwrite: false });
        }
    }

    private async prepareLocalSettings(context: IActionContext, source: string, language: ProjectLanguage, selectedFunctionNames: readonly string[]): Promise<void> {
        const bindings = await findPollingConnectorBindings(source);
        const selected = new Set(selectedFunctionNames.map(name => name.toLowerCase()));
        if (bindings.some(binding => !binding.functionName)) {
            throw new Error(localize('connectorSampleFunctionNameMissing',
                'The connector sample contains a Poll function that cannot be identified safely.'));
        }
        const selectedBindings = bindings.filter(binding => binding.functionName && selected.has(binding.functionName.toLowerCase()));
        const configNames = selectedBindings.map(binding => binding.triggerConfigSettingName.toLowerCase());
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
        for (const binding of bindings) {
            const name = binding.functionName;
            if (!name) {
                continue;
            }
            const isSelected = selected.has(name.toLowerCase());
            const disabledNames = [getFunctionDisabledSettingName(name), `AzureWebJobs_${name}_Disabled`];
            const existing = Object.keys(settings.Values).filter(key => disabledNames.some(disabled => disabled.toLowerCase() === key.toLowerCase()));
            if (isSelected) {
                for (const key of existing) {
                    if (isFunctionDisabledSettingValue(settings.Values[key])) {
                        settings.Values[key] = 'false';
                    }
                }
            } else {
                for (const key of existing.length ? existing : [disabledNames[0]]) {
                    settings.Values[key] = 'true';
                }
            }
        }
        // Template values name provisioning examples, not resources that exist for this project.
        for (const binding of selectedBindings) {
            for (const name of [binding.triggerConfigSettingName, `${binding.connectionSettingName}__pollingEndpoint`]) {
                const key = Object.keys(settings.Values).find(existing => existing.toLowerCase() === name.toLowerCase()) ?? name;
                settings.Values[key] = '';
            }
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
        const gitAvailable = await gitUtils.isGitInstalled(temporaryDirectory);
        context.telemetry.properties.connectorTemplateDownload = gitAvailable ? 'git' : 'zip';
        if (gitAvailable) {
            this.reportProgress(localize('cloningConnectorTemplate', 'Downloading the connector project template...'));
        }
        await acquireProjectTemplateRepository(context, template.repositoryUrl, rawRef, repositoryPath, {
            gitInstalled: gitAvailable,
        });
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
        await validateConnectorSampleFiles(source, repositoryPath);
        return source;
    }

    private async copyPreparedProject(
        source: string, destination: string, options: ConnectorProjectCreationOptions, sampleRoot: string = source,
        unselectedFunctions: readonly string[] = [],
    ): Promise<ConnectorSampleDeploymentPreparation> {
        const preparation = await prepareConnectorSampleDeployment(source, sampleRoot);
        const files: { source: string; destination: string }[] = [];
        const conflict = (): Error => new Error(localize(
            'connectorProjectTargetConflict',
            'The destination contains conflicting project files. Choose an empty folder or retry with the same event selection. No existing files were overwritten.',
        ));
        const destinationStat = async (target: string): Promise<fs.Stats | undefined> => {
            try {
                return await fs.promises.lstat(target);
            } catch (error) {
                if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
                    return undefined;
                }
                throw error;
            }
        };
        const visit = async (directory: string, relative: string): Promise<void> => {
            if (relative) {
                const directoryStat = await destinationStat(path.join(destination, relative));
                if (directoryStat && !directoryStat.isDirectory()) {
                    throw conflict();
                }
            }
            for (const entry of await AzExtFsExtra.readDirectory(directory)) {
                if (entry.name === '.git') {
                    continue;
                }
                const sourcePath = path.join(directory, entry.name);
                const destinationPath = path.join(destination, relative, entry.name);
                if (entry.type === vscode.FileType.Directory) {
                    await visit(sourcePath, path.join(relative, entry.name));
                } else if (entry.type === vscode.FileType.File) {
                    const targetStat = await destinationStat(destinationPath);
                    if (targetStat) {
                        if (!targetStat.isFile()) {
                            throw conflict();
                        }
                        // npm install updates the starter lockfile; retain it when retrying the same project.
                        if (relative === '' && entry.name === 'package-lock.json' &&
                            await AzExtFsExtra.pathExists(path.join(destination, packageJsonFileName)) &&
                            (await fs.promises.readFile(path.join(source, packageJsonFileName))).equals(
                                await fs.promises.readFile(path.join(destination, packageJsonFileName)))) {
                            continue;
                        }
                        if (relative.split(path.sep)[0] === vscodeFolderName ||
                            (relative === '' && entry.name === localSettingsFileName)) {
                            continue;
                        }
                        const [sourceContent, destinationContent] = await Promise.all([
                            fs.promises.readFile(sourcePath), fs.promises.readFile(destinationPath),
                        ]);
                        if (relative === '' && (entry.name === '.gitignore' || entry.name === '.funcignore') &&
                            destinationContent.subarray(0, sourceContent.length).equals(sourceContent)) {
                            continue;
                        }
                        if (!sourceContent.equals(destinationContent)) {
                            throw conflict();
                        }
                        continue;
                    }
                    files.push({ source: sourcePath, destination: destinationPath });
                } else {
                    throw new Error(localize('connectorSampleUnsupportedFile',
                        'The connector sample contains a symbolic link or unsupported file that cannot be copied safely.'));
                }
            }
        };
        await visit(source, '');
        const destinationSettingsPath = path.join(destination, localSettingsFileName);
        let existingSettings: Awaited<ReturnType<typeof getLocalSettingsJsonWithDefaults>> | undefined;
        const existingSettingsStat = unselectedFunctions.length ? await destinationStat(destinationSettingsPath) : undefined;
        if (existingSettingsStat) {
            if (!existingSettingsStat.isFile()) {
                throw conflict();
            }
            const settings = await getLocalSettingsJsonWithDefaults(destinationSettingsPath, {});
            settings.Values ??= {};
            let changed = false;
            for (const name of unselectedFunctions) {
                const disabledNames = [getFunctionDisabledSettingName(name), `AzureWebJobs_${name}_Disabled`];
                const keys = Object.keys(settings.Values).filter(key => disabledNames.some(disabled => disabled.toLowerCase() === key.toLowerCase()));
                if (keys.some(key => isFunctionDisabledSettingValue(settings.Values?.[key]))) {
                    continue;
                }
                if (keys.length) {
                    throw new Error(localize('connectorSampleUnselectedSettingsConflict',
                        'Existing local settings enable an unselected sample function. Disable it or choose an empty project folder before retrying.'));
                }
                settings.Values[disabledNames[0]] = 'true';
                changed = true;
            }
            existingSettings = changed ? settings : undefined;
        }
        this.checkCancellation(options);
        for (const file of files) {
            this.checkCancellation(options);
            await AzExtFsExtra.ensureDir(path.dirname(file.destination));
            await AzExtFsExtra.copy(file.source, file.destination, { overwrite: false });
        }
        if (existingSettings) {
            this.checkCancellation(options);
            await AzExtFsExtra.writeJSON(destinationSettingsPath, existingSettings);
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
