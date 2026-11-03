/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { FileType } from 'vscode';
import { ProjectLanguage, requirementsFileName } from '../constants';
import { localize } from '../localize';

const connectionSettingName = 'ConnectorNamespace';
const triggerConfigSettingName = 'ConnectorTriggerConfigName';
const generatedFunctionName = 'ConnectorTriggerFunction';

export async function ensureConnectorTriggerPollProject(
    projectPath: string,
    language: string,
): Promise<void> {
    switch (language) {
        case ProjectLanguage.CSharp:
            await ensureCSharpProject(projectPath);
            return;
        case ProjectLanguage.TypeScript:
            await ensureTypeScriptProject(projectPath);
            return;
        case ProjectLanguage.Python:
            await ensurePythonProject(projectPath);
            return;
        default:
            throw new Error(localize(
                'connectorTriggerPollLanguageUnsupported',
                'Connector Trigger Poll projects are not supported for language "{0}".',
                language,
            ));
    }
}

async function ensureCSharpProject(projectPath: string): Promise<void> {
    await updateCSharpConnectorExtension(projectPath);
    await AzExtFsExtra.writeFile(
        path.join(projectPath, `${generatedFunctionName}.cs`),
        getCSharpFunction(),
    );
}

export async function updateCSharpConnectorExtension(
    projectPath: string,
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

    await AzExtFsExtra.writeFile(
        projectFilePath,
        projectContents.replace(
            packagePattern,
            (_match, prefix: string, suffix: string) => `${prefix}1.0.0${suffix}`,
        ),
    );
}

async function ensureTypeScriptProject(projectPath: string): Promise<void> {
    const functionsPath = path.join(projectPath, 'src', 'functions');
    await AzExtFsExtra.ensureDir(functionsPath);
    await AzExtFsExtra.writeFile(
        path.join(functionsPath, 'connectorTriggerFunction.ts'),
        getTypeScriptFunction(),
    );
}

async function ensurePythonProject(projectPath: string): Promise<void> {
    const functionAppPath = path.join(projectPath, 'function_app.py');
    const requirementsPath = path.join(projectPath, requirementsFileName);
    if (!await AzExtFsExtra.pathExists(functionAppPath) ||
        !await AzExtFsExtra.pathExists(requirementsPath)) {
        throw createUnsupportedTemplateError();
    }

    let functionApp = (await AzExtFsExtra.readFile(functionAppPath)).toString();
    const lineEnding = functionApp.includes('\r\n') ? '\r\n' : '\n';
    if (!functionApp.includes('from typing import List')) {
        const importPattern = /import azure\.functions as func\r?\n/;
        if (!importPattern.test(functionApp)) {
            throw createUnsupportedTemplateError();
        }
        functionApp = functionApp.replace(
            importPattern,
            match => `${match}from typing import List${lineEnding}`,
        );
    }
    if (!functionApp.includes(`name="${generatedFunctionName}"`)) {
        functionApp = `${functionApp.trimEnd()}${lineEnding}${lineEnding}${getPythonFunction(lineEnding)}`;
    }
    await AzExtFsExtra.writeFile(functionAppPath, functionApp);
    await updatePythonFunctionsSdk(projectPath);
}

export async function updatePythonFunctionsSdk(
    projectPath: string,
): Promise<void> {
    const requirementsPath = path.join(projectPath, requirementsFileName);
    if (!await AzExtFsExtra.pathExists(requirementsPath)) {
        throw createUnsupportedTemplateError();
    }
    let requirements = (await AzExtFsExtra.readFile(requirementsPath)).toString();
    const lineEnding = requirements.includes('\r\n') ? '\r\n' : '\n';
    const azureFunctionsPattern = /^azure-functions(?:[<>=!~].*)?$/im;
    requirements = azureFunctionsPattern.test(requirements) ?
        requirements.replace(azureFunctionsPattern, 'azure-functions>=2.4.0b1') :
        `${requirements.trimEnd()}${lineEnding}azure-functions>=2.4.0b1${lineEnding}`;
    await AzExtFsExtra.writeFile(requirementsPath, requirements);
}

function getCSharpFunction(): string {
    return `using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Extensions.Connector;
using Microsoft.Extensions.Logging;

public sealed class ${generatedFunctionName}
{
    private readonly ILogger<${generatedFunctionName}> logger;

    public ${generatedFunctionName}(ILogger<${generatedFunctionName}> logger)
    {
        this.logger = logger;
    }

    [Function("${generatedFunctionName}")]
    public void Run(
        [ConnectorTrigger(
            DeliveryMode = ConnectorTriggerDeliveryMode.Poll,
            Connection = "${connectionSettingName}",
            TriggerConfigName = "%${triggerConfigSettingName}%")]
        string payload)
    {
        logger.LogInformation("Connector trigger event received.");
    }
}
`;
}

function getTypeScriptFunction(): string {
    return `import { app, InvocationContext } from '@azure/functions';

app.connectorTrigger('${generatedFunctionName}', {
    deliveryMode: 'Poll',
    connection: '${connectionSettingName}',
    triggerConfigName: '%${triggerConfigSettingName}%',
    handler: async (_payload, context: InvocationContext) => {
        context.log('Connector trigger event received.');
    },
});
`;
}

function getPythonFunction(lineEnding: string): string {
    return `@app.function_name(name="${generatedFunctionName}")${lineEnding}` +
        `@app.connector_trigger(${lineEnding}` +
        `    arg_name="payloads",${lineEnding}` +
        `    delivery_mode=func.DeliveryMode.POLL,${lineEnding}` +
        `    connection="${connectionSettingName}",${lineEnding}` +
        `    trigger_config_name="%${triggerConfigSettingName}%",${lineEnding}` +
        `    cardinality=func.Cardinality.MANY,${lineEnding}` +
        `    max_batch_size=4,${lineEnding}` +
        `)${lineEnding}` +
        `def connector_trigger_function(payloads: List[str]) -> None:${lineEnding}` +
        `    logging.info("Received %s connector event(s).", len(payloads))${lineEnding}`;
}

function createUnsupportedTemplateError(): Error {
    return new Error(localize(
        'connectorTriggerPollTemplateUnsupported',
        'The selected project template cannot be configured for Connector Trigger Poll debugging.',
    ));
}
