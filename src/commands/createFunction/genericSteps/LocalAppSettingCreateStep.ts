/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Progress } from 'vscode';
import { AzureWizardExecuteStep } from 'vscode-azureextensionui';
import { localSettingsFileName } from '../../../constants';
import { setLocalAppSetting } from '../../../LocalAppSettings';
import { localize } from '../../../localize';
import { nonNullProp } from '../../../utils/nonNull';
import { IFunctionWizardContext } from '../IFunctionWizardContext';

export class LocalAppSettingCreateStep extends AzureWizardExecuteStep<IFunctionWizardContext> {
    private readonly _nameKey: string;
    private readonly _valueKey: string;

    constructor(nameKey: string, valueKey: string) {
        super();
        this._nameKey = nameKey;
        this._valueKey = valueKey;
    }

    public async execute(wizardContext: IFunctionWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        progress.report({ message: localize('updatingLocalSettings', 'Updating {0}...', localSettingsFileName) });
        // tslint:disable-next-line: no-unsafe-any no-any
        await setLocalAppSetting(wizardContext.projectPath, nonNullProp(wizardContext, <any>this._nameKey), nonNullProp(wizardContext, <any>this._valueKey));
    }

    public shouldExecute(wizardContext: IFunctionWizardContext): boolean {
        return !!wizardContext[this._valueKey];
    }
}
