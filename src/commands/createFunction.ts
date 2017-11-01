/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import CosmosDBManagementClient = require('azure-arm-cosmosdb');
import { DatabaseAccount, DatabaseAccountListKeysResult } from 'azure-arm-cosmosdb/lib/models';
import * as fse from 'fs-extra';
import { ServiceClientCredentials } from 'ms-rest';
import { BaseResource } from 'ms-rest-azure';
import * as path from 'path';
import * as vscode from 'vscode';
import { AzureAccount, AzureResourceFilter } from '../azure-account.api';
import * as errors from '../errors';
import { UserCancelledError } from '../errors';
import * as FunctionsCli from '../functions-cli';
import { IUserInterface, Pick, PickWithData } from '../IUserInterface';
import { localize } from '../localize';
import { ConfigSetting, ResourceType, ValueType } from '../templates/ConfigSetting';
import { EnumValue } from '../templates/EnumValue';
import { Template } from '../templates/Template';
import { TemplateData } from '../templates/TemplateData';
import * as azUtil from '../utils/azure';
import * as fsUtil from '../utils/fs';
import * as workspaceUtil from '../utils/workspace';
import { VSCodeUI } from '../VSCodeUI';

const expectedFunctionAppFiles: string[] = [
    'host.json',
    'local.settings.json',
    path.join('.vscode', 'launch.json')
];

function getMissingFunctionAppFiles(rootPath: string): string[] {
    return expectedFunctionAppFiles.filter((file: string) => !fse.existsSync(path.join(rootPath, file)));
}

function validateTemplateName(rootPath: string, name: string | undefined): string | undefined {
    if (!name) {
        return localize('azFunc.emptyTemplateNameError', 'The template name cannot be empty.');
    } else if (fse.existsSync(path.join(rootPath, name))) {
        return localize('azFunc.existingFolderError', 'A folder with the name \'{0}\' already exists.', name);
    } else {
        return undefined;
    }
}

async function validateIsFunctionApp(outputChannel: vscode.OutputChannel, functionAppPath: string): Promise<void> {
    const missingFiles: string[] = getMissingFunctionAppFiles(functionAppPath);
    if (missingFiles.length !== 0) {
        const yes: string = localize('azFunc.yes', 'Yes');
        const no: string = localize('azFunc.no', 'No');
        const message: string = localize('azFunc.missingFuncAppFiles', 'The current folder is missing the following function app files: \'{0}\'. Add the missing files?', missingFiles.join(','));
        const result: string | undefined = await vscode.window.showWarningMessage(message, yes, no);
        if (result === yes) {
            await FunctionsCli.createNewProject(outputChannel, functionAppPath);
        } else {
            throw new errors.UserCancelledError();
        }
    }
}

async function promptForFunctionName(ui: IUserInterface, functionAppPath: string, template: Template): Promise<string> {
    const defaultFunctionName: string | undefined = await fsUtil.getUniqueFsPath(functionAppPath, template.defaultFunctionName);
    const prompt: string = localize('azFunc.funcNamePrompt', 'Provide a function name');
    const placeHolder: string = localize('azFunc.funcNamePlaceholder', 'Function name');

    return await ui.showInputBox(placeHolder, prompt, false, (s: string) => validateTemplateName(functionAppPath, s), defaultFunctionName || template.defaultFunctionName);
}

async function promptForSetting(ui: IUserInterface, azureAccount: AzureAccount, functionAppPath: string, setting: ConfigSetting, defaultValue?: string): Promise<string> {
    if (setting.resourceType !== undefined) {
        const subscription: AzureResourceFilter | undefined = await promptForSubscription(ui, azureAccount);

        if (subscription) {
            const subscriptionId: string | undefined = subscription.subscription.subscriptionId;

            if (subscriptionId) {
                const credentials: ServiceClientCredentials = subscription.session.credentials;

                switch (setting.resourceType) {
                    case ResourceType.DocumentDB:
                        return await promptForDocumentDB(ui, functionAppPath, credentials, subscriptionId, setting);
                    default:
                }
            }
        }
    } else {
        switch (setting.valueType) {
            case ValueType.boolean:
                return await promptForBooleanSetting(ui, setting);
            case ValueType.enum:
                return await promptForEnumSetting(ui, setting);
            default:
        }
    }

    // Default to 'string' type for any setting that isn't supported
    return await promptForStringSetting(ui, setting, defaultValue);
}

async function promptForSubscription(ui: IUserInterface, azureAccount: AzureAccount): Promise<AzureResourceFilter | undefined> {
    if (azureAccount.filters.length === 0) {
        return undefined;
    } else if (azureAccount.filters.length === 1) {
        return azureAccount.filters[0];
    } else {
        const subscriptionPicks: PickWithData<AzureResourceFilter>[] = [];
        azureAccount.filters.forEach((f: AzureResourceFilter) => {
            const subscriptionId: string | undefined = f.subscription.subscriptionId;
            if (subscriptionId) {
                const label: string = f.subscription.displayName || subscriptionId;
                subscriptionPicks.push(new PickWithData<AzureResourceFilter>(f, label, subscriptionId));
            }
        });
        const placeHolder: string = localize('azFunc.selectSubscription', 'Select a Subscription');

        return (await ui.showQuickPick<AzureResourceFilter>(subscriptionPicks, placeHolder)).data;
    }
}

async function promptForDocumentDB(ui: IUserInterface, functionAppPath: string, credentials: ServiceClientCredentials, subscriptionId: string, setting: ConfigSetting): Promise<string> {
    const client: CosmosDBManagementClient = new CosmosDBManagementClient(credentials, subscriptionId);
    const dbAccount: DatabaseAccount = await showResourceQuickPick<DatabaseAccount>(ui, setting, client.databaseAccounts.list());
    if (dbAccount.id && dbAccount.name) {
        const resourceGroup: string = azUtil.getResourceGroupFromId(dbAccount.id);
        const keys: DatabaseAccountListKeysResult = await client.databaseAccounts.listKeys(resourceGroup, dbAccount.name);
        const appSettingName: string = `${dbAccount.name}_${ResourceType.DocumentDB.toUpperCase()}`;
        await setLocalFunctionAppSetting(functionAppPath, appSettingName, `AccountEndpoint=${dbAccount.documentEndpoint};AccountKey=${keys.primaryMasterKey};`);

        return appSettingName;
    } else {
        throw new Error(localize('azFunc.InvalidCosmosDBAccount', 'Invalid Cosmos DB Account'));
    }
}

async function promptForEnumSetting(ui: IUserInterface, setting: ConfigSetting): Promise<string> {
    const picks: PickWithData<string>[] = setting.enums.map((ev: EnumValue) => new PickWithData<string>(ev.value, ev.displayName));

    return (await ui.showQuickPick(picks, setting.label, false)).data;
}

async function promptForBooleanSetting(ui: IUserInterface, setting: ConfigSetting): Promise<string> {
    const picks: Pick[] = [new Pick('true'), new Pick('false')];

    return (await ui.showQuickPick(picks, setting.label, false)).label;
}

async function promptForStringSetting(ui: IUserInterface, setting: ConfigSetting, defaultValue?: string): Promise<string> {
    const prompt: string = localize('azFunc.stringSettingPrompt', 'Provide a \'{0}\'', setting.label);
    defaultValue = defaultValue ? defaultValue : setting.defaultValue;

    return await ui.showInputBox(setting.label, prompt, false, (s: string) => setting.validateSetting(s), defaultValue);
}

interface IBaseResourceWithName extends BaseResource {
    name?: string;
}

async function showResourceQuickPick<T extends IBaseResourceWithName>(ui: IUserInterface, setting: ConfigSetting, resourcesTask: Promise<T[]>): Promise<T> {
    const picksTask: Promise<PickWithData<T>[]> = resourcesTask.then((resources: T[]) => {
        return <PickWithData<T>[]>(resources
            .map((br: T) => br.name ? new PickWithData(br, br.name) : undefined)
            .filter((p: PickWithData<T> | undefined) => p));
    });
    const prompt: string = localize('azFunc.resourcePrompt', 'Select a \'{0}\'', setting.label);

    return (await ui.showQuickPick<T>(picksTask, prompt)).data;
}

interface ILocalSettings {
    Values: { [key: string]: string };
}

async function setLocalFunctionAppSetting(functionAppPath: string, key: string, value: string): Promise<void> {
    const localSettingsPath: string = path.join(functionAppPath, 'local.settings.json');
    const localSettings: ILocalSettings = <ILocalSettings>JSON.parse((await fse.readFile(localSettingsPath)).toString());
    if (localSettings.Values[key]) {
        const message: string = localize('azFunc.SettingAlreadyExists', 'Local app setting \'{0}\' already exists. Overwrite?', key);
        const yes: string = localize('azFunc.yes', 'Yes');
        if (await vscode.window.showWarningMessage(message, yes) !== yes) {
            return;
        }
    }

    localSettings.Values[key] = value;
    await fsUtil.writeFormattedJson(localSettingsPath, localSettings);
}

export async function createFunction(
    outputChannel: vscode.OutputChannel,
    azureAccount: AzureAccount,
    templateData: TemplateData,
    ui: IUserInterface = new VSCodeUI()): Promise<void> {

    const folderPlaceholder: string = localize('azFunc.selectFunctionAppFolderExisting', 'Select the folder containing your function app');
    const functionAppPath: string = await workspaceUtil.selectWorkspaceFolder(ui, folderPlaceholder);
    await validateIsFunctionApp(outputChannel, functionAppPath);

    const templatePicks: PickWithData<Template>[] = (await templateData.getTemplates()).map((t: Template) => new PickWithData<Template>(t, t.name));
    const templatePlaceHolder: string = localize('azFunc.selectFuncTemplate', 'Select a function template');
    const template: Template = (await ui.showQuickPick<Template>(templatePicks, templatePlaceHolder)).data;

    const name: string = await promptForFunctionName(ui, functionAppPath, template);
    let showPrompts: boolean = true;
    for (const settingName of template.userPromptedSettings) {
        const setting: ConfigSetting | undefined = await templateData.getSetting(template.bindingType, settingName);
        if (setting) {
            try {
                let settingValue: string | undefined;
                const defaultValue: string | undefined = template.getSetting(settingName);
                if (showPrompts) {
                    settingValue = await promptForSetting(ui, azureAccount, functionAppPath, setting, defaultValue);
                } else {
                    settingValue = defaultValue;
                }

                template.setSetting(settingName, settingValue);
            } catch (error) {
                if (error instanceof UserCancelledError) {
                    const message: string = localize('azFunc.IncompleteFunction', 'Function \'{0}\' was created, but you must finish specifying settings in \'function.json\'.', name);
                    vscode.window.showWarningMessage(message);
                    showPrompts = false;
                } else {
                    throw error;
                }
            }
        }
    }

    const functionPath: string = path.join(functionAppPath, name);
    await template.writeTemplateFiles(functionPath);

    const newFileUri: vscode.Uri = vscode.Uri.file(path.join(functionPath, 'index.js'));
    vscode.window.showTextDocument(await vscode.workspace.openTextDocument(newFileUri));
}
