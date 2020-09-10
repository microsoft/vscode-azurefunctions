import { OpenDialogOptions, ProgressLocation, Uri, window, workspace } from "vscode";
import { AzureWizardExecuteStep } from "vscode-azureextensionui";
import { ProjectLanguage } from "../../../constants";
import { ext } from "../../../extensionVariables";
import { localize } from "../../../localize";
import { cpUtils } from "../../../utils/cpUtils";
import { IFunctionWizardContext } from "../../createFunction/IFunctionWizardContext";


export class OpenAPICreateStep extends AzureWizardExecuteStep<IFunctionWizardContext> {
    public priority: number;

    public async execute(wizardContext: IFunctionWizardContext): Promise<void> {
        const uris = await this.askDocument();
        const uri = uris[0];

        const args: string[] = [];
        args.push(`--input-file:${uri.fsPath} --version:3.0.6314`);

        if (wizardContext.language === ProjectLanguage.TypeScript) {
            args.push('--azure-functions-typescript');
            args.push('--no-namespace-folders:True');
        } else if (wizardContext.language === ProjectLanguage.CSharp) {
            args.push('--namespace:Microsoft.Azure.Stencil');
            args.push('--azure-functions-csharp');
        } else if (wizardContext.language === ProjectLanguage.Java) {
            args.push('--namespace:com.microsoft.azure.stencil');
            args.push('--azure-functions-java');
        } else if (wizardContext.language === ProjectLanguage.Python) {
            args.push('--azure-functions-python');
            args.push('--no-namespace-folders:True');
            args.push('--no-async');
        } else {
            throw new Error(localize("notSupported", "Not a supported language. We currently support C#, Java, Python, and Typescript"));
        }

        args.push('--generate-metadata:false');
        args.push(`--output-folder:${wizardContext.projectPath}`);

        ext.outputChannel.show();
        await window.withProgress({ location: ProgressLocation.Notification, title: localize('generatingFunctions', 'Generating Http trigger functions from OpenAPI...') }, async () => {
            await cpUtils.executeCommand(ext.outputChannel, undefined, 'autorest', ...args);
        });
    }
    public shouldExecute(): boolean {
        return true;
    }

    public async askDocument(): Promise<Uri[]> {
        const openDialogOptions: OpenDialogOptions = {
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            openLabel: "Select OpenAPI Specification (V2 or V3) File",
            filters: {
                JSON: ["json"]
            }
        };
        const rootPath = workspace.rootPath;
        if (rootPath) {
            openDialogOptions.defaultUri = Uri.file(rootPath);
        }
        return await ext.ui.showOpenDialog(openDialogOptions);
    }
}
