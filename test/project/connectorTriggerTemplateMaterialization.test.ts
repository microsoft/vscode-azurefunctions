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
import {
    ProjectTemplateCreator,
    type ProjectTemplateCreationOptions,
} from '../../src/commands/createNewProject/ProjectTemplateCreator';
import {
    connectorTriggerProjectHandoffVersion,
    type ConnectorTriggerProjectHandoff,
} from '../../src/connectorTrigger/connectorTriggerProjectHandoff';
import { materializeConnectorTriggerTemplate } from '../../src/connectorTrigger/materializeConnectorTriggerTemplate';
import { ProjectLanguage } from '../../src/constants';
import { getPollingConnectorBindings } from '../../src/debug/connectorNamespace/ConnectorTriggerF5BindingResolver';
import {
    TemplateCategory,
    type IProjectTemplate,
} from '../../src/templates/projectTemplates/IProjectTemplate';

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

    test('rejects missing operations, traversal, and shared path ownership', async () => {
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
    });

    test('ProjectTemplateCreator produces one selected Poll registration', async () => {
        const creator = new ProjectTemplateCreator() as unknown as TestableProjectTemplateCreator;
        creator.confirmTargetNotEmpty = async () => undefined;
        creator.isGitInstalled = async () => false;
        creator.downloadAndExtractZip = async (
            _context,
            _repositoryUrl,
            _archiveRef,
            destination,
        ) => {
            await createOperationFixture(destination);
        };
        creator.tryOpenReadme = async () => undefined;
        creator.promptAndOpenProject = async () => undefined;

        await creator.createProject(
            await createTestActionContext(),
            createTemplate(),
            ProjectLanguage.TypeScript,
            projectPath,
            'details',
            { connectorTriggerHandoff: createHandoff() },
        );

        const sourceFiles = await vscodeSourceFiles(projectPath);
        const bindings = sourceFiles.flatMap(getPollingConnectorBindings);
        assert.deepStrictEqual(bindings, [{
            connectionSettingName: 'ConnectorNamespace',
            functionName: 'OnNewEmail',
            triggerConfigSettingName: 'ConnectorTriggerConfigName',
        }]);
        assert.strictEqual(
            await AzExtFsExtra.pathExists(
                path.join(projectPath, 'src', 'functions', 'connectorTriggerFunction.ts'),
            ),
            false,
        );
    });
});

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

function createHandoff(): ConnectorTriggerProjectHandoff {
    return {
        version: connectorTriggerProjectHandoffVersion,
        subscription: {
            id: 'subscription-id',
            tenantId: 'tenant-id',
            environment: {
                name: 'AzureCloud',
                resourceManagerEndpointUrl: 'https://management.azure.com/',
            },
        },
        region: 'westcentralus',
        connectorId: 'office365',
        operationId: 'OnNewEmailV3',
    };
}

async function vscodeSourceFiles(root: string): Promise<string[]> {
    const functionsPath = path.join(root, 'src', 'functions');
    const entries = await AzExtFsExtra.readDirectory(functionsPath);
    return await Promise.all(entries
        .filter(entry => entry.name.endsWith('.ts'))
        .map(async entry =>
            (await AzExtFsExtra.readFile(path.join(functionsPath, entry.name))).toString()));
}

interface TestableProjectTemplateCreator {
    createProject(
        actionContext: IActionContext,
        template: IProjectTemplate,
        language: string,
        projectPath: string,
        entryPoint?: 'card' | 'details',
        options?: ProjectTemplateCreationOptions,
    ): Promise<void>;
    confirmTargetNotEmpty(
        actionContext: IActionContext,
        projectPath: string,
    ): Promise<void>;
    downloadAndExtractZip(
        context: IActionContext,
        repositoryUrl: string,
        archiveRef: string,
        destination: string,
    ): Promise<void>;
    isGitInstalled(): Promise<boolean>;
    promptAndOpenProject(
        actionContext: IActionContext,
        projectPath: string,
    ): Promise<void>;
    tryOpenReadme(projectPath: string): Promise<void>;
}
