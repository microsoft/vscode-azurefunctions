/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    AzExtFsExtra,
    createTestActionContext,
    type IActionContext,
} from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getConnectorTriggerEventIdentity } from '../../src/connectorTrigger/connectorTriggerEventIdentity';
import { findPollingConnectorBindings } from '../../src/connectorTrigger/connectorTriggerBindings';
import { materializeConnectorTriggerTemplateOperations } from '../../src/connectorTrigger/materializeConnectorTriggerTemplate';
import { ProjectLanguage } from '../../src/constants';
import { cpUtils } from '../../src/utils/cpUtils';
import {
    TemplateCategory,
    type IConnectorTriggerTemplate,
    type IProjectTemplate,
    type ITemplateManifest,
} from '../../src/templates/projectTemplates/IProjectTemplate';
import { ProjectTemplateProvider } from '../../src/templates/projectTemplates/ProjectTemplateProvider';

suite('Connector Trigger template materialization', () => {
    let projectPath: string;

    setup(async () => {
        projectPath = await fs.promises.mkdtemp(
            path.join(os.tmpdir(), 'azfunc-selected-connector-event-'),
        );
    });

    teardown(async () => {
        await AzExtFsExtra.deleteResource(projectPath, {
            recursive: true,
            useTrash: false,
        });
    });

    test('retains only the selected operation-owned artifacts', async () => {
        await createOperationFixture(projectPath);
        const optionsPath = path.join(projectPath, 'src', 'pollConnectorTriggerOptions.ts');
        const options = await AzExtFsExtra.readFile(optionsPath);

        const { operations: selected } = await materializeConnectorTriggerTemplateOperations(
            projectPath,
            createTemplate().connectorTrigger!,
            ['OnNewEmailV3'],
        );

        assert.deepStrictEqual(selected.map(operation => operation.functionName), ['OnNewEmail']);
        assert.strictEqual(
            await AzExtFsExtra.pathExists(
                path.join(projectPath, 'src', 'functions', 'onNewEmail.ts'),
            ),
            true,
        );
        assert.strictEqual(
            await AzExtFsExtra.pathExists(
                path.join(projectPath, 'infra', 'triggers', 'on-new-email.json'),
            ),
            true,
        );
        assert.strictEqual(
            await AzExtFsExtra.pathExists(
                path.join(projectPath, 'src', 'functions', 'onFlaggedEmail.ts'),
            ),
            false,
        );
        assert.strictEqual(
            await AzExtFsExtra.pathExists(
                path.join(projectPath, 'infra', 'triggers', 'on-flagged-email.json'),
            ),
            false,
        );
        assert.strictEqual(
            await AzExtFsExtra.pathExists(path.join(projectPath, 'host.json')),
            true,
        );
        assert.strictEqual(await AzExtFsExtra.readFile(optionsPath), options);
    });

    test('retains the selected union with independent configuration keys and supports reruns', async () => {
        await createOperationFixture(projectPath);
        const template = createTemplate().connectorTrigger!;
        await AzExtFsExtra.ensureDir(path.join(projectPath, 'unused'));
        await AzExtFsExtra.writeFile(path.join(projectPath, 'unused', 'event.json'), '{}');
        template.operations.push({ operationId: 'Unused', functionName: 'Unused', ownedPaths: ['unused'] });
        await AzExtFsExtra.writeJSON(path.join(projectPath, 'local.settings.json'), {
            IsEncrypted: false, Values: { KeepMe: 'unchanged' },
        });

        const selected = ['OnNewEmailV3', 'OnFlaggedEmailV4'];
        await materializeConnectorTriggerTemplateOperations(projectPath, template, selected);
        const beforeRerun = await findPollingConnectorBindings(projectPath);
        await materializeConnectorTriggerTemplateOperations(projectPath, template, selected);

        const bindings = await findPollingConnectorBindings(projectPath);
        assert.deepStrictEqual(new Set(bindings), new Set(beforeRerun));
        assert.deepStrictEqual(bindings.map(binding => binding.functionName).sort(), ['OnFlaggedEmail', 'OnNewEmail']);
        assert.strictEqual(new Set(bindings.map(binding => binding.triggerConfigSettingName)).size, 2);
        assert.ok(bindings.every(binding => binding.connectionSettingName === 'ConnectorNamespace'));
        assert.strictEqual(await AzExtFsExtra.pathExists(path.join(projectPath, 'unused')), false);
        const settings = await AzExtFsExtra.readJSON<{ Values: Record<string, string> }>(path.join(projectPath, 'local.settings.json'));
        assert.strictEqual(settings.Values.KeepMe, 'unchanged');
        for (const binding of bindings) {
            assert.strictEqual(settings.Values[binding.triggerConfigSettingName], '');
        }
        assert.match(await AzExtFsExtra.readFile(path.join(projectPath, 'src', 'pollConnectorTriggerOptions.ts')),
            /triggerConfigName: `%\$\{string\}%`;/);
    });

    test('rejects missing selected artifacts before pruning any other operation', async () => {
        await createOperationFixture(projectPath);
        await AzExtFsExtra.deleteResource(path.join(projectPath, 'src', 'functions', 'onNewEmail.ts'));
        await assert.rejects(materializeConnectorTriggerTemplateOperations(
            projectPath, createTemplate().connectorTrigger!, ['OnNewEmailV3'],
        ), /missing a required artifact/);
        assert.strictEqual(await AzExtFsExtra.pathExists(path.join(projectPath, 'src', 'functions', 'onFlaggedEmail.ts')), true);
    });

    test('registers every retained Python blueprint rather than invoking the single-event loader', async () => {
        const template = await createPythonOperationFixture(projectPath);
        await materializeConnectorTriggerTemplateOperations(projectPath, template, template.operations.map(operation => operation.operationId));

        const functionApp = await AzExtFsExtra.readFile(path.join(projectPath, 'function_app.py'));
        assert.match(functionApp, /for blueprint in load_selected_blueprints\(Path\(__file__\)\.parent\):\n {4}app\.register_functions\(blueprint\)/);
        assert.ok(!functionApp.includes('load_selected_blueprint('));
        const bindings = await findPollingConnectorBindings(projectPath);
        assert.strictEqual(bindings.length, 2);
        assert.strictEqual(new Set(bindings.map(binding => binding.triggerConfigSettingName)).size, 2);
    });

    (process.env.AZFUNC_TEST_PYTHON ? test : test.skip)('executes the generated Python loader and registers every retained blueprint', async () => {
        const template = await createPythonOperationFixture(projectPath);
        await materializeConnectorTriggerTemplateOperations(projectPath, template, template.operations.map(operation => operation.operationId));
        await AzExtFsExtra.writeFile(path.join(projectPath, 'verify_blueprints.py'), `import runpy
import sys
from types import ModuleType, SimpleNamespace

class Blueprint:
    def __init__(self):
        self.names = []
    def function_name(self, *, name):
        def decorate(handler):
            self.names.append(name)
            return handler
        return decorate
    def connector_trigger(self, **kwargs):
        return lambda handler: handler

class FunctionApp:
    def __init__(self):
        self.names = []
    def register_functions(self, blueprint):
        self.names.extend(blueprint.names)

azure = ModuleType("azure")
azure.functions = SimpleNamespace(Blueprint=Blueprint, FunctionApp=FunctionApp, DeliveryMode=SimpleNamespace(POLL="Poll"))
sys.modules["azure"] = azure
sys.modules["azure.functions"] = azure.functions
app = runpy.run_path("function_app.py")["app"]
assert sorted(app.names) == ["FirstEvent", "SecondEvent"], app.names
`);
        await cpUtils.executeCommand(undefined, projectPath, process.env.AZFUNC_TEST_PYTHON!, ['verify_blueprints.py']);
    });

    test('rejects missing operations and unsafe ownership metadata', async () => {
        await createOperationFixture(projectPath);
        const template = createTemplate().connectorTrigger!;

        await assert.rejects(
            materializeConnectorTriggerTemplateOperations(
                projectPath,
                template,
                ['MissingOperation'],
            ),
            /not available in this project template/,
        );
        await assert.rejects(
            materializeConnectorTriggerTemplateOperations(
                projectPath,
                {
                    operations: [{
                        operationId: 'OnNewEmailV3',
                        functionName: 'OnNewEmail',
                        ownedPaths: ['../outside.ts'],
                    }],
                },
                ['OnNewEmailV3'],
            ),
            /invalid operation ownership metadata/,
        );
        await assert.rejects(
            materializeConnectorTriggerTemplateOperations(
                projectPath,
                {
                    operations: [{
                        operationId: 'OnNewEmailV3',
                        functionName: 'OnNewEmail',
                        ownedPaths: ['src/functions/shared.ts'],
                    }, {
                        operationId: 'OnFlaggedEmailV4',
                        functionName: 'OnFlaggedEmail',
                        ownedPaths: ['src/functions/shared.ts'],
                    }],
                },
                ['OnNewEmailV3'],
            ),
            /invalid operation ownership metadata/,
        );

        const invalidTemplates = [{
            operations: [{
                operationId: 'OnNewEmailV3',
                functionName: 'OnNewEmail',
                ownedPaths: ['src/functions'],
            }, {
                operationId: 'OnFlaggedEmailV4',
                functionName: 'OnFlaggedEmail',
                ownedPaths: ['src/functions/onFlaggedEmail.ts'],
            }],
        }, {
            operations: [{
                operationId: 'OnNewEmailV3',
                functionName: 'OnNewEmail',
                ownedPaths: ['src/functions/onNewEmail.ts'],
            }, {
                operationId: 'onnewemailv3',
                functionName: 'OtherFunction',
                ownedPaths: ['src/functions/other.ts'],
            }],
        }, {
            operations: [{
                operationId: 'OnNewEmailV3',
                functionName: 'OnNewEmail',
                ownedPaths: ['src/functions/[event].ts'],
            }],
        }, {
            operations: [{
                operationId: 'OnNewEmailV3',
                functionName: 'OnNewEmail',
                ownedPaths: ['src/functions/CON.ts'],
            }],
        }];
        for (const invalidTemplate of invalidTemplates) {
            await assert.rejects(
                materializeConnectorTriggerTemplateOperations(
                    projectPath,
                    invalidTemplate,
                    ['OnNewEmailV3'],
                ),
                /invalid operation ownership metadata/,
            );
        }
    });

    test('ProjectTemplateProvider overlays older manifests and preserves remote ownership', async () => {
        const remoteTemplate = createTemplate();
        delete remoteTemplate.connectorTrigger;
        remoteTemplate.gitRef = 'refs/tags/old';
        remoteTemplate.folderPath = 'old-template-root';
        const bundledTemplate = createTemplate();
        bundledTemplate.gitRef = '0123456789abcdef0123456789abcdef01234567';
        bundledTemplate.folderPath = 'office365App/template';
        bundledTemplate.repositoryUrl = 'https://example.invalid/pinned-template';
        const provider = new ProjectTemplateProvider() as unknown as {
            getTemplates(
                context: IActionContext,
                language?: ProjectLanguage,
            ): Promise<IProjectTemplate[]>;
            getManifest(): Promise<{
                version: string;
                generatedAt: string;
                templates: IProjectTemplate[];
            }>;
            getBundledManifest(): Promise<{
                version: string;
                generatedAt: string;
                templates: IProjectTemplate[];
            }>;
        };
        provider.getManifest = async () => ({
            version: '1.0.0',
            generatedAt: '2026-01-01T00:00:00Z',
            templates: [remoteTemplate],
        });
        provider.getBundledManifest = async () => ({
            version: '1.0.0',
            generatedAt: '2026-01-01T00:00:00Z',
            templates: [bundledTemplate],
        });
        const context = await createTestActionContext();

        const [template] = await provider.getTemplates(
            context,
            ProjectLanguage.TypeScript,
        );

        assert.strictEqual(
            template.gitRef,
            '0123456789abcdef0123456789abcdef01234567',
        );
        assert.deepStrictEqual(
            template.connectorTrigger,
            bundledTemplate.connectorTrigger,
        );
        assert.strictEqual(template.folderPath, 'office365App/template');
        assert.strictEqual(
            template.repositoryUrl,
            'https://example.invalid/pinned-template',
        );
        assert.strictEqual(
            context.telemetry.properties.connectorOwnershipOverlay,
            'true',
        );

        remoteTemplate.connectorTrigger = {
            operations: [{
                operationId: 'RemoteOperation',
                functionName: 'RemoteFunction',
                ownedPaths: ['src/functions/remote.ts'],
            }],
        };
        remoteTemplate.gitRef = 'refs/tags/remote-contract';
        remoteTemplate.folderPath = 'remote-template-root';
        remoteTemplate.repositoryUrl = 'https://example.invalid/remote-template';
        const remoteContext = await createTestActionContext();
        const [remoteOwnedTemplate] = await provider.getTemplates(
            remoteContext,
            ProjectLanguage.TypeScript,
        );

        assert.strictEqual(remoteOwnedTemplate.gitRef, 'refs/tags/remote-contract');
        assert.strictEqual(remoteOwnedTemplate.folderPath, 'remote-template-root');
        assert.strictEqual(
            remoteOwnedTemplate.repositoryUrl,
            'https://example.invalid/remote-template',
        );
        assert.deepStrictEqual(
            remoteOwnedTemplate.connectorTrigger,
            remoteTemplate.connectorTrigger,
        );
        assert.strictEqual(
            remoteContext.telemetry.properties.connectorOwnershipOverlay,
            'false',
        );
    });

    test('bundled manifest carries every exact connector ownership contract', async () => {
        const manifest = await readBundledManifest();
        const expected = getExpectedConnectorTemplates();
        const actual = Object.fromEntries(manifest.templates
            .filter(template => Object.hasOwn(expected, template.id))
            .map(template => [template.id, {
                connectorTrigger: template.connectorTrigger,
                folderPath: template.folderPath,
                gitRef: template.gitRef,
                repositoryUrl: template.repositoryUrl,
            }]));

        assert.deepStrictEqual(actual, expected);
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

async function readBundledManifest(): Promise<ITemplateManifest> {
    return JSON.parse(await fs.promises.readFile(
        path.join(
            __dirname,
            '..',
            '..',
            'resources',
            'backupProjectTemplates',
            'manifest.json',
        ),
        'utf8',
    )) as ITemplateManifest;
}

async function createOperationFixture(root: string): Promise<void> {
    await AzExtFsExtra.ensureDir(path.join(root, 'src', 'functions'));
    await AzExtFsExtra.ensureDir(path.join(root, 'infra', 'triggers'));
    await AzExtFsExtra.writeFile(path.join(root, 'host.json'), '{}');
    await AzExtFsExtra.writeFile(path.join(root, 'src', 'pollConnectorTriggerOptions.ts'), `export type PollConnectorTriggerOptions = {
    deliveryMode: 'Poll';
    connection: 'ConnectorNamespace';
    triggerConfigName: '%ConnectorTriggerConfigName%';
};
`);
    await AzExtFsExtra.writeFile(
        path.join(root, 'src', 'functions', 'onNewEmail.ts'),
        createTypeScriptBinding('OnNewEmail'),
    );
    await AzExtFsExtra.writeFile(
        path.join(root, 'src', 'functions', 'onFlaggedEmail.ts'),
        createTypeScriptBinding('OnFlaggedEmail'),
    );
    await AzExtFsExtra.writeFile(
        path.join(root, 'infra', 'triggers', 'on-new-email.json'),
        '{"operationId":"OnNewEmailV3"}',
    );
    await AzExtFsExtra.writeFile(
        path.join(root, 'infra', 'triggers', 'on-flagged-email.json'),
        '{"operationId":"OnFlaggedEmailV4"}',
    );
}

async function createPythonOperationFixture(root: string): Promise<IConnectorTriggerTemplate> {
    await AzExtFsExtra.ensureDir(path.join(root, 'shared'));
    await AzExtFsExtra.writeFile(path.join(root, 'shared', 'operation_loader.py'), `import importlib.util
from pathlib import Path
from typing import Any

def _load_module(module_path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(module_path.parent.name, module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
`);
    await AzExtFsExtra.writeFile(path.join(root, 'function_app.py'), `from pathlib import Path
import azure.functions as func
from shared.operation_loader import load_selected_blueprint

app = func.FunctionApp()
app.register_functions(load_selected_blueprint(Path(__file__).parent))
`);
    const operations = ['FirstEvent', 'SecondEvent'].map(operationId => ({
        operationId, functionName: operationId, ownedPaths: [`operations/${operationId}`],
    }));
    for (const operation of operations) {
        const directory = path.join(root, 'operations', operation.operationId);
        await AzExtFsExtra.ensureDir(directory);
        await AzExtFsExtra.writeFile(path.join(directory, 'trigger-config.json'), '{}');
        await AzExtFsExtra.writeFile(path.join(directory, 'function.py'), `import azure.functions as func
bp = func.Blueprint()

@bp.function_name(name="${operation.functionName}")
@bp.connector_trigger(
    arg_name="payloads",
    delivery_mode=func.DeliveryMode.POLL,
    connection="Namespace",
    trigger_config_name="%SharedConfig%",
)
def handle(payloads):
    pass
`);
    }
    return { operations };
}

function createTypeScriptBinding(functionName: string): string {
    return `app.connectorTrigger('${functionName}', {
    deliveryMode: 'Poll',
    connection: 'ConnectorNamespace',
    triggerConfigName: '%ConnectorTriggerConfigName%',
    handler: async () => undefined,
});
`;
}

function createTemplate(): IProjectTemplate {
    return {
        id: 'office365-connector-trigger-typescript',
        displayName: 'Office 365 Outlook Connector Triggers',
        shortDescription: 'Connector Trigger project',
        categories: [TemplateCategory.Other],
        languages: [ProjectLanguage.TypeScript],
        repositoryUrl: 'https://example.invalid/template',
        connectorTrigger: {
            operations: [{
                operationId: 'OnNewEmailV3',
                functionName: 'OnNewEmail',
                ownedPaths: [
                    'src/functions/onNewEmail.ts',
                    'infra/triggers/on-new-email.json',
                ],
            }, {
                operationId: 'OnFlaggedEmailV4',
                functionName: 'OnFlaggedEmail',
                ownedPaths: [
                    'src/functions/onFlaggedEmail.ts',
                    'infra/triggers/on-flagged-email.json',
                ],
            }],
        },
    };
}

function getExpectedConnectorTemplates(): Record<string, {
    connectorTrigger: NonNullable<IProjectTemplate['connectorTrigger']>;
    folderPath: string;
    gitRef: string;
    repositoryUrl: string;
}> {
    const officeOperations = [
        ['OnNewEmailV3', 'OnNewEmail', 'onNewEmail.ts'],
        ['OnFlaggedEmailV4', 'OnFlaggedEmail', 'onFlaggedEmail.ts'],
        ['OnNewMentionMeEmailV3', 'OnNewMentionMeEmail', 'onNewMentionMeEmail.ts'],
        ['CalendarGetOnNewItemsV3', 'OnNewCalendarEvent', 'onNewCalendarEvent.ts'],
        ['OnUpcomingEventsV3', 'OnUpcomingEvent', 'onUpcomingEvent.ts'],
    ] as const;
    const sharePointOperations = [
        ['GetOnNewFileItems', 'OnSharepointNewFile', 'onSharepointNewFile.ts'],
        ['GetOnUpdatedFileItems', 'OnSharepointUpdatedFile', 'onSharepointUpdatedFile.ts'],
    ] as const;
    const createOperations = (
        language: 'csharp' | 'python' | 'typescript',
        operations: readonly (readonly [string, string, string])[],
    ): NonNullable<IProjectTemplate['connectorTrigger']> => ({
        operations: operations.map(([operationId, functionName, typeScriptFile]) => ({
            operationId,
            functionName: language === 'csharp' ?
                functionName.replace('OnSharepoint', 'On') :
                functionName,
            ownedPaths: language === 'csharp' ?
                [
                    `${functionName.replace('OnSharepoint', 'On')}.cs`,
                    `infra/triggers/${operationId}.json`,
                ] :
                language === 'python' ?
                    [`operations/${operationId}`] :
                    [
                        `src/functions/${typeScriptFile}`,
                        `infra/operations/${operationId}`,
                    ],
        })),
    });
    const csharpRef = 'b053eac5ad6e4e1c96f9515e39b5b3b0ebfaf74e';
    const pythonRef = 'a9bfc5cc752e61926b1fea1599024801d0b7a755';
    const typeScriptRef = 'e45f811fda9aed46ab8914291816d69b30dade1a';
    const csharpRepository = 'https://github.com/Azure-Samples/functions-connectors-net';
    const pythonRepository = 'https://github.com/Azure-Samples/functions-connectors-python';
    const typeScriptRepository =
        'https://github.com/Azure-Samples/functions-connectors-typescript';

    return {
        'office365-connector-trigger-csharp': {
            connectorTrigger: createOperations('csharp', officeOperations),
            folderPath: 'office365App/template',
            gitRef: csharpRef,
            repositoryUrl: csharpRepository,
        },
        'office365-connector-trigger-python': {
            connectorTrigger: createOperations('python', officeOperations),
            folderPath: 'office365App',
            gitRef: pythonRef,
            repositoryUrl: pythonRepository,
        },
        'office365-connector-trigger-typescript': {
            connectorTrigger: createOperations('typescript', officeOperations),
            folderPath: 'office365App',
            gitRef: typeScriptRef,
            repositoryUrl: typeScriptRepository,
        },
        'sharepoint-connector-trigger-csharp': {
            connectorTrigger: createOperations('csharp', sharePointOperations),
            folderPath: 'sharepointApp/template',
            gitRef: csharpRef,
            repositoryUrl: csharpRepository,
        },
        'sharepoint-connector-trigger-python': {
            connectorTrigger: createOperations('python', sharePointOperations),
            folderPath: 'sharepointApp',
            gitRef: pythonRef,
            repositoryUrl: pythonRepository,
        },
        'sharepoint-connector-trigger-typescript': {
            connectorTrigger: createOperations('typescript', sharePointOperations),
            folderPath: 'sharepointApp',
            gitRef: typeScriptRef,
            repositoryUrl: typeScriptRepository,
        },
    };
}
