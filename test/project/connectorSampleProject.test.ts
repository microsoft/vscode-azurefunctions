/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findConnectorSampleFunctionNames, getConnectorSampleOperationFunctions, parseOperationFunctions, resolveConnectorSampleProjectFolder } from '../../src/connectorTrigger/connectorSampleProject';
import { getPollingConnectorBindings } from '../../src/connectorTrigger/connectorTriggerBindings';
import { getConnectorTriggerEventIdentity } from '../../src/connectorTrigger/connectorTriggerEventIdentity';

suite('Connector sample project discovery', () => {
    let root: string;

    setup(async () => {
        root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'azfunc-connector-sample-'));
    });

    teardown(async () => {
        await AzExtFsExtra.deleteResource(root, { recursive: true, useTrash: false });
    });

    test('resolves the polling project beside a webhook project', async () => {
        for (const folder of ['webhook', 'polling']) {
            await AzExtFsExtra.writeFile(path.join(root, folder, 'host.json'), '{}');
        }
        assert.strictEqual(await resolveConnectorSampleProjectFolder(root), path.join(root, 'polling'));

        await AzExtFsExtra.writeFile(path.join(root, 'host.json'), '{}');
        assert.strictEqual(await resolveConnectorSampleProjectFolder(root), root);
    });

    test('resolves a single non-webhook project and rejects ambiguous layouts', async () => {
        await AzExtFsExtra.writeFile(path.join(root, 'webhook', 'host.json'), '{}');
        assert.strictEqual(await resolveConnectorSampleProjectFolder(root), undefined);

        await AzExtFsExtra.writeFile(path.join(root, 'app', 'host.json'), '{}');
        assert.strictEqual(await resolveConnectorSampleProjectFolder(root), path.join(root, 'app'));

        await AzExtFsExtra.writeFile(path.join(root, 'other', 'host.json'), '{}');
        assert.strictEqual(await resolveConnectorSampleProjectFolder(root), undefined);
    });

    test('maps operations to functions from JSON and Bicep infrastructure', async () => {
        await AzExtFsExtra.writeJSON(path.join(root, 'infra', 'scripts', 'polling-config.json'), {
            connectorName: 'sharepointonline',
            triggers: [
                { functionName: 'OnNewFilePoll', operationName: 'GetOnNewFileItems' },
                { functionName: 'OnUpdatedFilePoll', operationName: 'GetOnUpdatedFileItems', optional: true },
            ],
        });
        await AzExtFsExtra.writeFile(path.join(root, 'infra', 'poll-triggers.bicep'), `var triggers = [
  {
    functionName: 'OnNewEmail'
    operationName: 'OnNewEmailV3'
  }
  {
    functionName: 'OnFlaggedEmail'
    description: 'No operation for this entry'
  }
  {
    functionName: 'OnUpcomingEvent'
    operationName: 'OnUpcomingEventsV3'
  }
]
resource config 'x' = [for trigger in triggers: { name: trigger.functionName }]
`);
        const operations = await getConnectorSampleOperationFunctions(root);
        assert.deepStrictEqual(Object.fromEntries(operations), {
            getonnewfileitems: 'OnNewFilePoll',
            getonupdatedfileitems: 'OnUpdatedFilePoll',
            onnewemailv3: 'OnNewEmail',
            onupcomingeventsv3: 'OnUpcomingEvent',
        });
        assert.deepStrictEqual(parseOperationFunctions(`functionName: trigger.functionName
operationName: 'Unrelated'`), []);
    });

    test('finds sample function names registered in loops but ignores infrastructure', async () => {
        await AzExtFsExtra.writeFile(path.join(root, 'src', 'functions', 'poll.ts'), `for (const [name, register] of [
    ['OnNewFilePoll', connectors.sharepoint.onNewFileItems],
]) {
    register(name, { deliveryMode: DeliveryMode.Poll });
}`);
        await AzExtFsExtra.writeFile(path.join(root, 'infra', 'main.bicep'), `var name = 'OnInfraOnly'`);
        assert.deepStrictEqual([...await findConnectorSampleFunctionNames(root, ['OnNewFilePoll', 'OnInfraOnly'])], ['OnNewFilePoll']);
    });

    test('detects TypeScript Poll bindings that use the DeliveryMode enum', () => {
        const bindings = getPollingConnectorBindings(`connectors.office365.onNewEmail('OnNewEmailPoll', {
    deliveryMode: DeliveryMode.Poll,
    connection: 'ConnectorNamespace',
    triggerConfigName: '%OnNewEmailPollTriggerConfigName%',
    handler: async () => undefined,
});
connectors.office365.onNewEmail('OnNewEmailWebhook', {
    deliveryMode: DeliveryMode.Webhook,
    connection: 'ConnectorNamespace',
    triggerConfigName: '%Webhook%',
});
connectors.office365.onNewEmail('EnumConnection', {
    deliveryMode: 'Poll',
    connection: Settings.Connection,
    triggerConfigName: '%Enum%',
});`, '.ts');
        assert.deepStrictEqual(bindings.map(binding => binding.functionName), ['OnNewEmailPoll']);
        assert.strictEqual(bindings[0].triggerConfigSettingName, 'OnNewEmailPollTriggerConfigName');
    });

    test('derives valid event identities from canonical operation IDs', () => {
        const calendar = getConnectorTriggerEventIdentity(
            'office365',
            'CalendarGetOnChangedItemsV3',
        );
        assert.deepStrictEqual({
            functionName: calendar.functionName,
            csharpClassName: calendar.csharpClassName,
            csharpNamespace: calendar.csharpNamespace,
            packageName: calendar.packageName,
            pythonFunctionName: calendar.pythonFunctionName,
            typescriptFileName: calendar.typescriptFileName,
        }, {
            functionName: 'CalendarGetOnChangedItemsV3',
            csharpClassName: 'CalendarGetOnChangedItemsV3Function',
            csharpNamespace: 'CalendarGetOnChangedItemsV3App',
            packageName: 'calendar-get-on-changed-items-v3',
            pythonFunctionName: 'calendar_get_on_changed_items_v3_function',
            typescriptFileName: 'calendarGetOnChangedItemsV3Function.ts',
        });

        const unsafe = getConnectorTriggerEventIdentity(
            'customconnector',
            '123/CON/../class',
        );
        assert.match(unsafe.functionName, /^[A-Za-z][A-Za-z\d_-]*$/);
        assert.ok(!/[\\/:*?"<>|]/.test(unsafe.csharpFileName));
        assert.match(unsafe.pythonFunctionName, /^[a-z_][a-z\d_]*$/);
        assert.match(unsafe.packageName, /^[a-z\d][a-z\d-]*$/);
        assert.ok(!/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(
            unsafe.csharpFileName,
        ));
    });
});
