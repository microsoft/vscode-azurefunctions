/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ConnectorTriggerSdkBinding {
    csharp?: { namespace: string; payloadType: string };
    python?: { importPath: string; moduleName: string; itemType: string };
    typescript: { helper?: string; importPath?: string; itemType?: string };
}

export const connectorSdkVersions = {
    "node": {
        "@azure/functions": "4.17.0",
        "@azure/functions-extensions-connectors": "0.2.0-preview",
        "@azure/connectors": "0.4.0-preview"
    },
    "csharp": "0.15.0-preview.1",
    "python": {
        "azurefunctions-extensions-connectors": "1.0.0b4",
        "azure-connectors": "0.6.0b1"
    },
    "nodeMinimumVersion": "24.0.0"
};

/** TypeScript item type for operations without an SDK model; it needs no import. */
const untypedItemType = 'Record<string, unknown>';

/** SDK modules shared by all of a connector's operations. */
interface ConnectorSdkPackages {
    /** Module that exports the connector's TypeScript item types. */
    typescript?: string;
    /** Namespace of the connector's C# trigger payload types. */
    csharp?: string;
    python?: { importPath: string; moduleName: string };
}

/** Per-operation SDK types; a language is supported when its type is set. */
interface ConnectorSdkOperation {
    /** TypeScript item type, imported from the connector's `typescript` module unless it is {@link untypedItemType}. */
    itemType?: string;
    /** `connectors.<helper>` registration from `@azure/functions-extensions-connectors`. */
    helper?: string;
    /** C# trigger payload type in the connector's `csharp` namespace. */
    payloadType?: string;
    /** Python item type in the connector's `python` module. */
    pythonItemType?: string;
}

type ConnectorSdkTableEntry = readonly [ConnectorSdkPackages, readonly (readonly [operationId: string, operation: ConnectorSdkOperation])[]];

// Hand-maintained. Add an entry only after verifying its types against the pinned SDK packages above.
const connectorSdkTable: Readonly<Record<string, ConnectorSdkTableEntry>> = {
    azureblob: [{ typescript: '@azure/connectors/generated/AzureblobExtensions', csharp: 'Azure.Connectors.Sdk.AzureBlob.Models' }, [
        ['OnUpdatedFiles_V2', { itemType: 'BlobMetadata', payloadType: 'AzureBlobOnUpdatedFilesTriggerPayload' }],
    ]],
    box: [{ typescript: '@azure/connectors/generated/BoxExtensions', csharp: 'Azure.Connectors.Sdk.Box.Models' }, [
        ['OnNewFilesV2', { itemType: 'BlobMetadata', payloadType: 'BoxOnNewFilesTriggerPayload' }],
        ['OnUpdatedFilesV2', { itemType: 'BlobMetadata', payloadType: 'BoxOnUpdatedFilesTriggerPayload' }],
    ]],
    commondataservice: [{ typescript: '@azure/connectors/generated/CommondataserviceExtensions', csharp: 'Azure.Connectors.Sdk.Commondataservice.Models', python: { importPath: 'azurefunctions.extensions.connectors.commondataservice', moduleName: 'commondataservice' } }, [
        ['GetOnDeletedItems_V2', { payloadType: 'CommondataserviceOnDeletedItemsTriggerPayload', pythonItemType: 'Item' }],
        ['GetOnNewItems_V2', { itemType: 'Item', payloadType: 'CommondataserviceOnNewItemsTriggerPayload', pythonItemType: 'Item' }],
        ['GetOnUpdatedItems_V2', { itemType: 'Item', payloadType: 'CommondataserviceOnUpdatedItemsTriggerPayload', pythonItemType: 'Item' }],
    ]],
    dataflows: [{ python: { importPath: 'azurefunctions.extensions.connectors.dataflows', moduleName: 'dataflows' } }, [
        ['OnRefreshComplete', { helper: 'dataflows.onRefreshComplete', pythonItemType: 'RefreshModel' }],
    ]],
    dropbox: [{ typescript: '@azure/connectors/generated/DropboxExtensions', csharp: 'Azure.Connectors.Sdk.Dropbox.Models' }, [
        ['OnNewFiles', { itemType: 'BlobMetadata', payloadType: 'DropboxOnNewFilesTriggerPayload' }],
        ['OnUpdatedFiles', { itemType: 'BlobMetadata', payloadType: 'DropboxOnUpdatedFilesTriggerPayload' }],
    ]],
    eventbrite: [{ csharp: 'Azure.Connectors.Sdk.Eventbrite.Models' }, [
        ['OnNewEventV2', { itemType: untypedItemType, payloadType: 'EventbriteOnNewEventTriggerPayload' }],
        ['OnOrderChangedV2', { itemType: untypedItemType, payloadType: 'EventbriteOnOrderChangedTriggerPayload' }],
    ]],
    eventhubs: [{ typescript: '@azure/connectors/generated/EventhubsExtensions', csharp: 'Azure.Connectors.Sdk.Eventhubs.Models' }, [
        ['OnNewEvents', { itemType: 'Event', payloadType: 'EventHubsOnNewEventsTriggerPayload' }],
    ]],
    freshservice: [{ typescript: '@azure/connectors/generated/FreshserviceExtensions', csharp: 'Azure.Connectors.Sdk.FreshService.Models' }, [
        ['OnTicketCreatedV2', { itemType: 'ListTicketResponse', payloadType: 'FreshServiceOnTicketCreatedTriggerPayload' }],
    ]],
    ftp: [{ typescript: '@azure/connectors/generated/FtpExtensions', csharp: 'Azure.Connectors.Sdk.Ftp.Models' }, [
        ['OnUpdatedFiles', { itemType: 'BlobMetadata', payloadType: 'FtpOnUpdatedFilesTriggerPayload' }],
    ]],
    github: [{ typescript: '@azure/connectors/generated/GithubExtensions', csharp: 'Azure.Connectors.Sdk.GitHub.Models' }, [
        ['IssueAssigned', { itemType: 'IssueDetailsModel', payloadType: 'GitHubOnIssueAssignedTriggerPayload' }],
        ['IssueClosed', { itemType: 'IssueDetailsModel', payloadType: 'GitHubOnIssueClosedTriggerPayload' }],
        ['IssueOpened', { itemType: 'IssueDetailsModel', payloadType: 'GitHubOnIssueOpenedTriggerPayload' }],
    ]],
    infusionsoft: [{ typescript: '@azure/connectors/generated/InfusionsoftExtensions', csharp: 'Azure.Connectors.Sdk.Infusionsoft.Models' }, [
        ['OnNewOrder', { itemType: untypedItemType, payloadType: 'InfusionsoftOnNewOrderTriggerPayload' }],
        ['OnNewTask', { itemType: 'TaskResponse', payloadType: 'InfusionsoftOnNewTaskTriggerPayload' }],
    ]],
    jira: [{ typescript: '@azure/connectors/generated/JiraExtensions', csharp: 'Azure.Connectors.Sdk.Jira.Models' }, [
        ['OnCloseIssue_Datacenter', { itemType: 'FullIssue', payloadType: 'JiraOnCloseIssueDatacenterTriggerPayload' }],
        ['OnCloseIssue_V2', { itemType: 'FullIssue', payloadType: 'JiraOnCloseIssueTriggerPayload' }],
        ['OnNewIssueJQL_Datacenter', { itemType: 'FullIssue', payloadType: 'JiraOnNewIssueJQLDatacenterTriggerPayload' }],
        ['OnNewIssueJQL_V2', { itemType: 'FullIssue', payloadType: 'JiraOnNewIssueJQLTriggerPayload' }],
        ['OnNewIssue_Datacenter', { itemType: 'FullIssue', payloadType: 'JiraOnNewIssueDatacenterTriggerPayload' }],
        ['OnNewIssue_V2', { itemType: 'FullIssue', payloadType: 'JiraOnNewIssueTriggerPayload' }],
    ]],
    office365: [{ typescript: '@azure/connectors/generated/Office365Extensions', csharp: 'Azure.Connectors.Sdk.Office365.Models', python: { importPath: 'azurefunctions.extensions.connectors.office365', moduleName: 'office365' } }, [
        ['CalendarGetOnChangedItemsV3', { itemType: 'GraphCalendarEventClientWithActionType', helper: 'office365.onCalendarChangedItems', payloadType: 'Office365OnCalendarChangedItemsTriggerPayload', pythonItemType: 'GraphCalendarEventClientWithActionType' }],
        ['CalendarGetOnNewItemsV3', { itemType: 'GraphCalendarEventClientReceive', helper: 'office365.onCalendarNewItems', payloadType: 'Office365OnCalendarNewItemsTriggerPayload', pythonItemType: 'GraphCalendarEventClientReceive' }],
        ['CalendarGetOnUpdatedItemsV3', { itemType: 'GraphCalendarEventClientReceive', helper: 'office365.onCalendarUpdatedItems', payloadType: 'Office365OnCalendarUpdatedItemsTriggerPayload', pythonItemType: 'GraphCalendarEventClientReceive' }],
        ['OnFlaggedEmailV4', { itemType: 'GraphClientReceiveMessage', helper: 'office365.onFlaggedEmail', payloadType: 'Office365OnFlaggedEmailTriggerPayload', pythonItemType: 'GraphClientReceiveMessage' }],
        ['OnNewEmailV3', { itemType: 'GraphClientReceiveMessage', helper: 'office365.onNewEmail', payloadType: 'Office365OnNewEmailTriggerPayload', pythonItemType: 'GraphClientReceiveMessage' }],
        ['OnNewMentionMeEmailV3', { itemType: 'GraphClientReceiveMessage', helper: 'office365.onNewEmailMentioningMe', payloadType: 'Office365OnNewEmailMentioningMeTriggerPayload', pythonItemType: 'GraphClientReceiveMessage' }],
        ['OnUpcomingEventsV3', { itemType: 'GraphCalendarEventClientReceive', helper: 'office365.onUpcomingEvents', payloadType: 'Office365OnUpcomingEventsTriggerPayload', pythonItemType: 'GraphCalendarEventClientReceive' }],
        ['SharedMailboxOnNewEmailV2', { itemType: 'GraphClientReceiveMessage', helper: 'office365.onSharedMailboxNewEmail', payloadType: 'Office365OnSharedMailboxNewEmailTriggerPayload', pythonItemType: 'GraphClientReceiveMessage' }],
    ]],
    office365groups: [{ csharp: 'Azure.Connectors.Sdk.Office365Groups.Models' }, [
        ['OnGroupMembershipChange', { itemType: untypedItemType, payloadType: 'Office365GroupsOnGroupMembershipChangeTriggerPayload' }],
        ['OnNewEvent', { itemType: untypedItemType, payloadType: 'Office365GroupsOnNewEventTriggerPayload' }],
    ]],
    office365groupsmail: [{ typescript: '@azure/connectors/generated/Office365groupsmailExtensions', csharp: 'Azure.Connectors.Sdk.Office365GroupsMail.Models' }, [
        ['OnNewEmailInGroup', { itemType: 'ConversationTriggerResponse', payloadType: 'Office365GroupsMailOnNewEmailInGroupTriggerPayload' }],
    ]],
    onedrive: [{ csharp: 'Azure.Connectors.Sdk.OneDrive.Models' }, [
        ['OnDeletedFiles', { payloadType: 'OneDriveOnDeletedFilesTriggerPayload' }],
        ['OnNewFilesV2', { payloadType: 'OneDriveOnNewFilesTriggerPayload' }],
        ['OnUpdatedFilesV2', { payloadType: 'OneDriveOnUpdatedFilesTriggerPayload' }],
    ]],
    onedriveforbusiness: [{ typescript: '@azure/connectors/generated/OnedriveforbusinessExtensions', csharp: 'Azure.Connectors.Sdk.OneDriveForBusiness.Models', python: { importPath: 'azurefunctions.extensions.connectors.onedriveforbusiness', moduleName: 'onedriveforbusiness' } }, [
        ['OnNewFilesV2', { itemType: 'BlobMetadata', helper: 'onedriveforbusiness.onNewFiles', payloadType: 'OneDriveForBusinessOnNewFilesTriggerPayload', pythonItemType: 'BlobMetadata' }],
        ['OnUpdatedFilesV2', { itemType: 'BlobMetadata', helper: 'onedriveforbusiness.onUpdatedFiles', payloadType: 'OneDriveForBusinessOnUpdatedFilesTriggerPayload', pythonItemType: 'BlobMetadata' }],
    ]],
    onenote: [{ typescript: '@azure/connectors/generated/OnenoteExtensions', csharp: 'Azure.Connectors.Sdk.Onenote.Models' }, [
        ['OnNewPageInSection', { itemType: 'Page', payloadType: 'OnenoteOnNewPageInSectionTriggerPayload' }],
        ['OnNewSectionGroupInNotebook', { itemType: 'SectionGroupResponse', payloadType: 'OnenoteOnNewSectionGroupInNotebookTriggerPayload' }],
        ['OnNewSectionInNotebook', { itemType: 'SectionResponse', payloadType: 'OnenoteOnNewSectionInNotebookTriggerPayload' }],
    ]],
    outlook: [{ typescript: '@azure/connectors/generated/OutlookExtensions', csharp: 'Azure.Connectors.Sdk.Outlook.Models' }, [
        ['CalendarGetOnChangedItemsV2', { itemType: 'CalendarEventClientWithActionType', payloadType: 'OutlookOnCalendarGetOnChangedItemsTriggerPayload' }],
        ['CalendarGetOnNewItemsV2', { itemType: 'CalendarEventClientReceive', payloadType: 'OutlookOnCalendarGetOnNewItemsTriggerPayload' }],
        ['CalendarGetOnUpdatedItemsV2', { itemType: 'CalendarEventClientReceive', payloadType: 'OutlookOnCalendarGetOnUpdatedItemsTriggerPayload' }],
        ['OnFlaggedEmailV2', { itemType: 'ClientReceiveMessage', payloadType: 'OutlookOnFlaggedEmailTriggerPayload' }],
        ['OnNewEmailV2', { itemType: 'ClientReceiveMessage', payloadType: 'OutlookOnNewEmailTriggerPayload' }],
        ['OnNewMentionMeEmailV2', { itemType: 'ClientReceiveMessage', payloadType: 'OutlookOnNewMentionMeEmailTriggerPayload' }],
        ['OnUpcomingEventsV2', { itemType: 'CalendarEventClientReceive', payloadType: 'OutlookOnUpcomingEventsTriggerPayload' }],
    ]],
    pipedrive: [{ typescript: '@azure/connectors/generated/PipedriveExtensions', csharp: 'Azure.Connectors.Sdk.Pipedrive.Models' }, [
        ['TrigNewActivity', { itemType: 'ActivityResponse', payloadType: 'PipedriveOnTrigNewActivityTriggerPayload' }],
        ['TrigNewDealV2', { itemType: 'DealResponseV2', payloadType: 'PipedriveOnTrigNewDealTriggerPayload' }],
    ]],
    planner: [{ typescript: '@azure/connectors/generated/PlannerExtensions', csharp: 'Azure.Connectors.Sdk.Planner.Models', python: { importPath: 'azurefunctions.extensions.connectors.planner', moduleName: 'planner' } }, [
        ['OnCompleteTask_V3', { itemType: 'GetTaskResponseV2', helper: 'planner.onCompleteTask', payloadType: 'PlannerOnCompleteTaskTriggerPayload', pythonItemType: 'GetTaskResponseV2' }],
        ['OnNewTask_V3', { itemType: 'GetTaskResponseV2', helper: 'planner.onNewTask', payloadType: 'PlannerOnNewTaskTriggerPayload', pythonItemType: 'GetTaskResponseV2' }],
        ['OnTaskAssignedToMe_V2', { itemType: 'GetTaskResponseV2', helper: 'planner.onTaskAssignedToMe', payloadType: 'PlannerOnTaskAssignedToMeTriggerPayload', pythonItemType: 'GetTaskResponseV2' }],
    ]],
    rss: [{ typescript: '@azure/connectors/generated/RssExtensions', csharp: 'Azure.Connectors.Sdk.Rss.Models' }, [
        ['OnNewFeed', { itemType: 'FeedItem', payloadType: 'RssOnNewFeedTriggerPayload' }],
    ]],
    salesforce: [{ typescript: '@azure/connectors/generated/SalesforceExtensions', csharp: 'Azure.Connectors.Sdk.Salesforce.Models', python: { importPath: 'azurefunctions.extensions.connectors.salesforce', moduleName: 'salesforce' } }, [
        ['GetOnNewItems', { itemType: 'Item', helper: 'salesforce.onNewItems', payloadType: 'SalesforceOnNewItemsTriggerPayload', pythonItemType: 'Item' }],
        ['GetOnUpdatedItems', { itemType: 'Item', helper: 'salesforce.onUpdatedItems', payloadType: 'SalesforceOnUpdatedItemsTriggerPayload', pythonItemType: 'Item' }],
    ]],
    servicebus: [{ typescript: '@azure/connectors/generated/ServicebusExtensions', csharp: 'Azure.Connectors.Sdk.Servicebus.Models' }, [
        ['GetMessagesFromQueue', { itemType: 'ServiceBusMessage', payloadType: 'ServicebusOnGetMessagesFromQueueTriggerPayload' }],
        ['GetMessagesFromTopic', { itemType: 'ServiceBusMessage', payloadType: 'ServicebusOnGetMessagesFromTopicTriggerPayload' }],
        ['GetNewMessagesFromQueueWithPeekLock', { itemType: 'ServiceBusMessage', payloadType: 'ServicebusOnGetNewMessagesFromQueueWithPeekLockTriggerPayload' }],
        ['GetNewMessagesFromTopicWithPeekLock', { itemType: 'ServiceBusMessage', payloadType: 'ServicebusOnGetNewMessagesFromTopicWithPeekLockTriggerPayload' }],
    ]],
    sharepointonline: [{ typescript: '@azure/connectors/generated/SharepointonlineExtensions', csharp: 'Azure.Connectors.Sdk.SharePointOnline.Models', python: { importPath: 'azurefunctions.extensions.connectors.sharepointonline', moduleName: 'sharepointonline' } }, [
        ['GetOnChangedItems', { itemType: 'Item', helper: 'sharepoint.onChangedItems', payloadType: 'SharePointOnlineOnChangedItemsTriggerPayload', pythonItemType: 'Item' }],
        ['GetOnDeletedFileItems', { itemType: 'DeletedItem', helper: 'sharepoint.onDeletedFileItems', payloadType: 'SharePointOnlineOnDeletedFileItemsTriggerPayload', pythonItemType: 'DeletedItem' }],
        ['GetOnDeletedItems', { itemType: 'DeletedItem', helper: 'sharepoint.onDeletedItems', payloadType: 'SharePointOnlineOnDeletedItemsTriggerPayload', pythonItemType: 'DeletedItem' }],
        ['GetOnNewFileItems', { itemType: 'Item', helper: 'sharepoint.onNewFileItems', payloadType: 'SharePointOnlineOnNewFileItemsTriggerPayload', pythonItemType: 'Item' }],
        ['GetOnNewItems', { itemType: 'Item', helper: 'sharepoint.onNewItems', payloadType: 'SharePointOnlineOnNewItemsTriggerPayload', pythonItemType: 'Item' }],
        ['GetOnNewItemsFromForm', { itemType: 'Item', helper: 'sharepoint.onNewItemsFromForm', payloadType: 'SharePointOnlineOnNewItemsFromFormTriggerPayload', pythonItemType: 'Item' }],
        ['GetOnRecurrenceDigest', { itemType: 'Item', helper: 'sharepoint.onRecurrenceDigest', payloadType: 'SharePointOnlineOnRecurrenceDigestTriggerPayload', pythonItemType: 'Item' }],
        ['GetOnUpdatedFileClassifiedTimes', { itemType: 'Item', helper: 'sharepoint.onUpdatedFileClassifiedTimes', payloadType: 'SharePointOnlineOnUpdatedFileClassifiedTimesTriggerPayload', pythonItemType: 'Item' }],
        ['GetOnUpdatedFileItems', { itemType: 'Item', helper: 'sharepoint.onUpdatedFileItems', payloadType: 'SharePointOnlineOnUpdatedFileItemsTriggerPayload', pythonItemType: 'Item' }],
        ['GetOnUpdatedItems', { itemType: 'Item', helper: 'sharepoint.onUpdatedItems', payloadType: 'SharePointOnlineOnUpdatedItemsTriggerPayload', pythonItemType: 'Item' }],
        ['OnNewFile', { helper: 'sharepoint.onNewFile' }],
        ['OnUpdatedFile', { helper: 'sharepoint.onUpdatedFile' }],
    ]],
    slack: [{ csharp: 'Azure.Connectors.Sdk.Slack.Models' }, [
        ['OnNewFile', { itemType: untypedItemType, payloadType: 'SlackOnNewFileTriggerPayload' }],
    ]],
    sql: [{ typescript: '@azure/connectors/generated/SqlExtensions', csharp: 'Azure.Connectors.Sdk.Sql.Models' }, [
        ['GetOnNewItems_V2', { itemType: 'SqlItem', payloadType: 'SqlOnNewItemsTriggerPayload' }],
        ['GetOnUpdatedItems_V2', { itemType: 'SqlItem', payloadType: 'SqlOnUpdatedItemsTriggerPayload' }],
    ]],
    teams: [{ typescript: '@azure/connectors/generated/TeamsExtensions', csharp: 'Azure.Connectors.Sdk.Teams.Models', python: { importPath: 'azurefunctions.extensions.connectors.teams', moduleName: 'teams' } }, [
        ['OnGroupMembershipAdd', { itemType: untypedItemType, helper: 'teams.onTeamMemberAdded', payloadType: 'TeamsOnTeamMemberAddedTriggerPayload', pythonItemType: 'OnGroupMemberChangeResponse' }],
        ['OnGroupMembershipRemoval', { itemType: untypedItemType, helper: 'teams.onTeamMemberRemoved', payloadType: 'TeamsOnTeamMemberRemovedTriggerPayload', pythonItemType: 'OnGroupMemberChangeResponse' }],
        ['OnNewChannelMessage', { itemType: 'ChatMessage', helper: 'teams.onNewChannelMessage', payloadType: 'TeamsOnNewChannelMessageTriggerPayload', pythonItemType: 'ChatMessage' }],
        ['OnNewChannelMessageMentioningMe', { itemType: 'ChatMessage', helper: 'teams.onNewChannelMessageMentioningMe', payloadType: 'TeamsOnNewChannelMessageMentioningMeTriggerPayload', pythonItemType: 'ChatMessage' }],
    ]],
    todo: [{ typescript: '@azure/connectors/generated/TodoExtensions', csharp: 'Azure.Connectors.Sdk.Todo.Models' }, [
        ['OnNewToDoInFolderV2', { itemType: 'ToDo', payloadType: 'TodoOnNewToDoInFolderTriggerPayload' }],
        ['OnUpdateToDoInFolderV2', { itemType: 'ToDo', payloadType: 'TodoOnUpdateToDoInFolderTriggerPayload' }],
    ]],
    trello: [{ typescript: '@azure/connectors/generated/TrelloExtensions', csharp: 'Azure.Connectors.Sdk.Trello.Models' }, [
        ['OnNewCardInBoardV3', { itemType: 'CardInAction', payloadType: 'TrelloOnNewCardInBoardTriggerPayload' }],
        ['OnNewCardInListV3', { itemType: 'CardInAction', payloadType: 'TrelloOnNewCardInListTriggerPayload' }],
    ]],
    twitter: [{ typescript: '@azure/connectors/generated/TwitterExtensions', csharp: 'Azure.Connectors.Sdk.Twitter.Models' }, [
        ['OnNewTweet', { itemType: 'TweetModel', payloadType: 'TwitterOnNewTweetTriggerPayload' }],
    ]],
    visualstudioteamservices: [{ typescript: '@azure/connectors/generated/VisualstudioteamservicesExtensions', csharp: 'Azure.Connectors.Sdk.VisualStudioTeamServices.Models', python: { importPath: 'azurefunctions.extensions.connectors.visualstudioteamservices', moduleName: 'visualstudioteamservices' } }, [
        ['OnBuildCompleted', { itemType: 'BuildResult', helper: 'vsts.onBuildCompleted', payloadType: 'VisualStudioTeamServicesOnBuildCompletedTriggerPayload', pythonItemType: 'BuildResult' }],
        ['OnGitPullClosed', { itemType: 'GitPullRequest', helper: 'vsts.onGitPullClosed', payloadType: 'VisualStudioTeamServicesOnGitPullClosedTriggerPayload', pythonItemType: 'GitPullRequest' }],
        ['OnGitPullCreated', { itemType: 'GitPullRequest', helper: 'vsts.onGitPullCreated', payloadType: 'VisualStudioTeamServicesOnGitPullCreatedTriggerPayload', pythonItemType: 'GitPullRequest' }],
        ['OnGitPush', { itemType: 'GitPush', helper: 'vsts.onGitPush', payloadType: 'VisualStudioTeamServicesOnGitPushTriggerPayload', pythonItemType: 'GitPush' }],
        ['OnTfvcCheckIn', { itemType: 'TfvcChangeset', helper: 'vsts.onTfvcCheckIn', payloadType: 'VisualStudioTeamServicesOnTfvcCheckInTriggerPayload', pythonItemType: 'TfvcChangeset' }],
        ['OnWorkItemAssignedV2', { itemType: 'TriggerWorkItemResponse', helper: 'vsts.onWorkItemAssigned', payloadType: 'VisualStudioTeamServicesOnWorkItemAssignedTriggerPayload', pythonItemType: 'TriggerWorkItemResponse' }],
        ['OnWorkItemClosedV2', { itemType: 'TriggerWorkItemResponse', helper: 'vsts.onWorkItemClosed', payloadType: 'VisualStudioTeamServicesOnWorkItemClosedTriggerPayload', pythonItemType: 'TriggerWorkItemResponse' }],
        ['OnWorkItemCreatedV2', { itemType: 'TriggerWorkItemResponse', helper: 'vsts.onWorkItemCreated', payloadType: 'VisualStudioTeamServicesOnWorkItemCreatedTriggerPayload', pythonItemType: 'TriggerWorkItemResponse' }],
        ['OnWorkItemUpdatedV2', { itemType: 'TriggerWorkItemResponse', helper: 'vsts.onWorkItemUpdated', payloadType: 'VisualStudioTeamServicesOnWorkItemUpdatedTriggerPayload', pythonItemType: 'TriggerWorkItemResponse' }],
    ]],
    wdatp: [{ typescript: '@azure/connectors/generated/WdatpExtensions', csharp: 'Azure.Connectors.Sdk.Wdatp.Models' }, [
        ['OnNewRemediationActivity', { itemType: 'RemediationActivity', payloadType: 'WdatpOnNewRemediationActivityTriggerPayload' }],
    ]],
    zendesk: [{ typescript: '@azure/connectors/generated/ZendeskExtensions', csharp: 'Azure.Connectors.Sdk.Zendesk.Models' }, [
        ['GetOnNewItems', { itemType: 'Item', payloadType: 'ZendeskOnNewItemsTriggerPayload' }],
        ['GetOnUpdatedItemsV2', { itemType: 'Item', payloadType: 'ZendeskOnUpdatedItemsTriggerPayload' }],
    ]],
};

export function getConnectorTriggerSdkBinding(connectorId: string, operationId: string): ConnectorTriggerSdkBinding {
    const connectorName = connectorId.toLowerCase();
    const [packages, operations]: ConnectorSdkTableEntry = Object.hasOwn(connectorSdkTable, connectorName) ? connectorSdkTable[connectorName] : [{}, []];
    const { itemType, helper, payloadType, pythonItemType }: ConnectorSdkOperation = operations.find(([id]) => id === operationId)?.[1] ?? {};
    return {
        csharp: packages.csharp && payloadType ? { namespace: packages.csharp, payloadType } : undefined,
        python: packages.python && pythonItemType ?
            { importPath: packages.python.importPath, itemType: pythonItemType, moduleName: packages.python.moduleName } :
            undefined,
        typescript: {
            helper,
            importPath: itemType && itemType !== untypedItemType ? packages.typescript : undefined,
            itemType,
        },
    };
}
