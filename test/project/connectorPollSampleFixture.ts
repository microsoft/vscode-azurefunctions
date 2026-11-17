/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { ProjectLanguage } from '../../src/constants';

export async function writeConnectorPollSampleHandler(projectPath: string, language: string): Promise<string> {
    let relativePath: string;
    let source: string;
    if (language === ProjectLanguage.CSharp) {
        relativePath = 'GenericFunctions.cs';
        source = `using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Extensions.Connector;
using Microsoft.Extensions.Logging;

public sealed class GenericFunctions
{
    private readonly ILogger<GenericFunctions> logger;

    public GenericFunctions(ILogger<GenericFunctions> logger)
    {
        this.logger = logger;
    }

    [Function("OnGenericConnectorEvent")]
    public void Run(
        [ConnectorTrigger(
            DeliveryMode = ConnectorTriggerDeliveryMode.Poll,
            Connection = "ConnectorNamespace",
            TriggerConfigName = "%GenericTriggerConfigName%")]
        ConnectorEvent<string> connectorEvent)
    {
        logger.LogInformation("Received a connector event ({Length} JSON characters).", connectorEvent.Data.Length);
    }
}
`;
    } else if (language === ProjectLanguage.TypeScript) {
        relativePath = path.join('src', 'functions', 'generic.ts');
        source = `import { app, DeliveryMode } from '@azure/functions';

app.connectorTrigger('OnGenericConnectorEvent', {
    deliveryMode: DeliveryMode.Poll,
    connection: 'ConnectorNamespace',
    triggerConfigName: '%GenericTriggerConfigName%',
    handler: async (_payload: unknown, invocationContext) => {
        invocationContext.log('Sample handler received a connector event.');
    },
});
`;
    } else if (language === ProjectLanguage.Python) {
        relativePath = 'function_app.py';
        source = `import azure.functions as func
import logging

app = func.FunctionApp()

@app.function_name(name="OnGenericConnectorEvent")
@app.connector_trigger(
    arg_name="payload",
    delivery_mode=func.DeliveryMode.POLL,
    connection="ConnectorNamespace",
    trigger_config_name="%GenericTriggerConfigName%",
)
def on_generic_connector_event(payload: str) -> None:
    logging.info("Received a connector event (%s JSON characters).", len(payload))
`;
    } else {
        throw new Error('Unsupported test sample language.');
    }
    const sourcePath = path.join(projectPath, relativePath);
    await AzExtFsExtra.ensureDir(path.dirname(sourcePath));
    await AzExtFsExtra.writeFile(sourcePath, source);
    return sourcePath;
}

export async function writeConnectorPollSample(projectPath: string, language: string): Promise<void> {
    await writeConnectorPollSampleHandler(projectPath, language);
    await AzExtFsExtra.writeJSON(path.join(projectPath, 'host.json'), { version: '2.0' });
    const runtime = language === ProjectLanguage.CSharp ? 'dotnet-isolated' :
        language === ProjectLanguage.TypeScript ? 'node' : 'python';
    await AzExtFsExtra.writeJSON(path.join(projectPath, 'local.settings.example.json'), {
        IsEncrypted: false,
        Values: {
            FUNCTIONS_WORKER_RUNTIME: runtime,
            AzureWebJobsStorage: 'UseDevelopmentStorage=true',
            ['ConnectorNamespace__pollingEndpoint']: 'https://<connector-namespace-host>',
            GenericTriggerConfigName: '<trigger-configuration-name>',
        },
    });
    if (language === ProjectLanguage.Python) {
        await AzExtFsExtra.writeFile(path.join(projectPath, 'requirements.txt'), 'azure-functions>=2.2.0b4\n');
    }
}
