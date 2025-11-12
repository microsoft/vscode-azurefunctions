/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type TaskDefinition } from 'vscode';
import { type ProjectLanguage } from '../../../constants';
import { type MCPProjectWizardContext } from '../../createNewProject/IProjectWizardContext';
import { InitVSCodeStepBase } from './InitVSCodeStepBase';

export class MCPServerInitVSCodeStep extends InitVSCodeStepBase {
    stepName: string = 'MCPServerInitVSCodeStep';

    public constructor() {
        super();
    }

    public getTasks(_language: ProjectLanguage): TaskDefinition[] {
        return [{
            "type": "func",
            "label": "func: host start",
            "command": "host start",
            "problemMatcher": "$func-watch",
            "isBackground": true
        }];
    }

    protected async executeCore(context: MCPProjectWizardContext): Promise<void> {
        // the VSCode project language setting needs to match the server runtime, not SelfHostedMCPServer
        context.language = context.serverLanguage;
    }
}
