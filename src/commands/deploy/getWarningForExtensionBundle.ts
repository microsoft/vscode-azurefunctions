/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from "@microsoft/vscode-azext-utils";
import * as semver from 'semver';
import { hostFileName } from "../../constants";
import { type IHostJsonV2 } from "../../funcConfig/host";
import { localize } from "../../localize";
import { requestUtils } from "../../utils/requestUtils";
import { type IFuncDeployContext } from "./deploy";
import path = require("path");

export async function getWarningForExtensionBundle(context: IFuncDeployContext): Promise<string | undefined> {
    const hostFilePath: string = path.join(context.projectPath, hostFileName);
    let hostJson: IHostJsonV2;
    try {
        hostJson = await AzExtFsExtra.readJSON<IHostJsonV2>(hostFilePath);
        const defaultExtensionBundleVersionResponse = (await requestUtils.sendRequestWithExtTimeout(context, { method: 'GET', url: 'https://aka.ms/funcStaticProperties' })).bodyAsText;
        if (hostJson.extensionBundle && hostJson.extensionBundle.version && defaultExtensionBundleVersionResponse) {
            const responseJson = JSON.parse(defaultExtensionBundleVersionResponse) as { defaultVersionRange: string };
            const hostRange = normalizeRange(hostJson.extensionBundle.version);
            const defaultRange = normalizeRange(responseJson.defaultVersionRange);
            if (!hostRange || !defaultRange) {
                return;
            }
            if (!semver.intersects(hostRange, defaultRange)) {
                const warningMessage: string = localize('warningMessage', `Your apps is using a deprecated version {0} of extension bundles. Upgrade to [4.*, 5.0.0).`, hostJson.extensionBundle?.version);
                return warningMessage;
            }
        }
    } catch (error) {
        return;
    }
    return;
}

function normalizeRange(range: string): string | undefined {
    const match = range.match(/\[(\d+(?:\.\d+\.\d+)?|\d+)\.\*,\s*(\d+\.\d+\.\d+)\)/) ||
        range.match(/\[(\d+\.\d+\.\d+),\s*(\d+\.\d+\.\d+)\)/);
    if (match) {
        const lower = match[1].includes('*') ? match[1].replace('*', '0.0.0') : match[1];
        return `>=${lower} <${match[2]}`;
    }
    return undefined;
}
