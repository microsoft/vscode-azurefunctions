/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as os from 'os';
import * as path from 'path';
import { type Progress } from 'vscode';
import { FuncVersion } from '../../../FuncVersion';
import { gitignoreFileName, hostFileName, localSettingsFileName, workerRuntimeKey } from '../../../constants';
import { type IHostJsonV1, type IHostJsonV2 } from '../../../funcConfig/host';
import { type ILocalSettingsJson } from '../../../funcConfig/local.settings';
import { bundleFeedUtils } from '../../../utils/bundleFeedUtils';
import { confirmOverwriteFile } from "../../../utils/fs";
import { nonNullProp } from '../../../utils/nonNull';
import { isNodeV4Plus, isPythonV2Plus } from '../../../utils/programmingModelUtils';
import { getRootFunctionsWorkerRuntime } from '../../../vsCodeConfig/settings';
import { type IProjectWizardContext } from '../IProjectWizardContext';
import { ProjectCreateStepBase } from './ProjectCreateStepBase';

export class ScriptProjectCreateStep extends ProjectCreateStepBase {
    protected funcignore: string[] = ['__blobstorage__', '__queuestorage__', '__azurite_db*__.json', '.git*', '.vscode', 'local.settings.json', 'test'];
    protected gitignore: string = '';
    protected localSettingsJson: ILocalSettingsJson = {
        IsEncrypted: false,
        Values: {
            AzureWebJobsStorage: ''
        }
    };

    public async executeCore(context: IProjectWizardContext, _progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        const version: FuncVersion = nonNullProp(context, 'version');
        const hostJsonPath: string = path.join(context.projectPath, hostFileName);
        if (await confirmOverwriteFile(context, hostJsonPath)) {
            const hostJson: IHostJsonV2 | IHostJsonV1 = version === FuncVersion.v1 ? {} : await this.getHostContent(context);
            await AzExtFsExtra.writeJSON(hostJsonPath, hostJson);
        }

        const localSettingsJsonPath: string = path.join(context.projectPath, localSettingsFileName);
        if (await confirmOverwriteFile(context, localSettingsJsonPath)) {
            const functionsWorkerRuntime: string | undefined = getRootFunctionsWorkerRuntime(context.language);
            if (functionsWorkerRuntime) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                this.localSettingsJson.Values![workerRuntimeKey] = functionsWorkerRuntime;
            }

            await AzExtFsExtra.writeJSON(localSettingsJsonPath, this.localSettingsJson);
        }

        const gitignorePath: string = path.join(context.projectPath, gitignoreFileName);
        if (await confirmOverwriteFile(context, gitignorePath)) {
            await AzExtFsExtra.writeFile(gitignorePath, this.gitignore.concat(`
# Azure Functions artifacts
bin
obj
appsettings.json
local.settings.json

# Azurite artifacts
__blobstorage__
__queuestorage__
__azurite_db*__.json`));
        }

        const funcIgnorePath: string = path.join(context.projectPath, '.funcignore');
        if (await confirmOverwriteFile(context, funcIgnorePath)) {
            await AzExtFsExtra.writeFile(funcIgnorePath, this.funcignore.sort().join(os.EOL));
        }
    }

    protected async getHostContent(context: IProjectWizardContext): Promise<IHostJsonV2> {
        const hostJson: IHostJsonV2 = {
            version: '2.0',
            logging: {
                applicationInsights: {
                    samplingSettings: {
                        isEnabled: true,
                        excludedTypes: 'Request'
                    }
                }
            }
        };

        await bundleFeedUtils.addDefaultBundle(context, hostJson);

        // new programming models need to have a higher version of the extension bundle
        if (isPythonV2Plus(context.language, context.languageModel) && isNodeV4Plus(context)) {
            bundleFeedUtils.overwriteExtensionBundleVersion(hostJson, "[3.*, 4.0.0)", "[4.*, 5.0.0)");
        }

        return hostJson;
    }
}
