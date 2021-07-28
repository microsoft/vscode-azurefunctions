/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext } from 'vscode-azureextensiondev';
import { CentralTemplateProvider, FuncVersion, ProjectLanguage, supportedLanguages as resourceLanguages, TemplateProviderBase } from '../extension.bundle';
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
            { language: ProjectLanguage.CSharp, versions: [FuncVersion.v1, FuncVersion.v2] },
            { language: ProjectLanguage.CSharp, projectTemplateKey: 'netcoreapp3.1', versions: [FuncVersion.v3] },
            { language: ProjectLanguage.CSharp, projectTemplateKey: 'net5.0-isolated', versions: [FuncVersion.v3] },
            { language: ProjectLanguage.Java, versions: [FuncVersion.v2, FuncVersion.v3] }
        ];

        for (const worker of workers) {
            for (const version of Object.values(FuncVersion)) {
                if (version === FuncVersion.v4) {
                    // v4 doesn't have templates yet
                    continue;
                }

                if (!worker.versions?.includes(version)) {
                    continue;
                }

                const providers: TemplateProviderBase[] = CentralTemplateProvider.getProviders(testWorkspacePath, worker.language, version, worker.projectTemplateKey);

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
