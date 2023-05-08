/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import { Progress } from 'vscode';
import { BallerinaBackend, ballerinaTomlFileName } from '../../../constants';
import { ballerinaUtils } from '../../../utils/ballerinaUtils';
import { IBallerinaProjectWizardContext } from '../ballerinaSteps/IBallerinaProjectWizardContext';
import { ScriptProjectCreateStep } from './ScriptProjectCreateStep';
import path = require('path');

export class BallerinaProjectCreateStep extends ScriptProjectCreateStep {
    protected gitignore: string = ballerinaGitIgnore;

    public async executeCore(context: IBallerinaProjectWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        await ballerinaUtils.getBallerinaVersion(context);
        const ballerinaTomlPath: string = path.join(context.projectPath, ballerinaTomlFileName);

        // Having a Ballerina.toml file specifies a Ballerina project. If it doesn't exist, create one using the 'bal init' command.
        if (!await AzExtFsExtra.pathExists(ballerinaTomlPath)) {
            await ballerinaUtils.executeInit(context);
            let ballerinaTomlContents: string = await AzExtFsExtra.readFile(ballerinaTomlPath);
            const buildOptions: string = await this.getBuildOptions(context);
            ballerinaTomlContents = ballerinaTomlContents + buildOptions;
            await AzExtFsExtra.writeFile(ballerinaTomlPath, ballerinaTomlContents);
        }
        await super.executeCore(context, progress);
    }

    async getBuildOptions(context: IBallerinaProjectWizardContext): Promise<string> {
        return `cloud="azure_functions"
${context.balBackend === BallerinaBackend.native ? 'native=true' : ''}`;
    }
}

const ballerinaGitIgnore: string = `target/`;

