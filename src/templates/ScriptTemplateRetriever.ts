/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as extract from 'extract-zip';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
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
    private _tempPath: string = path.join(os.tmpdir(), 'vscode-azurefunctions-templates');
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

    protected async getTemplatesFromCliFeed(cliFeedJson: cliFeedJsonResponse, templateVersion: string, _runtime: ProjectRuntime): Promise<IFunctionTemplate[]> {
        try {
            const filePath: string = path.join(this._tempPath, `templates-${templateVersion}.zip`);
            await downloadFile(cliFeedJson.releases[templateVersion].templateApiZip, filePath);

            await new Promise(async (resolve: () => void, reject: (e: Error) => void): Promise<void> => {
                // tslint:disable-next-line:no-unsafe-any
                extract(filePath, { dir: this._tempPath }, (err: Error) => {
                    // tslint:disable-next-line:strict-boolean-expressions
                    if (err) {
                        reject(err);
                    }
                    resolve();
                });
            });

            // only Resources.json has a capital letter
            this._rawResources = <object>await fse.readJSON(path.join(this._tempPath, 'resources', 'Resources.json'));
            this._rawTemplates = <object[]>await fse.readJSON(path.join(this._tempPath, 'templates', 'templates.json'));
            this._rawConfig = <object>await fse.readJSON(path.join(this._tempPath, 'bindings', 'bindings.json'));

            return parseScriptTemplates(this._rawResources, this._rawTemplates, this._rawConfig);
        } finally {
            if (await fse.pathExists(this._tempPath)) {
                await fse.remove(this._tempPath);
            }
        }
    }

    protected async cacheTemplatesFromCliFeed(runtime: ProjectRuntime): Promise<void> {
        ext.context.globalState.update(this.getCacheKey(this._templatesKey, runtime), this._rawTemplates);
        ext.context.globalState.update(this.getCacheKey(this._configKey, runtime), this._rawConfig);
        ext.context.globalState.update(this.getCacheKey(this._resourcesKey, runtime), this._rawResources);
    }
}

export function getScriptVerifiedTemplateIds(runtime: string): string[] {
    let verifiedTemplateIds: string[] = [
        'BlobTrigger-JavaScript',
        'HttpTrigger-JavaScript',
        'QueueTrigger-JavaScript',
        'TimerTrigger-JavaScript'
    ];

    if (runtime === ProjectRuntime.one) {
        verifiedTemplateIds = verifiedTemplateIds.concat([
            'GenericWebHook-JavaScript',
            'GitHubWebHook-JavaScript',
            'HttpTriggerWithParameters-JavaScript',
            'ManualTrigger-JavaScript'
        ]);
    }

    return verifiedTemplateIds;
}
