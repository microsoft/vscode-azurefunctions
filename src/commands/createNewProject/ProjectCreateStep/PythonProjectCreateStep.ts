/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import * as semver from 'semver';
import { type Progress } from 'vscode';
import { requirementsFileName } from '../../../constants';
import { getLocalFuncCoreToolsVersion } from '../../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { confirmOverwriteFile } from '../../../utils/fs';
import { type IProjectWizardContext } from '../IProjectWizardContext';
import { ScriptProjectCreateStep } from './ScriptProjectCreateStep';
import { pythonGitignore } from './scriptProjectIgnoreFiles';

// Starting after this version, the func cli does not require a virtual environment and comes pre-packaged with the below dependencies
const oldFuncVersion: string = '2.4.419';
const oldRequirements: string = `azure-functions==1.0.0b3
azure-functions-worker==1.0.0b4
grpcio==1.14.2
grpcio-tools==1.14.2
protobuf==3.7.1
six==1.12.0
`;

const defaultRequirements: string = `# Uncomment to enable Azure Monitor OpenTelemetry
# Ref: aka.ms/functions-azure-monitor-python
# azure-monitor-opentelemetry

azure-functions
`;

export class PythonProjectCreateStep extends ScriptProjectCreateStep {
    protected gitignore: string = pythonGitignore;

    public async executeCore(context: IProjectWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        await super.executeCore(context, progress);

        const requirementsPath: string = path.join(context.projectPath, requirementsFileName);
        if (await confirmOverwriteFile(context, requirementsPath)) {
            let isOldFuncCli: boolean;
            try {
                const currentVersion: string | null = await getLocalFuncCoreToolsVersion(context, context.workspacePath);
                isOldFuncCli = !!currentVersion && semver.lte(currentVersion, oldFuncVersion);
            } catch {
                isOldFuncCli = false;
            }

            await AzExtFsExtra.writeFile(requirementsPath, isOldFuncCli ? oldRequirements : defaultRequirements);
        }
    }
}
