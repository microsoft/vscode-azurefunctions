/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, UserCancelledError } from '@microsoft/vscode-azext-utils';
import * as fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';
import { FileType, RelativePattern, workspace, type CancellationToken } from 'vscode';
import { localSettingsFileName, localStorageEmulatorConnectionString, ProjectLanguage, requirementsFileName, workerRuntimeKey } from '../constants';
import { ensureLocalSettingsIgnored, getLocalSettingsJsonWithDefaults } from '../funcConfig/local.settings';
import { localize } from '../localize';
import { isPathEqual } from '../utils/fs';
import { findConnectorSampleFunctionPaths, validateConnectorSampleFiles } from './connectorSampleProject';
import {
    findNonPollingFunctionRegistrations,
    findPollingConnectorBindings,
    getConnectorTriggerRegistrations,
    getNonPollingFunctionRegistrations,
    getPollingConnectorBindings,
    getSourceViews,
    readGroup,
    type ConnectorTriggerBindingCandidate,
} from './connectorTriggerBindings';
import {
    getConnectorTriggerEventIdentity,
    type ConnectorTriggerEventIdentity,
} from './connectorTriggerEventIdentity';
import { getConnectorTriggerSelections, isConnectorTriggerSelections, type ConnectorTriggerSelection, type ConnectorTriggerSelections } from './connectorTriggerSelection';
import { type ConnectorTriggerOutputMetadata } from './connectorTriggerOutputSchema';
import { getPythonFunctionAppName } from './pythonFunctionApp';

interface AvailableConnectorIdentity {
    alreadyExists: boolean;
    binding: ConnectorTriggerBindingCandidate;
    identity: ConnectorTriggerEventIdentity;
}

const connectionSettingName = 'ConnectorNamespace';

export interface ConnectorSampleSource {
    readonly projectPath: string;
    readonly sourcePath: string;
    readonly source: string;
    readonly functionName: string;
}

export interface ConnectorPollSample extends ConnectorSampleSource {
    readonly binding: ConnectorTriggerBindingCandidate & { functionName: string };
    readonly settings: Readonly<Record<string, string>>;
}

export async function readConnectorPollSample(projectPath: string, language: string): Promise<ConnectorPollSample> {
    await validateConnectorSampleFiles(projectPath);
    const bindings = await findPollingConnectorBindings(projectPath);
    const binding = bindings[0];
    if (bindings.length !== 1 || !binding.functionName) {
        throw createUnsupportedTemplateError();
    }
    const functionName = binding.functionName;
    const sourcePath = (await findConnectorSampleFunctionPaths(projectPath, [functionName])).get(functionName);
    const extension = language === ProjectLanguage.CSharp ? '.cs' :
        language === ProjectLanguage.TypeScript ? '.ts' :
            language === ProjectLanguage.Python ? '.py' : undefined;
    if (!sourcePath || !extension || path.extname(sourcePath).toLowerCase() !== extension || !await isSafeSampleFile(projectPath, sourcePath)) {
        throw createUnsupportedTemplateError();
    }
    const source = await AzExtFsExtra.readFile(sourcePath);
    if (getConnectorTriggerRegistrations(source, extension).length !== 1 ||
        getPollingConnectorBindings(source, extension).length !== 1 ||
        getNonPollingFunctionRegistrations(source, extension).length !== 0) {
        throw createUnsupportedTemplateError();
    }
    const examplePath = path.join(projectPath, 'local.settings.example.json');
    const settingsPath = await AzExtFsExtra.pathExists(examplePath) ? examplePath : path.join(projectPath, localSettingsFileName);
    if (await AzExtFsExtra.pathExists(settingsPath) && !await isSafeSampleFile(projectPath, settingsPath)) {
        throw createUnsupportedTemplateError();
    }
    const settings = await getLocalSettingsJsonWithDefaults(settingsPath, {});
    return { projectPath, sourcePath, source, functionName, binding: { ...binding, functionName }, settings: settings.Values ?? {} };
}

export type ConnectorAdditionCheckpoint = (
    item: { event: ConnectorTriggerSelection; functionName: string; handlerPath: string | undefined },
    finish: () => Promise<void>,
) => void;

export async function ensureConnectorTriggerPollProjects(
    projectPath: string,
    language: string,
    selection: ConnectorTriggerSelections,
    outputMetadata: ReadonlyMap<string, ConnectorTriggerOutputMetadata> = new Map(),
    cancellationToken?: CancellationToken,
    sample?: ConnectorPollSample,
): Promise<(string | undefined)[]> {
    const selections = validateConnectorTriggerSelections(selection);
    // Validate the entire batch before changing dependencies or writing a handler.
    for (const event of selections) {
        await getAvailableConnectorIdentity(projectPath, language, event, sample);
    }
    const handlerPaths: (string | undefined)[] = [];
    for (const event of selections) {
        if (cancellationToken?.isCancellationRequested) {
            throw new UserCancelledError('connectorProjectCreation');
        }
        handlerPaths.push(await ensureConnectorTriggerPollProject(projectPath, language, event, outputMetadata.get(event.operationId), sample));
    }
    return handlerPaths;
}

export async function addConnectorTriggerPollProjects(
    projectPath: string,
    language: string,
    selection: ConnectorTriggerSelections,
    cancellationToken: CancellationToken,
    checkpoint?: ConnectorAdditionCheckpoint,
): Promise<{ event: ConnectorTriggerSelection; functionName: string; handlerPath: string | undefined }[]> {
    const selections = validateConnectorTriggerSelections(selection, true);
    const identities: AvailableConnectorIdentity[] = [];
    for (const event of selections) {
        identities.push(await getAvailableConnectorIdentity(projectPath, language, event, undefined, true, identities));
    }
    const created: { event: ConnectorTriggerSelection; functionName: string; handlerPath: string | undefined }[] = [];
    for (const [index, event] of selections.entries()) {
        if (cancellationToken.isCancellationRequested) {
            throw new UserCancelledError('connectorProjectCreation');
        }
        created.push({
            event, functionName: identities[index].identity.functionName,
            handlerPath: await writeConnectorTriggerPollProject(projectPath, language, identities[index], checkpoint ?
                (handlerPath, finish) => checkpoint({ event, functionName: identities[index].identity.functionName, handlerPath }, finish) : undefined),
        });
    }
    return created;
}

export function validateConnectorTriggerSelections(selection: ConnectorTriggerSelections, allowNameConflicts = false): ConnectorTriggerSelection[] {
    if (!isConnectorTriggerSelections(selection)) {
        throw new Error(localize('connectorTriggerSelectionInvalid', 'Select one or more distinct events for one connector.'));
    }
    const selections = getConnectorTriggerSelections(selection);
    const functionNames = selections.map(event =>
        getConnectorTriggerEventIdentity(event.connectorId, event.operationId).functionName.toLowerCase());
    if (!allowNameConflicts && new Set(functionNames).size !== functionNames.length) {
        throw new Error(localize(
            'connectorTriggerBatchNameCollision',
            'The selected events would register the same function name. Select these events separately and rename the first function before adding the next.',
        ));
    }
    return selections;
}

export async function ensureConnectorTriggerPollProject(
    projectPath: string,
    language: string,
    selection: ConnectorTriggerSelection,
    _outputMetadata?: ConnectorTriggerOutputMetadata,
    sample?: ConnectorPollSample,
): Promise<string | undefined> {
    if (![ProjectLanguage.CSharp, ProjectLanguage.TypeScript, ProjectLanguage.Python].some(value => value === language)) {
        throw new Error(localize(
            'connectorTriggerPollLanguageUnsupported',
            'Connector Trigger Poll projects are not supported for language "{0}".',
            language,
        ));
    }
    const available = await getAvailableConnectorIdentity(
        projectPath,
        language,
        selection,
        sample,
    );
    if (!available.alreadyExists && !sample) {
        throw createUnsupportedTemplateError();
    }
    const localSettingsPath = path.join(projectPath, localSettingsFileName);
    const settings = await getLocalSettingsJsonWithDefaults(localSettingsPath, {});
    settings.Values ??= {};
    if (sample) {
        const values = settings.Values;
        const addDefault = (name: string, value: string | undefined): void => {
            if (value !== undefined && !Object.keys(values).some(key => equalsIgnoreCase(key, name))) {
                values[name] = value;
            }
        };
        addDefault(workerRuntimeKey, sample.settings[workerRuntimeKey]);
        if (!Object.keys(values).some(key => key.toLowerCase() === 'azurewebjobsstorage' || key.toLowerCase().startsWith('azurewebjobsstorage__'))) {
            addDefault('AzureWebJobsStorage', sample.settings.AzureWebJobsStorage);
        }
        const endpoint = `${sample.binding.connectionSettingName}__pollingEndpoint`;
        addDefault(`${available.binding.connectionSettingName}__pollingEndpoint`, sample.settings[endpoint]);
        addDefault(available.binding.triggerConfigSettingName, sample.settings[sample.binding.triggerConfigSettingName]);
    }
    let handlerPath: string | undefined;
    if (!available.alreadyExists && sample) {
        handlerPath = await copySampleHandler(projectPath, language, available.identity, sample);
    }
    await ensureLocalSettingsIgnored(projectPath, language);
    await AzExtFsExtra.writeJSON(localSettingsPath, settings);
    return handlerPath;
}

async function writeConnectorTriggerPollProject(
    projectPath: string, language: string, available: AvailableConnectorIdentity,
    checkpoint?: (handlerPath: string | undefined, finish: () => Promise<void>) => void,
): Promise<string | undefined> {
    const workerRuntime = language === ProjectLanguage.CSharp ? 'dotnet-isolated' :
        language === ProjectLanguage.TypeScript ? 'node' :
            language === ProjectLanguage.Python ? 'python' : undefined;
    if (!workerRuntime) {
        throw new Error(localize(
            'connectorTriggerPollLanguageUnsupported',
            'Connector Trigger Poll projects are not supported for language "{0}".',
            language,
        ));
    }
    await getLocalSettingsJsonWithDefaults(path.join(projectPath, localSettingsFileName), {
        [workerRuntimeKey]: workerRuntime,
        [`${available.binding.connectionSettingName}__pollingEndpoint`]: 'https://<connector-namespace-host>',
        [available.binding.triggerConfigSettingName]: '<trigger-configuration-name>',
    });
    switch (language) {
        case ProjectLanguage.CSharp:
            await ensureCSharpProject(projectPath, available);
            break;
        case ProjectLanguage.TypeScript:
            await ensureTypeScriptProject(projectPath, available);
            break;
        case ProjectLanguage.Python:
            await ensurePythonProject(projectPath, available);
            break;
    }
    const handlerPath = language === ProjectLanguage.Python ? path.join(projectPath, 'function_app.py') :
        available.alreadyExists ? undefined : getGeneratedFilePath(projectPath, language, available.identity);
    const finish = async (): Promise<void> => {
        const localSettingsPath = path.join(projectPath, localSettingsFileName);
        const settings = await getLocalSettingsJsonWithDefaults(localSettingsPath, {
            [workerRuntimeKey]: workerRuntime,
            [`${available.binding.connectionSettingName}__pollingEndpoint`]: 'https://<connector-namespace-host>',
            [available.binding.triggerConfigSettingName]: '<trigger-configuration-name>',
        });
        if (!Object.keys(settings.Values ?? {}).some(key =>
            key.toLowerCase() === 'azurewebjobsstorage' || key.toLowerCase().startsWith('azurewebjobsstorage__'))) {
            settings.Values = { ...settings.Values, AzureWebJobsStorage: localStorageEmulatorConnectionString };
        }
        await ensureLocalSettingsIgnored(projectPath, language);
        await AzExtFsExtra.writeJSON(localSettingsPath, settings);
    };
    checkpoint?.(handlerPath, finish);
    await finish();
    return handlerPath;
}

async function getAvailableConnectorIdentity(
    projectPath: string,
    language: string,
    selection: ConnectorTriggerSelection,
    sample?: ConnectorPollSample,
    createNew = false,
    reserved: readonly AvailableConnectorIdentity[] = [],
): Promise<AvailableConnectorIdentity> {
    const nonPollingRegistrations = await findNonPollingFunctionRegistrations(projectPath);
    const bindings = await findPollingConnectorBindings(projectPath);
    const baseIdentity = getConnectorTriggerEventIdentity(
        selection.connectorId,
        selection.operationId,
    );
    const matchingBindings = bindings.filter(binding =>
        equalsIgnoreCase(binding.functionName, baseIdentity.functionName));
    if (!createNew && matchingBindings.length > 1) {
        throw new Error(localize(
            'connectorTriggerBindingAmbiguous',
            'The selected event already matches multiple Poll bindings.',
        ));
    }
    // An existing Poll binding must not hide another registration with the same name.
    if (!createNew && nonPollingRegistrations.some(registration =>
        equalsIgnoreCase(registration, baseIdentity.functionName))) {
        throw new Error(localize(
            'connectorTriggerFunctionNameCollision',
            'A function with the selected event name is already registered. Rename the existing function or select another event before adding a Connector Trigger.',
        ));
    }
    if (!createNew && matchingBindings.length === 1) {
        return {
            alreadyExists: true,
            binding: matchingBindings[0],
            identity: baseIdentity,
        };
    }

    if (!sample && !createNew) {
        throw createUnsupportedTemplateError();
    }
    let fileIdentity: ConnectorTriggerEventIdentity | undefined;
    let fileInstance = 1;
    for (; createNew || fileInstance <= 100; fileInstance++) {
        const candidate = getConnectorTriggerEventIdentity(
            selection.connectorId,
            selection.operationId,
            fileInstance,
        );
        const nameConflict = createNew && (
            nonPollingRegistrations.some(name => equalsIgnoreCase(name, candidate.functionName)) ||
            bindings.some(binding => equalsIgnoreCase(binding.functionName, candidate.functionName)) ||
            reserved.some(item => equalsIgnoreCase(item.identity.functionName, candidate.functionName) ||
                item.identity.csharpFileName.toLowerCase() === candidate.csharpFileName.toLowerCase() ||
                item.identity.pythonFunctionName === candidate.pythonFunctionName));
        if (!nameConflict && await isSampleHandlerIdentityAvailable(
            projectPath,
            language,
            candidate,
            sample,
        )) {
            fileIdentity = candidate;
            break;
        }
    }
    if (!fileIdentity) {
        throw new Error(localize(
            'connectorTriggerIdentityUnavailable',
            'Unable to create a unique file for the selected Connector Trigger.',
        ));
    }

    const identity = createNew ? fileIdentity : baseIdentity;
    const settings = createNew ? await getLocalSettingsJsonWithDefaults(path.join(projectPath, localSettingsFileName), {}) : undefined;
    const settingNames = Object.keys(settings?.Values ?? {});
    let triggerConfigSettingName = identity.triggerConfigSettingName;
    for (let settingInstance = 2; [...bindings, ...reserved.map(item => item.binding)].some(binding =>
        equalsIgnoreCase(
            binding.triggerConfigSettingName,
            triggerConfigSettingName,
        )) || settingNames.some(name => equalsIgnoreCase(name, triggerConfigSettingName)); settingInstance++) {
        triggerConfigSettingName = getConnectorTriggerEventIdentity(
            selection.connectorId, selection.operationId, settingInstance,
        ).triggerConfigSettingName;
        if (!createNew && settingInstance > 100) {
            throw new Error(localize(
                'connectorTriggerSettingUnavailable',
                'Unable to create a unique trigger configuration setting for the selected Connector Trigger.',
            ));
        }
    }
    return {
        alreadyExists: false,
        binding: {
            connectionSettingName: sample?.binding.connectionSettingName ?? connectionSettingName,
            functionName: identity.functionName,
            triggerConfigSettingName,
        },
        identity: {
            ...fileIdentity,
            functionName: identity.functionName,
            triggerConfigSettingName,
        },
    };
}

export async function isSampleHandlerIdentityAvailable(
    projectPath: string,
    language: string,
    identity: ConnectorTriggerEventIdentity,
    sample?: ConnectorSampleSource,
): Promise<boolean> {
    const filePath = getGeneratedFilePath(projectPath, language, identity, sample);
    if (filePath) {
        if (await AzExtFsExtra.pathExists(filePath)) {
            return false;
        }
        if (language === ProjectLanguage.CSharp) {
            const files = await workspace.findFiles(new RelativePattern(projectPath, '**/*.cs'), '**/{.git,bin,obj}/**');
            for (const file of files) {
                const content = await AzExtFsExtra.readFile(file.fsPath);
                if (new RegExp(`\\bclass\\s+${escapeRegExp(identity.csharpClassName)}\\b`).test(content)) {
                    return false;
                }
            }
        }
        return true;
    }
    if (language === ProjectLanguage.Python) {
        const functionAppPath = sample ? getPythonTargetPath(projectPath, sample) : path.join(projectPath, 'function_app.py');
        if (!await AzExtFsExtra.pathExists(functionAppPath)) {
            return true;
        }
        const contents = (await AzExtFsExtra.readFile(functionAppPath)).toString();
        return !new RegExp(
            `\\bdef\\s+${escapeRegExp(identity.pythonFunctionName)}\\s*\\(`,
        ).test(contents);
    }
    return true;
}

function getGeneratedFilePath(
    projectPath: string,
    language: string,
    identity: ConnectorTriggerEventIdentity,
    sample?: ConnectorSampleSource,
): string | undefined {
    const directory = sample ? path.dirname(path.relative(sample.projectPath, sample.sourcePath)) :
        language === ProjectLanguage.TypeScript ? path.join('src', 'functions') : '.';
    if (language === ProjectLanguage.CSharp) {
        return path.join(projectPath, directory, identity.csharpFileName);
    }
    if (language === ProjectLanguage.TypeScript) {
        return path.join(
            projectPath,
            directory,
            identity.typescriptFileName,
        );
    }
    return undefined;
}

export async function retargetConnectorPollSample(
    sample: ConnectorPollSample,
    language: string,
    selection: ConnectorTriggerSelection,
): Promise<string> {
    const available = await getAvailableConnectorIdentity(sample.projectPath, language, selection, sample);
    if (!available.alreadyExists) {
        await AzExtFsExtra.writeFile(sample.sourcePath, retargetSampleSource(sample, available.identity));
    }
    return sample.sourcePath;
}

function retargetSampleSource(sample: ConnectorPollSample, identity: ConnectorTriggerEventIdentity): string {
    const name = new RegExp(`(["'])${escapeRegExp(sample.binding.functionName)}\\1`, 'g');
    const setting = `%${sample.binding.triggerConfigSettingName}%`;
    if (!name.test(sample.source) || !sample.source.includes(setting)) {
        throw createUnsupportedTemplateError();
    }
    return sample.source.replace(name, (_match, quote: string) => `${quote}${identity.functionName}${quote}`)
        .split(setting).join(`%${identity.triggerConfigSettingName}%`);
}

async function copySampleHandler(
    projectPath: string,
    language: string,
    identity: ConnectorTriggerEventIdentity,
    sample: ConnectorPollSample,
): Promise<string> {
    return await copyConnectorSampleHandler(projectPath, language, identity, sample, retargetSampleSource(sample, identity));
}

async function ensureCSharpProject(
    projectPath: string,
    available: AvailableConnectorIdentity,
): Promise<void> {
    const entries = await AzExtFsExtra.readDirectory(projectPath);
    const projectFile = entries.find(entry =>
        entry.type === FileType.File &&
        entry.name.toLowerCase().endsWith('.csproj'));
    // The template owns the extension version; only verify it references the extension.
    if (!projectFile || !/<PackageReference\s+Include="Microsoft\.Azure\.Functions\.Worker\.Extensions\.Connector"/i.test(
        (await AzExtFsExtra.readFile(path.join(projectPath, projectFile.name))).toString())) {
        throw createUnsupportedTemplateError();
    }
    if (available.alreadyExists) {
        return;
    }
    await AzExtFsExtra.writeFile(
        path.join(projectPath, available.identity.csharpFileName),
        getCSharpFunction(available.identity),
    );
}

async function ensureTypeScriptProject(
    projectPath: string,
    available: AvailableConnectorIdentity,
): Promise<void> {
    if (available.alreadyExists) {
        return;
    }
    const functionsPath = path.join(projectPath, 'src', 'functions');
    await AzExtFsExtra.ensureDir(functionsPath);
    await AzExtFsExtra.writeFile(
        path.join(functionsPath, available.identity.typescriptFileName),
        getTypeScriptFunction(available.identity),
    );
}

async function ensurePythonProject(
    projectPath: string,
    available: AvailableConnectorIdentity,
): Promise<void> {
    const functionAppPath = path.join(projectPath, 'function_app.py');
    const requirementsPath = path.join(projectPath, requirementsFileName);
    if (!await AzExtFsExtra.pathExists(functionAppPath) ||
        !await AzExtFsExtra.pathExists(requirementsPath)) {
        throw createUnsupportedTemplateError();
    }
    if (available.alreadyExists) {
        return;
    }
    let functionApp = (await AzExtFsExtra.readFile(functionAppPath)).toString();
    const lineEnding = functionApp.includes('\r\n') ? '\r\n' : '\n';
    const appName = getPythonFunctionAppName(functionApp);
    functionApp = ensurePythonImports(functionApp, lineEnding);
    functionApp = `${functionApp.trimEnd()}${lineEnding}${lineEnding}` +
        getPythonFunction(available.identity, lineEnding, appName);
    await AzExtFsExtra.writeFile(functionAppPath, functionApp);
}

function getCSharpFunction(identity: ConnectorTriggerEventIdentity): string {
    return `using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Extensions.Connector;
using Microsoft.Extensions.Logging;

public sealed class ${identity.csharpClassName}
{
    private readonly ILogger<${identity.csharpClassName}> logger;

    public ${identity.csharpClassName}(ILogger<${identity.csharpClassName}> logger)
    {
        this.logger = logger;
    }

    [Function("${identity.functionName}")]
    public void Run(
        [ConnectorTrigger(
            DeliveryMode = ConnectorTriggerDeliveryMode.Poll,
            Connection = "${connectionSettingName}",
            TriggerConfigName = "%${identity.triggerConfigSettingName}%")]
        ConnectorEvent<string> connectorEvent)
    {
        logger.LogInformation("Received a connector event ({Length} JSON characters).", connectorEvent.Data.Length);
    }
}
`;
}

function getTypeScriptFunction(identity: ConnectorTriggerEventIdentity): string {
    return `import { app, DeliveryMode } from '@azure/functions';

app.connectorTrigger('${identity.functionName}', {
    deliveryMode: DeliveryMode.Poll,
    connection: '${connectionSettingName}',
    triggerConfigName: '%${identity.triggerConfigSettingName}%',
    handler: async (_payload: unknown, invocationContext) => {
        invocationContext.log('${identity.functionName} received a connector event.');
    },
});
`;
}

function getPythonFunction(
    identity: ConnectorTriggerEventIdentity,
    lineEnding: string,
    appName: string,
): string {
    return `@${appName}.function_name(name="${identity.functionName}")${lineEnding}` +
        `@${appName}.connector_trigger(${lineEnding}` +
        `    arg_name="payload",${lineEnding}` +
        `    delivery_mode=func.DeliveryMode.POLL,${lineEnding}` +
        `    connection="${connectionSettingName}",${lineEnding}` +
        `    trigger_config_name="%${identity.triggerConfigSettingName}%",${lineEnding}` +
        `)${lineEnding}` +
        `def ${identity.pythonFunctionName}(payload: str) -> None:${lineEnding}` +
        `    logging.info("Received a connector event (%s JSON characters).", len(payload))${lineEnding}`;
}

function ensurePythonImports(contents: string, lineEnding: string): string {
    const anchorPattern = /^import azure\.functions as func$/m;
    if (!anchorPattern.test(contents)) {
        throw createUnsupportedTemplateError();
    }
    return /^import logging$/m.test(contents) ?
        contents :
        contents.replace(anchorPattern, match => `${match}${lineEnding}import logging`);
}

export async function copyConnectorSampleHandler(
    projectPath: string,
    language: string,
    identity: ConnectorTriggerEventIdentity,
    sample: ConnectorSampleSource,
    originalSource: string,
): Promise<string> {
    let source = originalSource;
    if (!isPathEqual(projectPath, sample.projectPath)) {
        if (language === ProjectLanguage.TypeScript) {
            await copyTypeScriptSampleDependencies(projectPath, sample);
        } else if (language === ProjectLanguage.CSharp) {
            await copyCSharpSampleDependencies(projectPath, sample);
        }
    }
    if (language === ProjectLanguage.Python) {
        const lines = source.split(/\r?\n/);
        const range = findPythonFunctionLines(lines, identity.functionName);
        if (!range) {
            throw createUnsupportedTemplateError();
        }
        let handler = lines.slice(range[0], range[1] + 1).join('\n');
        const name = /^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/m.exec(handler)?.[1];
        if (!name) {
            throw createUnsupportedTemplateError();
        }
        handler = handler.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, 'g'), identity.pythonFunctionName);
        const target = getPythonTargetPath(projectPath, sample);
        if (!await AzExtFsExtra.pathExists(target)) {
            throw createUnsupportedTemplateError();
        }
        let contents = await AzExtFsExtra.readFile(target);
        const eol = contents.includes('\r\n') ? '\r\n' : '\n';
        if (!isPathEqual(projectPath, sample.projectPath)) {
            contents = await addPythonSampleImports(projectPath, contents, sample);
        }
        await AzExtFsExtra.writeFile(target, `${contents.trimEnd()}${eol}${eol}${handler.replace(/\n/g, eol)}${eol}`);
        return target;
    }
    if (language === ProjectLanguage.CSharp) {
        const classes = [...source.matchAll(/^[ \t]*(?:(?:public|internal|sealed|abstract|partial|static)\s+)*class\s+([A-Za-z_]\w*)/gm)];
        if (classes.length !== 1) {
            throw createUnsupportedTemplateError();
        }
        source = source.replace(new RegExp(`\\b${escapeRegExp(classes[0][1])}\\b`, 'g'), identity.csharpClassName);
    }
    const target = getGeneratedFilePath(projectPath, language, identity, sample);
    if (!target) {
        throw createUnsupportedTemplateError();
    }
    await AzExtFsExtra.ensureDir(path.dirname(target));
    await fs.promises.writeFile(target, source, { flag: 'wx' });
    return target;
}

async function copyTypeScriptSampleDependencies(projectPath: string, sample: ConnectorSampleSource): Promise<void> {
    const sampleManifest = path.join(sample.projectPath, 'package.json');
    if (await AzExtFsExtra.pathExists(sampleManifest)) {
        const targetManifest = path.join(projectPath, 'package.json');
        if (!await AzExtFsExtra.pathExists(targetManifest)) {
            throw createSampleDependencyError();
        }
        const source = await AzExtFsExtra.readJSON<{ dependencies?: Record<string, string> }>(sampleManifest);
        const target = await AzExtFsExtra.readJSON<{ dependencies?: Record<string, string> }>(targetManifest);
        for (const [name, required] of Object.entries(source.dependencies ?? {})) {
            const available = target.dependencies?.[name];
            if (typeof required !== 'string' || typeof available !== 'string' ||
                (required !== available && (!semver.validRange(required) || semver.validRange(required) !== semver.validRange(available)))) {
                throw createSampleDependencyError();
            }
        }
    }

    const pending = [sample.sourcePath];
    const visited = new Set<string>();
    while (pending.length) {
        const file = pending.pop();
        if (!file || visited.has(file)) {
            continue;
        }
        visited.add(file);
        const source = getSourceViews(await fs.promises.readFile(file, 'utf8'), path.extname(file).toLowerCase());
        const references = [
            ...source.structure.matchAll(/\b(?:from\s*|import\s*\(\s*|import\s*|require\s*\(\s*)(["'])([^'"\r\n]+)\1/gd),
            ...source.structure.matchAll(/\bnew\s+URL\(\s*(["'])([^'"\r\n]+)\1\s*,\s*import\.meta\.url\s*\)/gd),
        ].flatMap(match => readGroup(source, match, 2) ?? []).filter(reference => reference.startsWith('.'));
        for (const reference of references) {
            const resolved = path.resolve(path.dirname(file), reference);
            const extension = path.extname(resolved).toLowerCase();
            const candidates = [
                resolved,
                ...(extension === '.js' ? [`${resolved.slice(0, -3)}.ts`] : []),
                ...(!extension ? [`${resolved}.ts`, `${resolved}.js`, `${resolved}.json`, path.join(resolved, 'index.ts'), path.join(resolved, 'index.js')] : []),
            ];
            let dependency: string | undefined;
            for (const candidate of candidates) {
                if (await isSafeSampleFile(sample.projectPath, candidate)) {
                    dependency = candidate;
                    break;
                }
            }
            if (!dependency) {
                throw createSampleDependencyError();
            }
            if (isPathEqual(dependency, sample.sourcePath)) {
                throw createSampleDependencyError();
            }
            await copySampleDependency(sample.projectPath, projectPath, dependency);
            if (/\.[cm]?[jt]sx?$/i.test(dependency)) {
                pending.push(dependency);
            }
        }
    }
}

async function copyCSharpSampleDependencies(projectPath: string, sample: ConnectorSampleSource): Promise<void> {
    const findProjects = async (root: string): Promise<string[]> => (await AzExtFsExtra.readDirectory(root))
        .filter(entry => entry.type === FileType.File && entry.name.toLowerCase().endsWith('.csproj'))
        .map(entry => path.join(root, entry.name));
    const sourceProjects = await findProjects(sample.projectPath);
    if (sourceProjects.length) {
        const targetProjects = await findProjects(projectPath);
        if (sourceProjects.length !== 1 || targetProjects.length !== 1) {
            throw createSampleDependencyError();
        }
        const readReferences = async (file: string): Promise<Map<string, string>> => {
            const content = await AzExtFsExtra.readFile(file);
            const references = new Map<string, string>();
            for (const match of content.matchAll(/<PackageReference\b([^>]*?)(?:\/>|>([\s\S]*?)<\/PackageReference\s*>)/gi)) {
                const name = /\bInclude\s*=\s*["']([^"']+)["']/i.exec(match[1])?.[1];
                const version = /\bVersion\s*=\s*["']([^"']+)["']/i.exec(match[1])?.[1] ??
                    /<Version\s*>([^<]+)<\/Version\s*>/i.exec(match[2] ?? '')?.[1];
                if (!name || !version) {
                    throw createSampleDependencyError();
                }
                references.set(name.toLowerCase(), version);
            }
            return references;
        };
        const sourceReferences = await readReferences(sourceProjects[0]);
        const targetReferences = await readReferences(targetProjects[0]);
        if ([...sourceReferences].some(([name, version]) => targetReferences.get(name) !== version)) {
            throw createSampleDependencyError();
        }
    }
    const files = await workspace.findFiles(new RelativePattern(sample.projectPath, '**/*.cs'), '**/{.git,bin,obj}/**');
    for (const file of files) {
        if (isPathEqual(file.fsPath, sample.sourcePath) || path.basename(file.fsPath).toLowerCase() === 'program.cs') {
            continue;
        }
        const content = await AzExtFsExtra.readFile(file.fsPath);
        if (getConnectorTriggerRegistrations(content, '.cs').length || getNonPollingFunctionRegistrations(content, '.cs').length) {
            throw createSampleDependencyError();
        }
        await copySampleDependency(sample.projectPath, projectPath, file.fsPath);
    }
}

async function isSafeSampleFile(root: string, file: string): Promise<boolean> {
    const relative = path.relative(root, file);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        return false;
    }
    const rootStat = await fs.promises.lstat(root);
    if (!rootStat.isDirectory()) {
        return false;
    }
    const segments = relative.split(path.sep);
    if (segments.some(segment => segment.toLowerCase() === '.git')) {
        return false;
    }
    for (let index = 0; index < segments.length; index++) {
        const current = path.join(root, ...segments.slice(0, index + 1));
        const stat = await tryLstat(current);
        if (!stat) {
            return false;
        }
        if (index === segments.length - 1 ? !stat.isFile() : !stat.isDirectory()) {
            return false;
        }
    }
    return true;
}

async function tryLstat(file: string): Promise<fs.Stats | undefined> {
    try {
        return await fs.promises.lstat(file);
    } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
            return undefined;
        }
        throw error;
    }
}

async function copySampleDependency(sourceRoot: string, targetRoot: string, file: string): Promise<void> {
    if (!await isSafeSampleFile(sourceRoot, file) || !(await fs.promises.lstat(targetRoot)).isDirectory()) {
        throw createSampleDependencyError();
    }
    const target = path.join(targetRoot, path.relative(sourceRoot, file));
    const relative = path.relative(targetRoot, target);
    const parts = relative.split(path.sep);
    for (let index = 0; index < parts.length; index++) {
        const stat = await tryLstat(path.join(targetRoot, ...parts.slice(0, index + 1)));
        if (!stat) {
            break;
        }
        if (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory()) {
            throw createSampleDependencyError();
        }
    }
    if (await tryLstat(target)) {
        if (!await isSafeSampleFile(targetRoot, target) ||
            !(await fs.promises.readFile(file)).equals(await fs.promises.readFile(target))) {
            throw createSampleDependencyError();
        }
    } else {
        await AzExtFsExtra.ensureDir(path.dirname(target));
        await AzExtFsExtra.copy(file, target, { overwrite: false });
    }
}

function getPythonTargetPath(projectPath: string, sample: ConnectorSampleSource): string {
    return path.join(projectPath, path.relative(sample.projectPath, sample.sourcePath));
}

function findPythonFunctionLines(lines: string[], name: string): [number, number] | undefined {
    const topLevel = getPythonTopLevelLines(lines);
    const isStatement = (index: number) => topLevel[index] && /^[^\s#]/.test(lines[index]);
    const isColumnZeroComment = (index: number) => topLevel[index] && lines[index].startsWith('#');
    const pattern = new RegExp(`^@(?:\\w+\\.)?function_name\\s*\\(\\s*name\\s*=\\s*["']${escapeRegExp(name)}["']\\s*\\)`);
    const matches = lines.map((line, index) => isStatement(index) && pattern.test(line) ? index : -1).filter(index => index >= 0);
    if (matches.length !== 1) {
        return undefined;
    }
    let start = matches[0];
    for (let index = start - 1; index >= 0; index--) {
        if (!topLevel[index]) {
            continue;
        }
        if (isStatement(index) && lines[index].startsWith('@')) {
            start = index;
        } else {
            break;
        }
    }
    let definition = -1;
    for (let index = matches[0] + 1; index < lines.length; index++) {
        if (isStatement(index) && !lines[index].startsWith('@')) {
            definition = /^(?:async\s+)?def\s/.test(lines[index]) ? index : -1;
            break;
        }
    }
    if (definition < 0) {
        return undefined;
    }
    let end = lines.length - 1;
    for (let index = definition + 1; index < lines.length; index++) {
        if (isStatement(index)) {
            end = index - 1;
            break;
        }
    }
    while (end > definition && (!lines[end].trim() || isColumnZeroComment(end))) {
        end--;
    }
    while (start > 0 && isColumnZeroComment(start - 1)) {
        start--;
    }
    return [start, end];
}

function getPythonTopLevelLines(lines: string[]): boolean[] {
    const topLevel: boolean[] = [];
    let depth = 0;
    let quote: string | undefined;
    for (const line of lines) {
        topLevel.push(depth === 0 && quote === undefined);
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (quote) {
                if (char === '\\') {
                    i++;
                } else if (line.startsWith(quote, i)) {
                    i += quote.length - 1;
                    quote = undefined;
                }
            } else if (char === '#') {
                break;
            } else if (char === '"' || char === "'") {
                quote = line.startsWith(char.repeat(3), i) ? char.repeat(3) : char;
                i += quote.length - 1;
            } else if ('([{'.includes(char)) {
                depth++;
            } else if (')]}'.includes(char)) {
                depth = Math.max(0, depth - 1);
            }
        }
        if (quote && quote.length === 1) {
            quote = undefined;
        }
    }
    return topLevel;
}

async function addPythonSampleImports(projectPath: string, contents: string, sample: ConnectorSampleSource): Promise<string> {
    const lines = sample.source.split(/\r?\n/);
    const range = findPythonFunctionLines(lines, sample.functionName);
    const owner = new RegExp(`^@(\\w+)\\.function_name\\s*\\(\\s*name\\s*=\\s*["']${escapeRegExp(sample.functionName)}["']`, 'm')
        .exec(sample.source)?.[1];
    if (!range || !owner) {
        throw createUnsupportedTemplateError();
    }
    const app = new RegExp(`^${escapeRegExp(owner)}\\s*=\\s*\\w+\\.FunctionApp\\s*\\(`, 'm');
    if (!app.test(contents)) {
        throw createUnsupportedTemplateError();
    }
    const outside = [...lines.slice(0, range[0]), ...lines.slice(range[1] + 1)]
        .join('\n').replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, '');
    const imports: string[] = [];
    for (const line of outside.split('\n')) {
        const text = line.trim();
        if (!text || text.startsWith('#') || app.test(text)) {
            continue;
        }
        if (!/^(?:import\s+[\w., ]+(?:\s+as\s+\w+)?|from\s+[\w.]+\s+import\s+[\w., ]+(?:\s+as\s+\w+)?)$/.test(text) ||
            /^from\s+\./.test(text)) {
            throw createUnsupportedTemplateError();
        }
        imports.push(text);
    }
    const sampleRequirements = path.join(sample.projectPath, 'requirements.txt');
    const targetRequirements = path.join(projectPath, 'requirements.txt');
    if (!await AzExtFsExtra.pathExists(sampleRequirements) || !await AzExtFsExtra.pathExists(targetRequirements)) {
        throw createUnsupportedTemplateError();
    }
    const required = (await AzExtFsExtra.readFile(sampleRequirements)).split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
    const target = new Set((await AzExtFsExtra.readFile(targetRequirements)).split(/\r?\n/).map(line => line.trim()));
    if (required.some(line => !target.has(line))) {
        throw createSampleDependencyError();
    }
    await copyPythonSampleModules(projectPath, sample);
    const missing = imports.filter(line => !contents.split(/\r?\n/).some(existing => existing.trim() === line));
    if (missing.some(line => line.startsWith('from __future__ import '))) {
        throw createUnsupportedTemplateError();
    }
    if (missing.length) {
        const eol = contents.includes('\r\n') ? '\r\n' : '\n';
        contents = contents.replace(app, match => `${missing.join(eol)}${eol}${eol}${match}`);
    }
    return contents;
}

async function copyPythonSampleModules(projectPath: string, sample: ConnectorSampleSource): Promise<void> {
    const pending = [sample.sourcePath];
    const visited = new Set<string>();
    const copyDirectory = async (directory: string): Promise<void> => {
        for (const entry of await AzExtFsExtra.readDirectory(directory)) {
            if (entry.name === '__pycache__') {
                continue;
            }
            const file = path.join(directory, entry.name);
            if (entry.type === FileType.Directory) {
                await copyDirectory(file);
            } else if (entry.type === FileType.File) {
                await copySampleDependency(sample.projectPath, projectPath, file);
                if (file.endsWith('.py')) {
                    pending.push(file);
                }
            } else {
                throw createSampleDependencyError();
            }
        }
    };
    while (pending.length) {
        const file = pending.pop();
        if (!file || visited.has(file)) {
            continue;
        }
        visited.add(file);
        const content = await fs.promises.readFile(file, 'utf8');
        for (const match of content.matchAll(/^\s*(?:from\s+([\w.]+)\s+import\s+|import\s+([^\r\n#]+))/gm)) {
            const modules = match[1] ? [match[1]] : match[2].split(',').map(part => part.trim().split(/\s+/)[0]);
            for (const module of modules) {
                if (!/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(module)) {
                    continue;
                }
                const topLevel = module.split('.')[0];
                const filePath = path.join(sample.projectPath, `${topLevel}.py`);
                const directoryPath = path.join(sample.projectPath, topLevel);
                if (await isSafeSampleFile(sample.projectPath, filePath)) {
                    await copySampleDependency(sample.projectPath, projectPath, filePath);
                    pending.push(filePath);
                } else {
                    const directory = await tryLstat(directoryPath);
                    if (directory?.isDirectory()) {
                        await copyDirectory(directoryPath);
                    } else if (directory?.isSymbolicLink()) {
                        throw createSampleDependencyError();
                    }
                }
            }
        }
    }
}

function createSampleDependencyError(): Error {
    return new Error(localize('connectorPollSampleDependenciesMissing',
        'The selected sample is missing compatible files or dependencies required by the generic sample for the additional event.'));
}

function equalsIgnoreCase(
    left: string | undefined,
    right: string,
): boolean {
    return !!left &&
        left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}

function createUnsupportedTemplateError(): Error {
    return new Error(localize(
        'connectorTriggerSampleTemplateUnsupported',
        'The selected project template cannot be materialized using the generic Connector Trigger sample.',
    ));
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
