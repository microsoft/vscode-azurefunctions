/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtTreeItem, NoResourceFoundError, TreeItemIconPath } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { ext } from '../extensionVariables';

export namespace treeUtils {
    export function findNearestParent<T extends AzExtTreeItem>(node: AzExtTreeItem, parentContextValues: string | RegExp | (string | RegExp)[]): T {
        parentContextValues = Array.isArray(parentContextValues) ? parentContextValues : [parentContextValues];
        if (!parentContextValues.length) throw new NoResourceFoundError();

        let currentNode: AzExtTreeItem = node;
        let foundParent: boolean = false;
        while (currentNode.parent) {
            for (const contextValue of parentContextValues) {
                const parentRegex: RegExp = contextValue instanceof RegExp ? contextValue : new RegExp(contextValue);
                if (parentRegex.test(currentNode.contextValue)) {
                    foundParent = true;
                    break;
                }
            }
            if (foundParent) break;
            currentNode = currentNode.parent;
        }
        if (!foundParent) throw new NoResourceFoundError();
        return currentNode as T;
    }

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
}
