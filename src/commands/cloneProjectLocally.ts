import * as vscode from 'vscode';
import { IActionContext } from 'vscode-azureextensionui';
import { setupProjectFolderParsed } from '../downloadAzureProject/setupProjectFolder';
import { ext } from '../extensionVariables';
import { ProductionSlotTreeItem } from '../tree/ProductionSlotTreeItem';
import { SlotTreeItemBase } from '../tree/SlotTreeItemBase';




export async function cloneLocally(context: IActionContext, node?: SlotTreeItemBase): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemPicker<SlotTreeItemBase>(ProductionSlotTreeItem.contextValue, context);
    }

    const filePathUri: vscode.Uri[] = await ext.ui.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false });
    const resourceId: string = node.id;
    const language: string = "python";
    //const language: string = node.getApplicationLanguage().get;

    await setupProjectFolderParsed(resourceId, language, filePathUri[0], context, node);
}

