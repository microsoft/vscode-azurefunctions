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
import { updateTypeScriptConnectorSdk } from '../../src/connectorTrigger/ensureConnectorTriggerPollProject';
import { materializeConnectorTriggerTemplate, materializeConnectorTriggerTemplateOperations } from '../../src/connectorTrigger/materializeConnectorTriggerTemplate';
import { ProjectLanguage } from '../../src/constants';
import { cpUtils } from '../../src/utils/cpUtils';
import { envUtils } from '../../src/utils/envUtils';
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

        const selected = await materializeConnectorTriggerTemplate(
            projectPath,
            createTemplate().connectorTrigger!,
            'OnNewEmailV3',
        );

        assert.strictEqual(selected.functionName, 'OnNewEmail');
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

    test('materializes TypeScript Poll enums without duplicating imports or changing nested values', async () => {
        await createOperationFixture(projectPath);
        const files = [
            { name: 'onNewEmail.ts', functionName: 'OnNewEmail', imports: 'InvocationContext' },
            { name: 'onFlaggedEmail.ts', functionName: 'OnFlaggedEmail', imports: 'InvocationContext, DeliveryMode' },
        ];
        for (const file of files) {
            await AzExtFsExtra.writeFile(path.join(projectPath, 'src', 'functions', file.name), `import { ${file.imports} } from '@azure/functions';

const options = {
    // Keep this example: deliveryMode: 'Poll'
    deliveryMode: 'Poll',
    connection: 'ConnectorNamespace',
    triggerConfigName: '%ConnectorTriggerConfigName%',
    handler: () => ({ deliveryMode: 'Poll' }),
};
connectors.office365.onChanged('${file.functionName}', options);
`);
        }
        const template = createTemplate().connectorTrigger!;
        const selected = ['OnNewEmailV3', 'OnFlaggedEmailV4'];

        await materializeConnectorTriggerTemplateOperations(projectPath, template, selected);

        const contents = await Promise.all(files.map(file =>
            AzExtFsExtra.readFile(path.join(projectPath, 'src', 'functions', file.name))));
        for (const content of contents) {
            assert.match(content, /import \{ InvocationContext, DeliveryMode \} from '@azure\/functions';/);
            assert.match(content, /^\s+deliveryMode: DeliveryMode\.Poll,/m);
            assert.match(content, /handler: \(\) => \(\{ deliveryMode: 'Poll' \}\)/);
            assert.match(content, /\/\/ Keep this example: deliveryMode: 'Poll'/);
        }

        await materializeConnectorTriggerTemplateOperations(projectPath, template, selected);
        assert.deepStrictEqual(await Promise.all(files.map(file =>
            AzExtFsExtra.readFile(path.join(projectPath, 'src', 'functions', file.name)))), contents);
    });

    test('updates renamed Office 365 SDK helpers in retained TypeScript handlers', async () => {
        await AzExtFsExtra.ensureDir(path.join(projectPath, 'src', 'functions'));
        const cases = [
            {
                operationId: 'OnNewMentionMeEmailV3', functionName: 'OnNewMentionMeEmail',
                oldHelper: 'onNewMentionMeEmail', newHelper: 'onNewEmailMentioningMe',
            },
            {
                operationId: 'OnUpcomingEventsV3', functionName: 'OnUpcomingEvent',
                oldHelper: 'onUpcomingEvent', newHelper: 'onUpcomingEvents',
            },
        ];
        const template: IConnectorTriggerTemplate = {
            operations: cases.map(({ operationId, functionName }) => ({
                operationId, functionName, ownedPaths: [`src/functions/${functionName}.ts`],
            })),
        };
        for (const { functionName, oldHelper } of cases) {
            await AzExtFsExtra.writeFile(path.join(projectPath, 'src', 'functions', `${functionName}.ts`), `import { InvocationContext } from '@azure/functions';
import { connectors } from '@azure/functions-extensions-connectors';
// Keep the old example: connectors.office365.${oldHelper}
const options = {
    deliveryMode: 'Poll',
    connection: 'ConnectorNamespace',
    triggerConfigName: '%${functionName}Config%',
    handler: async (_context: unknown, _invocationContext: InvocationContext) => undefined,
} satisfies Parameters<typeof connectors.office365.${oldHelper}>[1];
connectors.office365.${oldHelper}('${functionName}', options);
`);
        }

        await materializeConnectorTriggerTemplateOperations(projectPath, template, cases.map(item => item.operationId));
        const contents = await Promise.all(cases.map(item =>
            AzExtFsExtra.readFile(path.join(projectPath, 'src', 'functions', `${item.functionName}.ts`))));
        for (const [index, item] of cases.entries()) {
            assert.ok(contents[index].includes(`typeof connectors.office365.${item.newHelper}`));
            assert.ok(contents[index].includes(`connectors.office365.${item.newHelper}('${item.functionName}'`));
            assert.ok(contents[index].includes(`// Keep the old example: connectors.office365.${item.oldHelper}`));
        }
        await materializeConnectorTriggerTemplateOperations(projectPath, template, cases.map(item => item.operationId));
        assert.deepStrictEqual(await Promise.all(cases.map(item =>
            AzExtFsExtra.readFile(path.join(projectPath, 'src', 'functions', `${item.functionName}.ts`)))), contents);
    });

    (envUtils.isEnvironmentVariableSet(process.env.AZFUNC_TEST_BUILD_CONNECTOR_ADD_PROJECTS) ? test : test.skip)(
        'compiles a materialized TypeScript sample against @azure/functions 4.17.1',
        async function (this: Mocha.Context): Promise<void> {
            this.timeout(5 * 60 * 1000);
            await createOperationFixture(projectPath);
            await AzExtFsExtra.writeJSON(path.join(projectPath, 'package.json'), {
                private: true,
                scripts: { build: 'tsc' },
                dependencies: {
                    '@azure/functions': '4.17.0',
                    '@azure/functions-extensions-connectors': '0.0.2-preview',
                    '@azure/connectors': '0.3.0',
                },
                overrides: {
                    '@azure/functions': '4.17.0',
                    '@azure/functions-extensions-connectors': '0.0.2-preview',
                    '@azure/connectors': '0.3.0',
                },
                optionalDependencies: { '@azure/functions-extensions-connectors': '0.0.2-preview' },
                devDependencies: { '@types/node': '^20.0.0', typescript: '^5.0.0' },
            });
            await AzExtFsExtra.writeJSON(path.join(projectPath, 'tsconfig.json'), {
                compilerOptions: {
                    module: 'es2022',
                    moduleResolution: 'bundler',
                    noEmit: true,
                    strict: true,
                    target: 'es2022',
                },
                include: ['src/**/*.ts'],
            });
            const samples = [
                { operationId: 'OnNewEmailV3', functionName: 'OnNewEmail', file: 'onNewEmail.ts', connector: 'office365', helper: 'onNewEmail', context: 'EmailTriggerContext', items: 'emails' },
                { operationId: 'OnFlaggedEmailV4', functionName: 'OnFlaggedEmail', file: 'onFlaggedEmail.ts', connector: 'office365', helper: 'onFlaggedEmail', context: 'EmailTriggerContext', items: 'emails' },
                { operationId: 'OnNewMentionMeEmailV3', functionName: 'OnNewMentionMeEmail', file: 'onNewMentionMeEmail.ts', connector: 'office365', helper: 'onNewMentionMeEmail', context: 'EmailTriggerContext', items: 'emails' },
                { operationId: 'CalendarGetOnNewItemsV3', functionName: 'OnNewCalendarEvent', file: 'onNewCalendarEvent.ts', connector: 'office365', helper: 'onNewCalendarEvent', context: 'CalendarEventTriggerContext', items: 'calendarEvents' },
                { operationId: 'OnUpcomingEventsV3', functionName: 'OnUpcomingEvent', file: 'onUpcomingEvent.ts', connector: 'office365', helper: 'onUpcomingEvent', context: 'CalendarEventTriggerContext', items: 'calendarEvents' },
                { operationId: 'GetOnNewFileItems', functionName: 'OnSharepointNewFile', file: 'onSharepointNewFile.ts', connector: 'sharepoint', helper: 'onNewFile', context: 'FileTriggerContext', items: 'files' },
                { operationId: 'GetOnUpdatedFileItems', functionName: 'OnSharepointUpdatedFile', file: 'onSharepointUpdatedFile.ts', connector: 'sharepoint', helper: 'onUpdatedFile', context: 'FileTriggerContext', items: 'files' },
            ];
            const template = createTemplate().connectorTrigger!;
            for (const sample of samples) {
                if (!template.operations.some(operation => operation.operationId === sample.operationId)) {
                    template.operations.push({
                        operationId: sample.operationId,
                        functionName: sample.functionName,
                        ownedPaths: [`src/functions/${sample.file}`],
                    });
                }
                await AzExtFsExtra.writeFile(path.join(projectPath, 'src', 'functions', sample.file), `import { InvocationContext } from '@azure/functions';
import { connectors, ${sample.context} } from '@azure/functions-extensions-connectors';
import type { PollConnectorTriggerOptions } from '../pollConnectorTriggerOptions.js';

${sample.operationId === 'OnFlaggedEmailV4' ? "const DeliveryMode = 'unrelated';\n" : ''}
const options = {
    deliveryMode: 'Poll',
    connection: 'ConnectorNamespace',
    triggerConfigName: '%ConnectorTriggerConfigName%',
    handler: async (context: ${sample.context}, invocationContext: InvocationContext) => {
        invocationContext.log(context.${sample.items}.length);
        return context.rawPayload;
    },
} satisfies Parameters<typeof connectors.${sample.connector}.${sample.helper}>[1] & PollConnectorTriggerOptions;
connectors.${sample.connector}.${sample.helper}('${sample.functionName}', options);
`);
            }

            await materializeConnectorTriggerTemplateOperations(projectPath, template, samples.map(sample => sample.operationId));
            for (const sample of samples) {
                const source = await AzExtFsExtra.readFile(path.join(projectPath, 'src', 'functions', sample.file));
                assert.match(source, /deliveryMode: (?:azureFunctions\.)?DeliveryMode\.Poll/);
            }
            await updateTypeScriptConnectorSdk(projectPath);
            const packagePath = path.join(projectPath, 'package.json');
            const packageJson = await AzExtFsExtra.readJSON<{
                dependencies: Record<string, string>;
                optionalDependencies: Record<string, string>;
                overrides: Record<string, string>;
            }>(packagePath);
            assert.strictEqual(packageJson.dependencies['@azure/functions'], '^4.17.1');
            assert.strictEqual(packageJson.overrides['@azure/functions'], '^4.17.1');
            assert.strictEqual(packageJson.overrides['@azure/functions-extensions-connectors'], '^0.2.0-preview');
            assert.strictEqual(packageJson.overrides['@azure/connectors'], '^0.4.0-preview');
            assert.strictEqual(packageJson.optionalDependencies['@azure/functions-extensions-connectors'], '^0.2.0-preview');
            packageJson.dependencies['@azure/functions'] = '4.17.1';
            packageJson.overrides['@azure/functions'] = '4.17.1';
            await AzExtFsExtra.writeJSON(packagePath, packageJson);
            await cpUtils.executeCommand(undefined, projectPath, 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund']);
            await cpUtils.executeCommand(undefined, projectPath, 'npm', ['run', 'build']);
        },
    );

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
            materializeConnectorTriggerTemplate(
                projectPath,
                template,
                'MissingOperation',
            ),
            /not available in this project template/,
        );
        await assert.rejects(
            materializeConnectorTriggerTemplate(
                projectPath,
                {
                    operations: [{
                        operationId: 'OnNewEmailV3',
                        functionName: 'OnNewEmail',
                        ownedPaths: ['../outside.ts'],
                    }],
                },
                'OnNewEmailV3',
            ),
            /invalid operation ownership metadata/,
        );
        await assert.rejects(
            materializeConnectorTriggerTemplate(
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
                'OnNewEmailV3',
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
                materializeConnectorTriggerTemplate(
                    projectPath,
                    invalidTemplate,
                    'OnNewEmailV3',
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
