/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtTreeItem, TreeItemIconPath } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { ext } from '../extensionVariables';

export namespace treeUtils {
    export function getIconPath(iconName: string): TreeItemIconPath {
        return path.join(getResourcesPath(), `${iconName}.svg`);
    }

    export function getThemedIconPath(iconName: string): TreeItemIconPath {
        return {
            light: path.join(getResourcesPath(), 'light', `${iconName}.svg`),
            dark: path.join(getResourcesPath(), 'dark', `${iconName}.svg`)
        };
    }

    function getResourcesPath(): string {
        return ext.context.asAbsolutePath('resources');
    }

    // replace with azext-utils when it's released
    export function isAzExtTreeItem(ti: unknown): ti is AzExtTreeItem {
        return !!ti && (ti as AzExtTreeItem).fullId !== undefined && (ti as AzExtTreeItem).fullId !== null;
    }
}
