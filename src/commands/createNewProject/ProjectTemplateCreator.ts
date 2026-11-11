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
import { type ConnectorTriggerSelections } from '../../connectorTrigger/connectorTriggerSelection';
import { findConnectorTriggerRegistrations, findPollingConnectorBindings } from '../../connectorTrigger/connectorTriggerBindings';
import { getConnectorTriggerEventIdentity } from '../../connectorTrigger/connectorTriggerEventIdentity';
import { retargetConnectorTriggerProject } from '../../connectorTrigger/connectorTriggerTargetFramework';
import { ensureConnectorTriggerPollProjects, updatePythonFunctionsSdk, validateConnectorTriggerSelections } from '../../connectorTrigger/ensureConnectorTriggerPollProject';
import { isGenericConnectorTriggerTemplate } from '../../connectorTrigger/genericConnectorTriggerTemplates';
import { materializeConnectorTriggerTemplateOperations } from '../../connectorTrigger/materializeConnectorTriggerTemplate';
import { materializeGenericConnectorTriggerProject } from '../../connectorTrigger/materializeGenericConnectorTriggerProject';
import { hostFileName, localSettingsFileName, packageJsonFileName, ProjectLanguage, vscodeFolderName, workerRuntimeKey } from '../../constants';
import { localize } from '../../localize';
import { getLocalSettingsJson } from '../../funcConfig/local.settings';
import { cloneProjectTemplate } from '../../templates/projectTemplates/cloneProjectTemplate';
import { type IProjectTemplate } from '../../templates/projectTemplates/IProjectTemplate';
import { gitUtils } from '../../utils/gitUtils';
import { requestUtils } from '../../utils/requestUtils';
import { extractZip } from '../../utils/zipUtils';
import { tryGetFunctionsWorkerRuntimeForProject } from '../../vsCodeConfig/settings';
import { initProjectForVSCodeAtProjectRoot } from '../initProjectForVSCode/initProjectForVSCode';
import { promptAndOpenProject } from './OpenFolderStep';
import { ProjectPrepareStep, type IProjectPrepareContext } from './ProjectPrepareStep';
import { ensureScriptProjectIgnoreFiles } from './ProjectCreateStep/scriptProjectIgnoreFiles';
import { type IPythonVenvWizardContext } from './pythonSteps/IPythonVenvWizardContext';

export interface ProjectTemplateCreatorCallbacks {
    onProjectCreated?(): void;
    reportProgress?(detail: string): void;
}

export interface ConnectorProjectCreationOptions {
    selection: ConnectorTriggerSelections;
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
        const generic = isGenericConnectorTriggerTemplate(template, language);
        const ownership = template.connectorTrigger;
        if (!generic && !ownership) {
            throw new Error(localize('connectorTriggerOwnershipMissing', 'The selected connector project template is missing operation ownership metadata.'));
        }
        const functionNames = selections.map(selection =>
            ownership?.operations.find(operation => operation.operationId === selection.operationId)?.functionName ??
            getConnectorTriggerEventIdentity(selection.connectorId, selection.operationId).functionName);
        if (new Set(functionNames.map(name => name.toLowerCase())).size !== functionNames.length) {
            throw new Error(localize('connectorTemplateFunctionCollision', 'The selected events would register the same template function. Choose a different combination of events.'));
        }
        context.valuesToMask.push(projectPath);
        context.telemetry.properties.connectorTriggerTemplate = generic ? 'generic' : 'specialized';
        context.telemetry.properties.language = language;
        const temporaryDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'azfunc-template-'));
        try {
            const source = await this.downloadTemplate(context, template, temporaryDirectory);
            this.checkCancellation(options);
            this.reportProgress(localize('preparingConnectorFunctions', 'Preparing selected Connector Trigger functions...'));
            if (generic) {
                await materializeGenericConnectorTriggerProject(source, language, options.selection, options.outputMetadata);
            } else if (ownership) {
                const ownedIds = selections.map(selection => selection.operationId)
                    .filter(operationId => ownership.operations.some(operation => operation.operationId === operationId));
                await materializeConnectorTriggerTemplateOperations(source, ownership, ownedIds);
                const additionalIds = selections.map(selection => selection.operationId).filter(id => !ownedIds.includes(id));
                if (additionalIds.length > 0) {
                    await ensureConnectorTriggerPollProjects(source, language,
                        { connectorId: options.selection.connectorId, operationIds: additionalIds }, options.outputMetadata);
                }
            }
            if (language === ProjectLanguage.Python) {
                await updatePythonFunctionsSdk(source);
            }
            const registrations = await findConnectorTriggerRegistrations(source);
            const bindings = await findPollingConnectorBindings(source);
            if (registrations.length !== selections.length || bindings.length !== selections.length ||
                functionNames.some(name => registrations.filter(registration => registration === name).length !== 1 ||
                    bindings.filter(binding => binding.functionName === name).length !== 1)) {
                throw new Error(localize('connectorProjectBatchInvalid', 'The project template did not produce exactly one Poll function for each selected event.'));
            }
            if (language === ProjectLanguage.CSharp && options.targetFramework) {
                await retargetConnectorTriggerProject(source, options.targetFramework);
                context.telemetry.properties.targetFramework = options.targetFramework;
            }
            await this.prepareLocalSettings(context, source, language);
            await ensureScriptProjectIgnoreFiles(source, language);
            if (selections.length > 1 && !generic) {
                const readmePath = path.join(source, 'README.md');
                const readme = await AzExtFsExtra.pathExists(readmePath) ? await AzExtFsExtra.readFile(readmePath) : '';
                await AzExtFsExtra.writeFile(readmePath, `${readme.trimEnd()}

## Selected Connector Trigger functions

${bindings.sort((left, right) => (left.functionName ?? '').localeCompare(right.functionName ?? '')).map(binding =>
                    `- Function \`${binding.functionName}\`: connection \`${binding.connectionSettingName}\`, trigger configuration \`${binding.triggerConfigSettingName}\`.`).join('\n')}

Configure every event separately before running or deploying. Authoring does not create Azure resources or authorize connector connections. Multi-event F5 setup is not included. The starter's Azure provisioning hooks are single-event examples, not multi-event setup.
`);
            }
            this.checkCancellation(options);
            this.reportProgress(localize('settingUpConnectorProject', 'Setting up project files...'));
            await this.copyPreparedProject(source, projectPath, options);
            this.checkCancellation(options);
            this.reportProgress(localize('initializingConnectorProject', 'Initializing the project for VS Code...'));
            const initializationContext: IActionContext & Partial<IPythonVenvWizardContext> = Object.assign({}, context);
            await initProjectForVSCodeAtProjectRoot(initializationContext, projectPath, language, { preserveExistingConfig: true });
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
            void vscode.window.showInformationMessage(localize('connectorProjectCreated', 'Connector Trigger project created.'));
            await promptAndOpenProject(context, projectPath);
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

    private async prepareLocalSettings(context: IActionContext, source: string, language: ProjectLanguage): Promise<void> {
        const bindings = await findPollingConnectorBindings(source);
        const configNames = bindings.map(binding => binding.triggerConfigSettingName.toLowerCase());
        if (new Set(configNames).size !== configNames.length) {
            throw new Error(localize('connectorTriggerConfigCollision', 'Each selected event must have its own trigger configuration setting.'));
        }
        const settingsPath = path.join(source, localSettingsFileName);
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
            for (const key of [binding.triggerConfigSettingName, `${binding.connectionSettingName}__pollingEndpoint`]) {
                if (settings.Values[key] === undefined || /^<[^>]+>$/.test(settings.Values[key])) {
                    settings.Values[key] = '';
                }
            }
        }
        await AzExtFsExtra.writeJSON(settingsPath, settings);
    }

    private async downloadTemplate(context: IActionContext, template: IProjectTemplate, temporaryDirectory: string): Promise<string> {
        const rawRef = template.gitRef?.trim() || template.branch?.trim() || 'main';
        const repositoryPath = path.join(temporaryDirectory, 'repository');
        const gitAvailable = await gitUtils.isGitInstalled(temporaryDirectory);
        context.telemetry.properties.connectorTemplateDownload = gitAvailable ? 'git' : 'zip';
        if (gitAvailable) {
            this.reportProgress(localize('cloningConnectorTemplate', 'Downloading the connector project template...'));
            await cloneProjectTemplate(template.repositoryUrl, rawRef, repositoryPath, template.folderPath);
        } else {
            const archiveRef = rawRef.startsWith('refs/') || template.gitRef ? rawRef : `refs/heads/${rawRef}`;
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
        const relative = template.folderPath && template.folderPath !== '.' ? template.folderPath : template.subdirectory ?? '.';
        const source = path.resolve(repositoryPath, relative);
        const normalized = path.relative(repositoryPath, source);
        if (normalized.startsWith(`..${path.sep}`) || normalized === '..' || path.isAbsolute(normalized) ||
            !await AzExtFsExtra.pathExists(path.join(source, hostFileName))) {
            throw new Error(localize('connectorTemplateFolderInvalid', 'The connector project template does not contain a valid Functions project folder.'));
        }
        return source;
    }

    private async copyPreparedProject(source: string, destination: string, options: ConnectorProjectCreationOptions): Promise<void> {
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
    }

}
