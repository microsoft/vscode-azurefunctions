/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type InitialTemplateFilters } from '@microsoft/vscode-azext-webview';
import { localize } from '../../../localize';
import { type ConnectorTriggerOption } from '../../../webview/connectorTriggerPicker/ConnectorTriggerPickerViewModel';

export function getConnectorTriggerOptions(): readonly ConnectorTriggerOption[] {
    return [
        option('office365', localize('connectorOffice365Outlook', 'Office 365 Outlook')),
        option('sharepointonline', localize('connectorSharePoint', 'SharePoint')),
        option('onedriveforbusiness', localize('connectorOneDriveForBusiness', 'OneDrive for Business')),
        option('teams', localize('connectorMicrosoftTeams', 'Microsoft Teams')),
        option('excelonlinebusiness', localize('connectorExcelOnlineBusiness', 'Excel Online (Business)')),
        option('planner', localize('connectorPlanner', 'Planner')),
        option('todobusiness', localize('connectorMicrosoftTodoBusiness', 'Microsoft To-Do (Business)')),
        option('onenote', localize('connectorOneNoteBusiness', 'OneNote (Business)')),
        option('microsoftforms', localize('connectorMicrosoftForms', 'Microsoft Forms')),
        option('office365users', localize('connectorOffice365Users', 'Office 365 Users')),
        option('office365groups', localize('connectorOffice365Groups', 'Office 365 Groups')),
        option('shifts', localize('connectorShifts', 'Shifts for Microsoft Teams')),
        option('powerpoint', localize('connectorPowerPoint', 'PowerPoint')),
        option('microsoftbookings', localize('connectorMicrosoftBookings', 'Microsoft Bookings')),
        option('excelonline', localize('connectorExcelOnlineOneDrive', 'Excel Online (OneDrive)')),
        option('MSGraphGroupsandUser', localize('connectorMsGraphGroupsUsers', 'MS Graph Groups and Users')),
        option('office365groupsmail', localize('connectorOffice365GroupsMail', 'Office 365 Groups Mail')),
        option('onedrive', localize('connectorOneDrive', 'OneDrive')),
        option('outlook', localize('connectorOutlookCom', 'Outlook.com')),
        option('wordonlinebusiness', localize('connectorWordOnlineBusiness', 'Word Online (Business)')),
        option('yammer', localize('connectorVivaEngage', 'Viva Engage')),
    ];
}

export function getConnectorTriggerOption(connectorId: string): ConnectorTriggerOption | undefined {
    return getConnectorTriggerOptions().find(option => option.id === connectorId);
}

export function getConnectorTriggerTemplateFilters(
    initialFilters: InitialTemplateFilters,
    connectorId: string,
): InitialTemplateFilters | undefined {
    const connector = getConnectorTriggerOption(connectorId);
    return connector ? { ...initialFilters, search: connector.templateSearch } : undefined;
}

function option(id: string, label: string): ConnectorTriggerOption {
    return { id, label, templateSearch: label };
}
