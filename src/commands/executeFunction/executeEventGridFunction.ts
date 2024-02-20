/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext, type IAzureQuickPickItem } from '@microsoft/vscode-azext-utils';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { localize } from '../../localize';
import { type FunctionTreeItemBase } from '../../tree/FunctionTreeItemBase';
import { feedUtils } from '../../utils/feedUtils';
import { type IFunction } from '../../workspace/LocalFunction';
import { supportedEventGridSourceLabels, supportedEventGridSources, type EventGridSource } from './eventGridSources';
import { executeFunctionWithInput } from './executeFunction';

type FileMetadata = {
    name: string;
    path: string;
    sha: string;
    size: number;
    url: string;
    html_url: string;
    git_url: string;
    download_url: string;
    type: string;
    _links: {
        self: string;
        git: string;
        html: string;
    };
};

const sampleFilesUrl =
    'https://api.github.com/repos/Azure/azure-rest-api-specs/contents/specification/eventgrid/data-plane/' +
    '{eventSource}' +
    '/stable/2018-01-01/examples/cloud-events-schema/';

export async function executeEventGridFunction(context: IActionContext, node: FunctionTreeItemBase | IFunction): Promise<void> {
    // Prompt for event source
    const eventGridSourcePicks: IAzureQuickPickItem<EventGridSource | undefined>[] = supportedEventGridSources.map((source: EventGridSource) => {
        return {
            label: supportedEventGridSourceLabels.get(source) || source,
            data: source,
        };
    });
    const eventSource: EventGridSource =
        (
            await context.ui.showQuickPick(eventGridSourcePicks, {
                placeHolder: localize('selectEventSource', 'Select the event source'),
                stepName: 'eventGridSource',
            })
        ).data ?? 'Microsoft.Storage';

    // Get sample files for event source
    const samplesUrl = sampleFilesUrl.replace('{eventSource}', eventSource);
    const sampleFiles: FileMetadata[] = await feedUtils.getJsonFeed(context, samplesUrl);
    const fileNames: string[] = sampleFiles.map((fileMetadata) => fileMetadata.name);

    // Prompt for event type
    const eventTypePicks: IAzureQuickPickItem<string | undefined>[] = fileNames.map((name: string) => ({
        data: name,
        // give human-readable name for event type from file name
        label: name
            .replace(/\.json$/, '')
            .split('_')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' '),
    }));
    const selectedFileName: string =
        (
            await context.ui.showQuickPick(eventTypePicks, {
                placeHolder: localize('selectEventType', 'Select the event type'),
                stepName: 'eventType',
            })
        ).data ?? 'blob_created.json';

    // Get selected contents of sample request
    const selectedFileUrl = sampleFiles.find((fileMetadata) => fileMetadata.name === selectedFileName)?.download_url || sampleFiles[0].download_url;
    const selectedFileContents: {} = await feedUtils.getJsonFeed(context, selectedFileUrl);

    // Prompt for whether to send or modify the sample request
    const shouldModify: boolean =
        (
            await context.ui.showQuickPick(
                [
                    {
                        label: localize('sendSample', 'Send sample request'),
                        data: false,
                    },
                    {
                        label: localize('modifySample', 'Modify sample request'),
                        data: true,
                    },
                ],
                {
                    placeHolder: 'Would you like to send the sample request or modify it first?',
                    stepName: 'modifyOrSendSample',
                },
            )
        ).data || false;

    // Execute function with sample data directly if user chooses not to modify
    if (!shouldModify) {
        return executeFunctionWithInput(context, selectedFileContents, node);
    }

    // Create a temp file with the sample request & open in new window
    const tempFilePath: string = await createTempSampleFile(eventSource, selectedFileName, selectedFileContents);
    const document: vscode.TextDocument = await vscode.workspace.openTextDocument(tempFilePath);
    await vscode.window.showTextDocument(document, {
        preview: false,
    });

    // Request will be sent when the user clicks on the button or on the codelens link

    // Set a listener to delete the temp file after it's closed
    await new Promise<void>((resolve, reject) => {
        const disposable = vscode.workspace.onDidCloseTextDocument(async (closedDocument) => {
            if (closedDocument.fileName === document.fileName) {
                try {
                    await fs.unlink(tempFilePath);
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

async function createTempSampleFile(eventSource: string, fileName: string, contents: {}): Promise<string> {
    const samplesDirPath = await createSamplesDirIfNotExists(eventSource);
    const sampleFileName = fileName.replace(/\.json$/, '.eventgrid.json');
    const filePath: string = path.join(samplesDirPath, sampleFileName);

    await fs.writeFile(filePath, JSON.stringify(contents, undefined, 2));

    return filePath;
}

async function createSamplesDirIfNotExists(eventSource: string): Promise<string> {
    const baseDir: string = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || path.join(os.tmpdir(), 'vscode', 'azureFunctions');

    // Create the path to the directory
    const dirPath = path.join(baseDir, '.vscode', 'eventGridSamples', eventSource);
    // Create the directory if it doesn't already exist
    if (!(await fs.pathExists(dirPath))) {
        await fs.mkdirp(dirPath);
    }
    // Return the path to the directory
    return dirPath;
}
