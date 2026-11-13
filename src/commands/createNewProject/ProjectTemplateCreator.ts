/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizard, UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { type ConnectorTriggerSelection, type ConnectorTriggerSelections } from '../../connectorTrigger/connectorTriggerSelection';
import {
    formatConnectorTriggerFunctionList,
    hasOnePollFunctionPerName,
    scanConnectorTriggerProject,
    type ConnectorTriggerBindingCandidate,
    type ConnectorTriggerProjectScan,
} from '../../connectorTrigger/connectorTriggerBindings';
import { getConnectorTriggerEventIdentity } from '../../connectorTrigger/connectorTriggerEventIdentity';
import { retargetConnectorTriggerProject } from '../../connectorTrigger/connectorTriggerTargetFramework';
import { ensureConnectorTriggerPollProjects, updatePythonFunctionsSdk, validateConnectorTriggerSelections } from '../../connectorTrigger/ensureConnectorTriggerPollProject';
import { isGenericConnectorTriggerTemplate } from '../../connectorTrigger/genericConnectorTriggerTemplates';
import { materializeConnectorTriggerTemplateOperations } from '../../connectorTrigger/materializeConnectorTriggerTemplate';
import { materializeGenericConnectorTriggerProject } from '../../connectorTrigger/materializeGenericConnectorTriggerProject';
import { hostFileName, localSettingsFileName, packageJsonFileName, ProjectLanguage, vscodeFolderName, workerRuntimeKey } from '../../constants';
import { localize } from '../../localize';
import { getLocalSettingsJson } from '../../funcConfig/local.settings';
import { acquireProjectTemplate } from '../../templates/projectTemplates/acquireProjectTemplate';
import { type IProjectTemplate } from '../../templates/projectTemplates/IProjectTemplate';
import { nonNullValue } from '../../utils/nonNull';
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
            // Before Poll scaffolding, which would otherwise create missing ignore files with only local.settings.json.
            await ensureScriptProjectIgnoreFiles(source, language);
            this.checkCancellation(options);
            this.reportProgress(localize('preparingConnectorFunctions', 'Preparing selected Connector Trigger functions...'));
            let scan: ConnectorTriggerProjectScan;
            let pollSelections: readonly ConnectorTriggerSelection[] = selections;
            if (generic) {
                scan = await materializeGenericConnectorTriggerProject(source, language, selections);
            } else {
                const connectorTrigger = nonNullValue(ownership);
                const owned = selections.filter(selection =>
                    connectorTrigger.operations.some(operation => operation.operationId === selection.operationId));
                pollSelections = selections.filter(selection => !owned.includes(selection));
                scan = (await materializeConnectorTriggerTemplateOperations(source, connectorTrigger, owned.map(selection => selection.operationId))).scan;
                if (pollSelections.length > 0) {
                    await ensureConnectorTriggerPollProjects(source, language, pollSelections);
                    scan = await scanConnectorTriggerProject(source);
                }
            }
            if (language === ProjectLanguage.Python && pollSelections.length === 0) {
                // Poll scaffolding already updates requirements.txt.
                await updatePythonFunctionsSdk(source);
            }
            if (!hasOnePollFunctionPerName(scan, functionNames)) {
                throw new Error(localize('connectorProjectBatchInvalid', 'The project template did not produce exactly one Poll function for each selected event.'));
            }
            // The scan stays current: the steps below don't write function.json or .cs/.py/.js/.ts files.
            if (language === ProjectLanguage.CSharp && options.targetFramework) {
                await retargetConnectorTriggerProject(source, options.targetFramework);
                context.telemetry.properties.targetFramework = options.targetFramework;
            }
            await this.prepareLocalSettings(context, source, language, scan.bindings);
            await ensureScriptProjectIgnoreFiles(source, language);
            if (selections.length > 1 && !generic) {
                const readmePath = path.join(source, 'README.md');
                const readme = await AzExtFsExtra.pathExists(readmePath) ? await AzExtFsExtra.readFile(readmePath) : '';
                await AzExtFsExtra.writeFile(readmePath, `${readme.trimEnd()}

## Selected Connector Trigger functions

${formatConnectorTriggerFunctionList(scan.bindings)}

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

    private async prepareLocalSettings(
        context: IActionContext, source: string, language: ProjectLanguage, bindings: readonly ConnectorTriggerBindingCandidate[],
    ): Promise<void> {
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
        const { folder } = await acquireProjectTemplate(context, template, path.join(temporaryDirectory, 'repository'), method => {
            context.telemetry.properties.connectorTemplateDownload = method;
            if (method === 'git') {
                this.reportProgress(localize('cloningConnectorTemplate', 'Downloading the connector project template...'));
            }
        });
        if (!folder || !await AzExtFsExtra.pathExists(path.join(folder, hostFileName))) {
            throw new Error(localize('connectorTemplateFolderInvalid', 'The connector project template does not contain a valid Functions project folder.'));
        }
        return folder;
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
