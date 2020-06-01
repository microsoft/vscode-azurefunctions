/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CentralTemplateProvider, FuncVersion, ProjectLanguage, supportedLanguages as resourceLanguages, TemplateProviderBase } from '../extension.bundle';
import { createTestActionContext, testWorkspacePath, updateBackupTemplates } from './global.test';
import { javaUtils } from './utils/javaUtils';

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

        const languages: ProjectLanguage[] = [ProjectLanguage.JavaScript, ProjectLanguage.CSharp, ProjectLanguage.Java];
        for (const language of languages) {
            for (const version of Object.values(FuncVersion)) {
                if (language === ProjectLanguage.Java && version === FuncVersion.v1) {
                    // not supported
                    continue;
                }

                const providers: TemplateProviderBase[] = CentralTemplateProvider.getProviders(testWorkspacePath, language, version);

                for (const provider of providers) {
                    const templateVersion: string = await provider.getLatestTemplateVersion();

                    async function updateBackupTemplatesInternal(): Promise<void> {
                        await provider.getLatestTemplates(createTestActionContext(), templateVersion);
                        await provider.updateBackupTemplates();
                    }

                    if (language === ProjectLanguage.JavaScript) {
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
