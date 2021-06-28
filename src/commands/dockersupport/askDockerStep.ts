import { QuickPickOptions } from "vscode";
import { IActionContext, IAzureQuickPickItem } from "vscode-azureextensionui";
import { localize } from "../../localize";

/**
 * Provides top bar prompt UI asking the user if they'd like to use Docker with their cloned local project
 * @param context - Provides basic actions for functions
 * @returns - Yes/No response to using Docker with cloned local project
 */
export async function prompt(context: IActionContext): Promise<string> {
    const question: QuickPickOptions = { placeHolder: localize('useDocker', 'Use Docker to simplify your development experience?') };
    let responses: IAzureQuickPickItem<string>[] = [
        // can customize the label name if needed
        { label: 'Yes, use Docker', data: "yes" },
        { label: 'No, do not use Docker', data: "no" }
    ];

    // pop up UI of the prompt and options at the top
    const dockersupport: string = (await context.ui.showQuickPick(responses, question)).data;
    return dockersupport;
}

