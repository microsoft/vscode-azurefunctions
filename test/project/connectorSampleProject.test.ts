/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { prepareConnectorSampleDeployment } from '../../src/connectorTrigger/connectorSampleDeployment';
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

    test('validates declared hooks and module-relative helpers without executing them', async () => {
        await AzExtFsExtra.writeFile(path.join(root, 'azure.yaml'), `hooks:
  prepackage:
    run: |
      npm install
      npm run build
  postdeploy:
    windows:
      shell: pwsh
      run: node "./infra/scripts/custom hook.mjs"
    posix:
      shell: sh
      run: node "./infra/scripts/custom hook.mjs"
`);
        await AzExtFsExtra.writeFile(path.join(root, 'infra', 'scripts', 'custom hook.mjs'), `
import { setup } from './helper.mjs';
const config = new URL('./config.json', import.meta.url);
throw new Error('Hooks must not be executed during project creation');
`);
        await AzExtFsExtra.writeFile(path.join(root, 'infra', 'scripts', 'helper.mjs'), `import './custom hook.mjs';`);
        await AzExtFsExtra.writeJSON(path.join(root, 'infra', 'scripts', 'config.json'), {});
        assert.deepStrictEqual((await prepareConnectorSampleDeployment(root)).issues, []);
        await AzExtFsExtra.deleteResource(path.join(root, 'infra', 'scripts', 'config.json'), { useTrash: false });
        assert.deepStrictEqual((await prepareConnectorSampleDeployment(root)).issues, [
            { hook: 'postdeploy', referencedBy: 'infra/scripts/custom hook.mjs', reference: './config.json' },
        ]);
    });

    for (const [platform, entry, helper] of [
        ['windows', 'postdeploy.ps1', `. (Join-Path $PSScriptRoot 'local-settings.ps1')`],
        ['posix', 'postdeploy.sh', `. "$script_dir/local-settings.sh"`],
        ['posix', 'postdeploy.sh', 'source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/local-settings.sh"'],
    ]) {
        test(`bundles the Python sibling helper from the sample into polling (${platform}, ${helper})`, async () => {
            const polling = path.join(root, 'sample', 'office365App', 'polling');
            const helperName = entry.endsWith('.ps1') ? 'local-settings.ps1' : 'local-settings.sh';
            await AzExtFsExtra.writeFile(path.join(polling, 'azure.yaml'), `hooks:
  postdeploy:
    ${platform}:
      run: ./infra/scripts/${entry}
`);
            await AzExtFsExtra.writeFile(path.join(polling, 'infra', 'scripts', entry), helper);
            const wrapper = platform === 'windows'
                ? (reference: string) => `$helper = Join-Path $PSScriptRoot '${reference}'\n$project = Join-Path $PSScriptRoot '../..'`
                : (reference: string) => `"\${PYTHON:-python}" "$script_dir/${reference}" --mode polling --project "$script_dir/../.."`;
            const wrapperPath = path.join(polling, 'infra', 'scripts', helperName);
            await AzExtFsExtra.writeFile(wrapperPath, wrapper('../../../scripts/setup.py'));
            // Outside the copied project, but inside the downloaded sample.
            await AzExtFsExtra.writeFile(path.join(root, 'sample', 'office365App', 'scripts', 'setup.py'), 'import json\n');

            // Without the sample root, the helper cannot be resolved and is only reported.
            assert.deepStrictEqual((await prepareConnectorSampleDeployment(polling)).issues, [
                { hook: 'postdeploy', referencedBy: `infra/scripts/${helperName}`, reference: '../../../scripts/setup.py' },
            ]);
            assert.strictEqual(await AzExtFsExtra.readFile(wrapperPath), wrapper('../../../scripts/setup.py'));

            assert.deepStrictEqual(await prepareConnectorSampleDeployment(polling, path.join(root, 'sample')), {
                issues: [], bundledFiles: ['office365App/scripts/setup.py'],
            });
            assert.strictEqual(await AzExtFsExtra.readFile(path.join(polling, 'infra', 'scripts', 'setup.py')), 'import json\n');
            assert.strictEqual(await AzExtFsExtra.readFile(wrapperPath), wrapper('setup.py'));
            // Rerunning on the prepared project is a no-op.
            assert.deepStrictEqual(await prepareConnectorSampleDeployment(polling, path.join(root, 'sample')), { issues: [], bundledFiles: [] });
        });
    }

    test('does not bundle helpers that escape the sample, are missing, or conflict with project files', async () => {
        const sample = path.join(root, 'sample');
        const polling = path.join(sample, 'app', 'polling');
        await AzExtFsExtra.writeFile(path.join(polling, 'azure.yaml'), 'hooks:\n  postdeploy:\n    posix:\n      run: ./infra/scripts/postdeploy.sh\n');
        await AzExtFsExtra.writeFile(path.join(polling, 'infra', 'scripts', 'postdeploy.sh'), [
            '. "$script_dir/../../../../../outside.sh"',
            '. "$script_dir/../../../scripts/missing.sh"',
            '. "$script_dir/../../../scripts/conflict.sh"',
        ].join('\n'));
        await AzExtFsExtra.writeFile(path.join(root, 'outside.sh'), '');
        await AzExtFsExtra.writeFile(path.join(sample, 'app', 'scripts', 'conflict.sh'), 'sample');
        await AzExtFsExtra.writeFile(path.join(polling, 'infra', 'scripts', 'conflict.sh'), 'project');
        const result = await prepareConnectorSampleDeployment(polling, sample);
        assert.deepStrictEqual(result.bundledFiles, []);
        assert.deepStrictEqual(result.issues.map(issue => issue.reference), [
            '../../../../../outside.sh', '../../../scripts/missing.sh', '../../../scripts/conflict.sh',
        ]);
        assert.ok(!await AzExtFsExtra.pathExists(path.join(polling, 'infra', 'scripts', 'outside.sh')));
        assert.strictEqual(await AzExtFsExtra.readFile(path.join(polling, 'infra', 'scripts', 'conflict.sh')), 'project');
    });

    test('checks both platform hooks, including the platform not running the extension', async () => {
        await AzExtFsExtra.writeFile(path.join(root, 'azure.yaml'), `hooks:
  postprovision:
    windows:
      run: ./infra/windows.ps1
    posix:
      run: ./infra/posix.sh
`);
        await AzExtFsExtra.writeFile(path.join(root, 'infra', 'windows.ps1'), '');
        assert.deepStrictEqual((await prepareConnectorSampleDeployment(root)).issues, [
            { hook: 'postprovision', referencedBy: 'azure.yaml', reference: './infra/posix.sh' },
        ]);
        await AzExtFsExtra.writeFile(path.join(root, 'infra', 'posix.sh'), '');
        assert.deepStrictEqual((await prepareConnectorSampleDeployment(root)).issues, []);
    });

    test('resolves service hooks from the service project directory', async () => {
        await AzExtFsExtra.writeFile(path.join(root, 'azure.yaml'), `services:
  api:
    project: ./app
    hooks:
      prepackage:
        run: ./scripts/build.sh
`);
        assert.deepStrictEqual((await prepareConnectorSampleDeployment(root)).issues, [
            { hook: 'api.prepackage', referencedBy: 'azure.yaml', reference: './scripts/build.sh' },
        ]);
        await AzExtFsExtra.writeFile(path.join(root, 'app', 'scripts', 'build.sh'), '');
        assert.deepStrictEqual((await prepareConnectorSampleDeployment(root)).issues, []);
    });

    test('allows projects without deployment hooks and rejects invalid manifests without leaking their content', async () => {
        await prepareConnectorSampleDeployment(root);
        await AzExtFsExtra.writeFile(path.join(root, 'azure.yaml'), 'name: no-hooks\n');
        await prepareConnectorSampleDeployment(root);
        for (const content of ['hooks: [private-value', 'hooks: {postdeploy: {run: 123}}']) {
            await AzExtFsExtra.writeFile(path.join(root, 'azure.yaml'), content);
            await assert.rejects(prepareConnectorSampleDeployment(root), error =>
                error instanceof Error && /invalid deployment hooks/.test(error.message) && !error.message.includes('private-value'));
        }
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
