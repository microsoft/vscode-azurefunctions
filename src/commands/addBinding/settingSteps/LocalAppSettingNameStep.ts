/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ext } from '../../../extensionVariables';
import { localize } from '../../../localize';
import { nonNullProp } from '../../../utils/nonNull';
import { IBindingWizardContext } from '../IBindingWizardContext';
import { BindingSettingStepBase } from './BindingSettingStepBase';

export class LocalAppSettingNameStep extends BindingSettingStepBase {
    public async promptCore(_wizardContext: IBindingWizardContext): Promise<string> {
        const appSettingSuffix: string = `_${nonNullProp(this._setting, 'resourceType').toUpperCase()}`;
        return await ext.ui.showInputBox({
            placeHolder: localize('appSettingKeyPlaceholder', 'Local app setting key'),
            prompt: localize('appSettingKeyPrompt', 'Provide a key for a connection string'),
            value: `example${appSettingSuffix}`
        });
    }
}
