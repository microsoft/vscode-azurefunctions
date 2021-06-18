/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Progress } from 'vscode';
import { AzureWizardExecuteStep } from 'vscode-azureextensionui';
import { localSettingsFileName } from '../../../constants';
import { setLocalAppSetting } from '../../../funcConfig/local.settings';
import { localize } from '../../../localize';
import { IBindingSetting } from '../../../templates/IBindingTemplate';
import { nonNullProp, nonNullValue } from '../../../utils/nonNull';
import { getBindingSetting } from '../../createFunction/IFunctionWizardContext';
import { IBindingWizardContext } from '../IBindingWizardContext';

export class LocalAppSettingCreateStep extends AzureWizardExecuteStep<IBindingWizardContext> {
    public priority: number = 210;

    private readonly _setting: IBindingSetting;
    private readonly _valueKey: string;

    constructor(setting: IBindingSetting, valueKey: string) {
        super();
        this._setting = setting;
        this._valueKey = valueKey;
    }

    public async execute(context: IBindingWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        progress.report({ message: localize('updatingLocalSettings', 'Updating {0}...', localSettingsFileName) });
        const appSettingName = String(nonNullValue(getBindingSetting(context, this._setting), this._setting.name));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await setLocalAppSetting(context, context.projectPath, appSettingName, nonNullProp(context, <any>this._valueKey));
    }

    public shouldExecute(context: IBindingWizardContext): boolean {
        return !!context[this._valueKey];
    }
}
