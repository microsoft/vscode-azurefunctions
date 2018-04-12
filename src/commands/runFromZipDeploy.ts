/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as archiver from 'archiver';
// tslint:disable-next-line:no-require-imports
import StorageClient = require('azure-arm-storage');
import { StorageAccountListKeysResult } from 'azure-arm-storage/lib/models';
import { StringDictionary } from 'azure-arm-website/lib/models';
import * as azureStorage from "azure-storage";
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MessageItem, OutputChannel } from "vscode";
import { SiteClient } from 'vscode-azureappservice';
import { AzureTreeDataProvider, DialogResponses, IAzureParentNode, IAzureUserInput } from 'vscode-azureextensionui';
import { localSettingsFileName } from '../constants';
import { ArgumentError } from '../errors';
import { localize } from '../localize';
import { getFuncExtensionSetting } from '../ProjectSettings';
import { FunctionAppTreeItem } from '../tree/FunctionAppTreeItem';
import * as  azUtil from '../utils/azure';

export async function runFromZipDeploy(ui: IAzureUserInput, tree: AzureTreeDataProvider, node: IAzureParentNode<FunctionAppTreeItem>, fsPath: string, outputChannel: OutputChannel): Promise<void> {
    let createdZip: boolean = false;
    let zipFilePath: string;
    try {
        const blobName: string = azureStorage.date.secondsFromNow(0).toISOString();
        ({ zipFilePath, createdZip } = await zipDirectory(outputChannel, fsPath, blobName));
        outputChannel.appendLine(localize('deployStart', 'Starting deployment...'));
        const blobService: azureStorage.BlobService = await createBlobService(ui, tree, node);
        const client: SiteClient = node.treeItem.client;
        const blobUrl: string = await createBlobFromZip(blobService, zipFilePath, blobName);
        const WEBSITE_USE_ZIP: string = 'WEBSITE_USE_ZIP';
        const appSettings: StringDictionary = await client.listApplicationSettings();
        if (appSettings.properties) {
            appSettings.properties[WEBSITE_USE_ZIP] = blobUrl;
        } else {
            throw new ArgumentError(appSettings);
        }

        await client.updateApplicationSettings(appSettings);
    } catch (error) {
        // tslint:disable-next-line:no-unsafe-any
        if (error && error.response && error.response.body) {
            // Autorest doesn't support plain/text as a MIME type, so we have to get the error message from the response body ourselves
            // https://github.com/Azure/autorest/issues/1527
            // tslint:disable-next-line:no-unsafe-any
            throw new Error(error.response.body);
        } else {
            throw error;
        }
    } finally {
        // clean up zip file
        if (createdZip) {
            await new Promise((resolve: () => void, reject: (err: Error) => void): void => {
                fs.unlink(zipFilePath, (err?: Error) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        }
    }
    return;
}

async function createBlobService(ui: IAzureUserInput, tree: AzureTreeDataProvider, node: IAzureParentNode): Promise<azureStorage.BlobService> {
    const settingKey: string = 'storageAccount';
    const storageAccount: { name: string, rg: string } | undefined = getFuncExtensionSetting<{ name: string, rg: string }>(settingKey);
    let name: string | undefined;
    let key: string | undefined;
    if (!storageAccount) {
        // prompt user for the first project deployment to get a storage account
        const runFromZipDeployMessage: string = localize('azFunc.AzureDeployStorageWarning', 'An Azure Storage account is required to deploy to this Function App.', localSettingsFileName);
        const selectStorageAccountButton: MessageItem = { title: localize('azFunc.SelectStorageAccount', 'Select Storage Account') };
        const result: MessageItem | undefined = await ui.showWarningMessage(runFromZipDeployMessage, selectStorageAccountButton, DialogResponses.cancel);
        if (result === selectStorageAccountButton) {
            const sa: azUtil.IResourceResult = await azUtil.promptForStorageAccount(ui, tree);
            const accountKey: string = 'AccountKey=';
            name = sa.name;
            key = sa.connectionString.substring(sa.connectionString.indexOf(accountKey) + accountKey.length);
        }
    } else {
        const client: StorageClient = new StorageClient(node.credentials, node.subscriptionId);
        const result: StorageAccountListKeysResult = await client.storageAccounts.listKeys(storageAccount.rg, storageAccount.name);
        if (!result.keys || result.keys.length === 0) {
            throw new ArgumentError(result);
        } else {
            name = storageAccount.name;
            key = result.keys[0].value;
        }
    }

    if (name !== undefined && key !== undefined) {
        return azureStorage.createBlobService(name, key);
    } else {
        throw new ArgumentError({ name: name, key: key });
    }
}

async function createBlobFromZip(blobService: azureStorage.BlobService, zipFilePath: string, blobName: string): Promise<string> {
    const containerName: string = 'azureappservice-run-from-zip';
    await new Promise<void>((resolve: () => void, reject: (err: Error) => void): void => {
        blobService.createContainerIfNotExists(containerName, (err: Error) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });

    await new Promise<void>((resolve: () => void, reject: (err: Error) => void): void => {
        blobService.createBlockBlobFromLocalFile(containerName, blobName, zipFilePath, (error: Error, _result: azureStorage.BlobService.BlobResult, _response: azureStorage.ServiceResponse) => {
            if (!!error) {
                // tslint:disable-next-line:no-any
                const errorAny: any = error;
                // tslint:disable-next-line:no-unsafe-any
                if (!!errorAny.code) {
                    // tslint:disable-next-line:no-unsafe-any
                    let humanReadableMessage: string = `Unable to save '${blobName}', blob service returned error code "${errorAny.code}"`;
                    // tslint:disable-next-line:no-unsafe-any
                    switch (errorAny.code) {
                        case 'ENOTFOUND':
                            humanReadableMessage += ' - Please check connection.';
                            break;
                        default:
                            break;
                    }
                    reject(new Error(humanReadableMessage));
                } else {
                    reject(error);
                }
            } else {
                resolve();
            }
        });
    });
    const sasToken: string = blobService.generateSharedAccessSignature(containerName, blobName, <azureStorage.common.SharedAccessPolicy>{
        AccessPolicy: {
            Permissions: azureStorage.BlobUtilities.SharedAccessPermissions.READ + azureStorage.BlobUtilities.SharedAccessPermissions.LIST,
            Start: azureStorage.date.secondsFromNow(-10),
            // for clock desync
            Expiry: azureStorage.date.daysFromNow(365),
            ResourceTypes: azureStorage.BlobUtilities.BlobContainerPublicAccessType.BLOB
        }
    });

    return blobService.getUrl(containerName, blobName, sasToken, true);
}

export async function isDirectory(fsPath: string): Promise<boolean> {
    const fsStats: fs.Stats = await new Promise((resolve: (s?: fs.Stats) => void, reject: (e: Error) => void): void => {
        fs.lstat(fsPath, (err?: Error, stats?: fs.Stats) => {
            if (err) {
                reject(err);
            } else {
                resolve(stats);
            }
        });
    });

    return fsStats.isDirectory();
}

async function zipDirectory(outputChannel: OutputChannel, fsPath: string, blobName: string, globPattern: string = '**/*', ignorePattern?: string | string[]): Promise<{ zipFilePath: string, createdZip: boolean }> {
    let zipFilePath: string;
    let createdZip: boolean = false;
    const zipFileName: string = blobName.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '').replace(/\s/g, '');
    try {
        if (fsPath.split('.').pop() === 'zip') {
            zipFilePath = fsPath;
        } else if (await isDirectory(fsPath)) {
            createdZip = true;
            outputChannel.appendLine(localize('zipCreate', 'Creating zip package...'));
            if (!fsPath.endsWith(path.sep)) {
                fsPath += path.sep;
            }

            zipFilePath = path.join(os.tmpdir(), `${zipFileName}.zip`);
            await new Promise((resolve: () => void, reject: (err: Error) => void): void => {
                const zipOutput: fs.WriteStream = fs.createWriteStream(zipFilePath);
                zipOutput.on('close', resolve);

                const zipper: archiver.Archiver = archiver('zip', { zlib: { level: 9 } });
                zipper.on('error', reject);
                zipper.pipe(zipOutput);
                zipper.glob(globPattern, {
                    cwd: fsPath,
                    dot: true,
                    ignore: ignorePattern
                });
                void zipper.finalize();
            });
        } else {
            throw new Error(localize('NotAZipError', 'Path specified is not a folder or a zip file'));
        }
    } catch (error) {
        throw error;
    }
    return { zipFilePath: zipFilePath, createdZip: createdZip };
}
