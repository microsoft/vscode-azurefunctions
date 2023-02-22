/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { Progress } from 'vscode';
import { BallerinaBackend, ballerinaTomlFileName } from '../../../constants';
import { ballerinaUtils } from '../../../utils/ballerinaUtils';
import { confirmOverwriteFile } from '../../../utils/fs';
import { IBallerinaProjectWizardContext } from '../ballerinaSteps/IBallerinaProjectWizardContext';
import { ScriptProjectCreateStep } from './ScriptProjectCreateStep';

export class BallerinaProjectCreateStep extends ScriptProjectCreateStep {
    protected gitignore: string = ballerinaGitIgnore;

    public async executeCore(context: IBallerinaProjectWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        await ballerinaUtils.validateBallerinaInstalled(context);
        await super.executeCore(context, progress);

        const ballerinaTomlPath: string = path.join(context.projectPath, ballerinaTomlFileName);
        if (await confirmOverwriteFile(context, ballerinaTomlPath)) {
            await AzExtFsExtra.writeFile(ballerinaTomlPath, await this.getBallerinaTomlContent(context));
        }
    }

    async getBallerinaTomlContent(context: IBallerinaProjectWizardContext): Promise<string> {
        return `[package]
org="${context.balOrgName}"
name="${context.balPackageName}"
version="${context.balVersion}"

[build-options]
observabilityIncluded=true
cloud="azure_functions"
${context.balBackend === BallerinaBackend.native ? 'native=true' : ''}
`;
    }
}

const ballerinaGitIgnore: string = `target/`;

