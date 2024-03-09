/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStep, callWithTelemetryAndErrorHandling, nonNullProp, type IActionContext } from "@microsoft/vscode-azext-utils";
import * as os from 'os';
import * as path from "path";
import * as vscode from 'vscode';
import { type Progress } from "vscode";
import { ext } from "../../../extensionVariables";
import { localize } from "../../../localize";
import { feedUtils } from "../../../utils/feedUtils";
import { type EventGridExecuteFunctionContext } from "./EventGridExecuteFunctionContext";

export class EventGridFileOpenStep extends AzureWizardExecuteStep<EventGridExecuteFunctionContext> {
    public priority: number;

    public async execute(context: EventGridExecuteFunctionContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined; }>): Promise<void> {
        const eventSource = nonNullProp(context, 'eventSource');
        const selectedFileName = nonNullProp(context, 'selectedFileName');
        const selectedFileUrl = nonNullProp(context, 'selectedFileUrl');

        // Get selected contents of sample request
        const downloadingMsg: string = localize('downloadingSample', 'Downloading sample request...');
        progress.report({ message: downloadingMsg });
        const selectedFileContent = await feedUtils.getJsonFeed(context, selectedFileUrl);

        // Create a temp file with the sample request & open in new window
        const openingFileMsg: string = localize('openingFile', 'Opening file...');
        progress.report({ message: openingFileMsg });
        const tempFilePath: string = await createTempSampleFile(eventSource, selectedFileName, selectedFileContent);
        const document: vscode.TextDocument = await vscode.workspace.openTextDocument(tempFilePath);
        await vscode.window.showTextDocument(document, {
            preview: false,
        });
        ext.fileToFunctionNodeMap.set(document.fileName, nonNullProp(ext, 'currentExecutingFunctionNode'));
        context.fileOpened = true;

        // Request will be sent when the user clicks on the button or on the codelens link
        // Show the message only once per workspace
        if (!ext.context.workspaceState.get('didShowEventGridFileOpenMsg')) {
            const doneMsg = localize('modifyFile', "You can modify the file and then click the 'Save and execute' button to send the request.");
            void vscode.window.showInformationMessage(doneMsg);
            await ext.context.workspaceState.update('didShowEventGridFileOpenMsg', true);
        }

        // Set a listener to track whether the file was modified before the request is sent
        let modifiedListenerDisposable: vscode.Disposable;
        void new Promise<void>((resolve, reject) => {
            modifiedListenerDisposable = vscode.workspace.onDidChangeTextDocument(async (event) => {
                if (event.contentChanges.length > 0 && event.document.fileName === document.fileName) {
                    try {
                        await callWithTelemetryAndErrorHandling('eventGridSampleModified', async (actionContext: IActionContext) => {
                            actionContext.telemetry.properties.eventGridSampleModified = 'true';
                        });
                        resolve();
                    } catch (error) {
                        context.errorHandling.suppressDisplay = true;
                        reject(error);
                    } finally {
                        modifiedListenerDisposable.dispose();
                    }
                }
            });
        });

        // Set a listener to delete the temp file after it's closed
        void new Promise<void>((resolve, reject) => {
            const closedListenerDisposable = vscode.workspace.onDidCloseTextDocument(async (closedDocument) => {
                if (closedDocument.fileName === document.fileName) {
                    try {
                        ext.fileToFunctionNodeMap.delete(document.fileName);
                        await AzExtFsExtra.deleteResource(tempFilePath);
                        resolve();
                    } catch (error) {
                        context.errorHandling.suppressDisplay = true;
                        reject(error);
                    } finally {
                        closedListenerDisposable.dispose();
                        if (modifiedListenerDisposable) {
                            modifiedListenerDisposable.dispose();
                        }
                    }
                }
            });
        });

    }

    public shouldExecute(context: EventGridExecuteFunctionContext): boolean {
        return !context.fileOpened
    }

}

async function createTempSampleFile(eventSource: string, fileName: string, contents: {}): Promise<string> {
    const samplesDirPath = await getSamplesDirPath(eventSource);
    const sampleFileName = fileName.replace(/\.json$/, '.eventgrid.json');
    const filePath: string = path.join(samplesDirPath, sampleFileName);

    await AzExtFsExtra.writeJSON(filePath, contents);

    return filePath;
}

async function getSamplesDirPath(eventSource: string): Promise<string> {
    // Create the path to the directory
    const baseDir: string = path.join(os.tmpdir(), 'vscode', 'azureFunctions', 'eventGridSamples');
    const dirPath = path.join(baseDir, eventSource);

    // Create the directory if it doesn't already exist
    await AzExtFsExtra.ensureDir(dirPath);

    // Return the path to the directory
    return dirPath;
}

