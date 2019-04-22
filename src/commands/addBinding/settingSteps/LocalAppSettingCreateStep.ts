/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Progress } from 'vscode';
import { AzureWizardExecuteStep } from 'vscode-azureextensionui';
import { localSettingsFileName } from '../../../constants';
import { setLocalAppSetting } from '../../../funcConfig/local.settings';
import { localize } from '../../../localize';
import { nonNullProp } from '../../../utils/nonNull';
import { IBindingWizardContext } from '../IBindingWizardContext';

export class LocalAppSettingCreateStep extends AzureWizardExecuteStep<IBindingWizardContext> {
    public priority: number = 210;

    private readonly _nameKey: string;
    private readonly _valueKey: string;

    constructor(nameKey: string, valueKey: string) {
        super();
        this._nameKey = nameKey;
        this._valueKey = valueKey;
    }

    public async execute(wizardContext: IBindingWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        progress.report({ message: localize('updatingLocalSettings', 'Updating {0}...', localSettingsFileName) });
        // tslint:disable-next-line: no-unsafe-any no-any
        await setLocalAppSetting(wizardContext.projectPath, nonNullProp(wizardContext, <any>this._nameKey), nonNullProp(wizardContext, <any>this._valueKey));
    }

    public shouldExecute(wizardContext: IBindingWizardContext): boolean {
        return !!wizardContext[this._valueKey];
    }
}
