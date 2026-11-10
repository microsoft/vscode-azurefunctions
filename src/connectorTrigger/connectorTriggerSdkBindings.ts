/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ConnectorTriggerSdkBinding {
    csharp?: { namespace: string; payloadType: string };
    python?: { importPath: string; moduleName: string; itemType: string };
    typescript: { helper?: string; importPath?: string; itemType?: string };
}

interface SdkConnector {
    csharpNamespace?: string;
    typescriptModule?: string;
    events: readonly (readonly [
        operationId: string,
        csharpPayload?: string,
        typescriptItem?: string,
        pythonAdapter?: string,
    ])[];
}

// Exact callback declarations in @azure/connectors 0.4.0-preview and Azure.Connectors.Sdk
// 0.15.0-preview.1. Python entries additionally require the event mapping in azure-connectors
// 0.6.0b1 and that specific model's exported adapter in azurefunctions-extensions-connectors 1.0.0b4.
const sdkConnectors: Readonly<Record<string, SdkConnector>> = {
    azureblob: {
        typescriptModule: '@azure/connectors/generated/AzureblobExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.AzureBlob.Models',
        events: [
            ['OnUpdatedFiles_V2', 'AzureBlobOnUpdatedFilesTriggerPayload', 'BlobMetadata'],
        ],
    },
    box: {
        typescriptModule: '@azure/connectors/generated/BoxExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.Box.Models',
        events: [
            ['OnNewFilesV2', 'BoxOnNewFilesTriggerPayload', 'BlobMetadata'],
            ['OnUpdatedFilesV2', 'BoxOnUpdatedFilesTriggerPayload', 'BlobMetadata'],
        ],
    },
    commondataservice: {
        typescriptModule: '@azure/connectors/generated/CommondataserviceExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.Commondataservice.Models',
        events: [
            ['GetOnDeletedItems_V2', 'CommondataserviceOnDeletedItemsTriggerPayload', undefined, 'Item'],
            ['GetOnNewItems_V2', 'CommondataserviceOnNewItemsTriggerPayload', 'Item', 'Item'],
            ['GetOnUpdatedItems_V2', 'CommondataserviceOnUpdatedItemsTriggerPayload', 'Item', 'Item'],
        ],
    },
    dataflows: {
        events: [
            ['OnRefreshComplete', undefined, undefined, 'RefreshModel'],
        ],
    },
    dropbox: {
        typescriptModule: '@azure/connectors/generated/DropboxExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.Dropbox.Models',
        events: [
            ['OnNewFiles', 'DropboxOnNewFilesTriggerPayload', 'BlobMetadata'],
            ['OnUpdatedFiles', 'DropboxOnUpdatedFilesTriggerPayload', 'BlobMetadata'],
        ],
    },
    eventbrite: {
        typescriptModule: '@azure/connectors/generated/EventbriteExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.Eventbrite.Models',
        events: [
            ['OnNewEventV2', 'EventbriteOnNewEventTriggerPayload', 'Record<string, unknown>'],
            ['OnOrderChangedV2', 'EventbriteOnOrderChangedTriggerPayload', 'Record<string, unknown>'],
        ],
    },
    eventhubs: {
        typescriptModule: '@azure/connectors/generated/EventhubsExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.Eventhubs.Models',
        events: [
            ['OnNewEvents', 'EventHubsOnNewEventsTriggerPayload', 'Event'],
        ],
    },
    freshservice: {
        typescriptModule: '@azure/connectors/generated/FreshserviceExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.FreshService.Models',
        events: [
            ['OnTicketCreatedV2', 'FreshServiceOnTicketCreatedTriggerPayload', 'ListTicketResponse'],
        ],
    },
    ftp: {
        typescriptModule: '@azure/connectors/generated/FtpExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.Ftp.Models',
        events: [
            ['OnUpdatedFiles', 'FtpOnUpdatedFilesTriggerPayload', 'BlobMetadata'],
        ],
    },
    github: {
        typescriptModule: '@azure/connectors/generated/GithubExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.GitHub.Models',
        events: [
            ['IssueAssigned', 'GitHubOnIssueAssignedTriggerPayload', 'IssueDetailsModel'],
            ['IssueClosed', 'GitHubOnIssueClosedTriggerPayload', 'IssueDetailsModel'],
            ['IssueOpened', 'GitHubOnIssueOpenedTriggerPayload', 'IssueDetailsModel'],
        ],
    },
    infusionsoft: {
        typescriptModule: '@azure/connectors/generated/InfusionsoftExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.Infusionsoft.Models',
        events: [
            ['OnNewOrder', 'InfusionsoftOnNewOrderTriggerPayload', 'Record<string, unknown>'],
            ['OnNewTask', 'InfusionsoftOnNewTaskTriggerPayload', 'TaskResponse'],
        ],
    },
    jira: {
        typescriptModule: '@azure/connectors/generated/JiraExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.Jira.Models',
        events: [
            ['OnCloseIssue_Datacenter', 'JiraOnCloseIssueDatacenterTriggerPayload', 'FullIssue'],
            ['OnCloseIssue_V2', 'JiraOnCloseIssueTriggerPayload', 'FullIssue'],
            ['OnNewIssueJQL_Datacenter', 'JiraOnNewIssueJQLDatacenterTriggerPayload', 'FullIssue'],
            ['OnNewIssueJQL_V2', 'JiraOnNewIssueJQLTriggerPayload', 'FullIssue'],
            ['OnNewIssue_Datacenter', 'JiraOnNewIssueDatacenterTriggerPayload', 'FullIssue'],
            ['OnNewIssue_V2', 'JiraOnNewIssueTriggerPayload', 'FullIssue'],
        ],
    },
    office365: {
        typescriptModule: '@azure/connectors/generated/Office365Extensions',
        csharpNamespace: 'Azure.Connectors.Sdk.Office365.Models',
        events: [
            ['CalendarGetOnChangedItemsV3', 'Office365OnCalendarChangedItemsTriggerPayload', 'GraphCalendarEventClientWithActionType', 'GraphCalendarEventClientWithActionType'],
            ['CalendarGetOnNewItemsV3', 'Office365OnCalendarNewItemsTriggerPayload', 'GraphCalendarEventClientReceive', 'GraphCalendarEventClientReceive'],
            ['CalendarGetOnUpdatedItemsV3', 'Office365OnCalendarUpdatedItemsTriggerPayload', 'GraphCalendarEventClientReceive', 'GraphCalendarEventClientReceive'],
            ['OnFlaggedEmailV4', 'Office365OnFlaggedEmailTriggerPayload', 'GraphClientReceiveMessage', 'GraphClientReceiveMessage'],
            ['OnNewEmailV3', 'Office365OnNewEmailTriggerPayload', 'GraphClientReceiveMessage', 'GraphClientReceiveMessage'],
            ['OnNewMentionMeEmailV3', 'Office365OnNewEmailMentioningMeTriggerPayload', 'GraphClientReceiveMessage', 'GraphClientReceiveMessage'],
            ['OnUpcomingEventsV3', 'Office365OnUpcomingEventsTriggerPayload', 'GraphCalendarEventClientReceive', 'GraphCalendarEventClientReceive'],
            ['SharedMailboxOnNewEmailV2', 'Office365OnSharedMailboxNewEmailTriggerPayload', 'GraphClientReceiveMessage', 'GraphClientReceiveMessage'],
        ],
    },
    office365groups: {
        typescriptModule: '@azure/connectors/generated/Office365groupsExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.Office365Groups.Models',
        events: [
            ['OnGroupMembershipChange', 'Office365GroupsOnGroupMembershipChangeTriggerPayload', 'Record<string, unknown>'],
            ['OnNewEvent', 'Office365GroupsOnNewEventTriggerPayload', 'Record<string, unknown>'],
        ],
    },
    office365groupsmail: {
        typescriptModule: '@azure/connectors/generated/Office365groupsmailExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.Office365GroupsMail.Models',
        events: [
            ['OnNewEmailInGroup', 'Office365GroupsMailOnNewEmailInGroupTriggerPayload', 'ConversationTriggerResponse'],
        ],
    },
    onedrive: {
        csharpNamespace: 'Azure.Connectors.Sdk.OneDrive.Models',
        events: [
            ['OnDeletedFiles', 'OneDriveOnDeletedFilesTriggerPayload'],
            ['OnNewFilesV2', 'OneDriveOnNewFilesTriggerPayload'],
            ['OnUpdatedFilesV2', 'OneDriveOnUpdatedFilesTriggerPayload'],
        ],
    },
    onedriveforbusiness: {
        typescriptModule: '@azure/connectors/generated/OnedriveforbusinessExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.OneDriveForBusiness.Models',
        events: [
            ['OnNewFilesV2', 'OneDriveForBusinessOnNewFilesTriggerPayload', 'BlobMetadata', 'BlobMetadata'],
            ['OnUpdatedFilesV2', 'OneDriveForBusinessOnUpdatedFilesTriggerPayload', 'BlobMetadata', 'BlobMetadata'],
        ],
    },
    onenote: {
        typescriptModule: '@azure/connectors/generated/OnenoteExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.Onenote.Models',
        events: [
            ['OnNewPageInSection', 'OnenoteOnNewPageInSectionTriggerPayload', 'Page'],
            ['OnNewSectionGroupInNotebook', 'OnenoteOnNewSectionGroupInNotebookTriggerPayload', 'SectionGroupResponse'],
            ['OnNewSectionInNotebook', 'OnenoteOnNewSectionInNotebookTriggerPayload', 'SectionResponse'],
        ],
    },
    outlook: {
        typescriptModule: '@azure/connectors/generated/OutlookExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.Outlook.Models',
        events: [
            ['CalendarGetOnChangedItemsV2', 'OutlookOnCalendarGetOnChangedItemsTriggerPayload', 'CalendarEventClientWithActionType'],
            ['CalendarGetOnNewItemsV2', 'OutlookOnCalendarGetOnNewItemsTriggerPayload', 'CalendarEventClientReceive'],
            ['CalendarGetOnUpdatedItemsV2', 'OutlookOnCalendarGetOnUpdatedItemsTriggerPayload', 'CalendarEventClientReceive'],
            ['OnFlaggedEmailV2', 'OutlookOnFlaggedEmailTriggerPayload', 'ClientReceiveMessage'],
            ['OnNewEmailV2', 'OutlookOnNewEmailTriggerPayload', 'ClientReceiveMessage'],
            ['OnNewMentionMeEmailV2', 'OutlookOnNewMentionMeEmailTriggerPayload', 'ClientReceiveMessage'],
            ['OnUpcomingEventsV2', 'OutlookOnUpcomingEventsTriggerPayload', 'CalendarEventClientReceive'],
        ],
    },
    pipedrive: {
        typescriptModule: '@azure/connectors/generated/PipedriveExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.Pipedrive.Models',
        events: [
            ['TrigNewActivity', 'PipedriveOnTrigNewActivityTriggerPayload', 'ActivityResponse'],
            ['TrigNewDealV2', 'PipedriveOnTrigNewDealTriggerPayload', 'DealResponseV2'],
        ],
    },
    planner: {
        typescriptModule: '@azure/connectors/generated/PlannerExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.Planner.Models',
        events: [
            ['OnCompleteTask_V3', 'PlannerOnCompleteTaskTriggerPayload', 'GetTaskResponseV2', 'GetTaskResponseV2'],
            ['OnNewTask_V3', 'PlannerOnNewTaskTriggerPayload', 'GetTaskResponseV2', 'GetTaskResponseV2'],
            ['OnTaskAssignedToMe_V2', 'PlannerOnTaskAssignedToMeTriggerPayload', 'GetTaskResponseV2', 'GetTaskResponseV2'],
        ],
    },
    rss: {
        typescriptModule: '@azure/connectors/generated/RssExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.Rss.Models',
        events: [
            ['OnNewFeed', 'RssOnNewFeedTriggerPayload', 'FeedItem'],
        ],
    },
    salesforce: {
        typescriptModule: '@azure/connectors/generated/SalesforceExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.Salesforce.Models',
        events: [
            ['GetOnNewItems', 'SalesforceOnNewItemsTriggerPayload', 'Item', 'Item'],
            ['GetOnUpdatedItems', 'SalesforceOnUpdatedItemsTriggerPayload', 'Item', 'Item'],
        ],
    },
    servicebus: {
        typescriptModule: '@azure/connectors/generated/ServicebusExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.Servicebus.Models',
        events: [
            ['GetMessagesFromQueue', 'ServicebusOnGetMessagesFromQueueTriggerPayload', 'ServiceBusMessage'],
            ['GetMessagesFromTopic', 'ServicebusOnGetMessagesFromTopicTriggerPayload', 'ServiceBusMessage'],
            ['GetNewMessagesFromQueueWithPeekLock', 'ServicebusOnGetNewMessagesFromQueueWithPeekLockTriggerPayload', 'ServiceBusMessage'],
            ['GetNewMessagesFromTopicWithPeekLock', 'ServicebusOnGetNewMessagesFromTopicWithPeekLockTriggerPayload', 'ServiceBusMessage'],
        ],
    },
    sharepointonline: {
        typescriptModule: '@azure/connectors/generated/SharepointonlineExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.SharePointOnline.Models',
        events: [
            ['GetOnChangedItems', 'SharePointOnlineOnChangedItemsTriggerPayload', 'Item', 'Item'],
            ['GetOnDeletedFileItems', 'SharePointOnlineOnDeletedFileItemsTriggerPayload', 'DeletedItem', 'DeletedItem'],
            ['GetOnDeletedItems', 'SharePointOnlineOnDeletedItemsTriggerPayload', 'DeletedItem', 'DeletedItem'],
            ['GetOnNewFileItems', 'SharePointOnlineOnNewFileItemsTriggerPayload', 'Item', 'Item'],
            ['GetOnNewItems', 'SharePointOnlineOnNewItemsTriggerPayload', 'Item', 'Item'],
            ['GetOnNewItemsFromForm', 'SharePointOnlineOnNewItemsFromFormTriggerPayload', 'Item', 'Item'],
            ['GetOnRecurrenceDigest', 'SharePointOnlineOnRecurrenceDigestTriggerPayload', 'Item', 'Item'],
            ['GetOnUpdatedFileClassifiedTimes', 'SharePointOnlineOnUpdatedFileClassifiedTimesTriggerPayload', 'Item', 'Item'],
            ['GetOnUpdatedFileItems', 'SharePointOnlineOnUpdatedFileItemsTriggerPayload', 'Item', 'Item'],
            ['GetOnUpdatedItems', 'SharePointOnlineOnUpdatedItemsTriggerPayload', 'Item', 'Item'],
        ],
    },
    slack: {
        typescriptModule: '@azure/connectors/generated/SlackExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.Slack.Models',
        events: [
            ['OnNewFile', 'SlackOnNewFileTriggerPayload', 'Record<string, unknown>'],
        ],
    },
    sql: {
        typescriptModule: '@azure/connectors/generated/SqlExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.Sql.Models',
        events: [
            ['GetOnNewItems_V2', 'SqlOnNewItemsTriggerPayload', 'SqlItem'],
            ['GetOnUpdatedItems_V2', 'SqlOnUpdatedItemsTriggerPayload', 'SqlItem'],
        ],
    },
    teams: {
        typescriptModule: '@azure/connectors/generated/TeamsExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.Teams.Models',
        events: [
            ['OnGroupMembershipAdd', 'TeamsOnTeamMemberAddedTriggerPayload', 'Record<string, unknown>', 'OnGroupMemberChangeResponse'],
            ['OnGroupMembershipRemoval', 'TeamsOnTeamMemberRemovedTriggerPayload', 'Record<string, unknown>', 'OnGroupMemberChangeResponse'],
            ['OnNewChannelMessage', 'TeamsOnNewChannelMessageTriggerPayload', 'ChatMessage', 'ChatMessage'],
            ['OnNewChannelMessageMentioningMe', 'TeamsOnNewChannelMessageMentioningMeTriggerPayload', 'ChatMessage', 'ChatMessage'],
        ],
    },
    todo: {
        typescriptModule: '@azure/connectors/generated/TodoExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.Todo.Models',
        events: [
            ['OnNewToDoInFolderV2', 'TodoOnNewToDoInFolderTriggerPayload', 'ToDo'],
            ['OnUpdateToDoInFolderV2', 'TodoOnUpdateToDoInFolderTriggerPayload', 'ToDo'],
        ],
    },
    trello: {
        typescriptModule: '@azure/connectors/generated/TrelloExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.Trello.Models',
        events: [
            ['OnNewCardInBoardV3', 'TrelloOnNewCardInBoardTriggerPayload', 'CardInAction'],
            ['OnNewCardInListV3', 'TrelloOnNewCardInListTriggerPayload', 'CardInAction'],
        ],
    },
    twitter: {
        typescriptModule: '@azure/connectors/generated/TwitterExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.Twitter.Models',
        events: [
            ['OnNewTweet', 'TwitterOnNewTweetTriggerPayload', 'TweetModel'],
        ],
    },
    visualstudioteamservices: {
        typescriptModule: '@azure/connectors/generated/VisualstudioteamservicesExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.VisualStudioTeamServices.Models',
        events: [
            ['OnBuildCompleted', 'VisualStudioTeamServicesOnBuildCompletedTriggerPayload', 'BuildResult', 'BuildResult'],
            ['OnGitPullClosed', 'VisualStudioTeamServicesOnGitPullClosedTriggerPayload', 'GitPullRequest', 'GitPullRequest'],
            ['OnGitPullCreated', 'VisualStudioTeamServicesOnGitPullCreatedTriggerPayload', 'GitPullRequest', 'GitPullRequest'],
            ['OnGitPush', 'VisualStudioTeamServicesOnGitPushTriggerPayload', 'GitPush', 'GitPush'],
            ['OnTfvcCheckIn', 'VisualStudioTeamServicesOnTfvcCheckInTriggerPayload', 'TfvcChangeset', 'TfvcChangeset'],
            ['OnWorkItemAssignedV2', 'VisualStudioTeamServicesOnWorkItemAssignedTriggerPayload', 'TriggerWorkItemResponse', 'TriggerWorkItemResponse'],
            ['OnWorkItemClosedV2', 'VisualStudioTeamServicesOnWorkItemClosedTriggerPayload', 'TriggerWorkItemResponse', 'TriggerWorkItemResponse'],
            ['OnWorkItemCreatedV2', 'VisualStudioTeamServicesOnWorkItemCreatedTriggerPayload', 'TriggerWorkItemResponse', 'TriggerWorkItemResponse'],
            ['OnWorkItemUpdatedV2', 'VisualStudioTeamServicesOnWorkItemUpdatedTriggerPayload', 'TriggerWorkItemResponse', 'TriggerWorkItemResponse'],
        ],
    },
    wdatp: {
        typescriptModule: '@azure/connectors/generated/WdatpExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.Wdatp.Models',
        events: [
            ['OnNewRemediationActivity', 'WdatpOnNewRemediationActivityTriggerPayload', 'RemediationActivity'],
        ],
    },
    zendesk: {
        typescriptModule: '@azure/connectors/generated/ZendeskExtensions',
        csharpNamespace: 'Azure.Connectors.Sdk.Zendesk.Models',
        events: [
            ['GetOnNewItems', 'ZendeskOnNewItemsTriggerPayload', 'Item'],
            ['GetOnUpdatedItemsV2', 'ZendeskOnUpdatedItemsTriggerPayload', 'Item'],
        ],
    },
};

// Exact registrations exposed by @azure/functions-extensions-connectors 0.2.0-preview.
const namedHelpers: Readonly<Record<string, Readonly<Record<string, string>>>> = {
    dataflows: {
        OnRefreshComplete: 'dataflows.onRefreshComplete',
    },
    office365: {
        CalendarGetOnChangedItemsV3: 'office365.onCalendarChangedItems',
        CalendarGetOnNewItemsV3: 'office365.onNewCalendarEvent',
        CalendarGetOnUpdatedItemsV3: 'office365.onCalendarUpdatedItems',
        OnFlaggedEmailV4: 'office365.onFlaggedEmail',
        OnNewEmailV3: 'office365.onNewEmail',
        OnNewMentionMeEmailV3: 'office365.onNewEmailMentioningMe',
        OnUpcomingEventsV3: 'office365.onUpcomingEvents',
        SharedMailboxOnNewEmailV2: 'office365.onSharedMailboxNewEmail',
    },
    onedriveforbusiness: {
        OnNewFilesV2: 'onedriveforbusiness.onNewFiles',
        OnUpdatedFilesV2: 'onedriveforbusiness.onUpdatedFiles',
    },
    planner: Object.fromEntries([
        ['OnCompleteTask_V3', 'planner.onCompleteTask'],
        ['OnNewTask_V3', 'planner.onNewTask'],
        ['OnTaskAssignedToMe_V2', 'planner.onTaskAssignedToMe'],
    ]),
    salesforce: {
        GetOnNewItems: 'salesforce.onNewItems',
        GetOnUpdatedItems: 'salesforce.onUpdatedItems',
    },
    sharepointonline: {
        GetOnChangedItems: 'sharepoint.onChangedItems',
        GetOnDeletedFileItems: 'sharepoint.onDeletedFileItems',
        GetOnDeletedItems: 'sharepoint.onDeletedItems',
        GetOnNewFileItems: 'sharepoint.onNewFileItems',
        GetOnNewItems: 'sharepoint.onNewItems',
        GetOnNewItemsFromForm: 'sharepoint.onNewItemsFromForm',
        GetOnRecurrenceDigest: 'sharepoint.onRecurrenceDigest',
        GetOnUpdatedFileClassifiedTimes: 'sharepoint.onUpdatedFileClassifiedTimes',
        GetOnUpdatedFileItems: 'sharepoint.onUpdatedFileItems',
        GetOnUpdatedItems: 'sharepoint.onUpdatedItems',
        OnNewFile: 'sharepoint.onNewFile',
        OnUpdatedFile: 'sharepoint.onUpdatedFile',
    },
    teams: {
        OnGroupMembershipAdd: 'teams.onTeamMemberAdded',
        OnGroupMembershipRemoval: 'teams.onTeamMemberRemoved',
        OnNewChannelMessage: 'teams.onNewChannelMessage',
        OnNewChannelMessageMentioningMe: 'teams.onNewChannelMessageMentioningMe',
    },
    visualstudioteamservices: {
        OnBuildCompleted: 'vsts.onBuildCompleted',
        OnGitPullClosed: 'vsts.onGitPullClosed',
        OnGitPullCreated: 'vsts.onGitPullCreated',
        OnGitPush: 'vsts.onGitPush',
        OnTfvcCheckIn: 'vsts.onTfvcCheckIn',
        OnWorkItemAssignedV2: 'vsts.onWorkItemAssigned',
        OnWorkItemClosedV2: 'vsts.onWorkItemClosed',
        OnWorkItemCreatedV2: 'vsts.onWorkItemCreated',
        OnWorkItemUpdatedV2: 'vsts.onWorkItemUpdated',
    },
};

export function getConnectorTriggerSdkBinding(connectorId: string, operationId: string): ConnectorTriggerSdkBinding {
    const connectorName = connectorId.toLowerCase();
    const connector = Object.hasOwn(sdkConnectors, connectorName) ? sdkConnectors[connectorName] : undefined;
    const event = connector?.events.find(([operation]) => operation === operationId);
    const helpers = Object.hasOwn(namedHelpers, connectorName) ? namedHelpers[connectorName] : undefined;
    const helper = helpers && Object.hasOwn(helpers, operationId) ? helpers[operationId] : undefined;
    const csharpPayload = event?.[1];
    const typescriptItem = event?.[2];
    const pythonAdapter = event?.[3];
    return {
        csharp: csharpPayload && connector?.csharpNamespace ?
            { namespace: connector.csharpNamespace, payloadType: csharpPayload } : undefined,
        python: pythonAdapter ? {
            importPath: `azurefunctions.extensions.connectors.${connectorName}`,
            moduleName: connectorName,
            itemType: pythonAdapter,
        } : undefined,
        typescript: {
            helper,
            importPath: typescriptItem && /^[A-Za-z_]\w*$/.test(typescriptItem) ? connector?.typescriptModule : undefined,
            itemType: typescriptItem,
        },
    };
}
