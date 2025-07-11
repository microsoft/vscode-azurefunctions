/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppSettingTreeItem } from "@microsoft/vscode-azext-azureappsettings";
import { type TreeItemIconPath } from "@microsoft/vscode-azext-utils";
import { ThemeIcon } from "vscode";

/**
 * Tracks the visibility state of app settings by their key
 */
// const hiddenSettings = new Map<string, boolean>();

/**
 * Check if an app setting value is currently hidden based on its label
 */
function isSettingValueHidden(settingTreeItem: AppSettingTreeItem): boolean {
    // The label contains "Hidden value. Click to view." when the value is hidden
    return settingTreeItem.label.includes('Hidden value. Click to view.');
}

/**
 * Patches the AppSettingTreeItem to provide dynamic icons based on visibility state
 */
export function patchAppSettingTreeItem(): void {
    const originalIconPath = Object.getOwnPropertyDescriptor(AppSettingTreeItem.prototype, 'iconPath');
    
    if (originalIconPath) {
        // Override the iconPath getter
        Object.defineProperty(AppSettingTreeItem.prototype, 'iconPath', {
            get: function(this: AppSettingTreeItem): TreeItemIconPath {
                // If this is a connection string setting, show warning icon (preserve original behavior)
                if (this.contextValue.includes('convertSetting')) {
                    return new ThemeIcon('warning');
                }

                // Determine if the value is hidden based on the label
                const isHidden = isSettingValueHidden(this);
                
                // Show appropriate eye icon based on visibility state
                return new ThemeIcon(isHidden ? 'eye' : 'eye-closed');
            },
            configurable: true,
            enumerable: true
        });
    }
}