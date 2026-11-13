/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, UserCancelledError } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { FileType, type CancellationToken } from 'vscode';
import { localSettingsFileName, localStorageEmulatorConnectionString, ProjectLanguage, requirementsFileName, workerRuntimeKey } from '../constants';
import { ensureLocalSettingsIgnored, getLocalSettingsJsonWithDefaults } from '../funcConfig/local.settings';
import { localize } from '../localize';
import {
    findNonPollingFunctionRegistrations,
    findPollingConnectorBindings,
    type ConnectorTriggerBindingCandidate,
} from './connectorTriggerBindings';
import {
    getConnectorTriggerEventIdentity,
    type ConnectorTriggerEventIdentity,
} from './connectorTriggerEventIdentity';
import { getConnectorTriggerSelections, isConnectorTriggerSelections, type ConnectorTriggerSelection, type ConnectorTriggerSelections } from './connectorTriggerSelection';
import { type ConnectorTriggerOutputMetadata } from './connectorTriggerOutputSchema';

const connectionSettingName = 'ConnectorNamespace';

interface AvailableConnectorIdentity {
    alreadyExists: boolean;
    binding: ConnectorTriggerBindingCandidate;
    identity: ConnectorTriggerEventIdentity;
}

export async function ensureConnectorTriggerPollProjects(
    projectPath: string,
    language: string,
    selection: ConnectorTriggerSelections,
    outputMetadata: ReadonlyMap<string, ConnectorTriggerOutputMetadata> = new Map(),
    cancellationToken?: CancellationToken,
): Promise<void> {
    const selections = validateConnectorTriggerSelections(selection);
    // Validate the entire batch before changing dependencies or writing a handler.
    for (const event of selections) {
        await getAvailableConnectorIdentity(projectPath, language, event);
    }
    for (const event of selections) {
        if (cancellationToken?.isCancellationRequested) {
            throw new UserCancelledError('connectorProjectCreation');
        }
        await ensureConnectorTriggerPollProject(projectPath, language, event, outputMetadata.get(event.operationId));
    }
}

export function validateConnectorTriggerSelections(selection: ConnectorTriggerSelections): ConnectorTriggerSelection[] {
    if (!isConnectorTriggerSelections(selection)) {
        throw new Error(localize('connectorTriggerSelectionInvalid', 'Select one or more distinct events for one connector.'));
    }
    const selections = getConnectorTriggerSelections(selection);
    const functionNames = selections.map(event =>
        getConnectorTriggerEventIdentity(event.connectorId, event.operationId).functionName.toLowerCase());
    if (new Set(functionNames).size !== functionNames.length) {
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
): Promise<void> {
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
    const available = await getAvailableConnectorIdentity(
        projectPath,
        language,
        selection,
    );
    const localSettingsPath = path.join(projectPath, localSettingsFileName);
    const settings = await getLocalSettingsJsonWithDefaults(localSettingsPath, {
        [workerRuntimeKey]: workerRuntime,
        [`${available.binding.connectionSettingName}__pollingEndpoint`]: 'https://<connector-namespace-host>',
        [available.binding.triggerConfigSettingName]: '<trigger-configuration-name>',
    });
    if (!Object.keys(settings.Values ?? {}).some(key =>
        key.toLowerCase() === 'azurewebjobsstorage' ||
        key.toLowerCase().startsWith('azurewebjobsstorage__'))) {
        settings.Values = {
            ...settings.Values,
            AzureWebJobsStorage: localStorageEmulatorConnectionString,
        };
    }
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
    await ensureLocalSettingsIgnored(projectPath, language);
    await AzExtFsExtra.writeJSON(localSettingsPath, settings);
}

async function getAvailableConnectorIdentity(
    projectPath: string,
    language: string,
    selection: ConnectorTriggerSelection,
): Promise<AvailableConnectorIdentity> {
    const nonPollingRegistrations = await findNonPollingFunctionRegistrations(projectPath);
    const bindings = await findPollingConnectorBindings(projectPath);
    const baseIdentity = getConnectorTriggerEventIdentity(
        selection.connectorId,
        selection.operationId,
    );
    const matchingBindings = bindings.filter(binding =>
        equalsIgnoreCase(binding.functionName, baseIdentity.functionName));
    if (matchingBindings.length > 1) {
        throw new Error(localize(
            'connectorTriggerBindingAmbiguous',
            'The selected event already matches multiple Poll bindings.',
        ));
    }
    // An existing Poll binding must not hide another registration with the same name.
    if (nonPollingRegistrations.some(registration =>
        equalsIgnoreCase(registration, baseIdentity.functionName))) {
        throw new Error(localize(
            'connectorTriggerFunctionNameCollision',
            'A function with the selected event name is already registered. Rename the existing function or select another event before adding a Connector Trigger.',
        ));
    }
    if (matchingBindings.length === 1) {
        return {
            alreadyExists: true,
            binding: matchingBindings[0],
            identity: baseIdentity,
        };
    }

    let fileIdentity: ConnectorTriggerEventIdentity | undefined;
    let fileInstance = 1;
    for (; fileInstance <= 100; fileInstance++) {
        const candidate = getConnectorTriggerEventIdentity(
            selection.connectorId,
            selection.operationId,
            fileInstance,
        );
        if (await isGeneratedIdentityAvailable(
            projectPath,
            language,
            candidate,
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

    let triggerConfigSettingName = baseIdentity.triggerConfigSettingName;
    for (let settingInstance = 2; bindings.some(binding =>
        equalsIgnoreCase(
            binding.triggerConfigSettingName,
            triggerConfigSettingName,
        )); settingInstance++) {
        triggerConfigSettingName = getConnectorTriggerEventIdentity(
            selection.connectorId, selection.operationId, settingInstance,
        ).triggerConfigSettingName;
        if (settingInstance > 100) {
            throw new Error(localize(
                'connectorTriggerSettingUnavailable',
                'Unable to create a unique trigger configuration setting for the selected Connector Trigger.',
            ));
        }
    }
    return {
        alreadyExists: false,
        binding: {
            connectionSettingName,
            functionName: baseIdentity.functionName,
            triggerConfigSettingName,
        },
        identity: {
            ...fileIdentity,
            functionName: baseIdentity.functionName,
            triggerConfigSettingName,
        },
    };
}

async function isGeneratedIdentityAvailable(
    projectPath: string,
    language: string,
    identity: ConnectorTriggerEventIdentity,
): Promise<boolean> {
    const filePath = getGeneratedFilePath(projectPath, language, identity);
    if (filePath) {
        return !await AzExtFsExtra.pathExists(filePath);
    }
    if (language === ProjectLanguage.Python) {
        const functionAppPath = path.join(projectPath, 'function_app.py');
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
): string | undefined {
    if (language === ProjectLanguage.CSharp) {
        return path.join(projectPath, identity.csharpFileName);
    }
    if (language === ProjectLanguage.TypeScript) {
        return path.join(
            projectPath,
            'src',
            'functions',
            identity.typescriptFileName,
        );
    }
    return undefined;
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
    functionApp = ensurePythonImports(functionApp, lineEnding);
    functionApp = `${functionApp.trimEnd()}${lineEnding}${lineEnding}` +
        getPythonFunction(available.identity, lineEnding);
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
): string {
    return `@app.function_name(name="${identity.functionName}")${lineEnding}` +
        `@app.connector_trigger(${lineEnding}` +
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

function equalsIgnoreCase(
    left: string | undefined,
    right: string,
): boolean {
    return !!left &&
        left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}

function createUnsupportedTemplateError(): Error {
    return new Error(localize(
        'connectorTriggerPollTemplateUnsupported',
        'The selected project template cannot be materialized for the Connector Trigger Poll event.',
    ));
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
