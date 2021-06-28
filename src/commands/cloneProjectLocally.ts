import { AzureTreeItem, IActionContext } from 'vscode-azureextensionui';
import { requestDownload } from '../downloadAzureProject/requestDownload';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { ProductionSlotTreeItem } from '../tree/ProductionSlotTreeItem';





export async function cloneLocally(context: IActionContext, node?: AzureTreeItem): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemPicker<AzureTreeItem>(ProductionSlotTreeItem.contextValue, context);
    }
    await node.runWithTemporaryDescription(
        context,
        localize('downloading', 'Downloading...'),
        async () => {
            await requestDownload(context);


        }
    );

}

