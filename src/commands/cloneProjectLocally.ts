import { IActionContext } from 'vscode-azureextensionui';
import { requestDownload } from '../downloadAzureProject/requestDownload';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { ProductionSlotTreeItem } from '../tree/ProductionSlotTreeItem';
import { SlotTreeItemBase } from '../tree/SlotTreeItemBase';




export async function cloneLocally(context: IActionContext, node?: SlotTreeItemBase): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemPicker<SlotTreeItemBase>(ProductionSlotTreeItem.contextValue, context);
    }

    await node.runWithTemporaryDescription(
        context,
        localize('downloading', 'Downloading...'),
        async () => {
            await requestDownload(context, node);
        }
    );
}
