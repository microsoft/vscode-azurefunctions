/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureParentTreeItem, AzureWizard, IActionContext } from 'vscode-azureextensionui';
import { createBindingWizard } from '../../commands/addBinding/createBindingWizard';
import { IBindingWizardContext } from '../../commands/addBinding/IBindingWizardContext';
import { ParsedFunctionJson } from '../../funcConfig/function';
import { localize } from '../../localize';
import { nodeUtils } from '../../utils/nodeUtils';
import { nonNullProp } from '../../utils/nonNull';
import { IProjectRoot } from './IProjectRoot';
import { LocalBindingTreeItem } from './LocalBindingTreeItem';
import { LocalFunctionTreeItem } from './LocalFunctionTreeItem';

export class LocalBindingsTreeItem extends AzureParentTreeItem<IProjectRoot> {
    public static contextValue: string = 'azFuncLocalBindings';
    public readonly contextValue: string = LocalBindingsTreeItem.contextValue;
    public readonly label: string = localize('bindings', 'Bindings');
    public readonly childTypeLabel: string = localize('binding', 'binding');
    public functionJsonPath: string;

    private readonly _config: ParsedFunctionJson;

    public constructor(parent: LocalFunctionTreeItem, config: ParsedFunctionJson, functionJsonPath: string) {
        super(parent);
        this._config = config;
        this.functionJsonPath = functionJsonPath;
    }

    public get id(): string {
        return 'bindings';
    }

    public get iconPath(): nodeUtils.IThemedIconPath {
        return nodeUtils.getThemedIconPath('BulletList');
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public async loadMoreChildrenImpl(_clearCache: boolean): Promise<LocalBindingTreeItem[]> {
        return this._config.bindings.map(b => new LocalBindingTreeItem(this, b));
    }

    public async createChildImpl(_showCreatingTreeItem: (label: string) => void): Promise<LocalBindingTreeItem> {
        // https://github.com/Microsoft/vscode-azuretools/issues/120
        const actionContext: IActionContext = { properties: {}, measurements: {} };
        const wizardContext: IBindingWizardContext = {
            actionContext,
            functionJsonPath: this.functionJsonPath,
            workspacePath: this.root.workspacePath,
            projectPath: this.root.projectPath,
            workspaceFolder: this.root.workspaceFolder
        };

        const wizard: AzureWizard<IBindingWizardContext> = createBindingWizard(wizardContext);
        await wizard.prompt(actionContext);
        await wizard.execute(actionContext);

        return new LocalBindingTreeItem(this, nonNullProp(wizardContext, 'binding'));
    }
}
