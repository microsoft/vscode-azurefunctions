/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import { FileType } from 'vscode';
import { localize } from '../localize';

// The Connector worker extension only ships a net8.0 dependency group, so it needs .NET 8 isolated or later.
const minimumMajorVersion = 8;

/**
 * Returns the target framework (e.g. "net8.0") for a .NET project template key (e.g. "net8.0-isolated"),
 * or undefined when the runtime cannot host Connector Trigger functions.
 */
export function getConnectorTriggerTargetFramework(projectTemplateKey: string | undefined): string | undefined {
    const match = /^net(\d+)\.0-isolated$/i.exec(projectTemplateKey ?? '');
    return match && Number(match[1]) >= minimumMajorVersion ? `net${match[1]}.0` : undefined;
}

export async function retargetConnectorTriggerProject(projectPath: string, targetFramework: string): Promise<void> {
    const projectFiles = (await AzExtFsExtra.readDirectory(projectPath))
        .filter(entry => entry.type === FileType.File && /\.csproj$/i.test(entry.name))
        .map(entry => entry.fsPath);
    const pattern = /<TargetFramework>\s*[^<]*\s*<\/TargetFramework>/g;
    const contents = projectFiles.length === 1 ? await AzExtFsExtra.readFile(projectFiles[0]) : '';
    if (contents.match(pattern)?.length !== 1) {
        throw new Error(localize('connectorTriggerRetargetFailed', 'The Connector Trigger project template could not be configured for {0}.', targetFramework));
    }
    await AzExtFsExtra.writeFile(projectFiles[0], contents.replace(pattern, `<TargetFramework>${targetFramework}</TargetFramework>`));
}
