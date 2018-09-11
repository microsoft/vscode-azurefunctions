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
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { MessageItem, Progress, ProgressLocation, window, workspace } from "vscode";
import { SiteClient } from 'vscode-azureappservice';
import { DialogResponses, IActionContext, IAzureParentNode } from 'vscode-azureextensionui';
import { localSettingsFileName, ProjectLanguage } from '../constants';
import { ArgumentError } from '../errors';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { getFuncExtensionSetting, getProjectLanguage } from '../ProjectSettings';
import { updateWorkspaceSetting } from '../ProjectSettings';
import { FunctionAppTreeItem } from '../tree/FunctionAppTreeItem';
import * as  azUtil from '../utils/azure';
import * as fsUtil from '../utils/fs';

/**
 * Method of deployment that is only intended to be used for Linux Consumption Function apps.
 * To deploy with Run from Package on a Windows plan, create the app setting "WEBSITE_RUN_FROM_ZIP" and set it to "1".
 * Then deploy via "zipdeploy" as usual.
 */

export async function runFromPackageDeploy(actionContext: IActionContext, node: IAzureParentNode<FunctionAppTreeItem>, fsPath: string): Promise<void> {
    const language: ProjectLanguage = await getProjectLanguage(fsPath, ext.ui);
    let createdZip: boolean = language === ProjectLanguage.Python ? true : false;
    let zipFilePath: string;
    await window.withProgress({ location: ProgressLocation.Notification, title: localize('deploying', 'Deploying to "{0}"...', node.treeItem.client.fullName) }, async (p: Progress<{}>) => {
        try {
            const blobName: string = azureStorage.date.secondsFromNow(0).toISOString().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '').replace(/\s/g, '');
            const creatingZip: string = localize('zipCreate', 'Creating zip package...');
            if (language === ProjectLanguage.Python) {
                // Python pre-deploy task creates a zip file to be deployed
                zipFilePath = path.join(fsPath, `${workspace.name}.zip`);
            } else {
                p.report({ message: creatingZip });
                ext.outputChannel.appendLine(creatingZip);
                ({ zipFilePath, createdZip } = await zipDirectory(fsPath, blobName));
            }
            const blobService: azureStorage.BlobService = await createBlobService(actionContext, node, fsPath);
            const client: SiteClient = node.treeItem.client;
            const creatingBlob: string = localize('creatingBlob', 'Uploading zip package to storage container...');
            p.report({ message: creatingBlob });
            ext.outputChannel.appendLine(creatingBlob);
            const blobUrl: string = await createBlobFromZip(blobService, zipFilePath, blobName);
            const appSettings: StringDictionary = await client.listApplicationSettings();
            if (appSettings.properties) {
                const WEBSITE_RUN_FROM_ZIP: string = 'WEBSITE_RUN_FROM_ZIP';
                appSettings.properties[WEBSITE_RUN_FROM_ZIP] = blobUrl;
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
                const cleaningZip: string = localize('cleaningZip', 'Cleaning zip package...');
                p.report({ message: cleaningZip });
                ext.outputChannel.appendLine(cleaningZip);
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
    });
    return;
}

async function createBlobService(actionContext: IActionContext, node: IAzureParentNode, fsPath: string): Promise<azureStorage.BlobService> {
    const settingKey: string = 'deployStorageAccount';
    let storageAccountId: string | undefined = getFuncExtensionSetting<string>(settingKey, fsPath);
    let name: string | undefined;
    let key: string | undefined;

    // prompt user for the first project deployment to get a storage account
    if (!storageAccountId) {
        const runFromZipDeployMessage: string = localize('azFunc.AzureDeployStorageWarning', 'An Azure Storage account is required to deploy to this Function App.', localSettingsFileName);
        const selectStorageAccountButton: MessageItem = { title: localize('azFunc.SelectStorageAccount', 'Select Storage Account') };
        await ext.ui.showWarningMessage(runFromZipDeployMessage, selectStorageAccountButton, DialogResponses.cancel);
        // if the user cancels, the operation will be cancelled completely
        const sa: azUtil.IResourceResult = await azUtil.promptForStorageAccount(actionContext, {
            kind: [],
            learnMoreLink: 'https://aka.ms/T5o0nf'
        });
        if (!sa.id) {
            throw new ArgumentError(sa);
        }
        storageAccountId = sa.id;
        await updateWorkspaceSetting(settingKey, storageAccountId, fsPath);
    }

    const sClient: StorageClient = new StorageClient(node.credentials, node.subscriptionId);
    const rg: string = azUtil.getResourceGroupFromId(storageAccountId);
    name = azUtil.getNameFromId(storageAccountId);
    const result: StorageAccountListKeysResult = await sClient.storageAccounts.listKeys(rg, name);
    if (!result.keys || result.keys.length === 0) {
        throw new ArgumentError(result);
    } else {
        key = result.keys[0].value;
    }

    if (name !== undefined && key !== undefined) {
        return azureStorage.createBlobService(name, key);
    } else {
        throw new ArgumentError({ name: name, key: key });
    }
}

async function createBlobFromZip(blobService: azureStorage.BlobService, zipFilePath: string, blobName: string): Promise<string> {
    const containerName: string = 'azureappservice-run-from-package';
    await new Promise<void>((resolve: () => void, reject: (err: Error) => void): void => {
        blobService.createContainerIfNotExists(containerName, (err: Error) => {
            if (err !== null) {
                reject(err);
            } else {
                resolve();
            }
        });
    });

    await new Promise<void>((resolve: () => void, reject: (err: Error) => void): void => {
        blobService.createBlockBlobFromLocalFile(containerName, blobName, zipFilePath, (error: Error, _result: azureStorage.BlobService.BlobResult, _response: azureStorage.ServiceResponse) => {
            if (error !== null) {
                reject(error);

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

async function zipDirectory(fsPath: string, zipFileName?: string, globPattern: string = '**/*', ignorePattern?: string | string[]): Promise<{ zipFilePath: string, createdZip: boolean }> {
    let zipFilePath: string;
    let createdZip: boolean = false;
    if (!zipFileName) {
        zipFileName = fsUtil.getRandomHexString();
    }

    try {
        if (fsPath.split('.').pop() === 'zip') {
            zipFilePath = fsPath;
        } else if ((await fse.lstat(fsPath)).isDirectory()) {
            createdZip = true;
            if (!fsPath.endsWith(path.sep)) {
                fsPath += path.sep;
            }
            zipFilePath = path.join(os.tmpdir(), `${zipFileName}.zip`);
            await new Promise((resolve: () => void, reject: (err: Error) => void): void => {
                const zipOutput: fs.WriteStream = fs.createWriteStream(zipFilePath);
                zipOutput.on('close', resolve);
                // tslint:disable-next-line:no-unsafe-any
                const zipper: archiver.Archiver = <archiver.Archiver>(archiver('zip', { zlib: { level: 9 } }));
                // tslint:disable-next-line:no-unsafe-any
                zipper.on('error', reject);
                // tslint:disable-next-line:no-unsafe-any
                zipper.pipe(zipOutput);
                // tslint:disable-next-line:no-unsafe-any
                zipper.glob(globPattern, {
                    cwd: fsPath,
                    dot: true,
                    ignore: ignorePattern
                });
                // tslint:disable-next-line:no-unsafe-any
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
