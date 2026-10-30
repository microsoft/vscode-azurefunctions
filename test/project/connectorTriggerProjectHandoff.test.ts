/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, createTestActionContext, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    ProjectTemplateCreator,
    type ProjectTemplateCreationOptions,
} from '../../src/commands/createNewProject/ProjectTemplateCreator';
import {
    clearConnectorTriggerProjectHandoff,
    ConnectorTriggerProjectHandoffError,
    connectorTriggerProjectHandoffRelativePath,
    connectorTriggerProjectHandoffVersion,
    getConnectorTriggerProjectHandoffPath,
    readConnectorTriggerProjectHandoff,
    writeConnectorTriggerProjectHandoff,
    type ConnectorTriggerProjectHandoff,
    type ConnectorTriggerProjectHandoffErrorCode,
} from '../../src/connectorTrigger/connectorTriggerProjectHandoff';
import { ProjectLanguage } from '../../src/constants';
import {
    TemplateCategory,
    type IProjectTemplate,
} from '../../src/templates/projectTemplates/IProjectTemplate';

suite('Connector trigger project handoff', () => {
    let projectPath: string;

    setup(async () => {
        projectPath = await fs.promises.mkdtemp(
            path.join(os.tmpdir(), 'azfunc-connector-handoff-'),
        );
    });

    teardown(async () => {
        await AzExtFsExtra.deleteResource(
            projectPath,
            { recursive: true, useTrash: false },
        );
    });

    test('writes a versioned local record and reads it after a new call', async () => {
        const handoff = createHandoff();

        await writeConnectorTriggerProjectHandoff(projectPath, handoff);

        assert.strictEqual(
            getConnectorTriggerProjectHandoffPath(projectPath),
            path.join(projectPath, ...connectorTriggerProjectHandoffRelativePath.split('/')),
        );
        assert.deepStrictEqual(
            await readConnectorTriggerProjectHandoff(projectPath),
            handoff,
        );
        assert.deepStrictEqual(
            JSON.parse(
                await fs.promises.readFile(
                    getConnectorTriggerProjectHandoffPath(projectPath),
                    'utf8',
                ),
            ),
            handoff,
        );
    });

    test('creates an idempotent project-root source control exclusion', async () => {
        const gitignorePath = path.join(projectPath, '.gitignore');
        await fs.promises.writeFile(gitignorePath, 'node_modules/\r\n', 'utf8');

        await writeConnectorTriggerProjectHandoff(projectPath, createHandoff());
        await writeConnectorTriggerProjectHandoff(projectPath, createHandoff());

        const gitignore = await fs.promises.readFile(gitignorePath, 'utf8');
        assert.strictEqual(
            gitignore,
            'node_modules/\r\n/.azurefunctions/connector-trigger-project-handoff.json\r\n',
        );
    });

    test('ProjectTemplateCreator persists the handoff before reporting success', async () => {
        const handoff = createHandoff();
        const handoffPath = getConnectorTriggerProjectHandoffPath(projectPath);
        let projectCreated = false;
        const creator = new ProjectTemplateCreator({
            onProjectCreated: () => {
                assert.strictEqual(fs.existsSync(handoffPath), true);
                projectCreated = true;
            },
        }) as unknown as TestableProjectTemplateCreator;
        creator.confirmTargetNotEmpty = async () => undefined;
        creator.isGitInstalled = async () => false;
        creator.downloadAndExtractZip = async (_context, _repositoryUrl, _archiveRef, destination) => {
            await AzExtFsExtra.ensureDir(destination);
            await AzExtFsExtra.writeFile(path.join(destination, 'host.json'), '{}');
        };
        creator.tryOpenReadme = async () => undefined;
        creator.promptAndOpenProject = async () => undefined;

        await creator.createProject(
            await createTestActionContext(),
            createProjectTemplate(),
            ProjectLanguage.TypeScript,
            projectPath,
            'details',
            { connectorTriggerHandoff: handoff },
        );

        assert.strictEqual(projectCreated, true);
        assert.deepStrictEqual(
            await readConnectorTriggerProjectHandoff(projectPath),
            handoff,
        );
    });

    test('does not persist trigger parameters or other unrecognized fields', async () => {
        const unsafeHandoff = {
            ...createHandoff(),
            parameters: {
                folder: 'customer-folder',
                secret: 'customer-secret',
            },
        } as ConnectorTriggerProjectHandoff;

        await assertHandoffError(
            writeConnectorTriggerProjectHandoff(projectPath, unsafeHandoff),
            'InvalidSchema',
        );
        assert.strictEqual(
            await AzExtFsExtra.pathExists(
                getConnectorTriggerProjectHandoffPath(projectPath),
            ),
            false,
        );
    });

    test('returns undefined when absent and clears idempotently', async () => {
        assert.strictEqual(
            await readConnectorTriggerProjectHandoff(projectPath),
            undefined,
        );

        await writeConnectorTriggerProjectHandoff(projectPath, createHandoff());
        await clearConnectorTriggerProjectHandoff(projectPath);
        await clearConnectorTriggerProjectHandoff(projectPath);

        assert.strictEqual(
            await readConnectorTriggerProjectHandoff(projectPath),
            undefined,
        );
        assert.strictEqual(
            await AzExtFsExtra.pathExists(path.join(projectPath, '.gitignore')),
            true,
        );
    });

    test('fails explicitly on invalid JSON without disclosing the path', async () => {
        await writeRawHandoff('{');

        const error = await assertHandoffError(
            readConnectorTriggerProjectHandoff(projectPath),
            'InvalidJson',
        );
        assert.ok(!error.message.includes(projectPath));
    });

    test('fails explicitly on unsupported versions and schema changes', async () => {
        await writeRawHandoff(JSON.stringify({
            ...createHandoff(),
            version: connectorTriggerProjectHandoffVersion + 1,
        }));
        await assertHandoffError(
            readConnectorTriggerProjectHandoff(projectPath),
            'UnsupportedVersion',
        );

        await writeRawHandoff(JSON.stringify({
            ...createHandoff(),
            connectionParameters: {},
        }));
        await assertHandoffError(
            readConnectorTriggerProjectHandoff(projectPath),
            'InvalidSchema',
        );
    });

    async function writeRawHandoff(contents: string): Promise<void> {
        const handoffPath = getConnectorTriggerProjectHandoffPath(projectPath);
        await AzExtFsExtra.ensureDir(path.dirname(handoffPath));
        await AzExtFsExtra.writeFile(handoffPath, contents);
    }
});

function createHandoff(): ConnectorTriggerProjectHandoff {
    return {
        version: connectorTriggerProjectHandoffVersion,
        subscription: {
            id: '00000000-0000-0000-0000-000000000000',
            tenantId: '11111111-1111-1111-1111-111111111111',
            environment: {
                name: 'AzureUSGovernment',
                resourceManagerEndpointUrl: 'https://management.usgovcloudapi.net/',
            },
        },
        region: 'usgovvirginia',
        connectorId: 'office365',
        operationId: 'OnNewEmail',
        catalog: {
            source: 'remote',
        },
    };
}

function createProjectTemplate(): IProjectTemplate {
    return {
        id: 'connector-trigger-typescript',
        displayName: 'Connector Trigger',
        shortDescription: 'Connector Trigger project',
        categories: [TemplateCategory.Other],
        languages: [ProjectLanguage.TypeScript],
        repositoryUrl: 'https://example.invalid/connector-trigger',
    };
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

async function assertHandoffError(
    promise: Promise<unknown>,
    code: ConnectorTriggerProjectHandoffErrorCode,
): Promise<ConnectorTriggerProjectHandoffError> {
    try {
        await promise;
    } catch (error) {
        assert.ok(error instanceof ConnectorTriggerProjectHandoffError);
        assert.strictEqual(error.code, code);
        return error;
    }

    assert.fail(`Expected ConnectorTriggerProjectHandoffError with code "${code}".`);
}
