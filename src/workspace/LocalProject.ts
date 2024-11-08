/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, type IActionContext } from "@microsoft/vscode-azext-utils";
import { tasks, type Task } from "vscode";
import { type FuncVersion } from "../FuncVersion";
import { hostFileName, localSettingsFileName } from "../constants";
import { parseHostJson, type IParsedHostJson } from "../funcConfig/host";
import { MismatchBehavior, getLocalSettingsJson, setLocalAppSetting, type ILocalSettingsJson } from "../funcConfig/local.settings";
import { get, getFuncPortFromTaskOrProject, isFuncHostTask, runningFuncTaskMap } from "../funcCoreTools/funcHostTask";
import { type ApplicationSettings, type FuncHostRequest } from "../tree/IProjectTreeItem";
import { ProjectSource } from "../tree/projectContextValues";
import { requestUtils } from "../utils/requestUtils";
import { type LocalProjectInternal, type LocalProjectOptionsInternal } from "./listLocalProjects";
import path = require("path");

export class LocalProject implements LocalProjectInternal {
    source: ProjectSource = ProjectSource.Local;

    constructor(public readonly options: LocalProjectOptionsInternal) { }

    public async getHostJson(): Promise<IParsedHostJson> {
        const version: FuncVersion = await this.getVersion();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        const data = await AzExtFsExtra.readJSON<any>(path.join(this.options.effectiveProjectPath, hostFileName));
        return parseHostJson(data, version);
    }

    public async getVersion(): Promise<FuncVersion> {
        return this.options.version;
    }

    public async getApplicationSettings(context: IActionContext): Promise<ApplicationSettings> {
        const localSettings: ILocalSettingsJson = await getLocalSettingsJson(context, path.join(this.options.effectiveProjectPath, localSettingsFileName));
        return localSettings.Values || {};
    }

    public async setApplicationSetting(context: IActionContext, key: string, value: string): Promise<void> {
        await setLocalAppSetting(context, this.options.effectiveProjectPath, key, value, MismatchBehavior.Overwrite);
    }

    public async getHostRequest(context: IActionContext): Promise<FuncHostRequest> {
        let port = get(runningFuncTaskMap, this.options.folder)?.portNumber;
        if (!port) {
            const funcTask: Task | undefined = (await tasks.fetchTasks()).find(t => t.scope === this.options.folder && isFuncHostTask(t));
            port = await getFuncPortFromTaskOrProject(context, funcTask, this.options.effectiveProjectPath);
        }

        const url = `http://localhost:${port}`;
        try {
            await requestUtils.sendRequestWithExtTimeout(context, { url: url, method: 'GET' });
        } catch {
            try {
                const httpsUrl = url.replace('http', 'https');
                await requestUtils.sendRequestWithExtTimeout(context, { url: httpsUrl, method: 'GET', rejectUnauthorized: false });
                return { url: httpsUrl, rejectUnauthorized: false };
            } catch {
                // ignore
            }
        }

        return { url };
    }
}
