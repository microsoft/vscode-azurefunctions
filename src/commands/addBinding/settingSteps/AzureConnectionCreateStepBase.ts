/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStepWithActivityOutput } from '@microsoft/vscode-azext-utils';
import { type Progress } from 'vscode';
import { setLocalAppSetting } from '../../../funcConfig/local.settings';
import { localize } from '../../../localize';
import { type IBindingSetting } from '../../../templates/IBindingTemplate';
import { type ParsedInput } from '../../../templates/script/parseScriptTemplatesV2';
import { setBindingSetting, type IFunctionWizardContext } from '../../createFunction/IFunctionWizardContext';

export interface IConnection {
    name: string;
    connectionString: string;
}

export abstract class AzureConnectionCreateStepBase<T extends IFunctionWizardContext> extends AzureWizardExecuteStepWithActivityOutput<T> {
    public priority: number = 200;
    stepName = 'azureConnectionCreateStepBase';
    public getTreeItemLabel(_context: T): string {
        return localize('azureConnection', 'Add connection string');
    }
    public getOutputLogSuccess(_context: T): string {
        return localize('azureConnectionSuccess', 'Successfully added connection string.');
    }
    public getOutputLogFail(_context: T): string {
        return localize('azureConnectionFail', 'Failed to add connection string.');
    }
    public getOutputLogProgress(_context: T): string {
        return localize('addingConnectionString', 'Adding connection string...');
    }

    private readonly _setting: IBindingSetting | ParsedInput;
    private readonly _resourceType: string;

    constructor(setting: IBindingSetting | ParsedInput) {
        super();
        this._setting = setting;
        this._resourceType = (setting as IBindingSetting).resourceType ?? (setting as ParsedInput).resource ?? '';
    }

    public abstract getConnection(context: T): Promise<IConnection>;

    public async execute(context: T, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        progress.report({ message: localize('retrieving', 'Retrieving connection string...') });

        const result: IConnection = await this.getConnection(context);
        let appSettingKey: string = `${result.name}_${this._resourceType.toUpperCase()}`;
        appSettingKey = appSettingKey.replace(/[^a-z0-9_\.]/gi, ''); // remove invalid chars
        setBindingSetting(context, this._setting, appSettingKey);
        await setLocalAppSetting(context, context.projectPath, appSettingKey, result.connectionString);
    }
}
