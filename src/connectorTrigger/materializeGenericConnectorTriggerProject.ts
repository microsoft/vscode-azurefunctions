/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { ProjectLanguage } from '../constants';
import { localize } from '../localize';
import {
    findConnectorTriggerRegistrations,
    findPollingConnectorBindings,
} from './connectorTriggerBindings';
import {
    updateCSharpConnectorExtension,
    updatePythonFunctionsSdk,
} from './ensureConnectorTriggerPollProject';

const connectionSettingName = 'ConnectorNamespace';
const triggerConfigSettingName = 'ConnectorTriggerConfigName';
const generatedFunctionName = 'ConnectorTriggerFunction';

export async function materializeGenericConnectorTriggerProject(
    projectPath: string,
    language: string,
): Promise<void> {
    switch (language) {
        case ProjectLanguage.CSharp:
            await materializeCSharpProject(projectPath);
            break;
        case ProjectLanguage.TypeScript:
            await materializeTypeScriptProject(projectPath);
            break;
        case ProjectLanguage.Python:
            await materializePythonProject(projectPath);
            break;
        default:
            throw new Error(localize(
                'genericConnectorTriggerLanguageUnsupported',
                'Generic Connector Trigger projects are not supported for language "{0}".',
                language,
            ));
    }

    const registrations = await findConnectorTriggerRegistrations(projectPath);
    const bindings = await findPollingConnectorBindings(projectPath);
    if (registrations.length !== 1 ||
        registrations[0] !== generatedFunctionName ||
        bindings.length !== 1 ||
        bindings[0].functionName !== generatedFunctionName) {
        throw new Error(localize(
            'genericConnectorTriggerMaterializationInvalid',
            'The generic Connector Trigger template did not produce exactly one Poll trigger.',
        ));
    }
}

async function materializeCSharpProject(projectPath: string): Promise<void> {
    await updateCSharpConnectorExtension(projectPath);
    await AzExtFsExtra.writeFile(
        path.join(projectPath, 'GenericFunctions.cs'),
        getCSharpFunction(),
    );
}

async function materializeTypeScriptProject(projectPath: string): Promise<void> {
    const functionsPath = path.join(projectPath, 'src', 'functions');
    if (await AzExtFsExtra.pathExists(functionsPath)) {
        await AzExtFsExtra.deleteResource(functionsPath, {
            recursive: true,
            useTrash: false,
        });
    }
    await AzExtFsExtra.ensureDir(functionsPath);
    await AzExtFsExtra.writeFile(
        path.join(functionsPath, 'connectorTriggerFunction.ts'),
        getTypeScriptFunction(),
    );
}

async function materializePythonProject(projectPath: string): Promise<void> {
    const functionAppPath = path.join(projectPath, 'function_app.py');
    if (!await AzExtFsExtra.pathExists(functionAppPath)) {
        throw createUnsupportedTemplateError();
    }
    await AzExtFsExtra.writeFile(functionAppPath, getPythonFunction());
    await updatePythonFunctionsSdk(projectPath);
}

function getCSharpFunction(): string {
    return `using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Extensions.Connector;
using Microsoft.Extensions.Logging;

namespace GenericApp;

public sealed class GenericFunctions
{
    private readonly ILogger<GenericFunctions> logger;

    public GenericFunctions(ILogger<GenericFunctions> logger)
    {
        this.logger = logger;
    }

    [Function("${generatedFunctionName}")]
    [BlobOutput("connector-messages/{rand-guid}.json", Connection = "AzureWebJobsStorage")]
    public string Run(
        [ConnectorTrigger(
            DeliveryMode = ConnectorTriggerDeliveryMode.Poll,
            Connection = "${connectionSettingName}",
            TriggerConfigName = "%${triggerConfigSettingName}%")]
        string payload)
    {
        logger.LogInformation("Connector trigger event received.");
        return payload;
    }
}
`;
}

function getTypeScriptFunction(): string {
    return `import { InvocationContext } from '@azure/functions';
import {
    connectorTrigger,
    type ConnectorTriggerOptions,
} from '@azure/functions-extensions-connectors';

type GenericConnectorItem = Record<string, unknown>;

interface PollConnectorTriggerOptions {
    deliveryMode: 'Poll';
    connection: string;
    triggerConfigName: string;
}

const connectorTriggerOptions = {
    deliveryMode: 'Poll',
    connection: '${connectionSettingName}',
    triggerConfigName: '%${triggerConfigSettingName}%',
    handler: async (context, invocationContext: InvocationContext) => {
        invocationContext.log(
            \`Received '\${context.items.length}' connector item(s).\`,
        );
        return context.rawPayload;
    },
} satisfies ConnectorTriggerOptions<GenericConnectorItem> & PollConnectorTriggerOptions;

connectorTrigger<GenericConnectorItem>(
    '${generatedFunctionName}',
    connectorTriggerOptions,
);
`;
}

function getPythonFunction(): string {
    return `# Copyright (c) .NET Foundation. All rights reserved.
# Licensed under the MIT License.

from typing import List

import azure.functions as func
import logging

app = func.FunctionApp()


@app.function_name(name="${generatedFunctionName}")
@app.connector_trigger(
    arg_name="payloads",
    delivery_mode=func.DeliveryMode.POLL,
    connection="${connectionSettingName}",
    trigger_config_name="%${triggerConfigSettingName}%",
    cardinality=func.Cardinality.MANY,
    max_batch_size=4,
)
def connector_trigger_function(payloads: List[str]) -> None:
    logging.info("Received %s connector event(s).", len(payloads))
`;
}

function createUnsupportedTemplateError(): Error {
    return new Error(localize(
        'genericConnectorTriggerTemplateUnsupported',
        'The generic Connector Trigger project template is not supported.',
    ));
}
