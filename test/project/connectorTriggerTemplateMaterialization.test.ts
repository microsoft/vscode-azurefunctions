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
import { getConnectorTriggerEventIdentity } from '../../src/connectorTrigger/connectorTriggerEventIdentity';
import {
    parseConnectorTriggerOutputMetadata,
    type ConnectorTriggerOutputMetadata,
} from '../../src/connectorTrigger/connectorTriggerOutputSchema';
import { type ConnectorTriggerSelection } from '../../src/connectorTrigger/connectorTriggerSelection';
import { getGenericConnectorTriggerTemplate } from '../../src/connectorTrigger/genericConnectorTriggerTemplates';
import { materializeConnectorTriggerTemplate } from '../../src/connectorTrigger/materializeConnectorTriggerTemplate';
import { ProjectLanguage } from '../../src/constants';
import {
    findConnectorTriggerRegistrations,
    findPollingConnectorBindings,
    getPollingConnectorBindings,
} from '../../src/connectorTrigger/connectorTriggerBindings';
import {
    TemplateCategory,
    type IProjectTemplate,
    type ITemplateManifest,
} from '../../src/templates/projectTemplates/IProjectTemplate';
import { ProjectTemplateProvider } from '../../src/templates/projectTemplates/ProjectTemplateProvider';
import { cpUtils } from '../../src/utils/cpUtils';
import { envUtils } from '../../src/utils/envUtils';

const realTemplateTestsEnabled = envUtils.isEnvironmentVariableSet(
    process.env.AZFUNC_TEST_REAL_CONNECTOR_TEMPLATES,
);
const buildGenericTemplateTestsEnabled = envUtils.isEnvironmentVariableSet(
    process.env.AZFUNC_TEST_BUILD_GENERIC_TEMPLATES,
);

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

    test('ProjectTemplateCreator produces one selected Poll registration', async () => {
        const creator = createTestCreator();

        await creator.createProject(
            await createTestActionContext(),
            createTemplate(),
            ProjectLanguage.TypeScript,
            projectPath,
            'details',
            { connectorTriggerSelection: createSelection() },
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

    test('ProjectTemplateCreator rejects connector templates without ownership metadata', async () => {
        let downloaded = false;
        const creator = createTestCreator(() => {
            downloaded = true;
        });
        const template = createTemplate();
        delete template.connectorTrigger;

        await assert.rejects(
            creator.createProject(
                await createTestActionContext(),
                template,
                ProjectLanguage.TypeScript,
                projectPath,
                'details',
                { connectorTriggerSelection: createSelection() },
            ),
            /missing operation ownership metadata/,
        );
        assert.strictEqual(downloaded, false);
        assert.deepStrictEqual(await AzExtFsExtra.readDirectory(projectPath), []);
        assert.strictEqual(
            await AzExtFsExtra.pathExists(
                path.join(projectPath, 'src', 'functions', 'connectorTriggerFunction.ts'),
            ),
            false,
        );
    });

    test('ProjectTemplateProvider preserves remote connector ownership', async () => {
        const remoteTemplate = createTemplate();
        remoteTemplate.gitRef = 'refs/tags/remote-contract';
        remoteTemplate.folderPath = 'remote-template-root';
        remoteTemplate.repositoryUrl = 'https://example.invalid/remote-template';
        const provider = new ProjectTemplateProvider() as unknown as {
            getTemplates(
                context: IActionContext,
                language?: ProjectLanguage,
            ): Promise<IProjectTemplate[]>;
            getManifest(): Promise<ITemplateManifest>;
        };
        provider.getManifest = async () => ({
            version: '1.0.0',
            generatedAt: '2026-01-01T00:00:00Z',
            templates: [remoteTemplate],
        });
        const context = await createTestActionContext();

        const [template] = await provider.getTemplates(
            context,
            ProjectLanguage.TypeScript,
        );

        assert.strictEqual(template.gitRef, 'refs/tags/remote-contract');
        assert.strictEqual(template.folderPath, 'remote-template-root');
        assert.strictEqual(
            template.repositoryUrl,
            'https://example.invalid/remote-template',
        );
        assert.deepStrictEqual(
            template.connectorTrigger,
            remoteTemplate.connectorTrigger,
        );
    });

    test('ProjectTemplateProvider does not use an offline manifest when the remote fetch fails', async () => {
        const provider = new ProjectTemplateProvider() as unknown as {
            getManifest(context: IActionContext): Promise<ITemplateManifest>;
            fetchManifestFromRemote(context: IActionContext): Promise<ITemplateManifest>;
        };
        provider.fetchManifestFromRemote = async () => {
            throw new Error('Remote manifest unavailable.');
        };
        const context = await createTestActionContext();

        await assert.rejects(
            provider.getManifest(context),
            /Remote manifest unavailable/,
        );
        assert.strictEqual(
            context.telemetry.properties.manifestSource,
            'remote',
        );
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

    (realTemplateTestsEnabled ? test : test.skip)(
        'production provider and creator materialize pinned real templates',
        async function (this: Mocha.Context): Promise<void> {
            this.timeout(10 * 60 * 1000);
            const provider = await createIntegrationProvider();
            const cases: {
                connectorId: string;
                gitRepeats: number;
                language: ProjectLanguage;
                operationId: string;
                templateId: string;
                triggerConfigSettingName: string;
            }[] = [{
                connectorId: 'office365',
                gitRepeats: 3,
                language: ProjectLanguage.TypeScript,
                operationId: 'OnNewEmailV3',
                templateId: 'office365-connector-trigger-typescript',
                triggerConfigSettingName: 'ConnectorTriggerConfigName',
            }, {
                connectorId: 'sharepointonline',
                gitRepeats: 1,
                language: ProjectLanguage.Python,
                operationId: 'GetOnNewFileItems',
                templateId: 'sharepoint-connector-trigger-python',
                triggerConfigSettingName: 'ConnectorTriggerConfigName',
            }, {
                connectorId: 'office365',
                gitRepeats: 1,
                language: ProjectLanguage.CSharp,
                operationId: 'OnUpcomingEventsV3',
                templateId: 'office365-connector-trigger-csharp',
                triggerConfigSettingName: 'OnUpcomingEventTriggerConfigName',
            }];

            for (const testCase of cases) {
                const context = await createTestActionContext();
                const template = (await provider.getTemplates(
                    context,
                    testCase.language,
                )).find(candidate => candidate.id === testCase.templateId);
                assert.ok(template, `Missing template ${testCase.templateId}`);
                assert.match(template.gitRef ?? '', /^[a-f\d]{40}$/i);

                for (const transport of ['git', 'zip'] as const) {
                    const repeats = transport === 'git' ? testCase.gitRepeats : 1;
                    for (let iteration = 0; iteration < repeats; iteration++) {
                        const destination = path.join(
                            projectPath,
                            `${testCase.templateId}-${transport}-${iteration}`,
                        );
                        const creator = createIntegrationCreator(transport === 'git');
                        await creator.createProject(
                            await createTestActionContext(),
                            template,
                            testCase.language,
                            destination,
                            'details',
                            {
                                connectorTriggerSelection: createSelection(
                                    testCase.connectorId,
                                    testCase.operationId,
                                ),
                            },
                        );
                        await assertMaterializedOperation(
                            destination,
                            template,
                            testCase.operationId,
                            testCase.triggerConfigSettingName,
                        );
                    }
                }
            }
        },
    );

    (realTemplateTestsEnabled ? test : test.skip)(
        'genericApp templates materialize unmapped selections',
        async function (this: Mocha.Context): Promise<void> {
            this.timeout(10 * 60 * 1000);
            const cases = [
                ProjectLanguage.CSharp,
                ProjectLanguage.TypeScript,
                ProjectLanguage.Python,
            ];
            const selections = [{
                connectorId: 'act',
                fixture: 'actTrigNewContactSwagger.json',
                operationId: 'TrigNewContact',
            }, {
                connectorId: 'rss',
                fixture: 'rssOnNewFeedSwagger.json',
                operationId: 'OnNewFeed',
            }, {
                connectorId: 'customconnector',
                operationId: 'OnCustomPollEvent',
            }];

            for (const language of cases) {
                const template = getGenericConnectorTriggerTemplate(language);
                assert.ok(template, `Missing generic template for ${language}`);
                for (let index = 0; index < selections.length; index++) {
                    const selection = selections[index];
                    const destination = path.join(
                        projectPath,
                        `${template.id}-${index}`,
                    );
                    const creator = createIntegrationCreator(index === 0);
                    const projectSelection = createSelection(
                        selection.connectorId,
                        selection.operationId,
                    );
                    const outputMetadata = selection.fixture ?
                        parseConnectorTriggerOutputMetadata(
                            await readConnectorFixture(selection.fixture),
                            selection.operationId,
                        ) :
                        {
                            limitation: 'definition-unavailable' as const,
                        };
                    try {
                        await creator.createProject(
                            await createTestActionContext(),
                            template,
                            language,
                            destination,
                            'details',
                            {
                                connectorTriggerSelection: projectSelection,
                                connectorTriggerOutputMetadata: outputMetadata,
                            },
                        );
                    } catch (error) {
                        throw new Error(
                            `Generic template failed for ${language} case ${index}.`,
                            { cause: error },
                        );
                    }
                    await assertGenericMaterialized(
                        destination,
                        language,
                        projectSelection,
                        outputMetadata,
                    );
                    if (index < 2 && buildGenericTemplateTestsEnabled) {
                        await buildGenericTemplate(destination, language);
                    }
                }
            }
        },
    );
});

function createTestCreator(onDownload?: () => void): TestableProjectTemplateCreator {
    const creator = new ProjectTemplateCreator() as unknown as TestableProjectTemplateCreator;
    creator.confirmTargetNotEmpty = async () => undefined;
    creator.isGitInstalled = async () => false;
    creator.downloadAndExtractZip = async (
        _context,
        _repositoryUrl,
        _archiveRef,
        destination,
    ) => {
        onDownload?.();
        await createOperationFixture(destination);
    };
    creator.tryOpenReadme = async () => undefined;
    creator.promptAndOpenProject = async () => undefined;
    return creator;
}

function createIntegrationCreator(useGit: boolean): TestableProjectTemplateCreator {
    const creator = new ProjectTemplateCreator() as unknown as TestableProjectTemplateCreator;
    creator.confirmTargetNotEmpty = async () => undefined;
    creator.isGitInstalled = async () => useGit;
    creator.tryOpenReadme = async () => undefined;
    creator.promptAndOpenProject = async () => undefined;
    return creator;
}

async function createIntegrationProvider(): Promise<ProjectTemplateProvider> {
    const remoteManifest: ITemplateManifest = {
        version: 'test',
        generatedAt: '2026-11-09T00:00:00Z',
        templates: Object.entries(getExpectedConnectorTemplates()).map(
            ([id, contract]): IProjectTemplate => ({
                id,
                displayName: id,
                shortDescription: 'Connector Trigger project',
                categories: [TemplateCategory.Other],
                languages: [
                    id.endsWith('-csharp') ?
                        ProjectLanguage.CSharp :
                        id.endsWith('-python') ?
                            ProjectLanguage.Python :
                            ProjectLanguage.TypeScript,
                ],
                ...contract,
            }),
        ),
    };

    const provider = new ProjectTemplateProvider() as unknown as {
        getManifest(context: IActionContext): Promise<ITemplateManifest>;
    };
    provider.getManifest = async context => {
        context.telemetry.properties.manifestSource = 'remote';
        return remoteManifest;
    };
    return provider as unknown as ProjectTemplateProvider;
}

async function readConnectorFixture(name: string): Promise<unknown> {
    return JSON.parse(await fs.promises.readFile(
        path.join(
            __dirname,
            '..',
            '..',
            'test',
            'fixtures',
            'connectorTriggerPicker',
            name,
        ),
        'utf8',
    ));
}

async function assertMaterializedOperation(
    root: string,
    template: IProjectTemplate,
    operationId: string,
    triggerConfigSettingName: string,
): Promise<void> {
    assert.ok(template.connectorTrigger);
    const selected = template.connectorTrigger.operations.find(operation =>
        operation.operationId === operationId);
    assert.ok(selected, `Missing ownership metadata for ${operationId}`);

    for (const operation of template.connectorTrigger.operations) {
        for (const ownedPath of operation.ownedPaths) {
            assert.strictEqual(
                await AzExtFsExtra.pathExists(path.join(root, ...ownedPath.split('/'))),
                operation === selected,
                `${operation.operationId}: ${ownedPath}`,
            );
        }
    }
    assert.strictEqual(
        await AzExtFsExtra.pathExists(path.join(root, 'host.json')),
        true,
    );
    assert.deepStrictEqual(
        await findConnectorTriggerRegistrations(root),
        [selected.functionName],
    );
    assert.deepStrictEqual(
        await findPollingConnectorBindings(root),
        [{
            connectionSettingName: 'ConnectorNamespace',
            functionName: selected.functionName,
            triggerConfigSettingName,
        }],
    );
}

async function assertGenericMaterialized(
    root: string,
    language: ProjectLanguage,
    selection: ConnectorTriggerSelection,
    outputMetadata: ConnectorTriggerOutputMetadata,
): Promise<void> {
    const identity = getConnectorTriggerEventIdentity(
        selection.connectorId,
        selection.operationId,
    );
    assert.deepStrictEqual(
        await findConnectorTriggerRegistrations(root),
        [identity.functionName],
    );
    assert.deepStrictEqual(
        await findPollingConnectorBindings(root),
        [{
            connectionSettingName: 'ConnectorNamespace',
            functionName: identity.functionName,
            triggerConfigSettingName: identity.triggerConfigSettingName,
        }],
    );
    assert.strictEqual(
        await AzExtFsExtra.pathExists(
            path.join(root, '.azure-functions', 'connector-trigger.json'),
        ),
        false,
    );
    assert.strictEqual(
        await AzExtFsExtra.pathExists(path.join(root, 'host.json')),
        true,
    );
    const readme = (await AzExtFsExtra.readFile(
        path.join(root, 'README.md'),
    )).toString();
    assert.ok(readme.includes(identity.operationId));
    assert.ok(!readme.includes('OnGenericCustomConnectorEvent'));
    assert.ok(readme.includes('not created by this authoring flow'));

    if (language === ProjectLanguage.TypeScript) {
        const functionsPath = path.join(root, 'src', 'functions');
        assert.deepStrictEqual(
            (await AzExtFsExtra.readDirectory(functionsPath)).map(entry => entry.name),
            [identity.typescriptFileName],
        );
        const source = (await AzExtFsExtra.readFile(
            path.join(functionsPath, identity.typescriptFileName),
        )).toString();
        const packageJson = JSON.parse((await AzExtFsExtra.readFile(
            path.join(root, 'package.json'),
        )).toString()) as {
            dependencies?: Record<string, string>;
            name: string;
        };
        assert.strictEqual(packageJson.name, identity.packageName);
        assert.match(
            (await AzExtFsExtra.readFile(path.join(root, 'azure.yaml'))).toString(),
            new RegExp(`^name: ${identity.projectName}$`, 'm'),
        );
        assert.match(source, new RegExp(`'${identity.functionName}'`));
        if (identity.payloadModel?.typescript) {
            assert.ok(source.includes(identity.payloadModel.typescript.importName));
            assert.ok(source.includes(identity.payloadModel.typescript.importPath));
            assert.ok(!source.includes('Record<string, unknown>'));
            assert.strictEqual(
                packageJson.dependencies?.['@typespec/ts-http-runtime'],
                '0.3.9',
            );
        } else if (outputMetadata.schema) {
            assert.ok(source.includes(
                `interface ${outputMetadata.schema.modelName}For${identity.pascalName}`,
            ));
            assert.ok(!source.includes('Record<string, unknown>'));
            assert.ok(readme.includes(outputMetadata.schema.schemaName));
        } else {
            assert.match(
                source,
                new RegExp(`type ${identity.pascalName}Item = Record<string, unknown>`),
            );
            assert.ok(readme.includes('Output schema definition-unavailable'));
        }
        assert.ok(!source.includes('OnGeneric'));
        assert.strictEqual(
            await AzExtFsExtra.pathExists(path.join(root, 'infra', 'main.bicep')),
            true,
        );
        await assertGenericSampleSettingsRemoved(root);
    } else if (language === ProjectLanguage.Python) {
        const source = (await AzExtFsExtra.readFile(
            path.join(root, 'function_app.py'),
        )).toString();
        const requirements = (await AzExtFsExtra.readFile(
            path.join(root, 'requirements.txt'),
        )).toString();
        assert.match(source, /payloads: List\[str\]/);
        assert.ok(source.includes(`name="${identity.functionName}"`));
        assert.ok(source.includes(`def ${identity.pythonFunctionName}`));
        assert.ok(!source.includes('OnGeneric'));
        assert.match(requirements, /^azure-functions>=2\.4\.0b1$/m);
        if (identity.payloadModel?.python) {
            assert.ok(source.includes(identity.payloadModel.python.importName));
            assert.ok(source.includes('"ActionType": "action_type"'));
            assert.ok(!source.includes('IsDeleted'));
            assert.match(requirements, /^azure-connectors==0\.1\.0$/m);
        } else if (outputMetadata.schema) {
            assert.ok(source.includes(
                `class ${outputMetadata.schema.modelName}For${identity.pascalName}:`,
            ));
            assert.ok(source.includes('payloads: List[str]'));
            assert.ok(readme.includes(outputMetadata.schema.schemaName));
            assert.ok(!requirements.includes('azure-connectors'));
        } else {
            assert.ok(!requirements.includes('azure-connectors'));
            assert.ok(readme.includes('Output schema definition-unavailable'));
        }
        assert.strictEqual(
            await AzExtFsExtra.pathExists(path.join(root, 'azure.yaml')),
            true,
        );
        assert.match(
            (await AzExtFsExtra.readFile(path.join(root, 'azure.yaml'))).toString(),
            new RegExp(`^name: ${identity.projectName}$`, 'm'),
        );
        await assertGenericSampleSettingsRemoved(root);
    } else {
        const sourcePath = path.join(root, identity.csharpFileName);
        const source = (await AzExtFsExtra.readFile(
            sourcePath,
        )).toString();
        const project = (await AzExtFsExtra.readFile(
            path.join(root, `${identity.pascalName}.csproj`),
        )).toString();
        assert.ok(source.includes(`namespace ${identity.csharpNamespace};`));
        assert.ok(source.includes(`[Function("${identity.functionName}")]`));
        if (identity.payloadModel?.csharp) {
            assert.ok(source.includes(identity.payloadModel.csharp.payloadType));
            assert.ok(project.includes(identity.payloadModel.csharp.packageName));
            assert.ok(!source.includes('string payload'));
        } else if (outputMetadata.schema) {
            assert.match(source, /\]\s*string payload\)/);
            assert.ok(source.includes(
                `class ${outputMetadata.schema.modelName}For${identity.pascalName}`,
            ));
            assert.ok(source.includes('JsonSerializer.Deserialize'));
            assert.ok(readme.includes(outputMetadata.schema.schemaName));
            assert.ok(!project.includes('Azure.Connectors.Sdk'));
        } else {
            assert.match(source, /\]\s*string payload\)/);
            assert.ok(!project.includes('Azure.Connectors.Sdk'));
            assert.ok(readme.includes('Output schema definition-unavailable'));
        }
        assert.ok(!source.includes('OnGeneric'));
        assert.strictEqual(
            await AzExtFsExtra.pathExists(path.join(root, 'GenericFunctions.cs')),
            false,
        );
        assert.strictEqual(
            await AzExtFsExtra.pathExists(
                path.join(root, 'functions-connectors-net.csproj'),
            ),
            false,
        );
        assert.match(
            project,
            /Microsoft\.Azure\.Functions\.Worker\.Extensions\.Connector"\s+Version="1\.0\.0"/,
        );
        assert.strictEqual(
            await AzExtFsExtra.pathExists(path.join(root, 'Program.cs')),
            true,
        );
    }
}

async function assertGenericSampleSettingsRemoved(root: string): Promise<void> {
    const settings = JSON.parse((await AzExtFsExtra.readFile(
        path.join(root, 'local.settings.json'),
    )).toString()) as { Values?: Record<string, unknown> };
    assert.deepStrictEqual(
        Object.keys(settings.Values ?? {}).filter(key =>
            /^(?:AzureBlob|Office365|Sharepoint|Teams)|_TOKEN$/.test(key)),
        [],
    );
}

async function buildGenericTemplate(
    root: string,
    language: ProjectLanguage,
): Promise<void> {
    if (language === ProjectLanguage.TypeScript) {
        await cpUtils.executeCommand(undefined, root, 'npm', ['install']);
        await cpUtils.executeCommand(
            undefined,
            root,
            'node',
            [path.join('node_modules', 'typescript', 'bin', 'tsc')],
        );
    } else if (language === ProjectLanguage.Python) {
        const python = process.env.AZFUNC_TEST_PYTHON || 'python';
        await cpUtils.executeCommand(
            undefined,
            root,
            python,
            [
                '-m',
                'pip',
                'install',
                '--quiet',
                '--target',
                path.join('.python_packages', 'lib', 'site-packages'),
                '-r',
                'requirements.txt',
            ],
        );
        await cpUtils.executeCommand(
            undefined,
            root,
            python,
            ['-m', 'compileall', '-q', '.'],
        );
        const importProbe = path.join(root, '.test_import.py');
        try {
            await AzExtFsExtra.writeFile(
                importProbe,
                `import sys
sys.path.insert(0, ".python_packages/lib/site-packages")
import function_app
`,
            );
            await cpUtils.executeCommand(
                undefined,
                root,
                python,
                [importProbe],
            );
        } finally {
            if (await AzExtFsExtra.pathExists(importProbe)) {
                await AzExtFsExtra.deleteResource(importProbe, {
                    recursive: false,
                    useTrash: false,
                });
            }
        }
    } else {
        await cpUtils.executeCommand(
            undefined,
            root,
            'dotnet',
            ['build', '--nologo'],
        );
    }
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

function createSelection(
    connectorId = 'office365',
    operationId = 'OnNewEmailV3',
): ConnectorTriggerSelection {
    return {
        connectorId,
        operationId,
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
