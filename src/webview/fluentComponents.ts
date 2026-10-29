/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The webview kit's CommonJS build imports the Fluent suite barrel. Re-exporting
// its ESM barrel keeps the public API while allowing esbuild to tree-shake it.
export {
    Button,
    Card,
    FluentProvider,
    createDarkTheme,
    createLightTheme,
    teamsDarkTheme,
    teamsHighContrastTheme,
    teamsLightTheme,
} from '../../node_modules/@fluentui/react-components/lib/index.js';
