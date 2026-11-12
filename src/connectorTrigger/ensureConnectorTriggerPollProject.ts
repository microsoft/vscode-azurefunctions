/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, UserCancelledError } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { FileType, type CancellationToken } from 'vscode';
import * as semver from 'semver';
import { localSettingsFileName, localStorageEmulatorConnectionString, packageJsonFileName, ProjectLanguage, requirementsFileName, workerRuntimeKey } from '../constants';
import { ensureLocalSettingsIgnored, getLocalSettingsJsonWithDefaults } from '../funcConfig/local.settings';
import { localize } from '../localize';
import {
    scanConnectorTriggerProject,
    type ConnectorTriggerBindingCandidate,
    type ConnectorTriggerProjectScan,
} from './connectorTriggerBindings';
import {
    getConnectorTriggerEventIdentity,
    type ConnectorTriggerEventIdentity,
} from './connectorTriggerEventIdentity';
import { getConnectorTriggerSelections, isConnectorTriggerSelections, type ConnectorTriggerSelection, type ConnectorTriggerSelections } from './connectorTriggerSelection';
import { connectorSdkVersions, getConnectorTriggerSdkBinding, type ConnectorTriggerSdkBinding } from './connectorTriggerSdkBindings';
import { equalsIgnoreCase } from './connectorTriggerUtils';

const connectionSettingName = 'ConnectorNamespace';

interface AvailableConnectorIdentity {
    alreadyExists: boolean;
    binding: ConnectorTriggerBindingCandidate;
    identity: ConnectorTriggerEventIdentity;
}

/** @param selections Events already checked by {@link validateConnectorTriggerSelections}. */
export async function ensureConnectorTriggerPollProjects(
    projectPath: string,
    language: string,
    selections: readonly ConnectorTriggerSelection[],
    cancellationToken?: CancellationToken,
): Promise<void> {
    // Validate the entire batch before changing dependencies or writing a handler.
    const scan = await scanConnectorTriggerProject(projectPath);
    for (const event of selections) {
        await getAvailableConnectorIdentity(projectPath, language, event, scan);
    }
    for (const event of selections) {
        if (cancellationToken?.isCancellationRequested) {
            throw new UserCancelledError('connectorProjectCreation');
        }
        await ensureConnectorTriggerPollProject(projectPath, language, event);
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
        await scanConnectorTriggerProject(projectPath),
    );
    const sdkBinding = getConnectorTriggerSdkBinding(selection.connectorId, selection.operationId);
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
            await ensureCSharpProject(projectPath, available, sdkBinding.csharp);
            break;
        case ProjectLanguage.TypeScript:
            await ensureTypeScriptProject(projectPath, available, sdkBinding.typescript);
            break;
        case ProjectLanguage.Python:
            await ensurePythonProject(projectPath, available, sdkBinding.python);
            break;
    }
    await ensureLocalSettingsIgnored(projectPath);
    await AzExtFsExtra.writeJSON(localSettingsPath, settings);
}

async function getAvailableConnectorIdentity(
    projectPath: string,
    language: string,
    selection: ConnectorTriggerSelection,
    { nonPollingRegistrations, bindings }: ConnectorTriggerProjectScan,
): Promise<AvailableConnectorIdentity> {
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
    binding: ConnectorTriggerSdkBinding['csharp'],
): Promise<void> {
    await updateCSharpConnectorExtension(projectPath, !!binding);
    if (available.alreadyExists) {
        return;
    }
    await AzExtFsExtra.writeFile(
        path.join(projectPath, available.identity.csharpFileName),
        getCSharpFunction(available.identity, binding),
    );
}

export async function updateCSharpConnectorExtension(
    projectPath: string,
    usesSdkPayload = false,
): Promise<void> {
    const entries = await AzExtFsExtra.readDirectory(projectPath);
    const projectFile = entries.find(entry =>
        entry.type === FileType.File &&
        entry.name.toLowerCase().endsWith('.csproj'));
    if (!projectFile) {
        throw createUnsupportedTemplateError();
    }

    const projectFilePath = path.join(projectPath, projectFile.name);
    const projectContents = (await AzExtFsExtra.readFile(projectFilePath)).toString();
    const packagePattern =
        /(<PackageReference\s+Include="Microsoft\.Azure\.Functions\.Worker\.Extensions\.Connector"\s+Version=")[^"]+("\s*\/>)/i;
    if (!packagePattern.test(projectContents)) {
        throw createUnsupportedTemplateError();
    }

    let updated = projectContents.replace(
        packagePattern,
        (_match, prefix: string, suffix: string) => `${prefix}1.0.0${suffix}`,
    );
    if (usesSdkPayload) {
        const sdkPattern = /(<PackageReference\s+Include="Azure\.Connectors\.Sdk"\s+Version=")([^"]+)("\s*\/>)/i;
        const minimumVersion = connectorSdkVersions.csharp;
        updated = sdkPattern.test(updated) ? updated.replace(
            sdkPattern,
            (_match, prefix: string, version: string, suffix: string) =>
                `${prefix}${semver.valid(version) && semver.gte(version, minimumVersion) ? version : minimumVersion}${suffix}`,
        ) : updated.replace('</ItemGroup>', `  <PackageReference Include="Azure.Connectors.Sdk" Version="${minimumVersion}" />\n  </ItemGroup>`);
    }
    await AzExtFsExtra.writeFile(projectFilePath, updated);
}

async function ensureTypeScriptProject(
    projectPath: string,
    available: AvailableConnectorIdentity,
    binding: ConnectorTriggerSdkBinding['typescript'],
): Promise<void> {
    await updateTypeScriptConnectorSdk(projectPath);
    if (available.alreadyExists) {
        return;
    }
    const functionsPath = path.join(projectPath, 'src', 'functions');
    await AzExtFsExtra.ensureDir(functionsPath);
    await AzExtFsExtra.writeFile(
        path.join(functionsPath, available.identity.typescriptFileName),
        getTypeScriptFunction(available.identity, binding),
    );
}

async function updateTypeScriptConnectorSdk(projectPath: string): Promise<void> {
    const packagePath = path.join(projectPath, packageJsonFileName);
    const packageJson = await AzExtFsExtra.pathExists(packagePath) ?
        await AzExtFsExtra.readJSON<{
            dependencies?: Record<string, string>;
            engines?: Record<string, string>;
        }>(packagePath) : {};
    const dependencies = packageJson.dependencies ??= {};
    for (const [name, version] of Object.entries(connectorSdkVersions.node)) {
        if (!hasMinimumVersion(dependencies[name], version)) {
            dependencies[name] = `^${version}`;
        }
    }
    const engines = packageJson.engines ??= {};
    if (!hasMinimumVersion(engines.node, connectorSdkVersions.nodeMinimumVersion)) {
        engines.node = `>=${connectorSdkVersions.nodeMinimumVersion}`;
    }
    await AzExtFsExtra.writeJSON(packagePath, packageJson);
}

function hasMinimumVersion(range: string | undefined, minimum: string): boolean {
    return !!range && !!semver.validRange(range) && new semver.Range(range).set.every(comparators =>
        comparators.some(comparator =>
            ['', '>', '>='].includes(comparator.operator) &&
            !!semver.valid(comparator.semver.version) && semver.gte(comparator.semver, minimum)));
}

async function ensurePythonProject(
    projectPath: string,
    available: AvailableConnectorIdentity,
    binding: ConnectorTriggerSdkBinding['python'],
): Promise<void> {
    const functionAppPath = path.join(projectPath, 'function_app.py');
    const requirementsPath = path.join(projectPath, requirementsFileName);
    if (!await AzExtFsExtra.pathExists(functionAppPath) ||
        !await AzExtFsExtra.pathExists(requirementsPath)) {
        throw createUnsupportedTemplateError();
    }

    let functionApp = (await AzExtFsExtra.readFile(functionAppPath)).toString();
    if (!available.alreadyExists) {
        const lineEnding = functionApp.includes('\r\n') ? '\r\n' : '\n';
        functionApp = ensurePythonImports(functionApp, lineEnding, binding);
        functionApp = `${functionApp.trimEnd()}${lineEnding}${lineEnding}` +
            getPythonFunction(
                available.identity,
                lineEnding,
                binding,
            );
        await AzExtFsExtra.writeFile(functionAppPath, functionApp);
    }
    await updatePythonFunctionsSdk(projectPath, !!binding);
}

export async function updatePythonFunctionsSdk(
    projectPath: string,
    usesSdkPayload = false,
): Promise<void> {
    const requirementsPath = path.join(projectPath, requirementsFileName);
    if (!await AzExtFsExtra.pathExists(requirementsPath)) {
        throw createUnsupportedTemplateError();
    }
    let requirements = (await AzExtFsExtra.readFile(requirementsPath)).toString();
    const lineEnding = requirements.includes('\r\n') ? '\r\n' : '\n';
    const azureFunctionsPattern = /^azure-functions[ \t]*(?:[<>=!~;#][^\r\n]*)?(?:\r?\n|$)/gim;
    const functionsRequirements = [
        "azure-functions>=2.4.0b1 ; python_version >= '3.13'",
        "azure-functions>=1.27.0b1 ; python_version < '3.13'",
    ].join(lineEnding) + lineEnding;
    let replacedFunctionsRequirement = false;
    requirements = requirements.replace(azureFunctionsPattern, () => {
        if (replacedFunctionsRequirement) {
            return '';
        }
        replacedFunctionsRequirement = true;
        return functionsRequirements;
    });
    if (!replacedFunctionsRequirement) {
        requirements = `${requirements.trimEnd()}${lineEnding}${functionsRequirements}`;
    }
    if (usesSdkPayload) {
        for (const [name, version] of Object.entries(connectorSdkVersions.python)) {
            const pattern = new RegExp(`^${name}(?:[<>=!~].*)?$`, 'im');
            requirements = pattern.test(requirements) ?
                requirements.replace(pattern, `${name}>=${version}`) :
                `${requirements.trimEnd()}${lineEnding}${name}>=${version}${lineEnding}`;
        }
    }
    await AzExtFsExtra.writeFile(requirementsPath, requirements);
}

function getCSharpFunction(
    identity: ConnectorTriggerEventIdentity,
    binding: ConnectorTriggerSdkBinding['csharp'],
): string {
    return `${binding ? `using ${binding.namespace};\n` : ''}using Microsoft.Azure.Functions.Worker;
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
        ${binding?.payloadType ?? 'ConnectorEvent<string>'} ${binding ? 'payload' : 'connectorEvent'})
    {
        ${binding ?
            'logger.LogInformation("Received a connector event ({Count} items).", payload.Body?.Value?.Count ?? 0);' :
            'logger.LogInformation("Received a connector event ({Length} JSON characters).", connectorEvent.Data.Length);'}
    }
}
`;
}

function getTypeScriptFunction(
    identity: ConnectorTriggerEventIdentity,
    binding: ConnectorTriggerSdkBinding['typescript'],
): string {
    const registration = binding.helper ? `connectors.${binding.helper}` : 'connectorTrigger';
    const typeArgument = !binding.helper && binding.itemType ? `<${binding.itemType}>` : '';
    const itemImport = !binding.helper && binding.importPath ?
        `import type { ${binding.itemType} } from '${binding.importPath}';\n` : '';
    return `import { ${binding.helper ? 'connectors' : 'connectorTrigger'} } from '@azure/functions-extensions-connectors';
${itemImport}

${registration}${typeArgument}('${identity.functionName}', {
    deliveryMode: 'Poll',
    connection: '${connectionSettingName}',
    triggerConfigName: '%${identity.triggerConfigSettingName}%',
    handler: async (event, invocationContext) => {
        invocationContext.log(\`Received \${event.items.length} item(s) in the polling event.\`);
    },
});
`;
}

function getPythonFunction(
    identity: ConnectorTriggerEventIdentity,
    lineEnding: string,
    binding: ConnectorTriggerSdkBinding['python'],
): string {
    return `@app.function_name(name="${identity.functionName}")${lineEnding}` +
        `@app.connector_trigger(${lineEnding}` +
        `    arg_name="payload",${lineEnding}` +
        `    delivery_mode=func.DeliveryMode.POLL,${lineEnding}` +
        `    connection="${connectionSettingName}",${lineEnding}` +
        `    trigger_config_name="%${identity.triggerConfigSettingName}%",${lineEnding}` +
        `)${lineEnding}` +
        `def ${identity.pythonFunctionName}(payload: ${binding ? `list[${binding.moduleName}.${binding.itemType}]` : 'str'}) -> None:${lineEnding}` +
        `    logging.info("Received a connector event (%s ${binding ? 'items' : 'JSON characters'}).", len(payload))${lineEnding}`;
}

function ensurePythonImports(
    contents: string,
    lineEnding: string,
    binding: ConnectorTriggerSdkBinding['python'],
): string {
    let result = contents;
    const anchorPattern = /^import azure\.functions as func$/m;
    if (!anchorPattern.test(result)) {
        throw createUnsupportedTemplateError();
    }
    const missingImports = [
        'import logging',
        ...(binding ? [`import ${binding.importPath} as ${binding.moduleName}`] : []),
    ].filter(statement =>
        !new RegExp(`^${escapeRegExp(statement)}$`, 'm').test(result));

    if (missingImports.length > 0) {
        result = result.replace(
            anchorPattern,
            match => `${match}${lineEnding}${missingImports.join(lineEnding)}`,
        );
    }
    return result;
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
