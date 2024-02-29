import { AzExtFsExtra, AzureWizardExecuteStep, nonNullProp } from "@microsoft/vscode-azext-utils";
import * as os from 'os';
import * as path from "path";
import * as vscode from 'vscode';
import { type Progress } from "vscode";
import { ext } from "../../../extensionVariables";
import { localize } from "../../../localize";
import { feedUtils } from "../../../utils/feedUtils";
import { type ExecuteEventGridFunctionContext } from "./ExecuteEventGridFunctionContext";

export class OpenEventGridFileStep extends AzureWizardExecuteStep<ExecuteEventGridFunctionContext> {
    public priority: number;

    public async execute(context: ExecuteEventGridFunctionContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined; }>): Promise<void> {
        if (!context.eventSource || !context.selectedFileName || !context.selectedFileUrl) {
            throw new Error('Internal error: event source or event type is missing');
        }

        // Get selected contents of sample request
        const downloadingMsg: string = localize('downloadingSample', 'Downloading sample request...');
        progress.report({ message: downloadingMsg });
        context.selectedFileContent = await feedUtils.getJsonFeed(context, context.selectedFileUrl);

        // Create a temp file with the sample request & open in new window
        const openingFileMsg: string = localize('openingFile', 'Opening file...');
        progress.report({ message: openingFileMsg });
        const tempFilePath: string = await createTempSampleFile(context.eventSource, context.selectedFileName, context.selectedFileContent);
        const document: vscode.TextDocument = await vscode.workspace.openTextDocument(tempFilePath);
        await vscode.window.showTextDocument(document, {
            preview: false,
        });
        ext.fileToFunctionNodeMap.set(document.fileName, nonNullProp(ext, 'currentExecutingFunctionNode'));
        context.fileOpened = true;

        // Request will be sent when the user clicks on the button or on the codelens link
        const doneMsg = localize('modifyFile', "You can modify the file and then click the 'Save and Send Request' button to send the request.");
        void vscode.window.showInformationMessage(doneMsg);

        // Set a listener to delete the temp file after it's closed
        void new Promise<void>((resolve, reject) => {
            const disposable = vscode.workspace.onDidCloseTextDocument(async (closedDocument) => {
                if (closedDocument.fileName === document.fileName) {
                    try {
                        ext.fileToFunctionNodeMap.delete(document.fileName);
                        await AzExtFsExtra.deleteResource(tempFilePath);
                        resolve();
                    } catch (error) {
                        reject(error);
                    } finally {
                        disposable.dispose();
                    }
                }
            });
        });
    }

    public shouldExecute(context: ExecuteEventGridFunctionContext): boolean {
        return !context.fileOpened
    }

}

async function createTempSampleFile(eventSource: string, fileName: string, contents: {}): Promise<string> {
    const samplesDirPath = await createSamplesDirIfNotExists(eventSource);
    const sampleFileName = fileName.replace(/\.json$/, '.eventgrid.json');
    const filePath: string = path.join(samplesDirPath, sampleFileName);

    await AzExtFsExtra.writeJSON(filePath, contents);

    return filePath;
}

async function createSamplesDirIfNotExists(eventSource: string): Promise<string> {
    const baseDir: string = path.join(os.tmpdir(), 'vscode', 'azureFunctions');

    // Create the path to the directory
    const dirPath = path.join(baseDir, 'eventGridSamples', eventSource);
    // Create the directory if it doesn't already exist
    if (!(await AzExtFsExtra.pathExists(dirPath))) {
        await AzExtFsExtra.ensureDir(dirPath);
    }
    // Return the path to the directory
    return dirPath;
}

