import { IActionContext } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { ProductionSlotTreeItem } from '../tree/ProductionSlotTreeItem';
import { SlotTreeItemBase } from '../tree/SlotTreeItemBase';
import { openUrl } from '../utils/openUrl';

// this is just the code for browseWebsite with the function name changed for testing purposes
export async function testFunctionValentina(context: IActionContext, node?: SlotTreeItemBase): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemPicker<SlotTreeItemBase>(ProductionSlotTreeItem.contextValue, context);
    }

    //await openUrl(node.root.client.defaultHostUrl);
    await openUrl("https://www.bing.com/videos/search?q=youtube+rick+roll&view=detail&mid=738D0878A9414F5E7752738D0878A9414F5E7752&FORM=VIRE0&ru=%2fsearch%3fq%3dyoutube%2brick%2broll%26cvid%3d6512247e6c044bc693ba3f909bb63f75%26aqs%3dedge.0.69i59j69i57j0l3j69i60l2.4331j0j1%26pglt%3d43%26FORM%3dANNAB1%26PC%3dLCTS");
}
