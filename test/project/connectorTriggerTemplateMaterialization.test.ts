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
import { materializeConnectorTriggerTemplate } from '../../src/connectorTrigger/materializeConnectorTriggerTemplate';
import { ProjectLanguage } from '../../src/constants';
import {
    TemplateCategory,
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
            schemaName: calendar.payloadModel?.schemaName,
        }, {
            functionName: 'CalendarGetOnChangedItemsV3',
            csharpClassName: 'CalendarGetOnChangedItemsV3Function',
            csharpNamespace: 'CalendarGetOnChangedItemsV3App',
            packageName: 'calendar-get-on-changed-items-v3',
            pythonFunctionName: 'calendar_get_on_changed_items_v3_function',
            typescriptFileName: 'calendarGetOnChangedItemsV3Function.ts',
            schemaName: 'GraphCalendarEventClientWithActionType',
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
