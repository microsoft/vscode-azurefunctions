/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, ICreateChildImplContext } from 'vscode-azureextensionui';
import { createBindingWizard } from '../../commands/addBinding/createBindingWizard';
import { IBindingWizardContext } from '../../commands/addBinding/IBindingWizardContext';
import { nonNullProp } from '../../utils/nonNull';
import { BindingsTreeItem } from '../BindingsTreeItem';
import { BindingTreeItem } from '../BindingTreeItem';
import { LocalFunctionTreeItem } from './LocalFunctionTreeItem';

export class LocalBindingsTreeItem extends BindingsTreeItem {
    public readonly parent: LocalFunctionTreeItem;

    public constructor(parent: LocalFunctionTreeItem) {
        super(parent);
    }

    public async createChildImpl(context: ICreateChildImplContext): Promise<BindingTreeItem> {
        const wizardContext: IBindingWizardContext = Object.assign(context, {
            functionJsonPath: this.parent.functionJsonPath,
            workspacePath: this.parent.parent.parent.workspacePath,
            projectPath: this.parent.parent.parent.projectPath,
            workspaceFolder: this.parent.parent.parent.workspaceFolder
        });

        const wizard: AzureWizard<IBindingWizardContext> = createBindingWizard(wizardContext);
        await wizard.prompt();
        await wizard.execute();

        return new BindingTreeItem(this, nonNullProp(wizardContext, 'binding'));
    }
}
