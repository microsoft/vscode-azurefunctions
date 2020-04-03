/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as extract from 'extract-zip';
import * as fse from 'fs-extra';
import * as path from 'path';
import { IActionContext } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';
import { FuncVersion } from '../../FuncVersion';
import { bundleFeedUtils } from '../../utils/bundleFeedUtils';
import { cliFeedUtils } from '../../utils/cliFeedUtils';
import { getRandomHexString } from '../../utils/fs';
import { requestUtils } from '../../utils/requestUtils';
import { IBindingTemplate } from '../IBindingTemplate';
import { IFunctionTemplate } from '../IFunctionTemplate';
import { ITemplates } from '../ITemplates';
import { TemplateProviderBase, TemplateType } from '../TemplateProviderBase';
import { english, getScriptResourcesLanguage } from './getScriptResourcesLanguage';
import { parseScriptTemplates } from './parseScriptTemplates';

export class ScriptTemplateProvider extends TemplateProviderBase {
    public templateType: TemplateType = TemplateType.Script;
    protected readonly _backupSubpath: string = 'backupScriptTemplates';

    protected _rawResources: object;
    protected _rawTemplates: object[];
    protected _rawBindings: object;

    private readonly _templatesKey: string = 'FunctionTemplates';
    private readonly _bindingsKey: string = 'FunctionTemplateConfig';
    private readonly _resourcesKey: string = 'FunctionTemplateResources';

    public async getCachedTemplates(): Promise<ITemplates | undefined> {
        const cachedResources: object | undefined = await this.getCachedValue(this._resourcesKey);
        const cachedTemplates: object[] | undefined = await this.getCachedValue(this._templatesKey);
        const cachedConfig: object | undefined = await this.getCachedValue(this._bindingsKey);
        if (cachedResources && cachedTemplates && cachedConfig) {
            return parseScriptTemplates(cachedResources, cachedTemplates, cachedConfig);
        } else {
            return undefined;
        }
    }

    public async getLatestTemplateVersion(): Promise<string> {
        return await cliFeedUtils.getLatestVersion(this.version);
    }

    public async getLatestTemplates(_context: IActionContext, latestTemplateVersion: string): Promise<ITemplates> {
        const templateRelease: cliFeedUtils.IRelease = await cliFeedUtils.getRelease(latestTemplateVersion);

        const templatesPath: string = path.join(ext.context.globalStoragePath, 'scriptTemplates');
        try {
            const filePath: string = path.join(templatesPath, `${getRandomHexString()}.zip`);
            await requestUtils.downloadFile(templateRelease.templateApiZip, filePath);

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
        const backupTemplatesPath: string = ext.context.asAbsolutePath(path.join('resources', this._backupSubpath, this.version));
        return await this.parseTemplates(backupTemplatesPath);
    }

    public async cacheTemplates(): Promise<void> {
        await this.updateCachedValue(this._templatesKey, this._rawTemplates);
        await this.updateCachedValue(this._bindingsKey, this._rawBindings);
        await this.updateCachedValue(this._resourcesKey, this._rawResources);
    }

    public includeTemplate(template: IFunctionTemplate | IBindingTemplate): boolean {
        return this.version === FuncVersion.v1 || !bundleFeedUtils.isBundleTemplate(template);
    }

    protected async parseTemplates(templatesPath: string): Promise<ITemplates> {
        const language: string = getScriptResourcesLanguage();
        // Unlike templates.json and bindings.json, Resources.json has a capital letter
        this._rawResources = <object>await fse.readJSON(path.join(templatesPath, 'resources', `Resources${language === english ? '' : '.' + language}.json`));
        this._rawTemplates = <object[]>await fse.readJSON(path.join(templatesPath, 'templates', 'templates.json'));
        this._rawBindings = <object>await fse.readJSON(path.join(templatesPath, 'bindings', 'bindings.json'));

        return parseScriptTemplates(this._rawResources, this._rawTemplates, this._rawBindings);
    }
}
