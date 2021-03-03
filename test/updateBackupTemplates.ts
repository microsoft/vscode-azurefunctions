/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CentralTemplateProvider, FuncVersion, ProjectLanguage, supportedLanguages as resourceLanguages, TemplateProviderBase } from '../extension.bundle';
import { createTestActionContext, testWorkspacePath, updateBackupTemplates } from './global.test';
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
        await javaUtils.addJavaProjectToWorkspace();

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
                if (!worker.versions?.includes(version)) {
                    continue;
                }

                const providers: TemplateProviderBase[] = CentralTemplateProvider.getProviders(testWorkspacePath, worker.language, version, worker.projectTemplateKey);

                for (const provider of providers) {
                    const templateVersion: string = await provider.getLatestTemplateVersion();

                    async function updateBackupTemplatesInternal(): Promise<void> {
                        await provider.getLatestTemplates(createTestActionContext(), templateVersion);
                        await provider.updateBackupTemplates();
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
