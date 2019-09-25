/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as extract from 'extract-zip';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { IActionContext } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';
import { downloadFile } from '../../utils/fs';
import { cliFeedJsonResponse } from '../../utils/getCliFeedJson';
import { ITemplates } from '../ITemplates';
import { TemplateProviderBase, TemplateType } from '../TemplateProviderBase';
import { getScriptResourcesPath } from './getScriptResourcesPath';
import { parseScriptTemplates } from './parseScriptTemplates';

export class ScriptTemplateProvider extends TemplateProviderBase {
    public templateType: TemplateType = TemplateType.Script;
    protected readonly _templatesKey: string = 'FunctionTemplates';
    protected readonly _configKey: string = 'FunctionTemplateConfig';
    protected readonly _resourcesKey: string = 'FunctionTemplateResources';

    protected _rawResources: object;
    protected _rawTemplates: object[];
    protected _rawConfig: object;

    public async getCachedTemplates(): Promise<ITemplates | undefined> {
        const cachedResources: object | undefined = ext.context.globalState.get<object>(this.getCacheKey(this._resourcesKey));
        const cachedTemplates: object[] | undefined = ext.context.globalState.get<object[]>(this.getCacheKey(this._templatesKey));
        const cachedConfig: object | undefined = ext.context.globalState.get<object>(this.getCacheKey(this._configKey));
        if (cachedResources && cachedTemplates && cachedConfig) {
            return parseScriptTemplates(cachedResources, cachedTemplates, cachedConfig);
        } else {
            return undefined;
        }
    }

    public async getLatestTemplates(cliFeedJson: cliFeedJsonResponse, templateVersion: string, _context: IActionContext): Promise<ITemplates> {
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

    public async getBackupTemplates(): Promise<ITemplates> {
        const backupTemplatesPath: string = ext.context.asAbsolutePath(path.join('resources', 'backupScriptTemplates', this.runtime));
        return await this.parseTemplates(backupTemplatesPath);
    }

    public async cacheTemplates(): Promise<void> {
        ext.context.globalState.update(this.getCacheKey(this._templatesKey), this._rawTemplates);
        ext.context.globalState.update(this.getCacheKey(this._configKey), this._rawConfig);
        ext.context.globalState.update(this.getCacheKey(this._resourcesKey), this._rawResources);
    }

    protected async parseTemplates(templatesPath: string): Promise<ITemplates> {
        this._rawResources = <object>await fse.readJSON(await getScriptResourcesPath(templatesPath));
        this._rawTemplates = <object[]>await fse.readJSON(path.join(templatesPath, 'templates', 'templates.json'));
        this._rawConfig = <object>await fse.readJSON(path.join(templatesPath, 'bindings', 'bindings.json'));

        return parseScriptTemplates(this._rawResources, this._rawTemplates, this._rawConfig);
    }
}
