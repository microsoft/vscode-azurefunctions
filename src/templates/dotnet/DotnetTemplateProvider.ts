/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { IActionContext } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';
import { cliFeedUtils } from '../../utils/cliFeedUtils';
import { dotnetUtils } from '../../utils/dotnetUtils';
import { downloadFile } from '../../utils/fs';
import { ITemplates } from '../ITemplates';
import { TemplateProviderBase, TemplateType } from '../TemplateProviderBase';
import { executeDotnetTemplateCommand, getDotnetItemTemplatePath, getDotnetProjectTemplatePath, getDotnetTemplatesPath } from './executeDotnetTemplateCommand';
import { parseDotnetTemplates } from './parseDotnetTemplates';

export class DotnetTemplateProvider extends TemplateProviderBase {
    public templateType: TemplateType = TemplateType.Dotnet;
    private readonly _dotnetTemplatesKey: string = 'DotnetTemplates';
    private _rawTemplates: object[];

    public async getCachedTemplates(): Promise<ITemplates | undefined> {
        const projectFilePath: string = getDotnetProjectTemplatePath(this.version);
        const itemFilePath: string = getDotnetItemTemplatePath(this.version);
        if (!await fse.pathExists(projectFilePath) || !await fse.pathExists(itemFilePath)) {
            return undefined;
        }

        const cachedDotnetTemplates: object[] | undefined = ext.context.globalState.get<object[]>(this.getCacheKey(this._dotnetTemplatesKey));
        if (cachedDotnetTemplates) {
            return await parseDotnetTemplates(cachedDotnetTemplates, this.version);
        } else {
            return undefined;
        }
    }

    public async getLatestTemplateVersion(): Promise<string> {
        return await cliFeedUtils.getLatestVersion(this.version);
    }

    public async getLatestTemplates(context: IActionContext, latestTemplateVersion: string): Promise<ITemplates> {
        await dotnetUtils.validateDotnetInstalled(context);

        const release: cliFeedUtils.IRelease = await cliFeedUtils.getRelease(latestTemplateVersion);

        const projectFilePath: string = getDotnetProjectTemplatePath(this.version);
        await downloadFile(release.projectTemplates, projectFilePath);

        const itemFilePath: string = getDotnetItemTemplatePath(this.version);
        await downloadFile(release.itemTemplates, itemFilePath);

        return await this.parseTemplates();
    }

    public async getBackupTemplates(): Promise<ITemplates> {
        await fse.copy(ext.context.asAbsolutePath(path.join('resources', 'backupDotnetTemplates')), getDotnetTemplatesPath(), { overwrite: true, recursive: false });
        return await this.parseTemplates();
    }

    public async cacheTemplates(): Promise<void> {
        ext.context.globalState.update(this.getCacheKey(this._dotnetTemplatesKey), this._rawTemplates);
    }

    private async parseTemplates(): Promise<ITemplates> {
        this._rawTemplates = <object[]>JSON.parse(await executeDotnetTemplateCommand(this.version, undefined, 'list'));
        return parseDotnetTemplates(this._rawTemplates, this.version);
    }
}
