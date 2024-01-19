/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from '@microsoft/vscode-azext-utils';
import { type Progress } from 'vscode';
import { localSettingsFileName } from '../../../constants';
import { setLocalAppSetting } from '../../../funcConfig/local.settings';
import { localize } from '../../../localize';
import { type IBindingSetting } from '../../../templates/IBindingTemplate';
import { type ParsedInput } from '../../../templates/script/parseScriptTemplatesV2';
import { nonNullProp, nonNullValue } from '../../../utils/nonNull';
import { getBindingSetting, setBindingSetting } from '../../createFunction/IFunctionWizardContext';
import { type IBindingWizardContext } from '../IBindingWizardContext';

export class LocalAppSettingCreateStep extends AzureWizardExecuteStep<IBindingWizardContext> {
    public priority: number = 210;

    private readonly _setting: IBindingSetting | ParsedInput;
    private readonly _valueKey: string;

    constructor(setting: IBindingSetting | ParsedInput, valueKey: string) {
        super();
        this._setting = setting;
        this._valueKey = valueKey;
    }

    public async execute(context: IBindingWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        progress.report({ message: localize('updatingLocalSettings', 'Updating {0}...', localSettingsFileName) });
        const appSettingName = String(nonNullValue(getBindingSetting(context, this._setting), this._setting.name));
        await setLocalAppSetting(context, context.projectPath, appSettingName, nonNullProp(context, this._valueKey as keyof IBindingWizardContext) as string);
        // if the binding isn't already set then a new one was created
        if (!getBindingSetting(context, this._setting)) {
            setBindingSetting(context, this._setting, nonNullProp(context, this._valueKey as keyof IBindingWizardContext) as string);
        }
    }

    public shouldExecute(context: IBindingWizardContext): boolean {
        return !!context[this._valueKey];
    }
}
