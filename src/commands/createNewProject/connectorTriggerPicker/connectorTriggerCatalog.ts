/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type InitialTemplateFilters } from '@microsoft/vscode-azext-webview';
import { localize } from '../../../localize';
import { type ConnectorTriggerOption } from '../../../webview/connectorTriggerPicker/ConnectorTriggerPickerViewModel';

export function getConnectorTriggerOptions(): readonly ConnectorTriggerOption[] {
    return [
        option(
            'office365',
            localize('connectorOffice365Outlook', 'Office 365 Outlook'),
            'https://preprod.static.powerapps.com/resource/ppcr/releases/v1.0.1813/1.0.1813.4756/office365/icon.png',
        ),
        option(
            'sharepointonline',
            localize('connectorSharePoint', 'SharePoint'),
            'https://preprod.static.powerapps.com/resource/ppcr/releases/v1.0.1814/1.0.1814.4751/sharepointonline/icon.png',
        ),
        option(
            'onedriveforbusiness',
            localize('connectorOneDriveForBusiness', 'OneDrive for Business'),
            'https://preprod.static.powerapps.com/resource/ppcr/releases/v1.0.1814/1.0.1814.4751/onedriveforbusiness/icon.png',
        ),
        option(
            'teams',
            localize('connectorMicrosoftTeams', 'Microsoft Teams'),
            'https://preprod.static.powerapps.com/resource/ppcr/u/kanchm/fix-pa-notification-url/1.0.1814.4758/teams/icon.png',
        ),
        option(
            'excelonlinebusiness',
            localize('connectorExcelOnlineBusiness', 'Excel Online (Business)'),
            'https://preprod.static.powerapps.com/resource/ppcr/u/ksgaipal/excelonline-buffer-request-body/1.0.1814.4751/excelonlinebusiness/icon.png',
        ),
        option(
            'planner',
            localize('connectorPlanner', 'Planner'),
            'https://preprod.static.powerapps.com/resource/ppcr/releases/v1.0.1808/1.0.1808.4692/planner/icon.png',
        ),
        option(
            'todobusiness',
            localize('connectorMicrosoftTodoBusiness', 'Microsoft To-Do (Business)'),
            'https://preprod.static.powerapps.com/resource/ppcr/releases/v1.0.1797/1.0.1797.4628/todo/icon.png',
        ),
        option(
            'onenote',
            localize('connectorOneNoteBusiness', 'OneNote (Business)'),
            'https://preprod.static.powerapps.com/resource/ppcr/releases/v1.0.1810/1.0.1810.4710/onenote/icon.png',
        ),
        option(
            'microsoftforms',
            localize('connectorMicrosoftForms', 'Microsoft Forms'),
            'https://conn-afd-test-endpoint-ekb7c2aueydtd3bf.b02.azurefd.net/v1.0.1774/1.0.1774.4397/microsoftforms/icon.png',
        ),
        option(
            'office365users',
            localize('connectorOffice365Users', 'Office 365 Users'),
            'https://preprod.static.powerapps.com/resource/ppcr/master/1.0.1811.4727/office365users/icon.png',
        ),
        option(
            'office365groups',
            localize('connectorOffice365Groups', 'Office 365 Groups'),
            'https://conn-afd-test-endpoint-ekb7c2aueydtd3bf.b02.azurefd.net/releases/v1.0.1777/1.0.1777.4410/office365groups/icon.png',
        ),
        option(
            'shifts',
            localize('connectorShifts', 'Shifts for Microsoft Teams'),
            'https://conn-afd-test-endpoint-ekb7c2aueydtd3bf.b02.azurefd.net/releases/v1.0.1747/1.0.1748.4181/shifts/icon.png',
        ),
        option(
            'powerpoint',
            localize('connectorPowerPoint', 'PowerPoint'),
            'https://conn-afd-test-endpoint-ekb7c2aueydtd3bf.b02.azurefd.net/powerpoint_new/1.0.1768.4341/powerpoint/icon.png',
        ),
        option(
            'microsoftbookings',
            localize('connectorMicrosoftBookings', 'Microsoft Bookings'),
            'https://conn-afd-test-endpoint-ekb7c2aueydtd3bf.b02.azurefd.net/v1.0.1778/1.0.1778.4417/microsoftbookings/icon.png',
        ),
        option(
            'excelonline',
            localize('connectorExcelOnlineOneDrive', 'Excel Online (OneDrive)'),
            'https://preprod.static.powerapps.com/resource/ppcr/releases/v1.0.1811/1.0.1811.4732/excelonline/icon.png',
        ),
        option(
            'MSGraphGroupsandUser',
            localize('connectorMsGraphGroupsUsers', 'MS Graph Groups and Users'),
            'https://conn-afd-test-endpoint-ekb7c2aueydtd3bf.b02.azurefd.net/releases/v1.0.1783/1.0.1783.4453/MSGraphGroupsandUser/icon.png',
        ),
        option(
            'office365groupsmail',
            localize('connectorOffice365GroupsMail', 'Office 365 Groups Mail'),
            'https://preprod.static.powerapps.com/resource/ppcr/danweiguo/groupsmail-fix-connectionfic-scope/1.0.1812.4748/office365groupsmail/icon.png',
        ),
        option(
            'onedrive',
            localize('connectorOneDrive', 'OneDrive'),
            'https://conn-afd-test-endpoint-ekb7c2aueydtd3bf.b02.azurefd.net/v1.0.1779/1.0.1779.4426/onedrive/icon.png',
        ),
        option(
            'outlook',
            localize('connectorOutlookCom', 'Outlook.com'),
            'https://preprod.static.powerapps.com/resource/ppcr/master/1.0.1811.4727/outlook/icon.png',
        ),
        option(
            'wordonlinebusiness',
            localize('connectorWordOnlineBusiness', 'Word Online (Business)'),
            'https://preprod.static.powerapps.com/resource/ppcr/master/1.0.1811.4727/wordonlinebusiness/icon.png',
        ),
        option(
            'yammer',
            localize('connectorVivaEngage', 'Viva Engage'),
            'https://conn-afd-test-endpoint-ekb7c2aueydtd3bf.b02.azurefd.net/releases/v1.0.1788/1.0.1788.4524/yammer/icon.png',
        ),
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

export function getConnectorTriggerIconSources(): readonly string[] {
    return [...new Set(
        getConnectorTriggerOptions()
            .map(option => option.iconUrl)
            .filter((iconUrl): iconUrl is string => !!iconUrl)
            .map(iconUrl => new URL(iconUrl).origin),
    )];
}

function option(id: string, label: string, iconUrl: string): ConnectorTriggerOption {
    return { id, label, iconUrl, templateSearch: label };
}
