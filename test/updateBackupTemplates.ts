/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext } from '@microsoft/vscode-azext-dev';
import { CentralTemplateProvider, FuncVersion, ProjectLanguage, supportedLanguages as resourceLanguages, type TemplateProviderBase } from '../extension.bundle';
import { getTestWorkspaceFolder, updateBackupTemplates } from './global.test';
import { javaUtils } from './utils/javaUtils';

type WorkerRuntime = { language: ProjectLanguage; projectTemplateKey?: string, versions: FuncVersion[] }

/**
 * This is not actually a test, but a tool for updating backup templates.
 * The benefit of running as a test (as opposed to for example a gulp task) is that it can run within the context of VS Code and our extension
 * Set the environment variable `AZFUNC_UPDATE_BACKUP_TEMPLATES` to `1` to run this
 */
suite('Backup templates', () => {
    suiteSetup(async function (this: Mocha.Context): Promise<void> {
        if (!updateBackupTemplates) {
            this.skip();
        }
    });

    test('Update', async () => {
        const testWorkspacePath = getTestWorkspaceFolder();
        await javaUtils.addJavaProjectToWorkspace(testWorkspacePath);

        const allVersions = Object.values(FuncVersion);
        const workers: WorkerRuntime[] = [
            { language: ProjectLanguage.JavaScript, versions: allVersions },
            { language: ProjectLanguage.CSharp, versions: [FuncVersion.v1] },
            { language: ProjectLanguage.CSharp, projectTemplateKey: 'net6.0', versions: [FuncVersion.v4] },
            { language: ProjectLanguage.CSharp, projectTemplateKey: 'net6.0-isolated', versions: [FuncVersion.v4] },
            { language: ProjectLanguage.CSharp, projectTemplateKey: 'net7.0-isolated', versions: [FuncVersion.v4] },
            { language: ProjectLanguage.Java, versions: [FuncVersion.v4] }
        ];

        for (const worker of workers) {
            for (const version of Object.values(FuncVersion)) {
                if (!worker.versions?.includes(version)) {
                    continue;
                }

                /* Currently doesn't back up v2 schema templates */
                const providers: TemplateProviderBase[] = CentralTemplateProvider.getProviders(testWorkspacePath, worker.language, undefined, version, worker.projectTemplateKey);

                const context = await createTestActionContext();
                for (const provider of providers) {
                    const templateVersion: string = await provider.getLatestTemplateVersion(context);

                    async function updateBackupTemplatesInternal(): Promise<void> {
                        await provider.getLatestTemplates(context, templateVersion);
                        await provider.updateBackupTemplates(context);
                    }

                    if (worker.language === ProjectLanguage.JavaScript) {
                        for (const resourcesLanguage of resourceLanguages) {
                            provider.resourcesLanguage = resourcesLanguage;
                            await updateBackupTemplatesInternal();
                        }
                    } else {
                        await updateBackupTemplatesInternal();
                    }

                    await provider.updateBackupTemplateVersion(templateVersion);
                }
            }
        }
    });
});
