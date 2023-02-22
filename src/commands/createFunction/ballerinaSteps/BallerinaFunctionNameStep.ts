/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import { localize } from "../../../localize";
import { IFunctionTemplate } from '../../../templates/IFunctionTemplate';
import { nonNullProp } from '../../../utils/nonNull';
import { getBallerinaFunctionFilePath, getBallerinaPackagePath, IBallerinaProjectWizardContext } from '../../createNewProject/ballerinaSteps/IBallerinaProjectWizardContext';
import { FunctionNameStepBase } from '../FunctionNameStepBase';
import { IFunctionWizardContext } from '../IFunctionWizardContext';

export class BallerinaFunctionNameStep extends FunctionNameStepBase<IFunctionWizardContext & IBallerinaProjectWizardContext> {
    protected async getUniqueFunctionName(context: IFunctionWizardContext & IBallerinaProjectWizardContext): Promise<string | undefined> {
        const template: IFunctionTemplate = nonNullProp(context, 'functionTemplate');
        return await this.getUniqueFsPath(getBallerinaPackagePath(context.projectPath), template.defaultFunctionName, '.bal');
    }

    protected async validateFunctionNameCore(context: IFunctionWizardContext & IBallerinaProjectWizardContext, name: string): Promise<string | undefined> {
        if (await AzExtFsExtra.pathExists(getBallerinaFunctionFilePath(context.projectPath, name))) {
            return localize('existingError', 'A function with name "{0}" already exists in package "{1}".', name);
        } else {
            return undefined;
        }
    }
}
