/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, UserCancelledError } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { FileType, type CancellationToken } from 'vscode';
import { localSettingsFileName, localStorageEmulatorConnectionString, packageJsonFileName, ProjectLanguage, requirementsFileName, workerRuntimeKey } from '../constants';
import { ensureLocalSettingsIgnored, getLocalSettingsJsonWithDefaults } from '../funcConfig/local.settings';
import { localize } from '../localize';
import { isPathEqual } from '../utils/fs';
import { findConnectorSampleFunctionPaths, validateConnectorSampleFiles } from './connectorSampleProject';
import {
    findConnectorTriggerRegistrations,
    findNonPollingFunctionRegistrations,
    findPollingConnectorBindings,
    getConnectorTriggerRegistrations,
    getNonPollingFunctionRegistrations,
    getPollingConnectorBindings,
    getSourceViews,
    readGroup,
} from './connectorTriggerBindings';
import { getConnectorTriggerEventIdentity, type ConnectorTriggerEventIdentity } from './connectorTriggerEventIdentity';
import { type ConnectorTriggerSelection, type ConnectorTriggerSelections } from './connectorTriggerSelection';
import {
    copyConnectorSampleHandler,
    isSampleHandlerIdentityAvailable,
    validateConnectorTriggerSelections,
    type ConnectorAdditionCheckpoint,
    type ConnectorSampleSource,
} from './ensureConnectorTriggerPollProject';
import { getPythonFunctionAppName } from './pythonFunctionApp';

const connectionSettingName = 'ConnectorNamespace';

export async function readConnectorWebhookSample(projectPath: string, language: string): Promise<ConnectorSampleSource> {
    await validateConnectorSampleFiles(projectPath);
    const extension = language === ProjectLanguage.CSharp ? '.cs' :
        language === ProjectLanguage.TypeScript ? '.ts' :
            language === ProjectLanguage.Python ? '.py' : undefined;
    const registrations = await findConnectorTriggerRegistrations(projectPath);
    const paths = await findConnectorSampleFunctionPaths(projectPath, registrations);
    for (const functionName of registrations) {
        const sourcePath = paths.get(functionName);
        if (!sourcePath || path.extname(sourcePath).toLowerCase() !== extension) {
            continue;
        }
        const source = await AzExtFsExtra.readFile(sourcePath);
        const sourceRegistrations = getConnectorTriggerRegistrations(source, extension);
        if (sourceRegistrations.filter(name => equalsIgnoreCase(name, functionName)).length !== 1 ||
            getPollingConnectorBindings(source, extension).length ||
            (language === ProjectLanguage.TypeScript && sourceRegistrations.length !== 1)) {
            continue;
        }
        return { projectPath, sourcePath, source, functionName };
    }
    throw unsupportedSample();
}

export async function ensureConnectorTriggerWebhookProjects(
    projectPath: string,
    language: string,
    selection: ConnectorTriggerSelections,
    sample: ConnectorSampleSource,
    cancellationToken?: CancellationToken,
): Promise<string[]> {
    const selections = validateConnectorTriggerSelections(selection);
    for (const event of selections) {
        await getAvailableIdentity(projectPath, language, event, sample);
    }
    const handlerPaths: string[] = [];
    for (const event of selections) {
        if (cancellationToken?.isCancellationRequested) {
            throw new UserCancelledError('connectorProjectCreation');
        }
        const { identity, alreadyExists } = await getAvailableIdentity(projectPath, language, event, sample);
        handlerPaths.push(alreadyExists ? sample.sourcePath :
            await copyConnectorSampleHandler(projectPath, language, identity, sample, retargetSampleSource(sample, language, identity)));
    }
    return handlerPaths;
}

/**
 * Adds webhook functions for the selected events to an existing project. Names that are already
 * registered, or repeated within the batch, receive a numeric suffix instead of failing.
 */
export async function addConnectorTriggerWebhookProjects(
    projectPath: string,
    language: string,
    selection: ConnectorTriggerSelections,
    cancellationToken?: CancellationToken,
    checkpoint?: ConnectorAdditionCheckpoint,
): Promise<{ event: ConnectorTriggerSelection; functionName: string; handlerPath: string | undefined }[]> {
    const selections = validateConnectorTriggerSelections(selection, true);
    const identities: ConnectorTriggerEventIdentity[] = [];
    for (const event of selections) {
        identities.push((await getAvailableIdentity(projectPath, language, event, undefined, identities)).identity);
    }
    const written = await writeFunctions(projectPath, language, identities, cancellationToken,
        checkpoint && selections.length === 1 ?
            (item, finish) => checkpoint({ event: selections[0], ...item }, finish) : undefined);
    return written.map(({ functionName, handlerPath }, index) => ({ event: selections[index], functionName, handlerPath }));
}

async function writeFunctions(
    projectPath: string, language: string, identities: ConnectorTriggerEventIdentity[], cancellationToken: CancellationToken | undefined,
    checkpoint?: (item: { functionName: string; handlerPath: string | undefined }, finish: () => Promise<void>) => void,
): Promise<{ functionName: string; handlerPath: string | undefined }[]> {
    const workerRuntime = getWorkerRuntime(language);
    await verifyTemplate(projectPath, language);
    await getLocalSettingsJsonWithDefaults(path.join(projectPath, localSettingsFileName), { [workerRuntimeKey]: workerRuntime });
    const written: { functionName: string; handlerPath: string | undefined }[] = [];
    const finish = async (): Promise<void> => {
        const localSettingsPath = path.join(projectPath, localSettingsFileName);
        const settings = await getLocalSettingsJsonWithDefaults(localSettingsPath, { [workerRuntimeKey]: workerRuntime });
        if (!Object.keys(settings.Values ?? {}).some(key =>
            key.toLowerCase() === 'azurewebjobsstorage' || key.toLowerCase().startsWith('azurewebjobsstorage__'))) {
            settings.Values = { ...settings.Values, AzureWebJobsStorage: localStorageEmulatorConnectionString };
        }
        await ensureLocalSettingsIgnored(projectPath, language);
        await AzExtFsExtra.writeJSON(localSettingsPath, settings);
    };
    for (const identity of identities) {
        if (cancellationToken?.isCancellationRequested) {
            throw new UserCancelledError('connectorProjectCreation');
        }
        const item = { functionName: identity.functionName, handlerPath: await writeFunction(projectPath, language, identity) };
        written.push(item);
        checkpoint?.(item, finish);
    }
    await finish();
    return written;
}

function getWorkerRuntime(language: string): string {
    switch (language) {
        case ProjectLanguage.CSharp:
            return 'dotnet-isolated';
        case ProjectLanguage.TypeScript:
            return 'node';
        case ProjectLanguage.Python:
            return 'python';
        default:
            throw new Error(localize('connectorTriggerWebhookLanguageUnsupported',
                'Connector Trigger webhook projects are not supported for language "{0}".', language));
    }
}

/**
 * When `reserved` is provided, the selection is being added to an existing project: a conflicting name
 * is suffixed with the next free instance number instead of failing.
 */
async function getAvailableIdentity(
    projectPath: string, language: string, selection: ConnectorTriggerSelection,
    sample?: ConnectorSampleSource, reserved?: readonly ConnectorTriggerEventIdentity[],
): Promise<{ identity: ConnectorTriggerEventIdentity; alreadyExists: boolean }> {
    const baseIdentity = getConnectorTriggerEventIdentity(selection.connectorId, selection.operationId);
    const registrations = [
        ...await findNonPollingFunctionRegistrations(projectPath),
        ...(await findPollingConnectorBindings(projectPath)).flatMap(binding => binding.functionName ? [binding.functionName] : []),
    ];
    if (reserved) {
        for (let instance = 1; ; instance++) {
            const candidate = getConnectorTriggerEventIdentity(selection.connectorId, selection.operationId, instance);
            const conflict = registrations.some(name => equalsIgnoreCase(name, candidate.functionName)) ||
                reserved.some(item => equalsIgnoreCase(item.functionName, candidate.functionName) ||
                    equalsIgnoreCase(item.csharpFileName, candidate.csharpFileName) ||
                    equalsIgnoreCase(item.typescriptFileName, candidate.typescriptFileName) ||
                    item.pythonFunctionName === candidate.pythonFunctionName);
            if (!conflict && await isIdentityAvailable(projectPath, language, candidate)) {
                return { identity: candidate, alreadyExists: false };
            }
        }
    }
    if (!sample) {
        throw unsupportedSample();
    }
    if (registrations.some(name => equalsIgnoreCase(name, baseIdentity.functionName))) {
        if (isPathEqual(projectPath, sample.projectPath) && equalsIgnoreCase(sample.functionName, baseIdentity.functionName) &&
            registrations.filter(name => equalsIgnoreCase(name, baseIdentity.functionName)).length === 1) {
            return { identity: baseIdentity, alreadyExists: true };
        }
        throw new Error(localize(
            'connectorTriggerFunctionNameCollision',
            'A function with the selected event name is already registered. Rename the existing function or select another event before adding a Connector Trigger.',
        ));
    }
    for (let instance = 1; instance <= 100; instance++) {
        const candidate = getConnectorTriggerEventIdentity(selection.connectorId, selection.operationId, instance);
        if (await isSampleHandlerIdentityAvailable(projectPath, language, candidate, sample)) {
            return { identity: { ...candidate, functionName: baseIdentity.functionName }, alreadyExists: false };
        }
    }
    throw new Error(localize('connectorTriggerIdentityUnavailable', 'Unable to create a unique file for the selected Connector Trigger.'));
}

function retargetSampleSource(sample: ConnectorSampleSource, language: string, identity: ConnectorTriggerEventIdentity): string {
    let source = sample.source;
    if (language === ProjectLanguage.CSharp) {
        const view = getSourceViews(source, '.cs');
        const attributes = [...view.structure.matchAll(/\[\s*Function\s*\(\s*(["'])([^"']+)\1\s*\)\s*\]/gid)];
        if (attributes.filter(match => equalsIgnoreCase(readGroup(view, match, 2), sample.functionName)).length !== 1) {
            throw unsupportedSample();
        }
        for (const attribute of attributes.reverse()) {
            if (!equalsIgnoreCase(readGroup(view, attribute, 2), sample.functionName)) {
                source = source.slice(0, attribute.index) + source.slice(attribute.index + attribute[0].length);
            }
        }
    }
    const name = new RegExp(`(["'])${escapeRegExp(sample.functionName)}\\1`, 'g');
    if (!name.test(source)) {
        throw unsupportedSample();
    }
    source = source.replace(name, (_match, quote: string) => `${quote}${identity.functionName}${quote}`);
    const extension = path.extname(sample.sourcePath).toLowerCase();
    if (getConnectorTriggerRegistrations(source, extension).filter(name => equalsIgnoreCase(name, identity.functionName)).length !== 1 ||
        (language !== ProjectLanguage.Python && getNonPollingFunctionRegistrations(source, extension).length !== 1)) {
        throw unsupportedSample();
    }
    return source;
}

async function isIdentityAvailable(projectPath: string, language: string, identity: ConnectorTriggerEventIdentity): Promise<boolean> {
    const filePath = getGeneratedFilePath(projectPath, language, identity);
    if (filePath) {
        return !await AzExtFsExtra.pathExists(filePath);
    }
    const functionAppPath = path.join(projectPath, 'function_app.py');
    return !await AzExtFsExtra.pathExists(functionAppPath) ||
        !new RegExp(`\\bdef\\s+${escapeRegExp(identity.pythonFunctionName)}\\s*\\(`).test(await AzExtFsExtra.readFile(functionAppPath));
}

function getGeneratedFilePath(projectPath: string, language: string, identity: ConnectorTriggerEventIdentity): string | undefined {
    return language === ProjectLanguage.CSharp ? path.join(projectPath, identity.csharpFileName) :
        language === ProjectLanguage.TypeScript ? path.join(projectPath, 'src', 'functions', identity.typescriptFileName) : undefined;
}

// The template owns the connector extension versions; only verify it references them.
async function verifyTemplate(projectPath: string, language: string): Promise<void> {
    let supported: boolean;
    if (language === ProjectLanguage.CSharp) {
        const projectFile = (await AzExtFsExtra.readDirectory(projectPath)).find(entry =>
            entry.type === FileType.File && entry.name.toLowerCase().endsWith('.csproj'));
        supported = !!projectFile && /<PackageReference\s+Include="Microsoft\.Azure\.Functions\.Worker\.Extensions\.Connector"/i.test(
            await AzExtFsExtra.readFile(path.join(projectPath, projectFile.name)));
    } else if (language === ProjectLanguage.TypeScript) {
        const packagePath = path.join(projectPath, packageJsonFileName);
        const packageJson = await AzExtFsExtra.pathExists(packagePath) ?
            await AzExtFsExtra.readJSON<{ dependencies?: Record<string, unknown> }>(packagePath) : undefined;
        supported = !!packageJson?.dependencies?.['@azure/functions'];
    } else {
        supported = await AzExtFsExtra.pathExists(path.join(projectPath, 'function_app.py')) &&
            await AzExtFsExtra.pathExists(path.join(projectPath, requirementsFileName)) &&
            /^import azure\.functions as func$/m.test(await AzExtFsExtra.readFile(path.join(projectPath, 'function_app.py')));
    }
    if (!supported) {
        throw new Error(localize('connectorTriggerWebhookTemplateUnsupported',
            'The selected project template cannot be materialized for the Connector Trigger webhook event.'));
    }
}

async function writeFunction(projectPath: string, language: string, identity: ConnectorTriggerEventIdentity): Promise<string> {
    if (language === ProjectLanguage.Python) {
        const functionAppPath = path.join(projectPath, 'function_app.py');
        let functionApp = await AzExtFsExtra.readFile(functionAppPath);
        const lineEnding = functionApp.includes('\r\n') ? '\r\n' : '\n';
        const appName = getPythonFunctionAppName(functionApp);
        if (!/^import logging$/m.test(functionApp)) {
            functionApp = functionApp.replace(/^import azure\.functions as func$/m, match => `${match}${lineEnding}import logging`);
        }
        functionApp = `${functionApp.trimEnd()}${lineEnding}${lineEnding}${getPythonFunction(identity, lineEnding, appName)}`;
        await AzExtFsExtra.writeFile(functionAppPath, functionApp);
        return functionAppPath;
    }
    const filePath = getGeneratedFilePath(projectPath, language, identity) as string;
    await AzExtFsExtra.ensureDir(path.dirname(filePath));
    await AzExtFsExtra.writeFile(filePath, language === ProjectLanguage.CSharp ? getCSharpFunction(identity) : getTypeScriptFunction(identity));
    return filePath;
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
    public void Run([ConnectorTrigger] string payload)
    {
        logger.LogInformation("Received a connector event ({Length} JSON characters).", payload.Length);
    }
}
`;
}

function unsupportedSample(): Error {
    return new Error(localize('connectorTriggerWebhookTemplateUnsupported',
        'The selected project template cannot be materialized using the generic Connector Trigger webhook sample.'));
}

function getTypeScriptFunction(identity: ConnectorTriggerEventIdentity): string {
    return `import { app } from '@azure/functions';

app.connectorTrigger('${identity.functionName}', {
    handler: async (_context, invocationContext) => {
        invocationContext.log('${identity.functionName} received a connector event.');
    },
});
`;
}

function getPythonFunction(identity: ConnectorTriggerEventIdentity, lineEnding: string, appName: string): string {
    return `@${appName}.function_name(name="${identity.functionName}")${lineEnding}` +
        `@${appName}.connector_trigger(arg_name="payload", connection="${connectionSettingName}")${lineEnding}` +
        `def ${identity.pythonFunctionName}(payload: str) -> None:${lineEnding}` +
        `    logging.info("Received a connector event (%s JSON characters).", len(payload))${lineEnding}`;
}

function equalsIgnoreCase(left: string | undefined, right: string): boolean {
    return !!left && left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
