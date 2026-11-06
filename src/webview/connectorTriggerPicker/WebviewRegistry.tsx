/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConnectorTriggerPickerView } from './ConnectorTriggerPickerView';
import { ConnectorTriggerSetupView } from '../connectorTriggerParameters/ConnectorTriggerSetupView';

export const WebviewRegistry = {
    connectorTriggerPicker: ConnectorTriggerPickerView,
    connectorTriggerSetup: ConnectorTriggerSetupView,
} as const;
