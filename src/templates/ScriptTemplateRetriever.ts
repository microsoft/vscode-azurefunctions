/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as extract from 'extract-zip';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { IActionContext } from 'vscode-azureextensionui';
import { ProjectRuntime } from '../constants';
import { ext } from '../extensionVariables';
import { downloadFile } from '../utils/fs';
import { cliFeedJsonResponse } from '../utils/getCliFeedJson';
import { IFunctionTemplate } from './IFunctionTemplate';
import { parseScriptTemplates } from './parseScriptTemplates';
import { TemplateRetriever, TemplateType } from './TemplateRetriever';

export class ScriptTemplateRetriever extends TemplateRetriever {
    public templateType: TemplateType = TemplateType.Script;
    private _templatesKey: string = 'FunctionTemplates';
    private _configKey: string = 'FunctionTemplateConfig';
    private _resourcesKey: string = 'FunctionTemplateResources';
    private _rawResources: object;
    private _rawTemplates: object[];
    private _rawConfig: object;

    public getVerifiedTemplateIds(runtime: ProjectRuntime): string[] {
        return getScriptVerifiedTemplateIds(runtime);
    }

    protected async getTemplatesFromCache(runtime: ProjectRuntime): Promise<IFunctionTemplate[] | undefined> {
        const cachedResources: object | undefined = ext.context.globalState.get<object>(this.getCacheKey(this._resourcesKey, runtime));
        const cachedTemplates: object[] | undefined = ext.context.globalState.get<object[]>(this.getCacheKey(this._templatesKey, runtime));
        const cachedConfig: object | undefined = ext.context.globalState.get<object>(this.getCacheKey(this._configKey, runtime));
        if (cachedResources && cachedTemplates && cachedConfig) {
            return parseScriptTemplates(cachedResources, cachedTemplates, cachedConfig);
        } else {
            return undefined;
        }
    }

    protected async getTemplatesFromCliFeed(cliFeedJson: cliFeedJsonResponse, templateVersion: string, _runtime: ProjectRuntime, _context: IActionContext): Promise<IFunctionTemplate[]> {
        const templatesPath: string = path.join(os.tmpdir(), 'vscode-azurefunctions-templates');
        try {
            const filePath: string = path.join(templatesPath, `templates-${templateVersion}.zip`);
            await downloadFile(cliFeedJson.releases[templateVersion].templateApiZip, filePath);

            await new Promise(async (resolve: () => void, reject: (e: Error) => void): Promise<void> => {
                // tslint:disable-next-line:no-unsafe-any
                extract(filePath, { dir: templatesPath }, (err: Error) => {
                    // tslint:disable-next-line:strict-boolean-expressions
                    if (err) {
                        reject(err);
                    }
                    resolve();
                });
            });

            return await this.parseTemplates(templatesPath);
        } finally {
            if (await fse.pathExists(templatesPath)) {
                await fse.remove(templatesPath);
            }
        }
    }

    protected async getTemplatesFromBackup(runtime: ProjectRuntime): Promise<IFunctionTemplate[]> {
        const backupTemplatesPath: string = ext.context.asAbsolutePath(path.join('resources', 'backupScriptTemplates', runtime));
        return await this.parseTemplates(backupTemplatesPath);
    }

    protected async cacheTemplates(runtime: ProjectRuntime): Promise<void> {
        ext.context.globalState.update(this.getCacheKey(this._templatesKey, runtime), this._rawTemplates);
        ext.context.globalState.update(this.getCacheKey(this._configKey, runtime), this._rawConfig);
        ext.context.globalState.update(this.getCacheKey(this._resourcesKey, runtime), this._rawResources);
    }

    private async parseTemplates(templatesPath: string): Promise<IFunctionTemplate[]> {
        this._rawResources = <object>await fse.readJSON(await getResourcesPath(templatesPath));
        this._rawTemplates = <object[]>await fse.readJSON(path.join(templatesPath, 'templates', 'templates.json'));
        this._rawConfig = <object>await fse.readJSON(path.join(templatesPath, 'bindings', 'bindings.json'));

        return parseScriptTemplates(this._rawResources, this._rawTemplates, this._rawConfig);
    }
}

/**
 * Unlike templates.json and bindings.json, Resources.json has a capital letter
 */
export async function getResourcesPath(templatesPath: string, vscodeLang: string = vscode.env.language): Promise<string> {
    const folder: string = path.join(templatesPath, 'resources');

    try {
        // Example: "en-US"
        const parts: string[] = vscodeLang.split('-');
        // Example: "en" for "english"
        const language: string = parts[0];
        // Example: "US" for "United States" (locale is optional)
        // tslint:disable-next-line: strict-boolean-expressions
        const locale: string | undefined = parts[1] || '[a-z]*';

        const files: string[] = await fse.readdir(folder);
        const regExp: RegExp = new RegExp(`resources\\.${language}(-${locale})?\\.json`, 'i');
        const matchingFile: string | undefined = files.find(f => regExp.test(f));
        if (matchingFile) {
            return path.join(folder, matchingFile);
        }
    } catch {
        // ignore and fall back to english
    }

    return path.join(folder, 'Resources.json');
}

export function getScriptVerifiedTemplateIds(runtime: string): string[] {
    let verifiedTemplateIds: string[] = [
        'BlobTrigger-JavaScript',
        'HttpTrigger-JavaScript',
        'QueueTrigger-JavaScript',
        'TimerTrigger-JavaScript'
    ];

    if (runtime === ProjectRuntime.v1) {
        verifiedTemplateIds = verifiedTemplateIds.concat([
            'GenericWebHook-JavaScript',
            'GitHubWebHook-JavaScript',
            'HttpTriggerWithParameters-JavaScript',
            'ManualTrigger-JavaScript'
        ]);
    } else {
        // For JavaScript, only include triggers that require extensions in v2. v1 doesn't have the same support for 'func extensions install'
        verifiedTemplateIds = verifiedTemplateIds.concat([
            'CosmosDBTrigger-JavaScript',
            'EventGridTrigger-JavaScript',
            'ServiceBusQueueTrigger-JavaScript',
            'ServiceBusTopicTrigger-JavaScript'
        ]);

        const javaScriptTemplateIds: string[] = verifiedTemplateIds;

        // Python is only supported in v2 - same functions as JavaScript
        verifiedTemplateIds = verifiedTemplateIds.concat(javaScriptTemplateIds.map(t => t.replace('JavaScript', 'Python')));

        // TypeScript is only supported in v2 - same functions as JavaScript
        verifiedTemplateIds = verifiedTemplateIds.concat(javaScriptTemplateIds.map(t => t.replace('JavaScript', 'TypeScript')));

        // We only care about PowerShell supported in v2 since v1 implementation was only experimental
        verifiedTemplateIds = verifiedTemplateIds.concat(['HttpTrigger-PowerShell', 'TimerTrigger-PowerShell']);
    }

    return verifiedTemplateIds;
}
