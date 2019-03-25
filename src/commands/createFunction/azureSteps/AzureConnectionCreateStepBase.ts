/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Progress } from 'vscode';
import { AzureWizardExecuteStep } from 'vscode-azureextensionui';
import { setLocalAppSetting } from '../../../LocalAppSettings';
import { localize } from '../../../localize';
import { IFunctionSetting } from '../../../templates/IFunctionSetting';
import { nonNullProp } from '../../../utils/nonNull';
import { IFunctionWizardContext } from '../IFunctionWizardContext';

export interface IConnection {
    name: string;
    connectionString: string;
}

export abstract class AzureConnectionCreateStepBase<T extends IFunctionWizardContext> extends AzureWizardExecuteStep<T> {
    private readonly _setting: IFunctionSetting;

    constructor(setting: IFunctionSetting) {
        super();
        this._setting = setting;
    }

    public abstract async getConnection(wizardContext: T): Promise<IConnection>;

    public async execute(wizardContext: T, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        progress.report({ message: localize('retrieving', 'Retrieving connection string...') });

        const result: IConnection = await this.getConnection(wizardContext);
        const appSettingKey: string = `${result.name}_${nonNullProp(this._setting, 'resourceType').toUpperCase()}`;
        wizardContext[this._setting.name] = appSettingKey;
        await setLocalAppSetting(wizardContext.projectPath, appSettingKey, result.connectionString);
    }
}
