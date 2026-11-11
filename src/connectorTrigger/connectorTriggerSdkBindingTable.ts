/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Hand-maintained. Add an entry only after verifying the type against the pinned SDK packages below.
import type { ConnectorTriggerSdkBinding } from './connectorTriggerSdkBindings';

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

const bindingEntries: readonly [string, readonly [string, ConnectorTriggerSdkBinding][]][] = [
    ["azureblob", [
        ["OnUpdatedFiles_V2",{"typescript":{"itemType":"BlobMetadata","importPath":"@azure/connectors/generated/AzureblobExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.AzureBlob.Models","payloadType":"AzureBlobOnUpdatedFilesTriggerPayload"}}],
    ]],
    ["box", [
        ["OnNewFilesV2",{"typescript":{"itemType":"BlobMetadata","importPath":"@azure/connectors/generated/BoxExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Box.Models","payloadType":"BoxOnNewFilesTriggerPayload"}}],
        ["OnUpdatedFilesV2",{"typescript":{"itemType":"BlobMetadata","importPath":"@azure/connectors/generated/BoxExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Box.Models","payloadType":"BoxOnUpdatedFilesTriggerPayload"}}],
    ]],
    ["commondataservice", [
        ["GetOnDeletedItems_V2",{"typescript":{},"csharp":{"namespace":"Azure.Connectors.Sdk.Commondataservice.Models","payloadType":"CommondataserviceOnDeletedItemsTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.commondataservice","itemType":"Item","moduleName":"commondataservice"}}],
        ["GetOnNewItems_V2",{"typescript":{"itemType":"Item","importPath":"@azure/connectors/generated/CommondataserviceExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Commondataservice.Models","payloadType":"CommondataserviceOnNewItemsTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.commondataservice","itemType":"Item","moduleName":"commondataservice"}}],
        ["GetOnUpdatedItems_V2",{"typescript":{"itemType":"Item","importPath":"@azure/connectors/generated/CommondataserviceExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Commondataservice.Models","payloadType":"CommondataserviceOnUpdatedItemsTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.commondataservice","itemType":"Item","moduleName":"commondataservice"}}],
    ]],
    ["dataflows", [
        ["OnRefreshComplete",{"typescript":{"helper":"dataflows.onRefreshComplete"},"python":{"importPath":"azurefunctions.extensions.connectors.dataflows","itemType":"RefreshModel","moduleName":"dataflows"}}],
    ]],
    ["dropbox", [
        ["OnNewFiles",{"typescript":{"itemType":"BlobMetadata","importPath":"@azure/connectors/generated/DropboxExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Dropbox.Models","payloadType":"DropboxOnNewFilesTriggerPayload"}}],
        ["OnUpdatedFiles",{"typescript":{"itemType":"BlobMetadata","importPath":"@azure/connectors/generated/DropboxExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Dropbox.Models","payloadType":"DropboxOnUpdatedFilesTriggerPayload"}}],
    ]],
    ["eventbrite", [
        ["OnNewEventV2",{"typescript":{"itemType":"Record<string, unknown>"},"csharp":{"namespace":"Azure.Connectors.Sdk.Eventbrite.Models","payloadType":"EventbriteOnNewEventTriggerPayload"}}],
        ["OnOrderChangedV2",{"typescript":{"itemType":"Record<string, unknown>"},"csharp":{"namespace":"Azure.Connectors.Sdk.Eventbrite.Models","payloadType":"EventbriteOnOrderChangedTriggerPayload"}}],
    ]],
    ["eventhubs", [
        ["OnNewEvents",{"typescript":{"itemType":"Event","importPath":"@azure/connectors/generated/EventhubsExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Eventhubs.Models","payloadType":"EventHubsOnNewEventsTriggerPayload"}}],
    ]],
    ["freshservice", [
        ["OnTicketCreatedV2",{"typescript":{"itemType":"ListTicketResponse","importPath":"@azure/connectors/generated/FreshserviceExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.FreshService.Models","payloadType":"FreshServiceOnTicketCreatedTriggerPayload"}}],
    ]],
    ["ftp", [
        ["OnUpdatedFiles",{"typescript":{"itemType":"BlobMetadata","importPath":"@azure/connectors/generated/FtpExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Ftp.Models","payloadType":"FtpOnUpdatedFilesTriggerPayload"}}],
    ]],
    ["github", [
        ["IssueAssigned",{"typescript":{"itemType":"IssueDetailsModel","importPath":"@azure/connectors/generated/GithubExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.GitHub.Models","payloadType":"GitHubOnIssueAssignedTriggerPayload"}}],
        ["IssueClosed",{"typescript":{"itemType":"IssueDetailsModel","importPath":"@azure/connectors/generated/GithubExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.GitHub.Models","payloadType":"GitHubOnIssueClosedTriggerPayload"}}],
        ["IssueOpened",{"typescript":{"itemType":"IssueDetailsModel","importPath":"@azure/connectors/generated/GithubExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.GitHub.Models","payloadType":"GitHubOnIssueOpenedTriggerPayload"}}],
    ]],
    ["infusionsoft", [
        ["OnNewOrder",{"typescript":{"itemType":"Record<string, unknown>"},"csharp":{"namespace":"Azure.Connectors.Sdk.Infusionsoft.Models","payloadType":"InfusionsoftOnNewOrderTriggerPayload"}}],
        ["OnNewTask",{"typescript":{"itemType":"TaskResponse","importPath":"@azure/connectors/generated/InfusionsoftExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Infusionsoft.Models","payloadType":"InfusionsoftOnNewTaskTriggerPayload"}}],
    ]],
    ["jira", [
        ["OnCloseIssue_Datacenter",{"typescript":{"itemType":"FullIssue","importPath":"@azure/connectors/generated/JiraExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Jira.Models","payloadType":"JiraOnCloseIssueDatacenterTriggerPayload"}}],
        ["OnCloseIssue_V2",{"typescript":{"itemType":"FullIssue","importPath":"@azure/connectors/generated/JiraExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Jira.Models","payloadType":"JiraOnCloseIssueTriggerPayload"}}],
        ["OnNewIssueJQL_Datacenter",{"typescript":{"itemType":"FullIssue","importPath":"@azure/connectors/generated/JiraExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Jira.Models","payloadType":"JiraOnNewIssueJQLDatacenterTriggerPayload"}}],
        ["OnNewIssueJQL_V2",{"typescript":{"itemType":"FullIssue","importPath":"@azure/connectors/generated/JiraExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Jira.Models","payloadType":"JiraOnNewIssueJQLTriggerPayload"}}],
        ["OnNewIssue_Datacenter",{"typescript":{"itemType":"FullIssue","importPath":"@azure/connectors/generated/JiraExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Jira.Models","payloadType":"JiraOnNewIssueDatacenterTriggerPayload"}}],
        ["OnNewIssue_V2",{"typescript":{"itemType":"FullIssue","importPath":"@azure/connectors/generated/JiraExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Jira.Models","payloadType":"JiraOnNewIssueTriggerPayload"}}],
    ]],
    ["office365", [
        ["CalendarGetOnChangedItemsV3",{"typescript":{"itemType":"GraphCalendarEventClientWithActionType","importPath":"@azure/connectors/generated/Office365Extensions","helper":"office365.onCalendarChangedItems"},"csharp":{"namespace":"Azure.Connectors.Sdk.Office365.Models","payloadType":"Office365OnCalendarChangedItemsTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.office365","itemType":"GraphCalendarEventClientWithActionType","moduleName":"office365"}}],
        ["CalendarGetOnNewItemsV3",{"typescript":{"itemType":"GraphCalendarEventClientReceive","importPath":"@azure/connectors/generated/Office365Extensions","helper":"office365.onCalendarNewItems"},"csharp":{"namespace":"Azure.Connectors.Sdk.Office365.Models","payloadType":"Office365OnCalendarNewItemsTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.office365","itemType":"GraphCalendarEventClientReceive","moduleName":"office365"}}],
        ["CalendarGetOnUpdatedItemsV3",{"typescript":{"itemType":"GraphCalendarEventClientReceive","importPath":"@azure/connectors/generated/Office365Extensions","helper":"office365.onCalendarUpdatedItems"},"csharp":{"namespace":"Azure.Connectors.Sdk.Office365.Models","payloadType":"Office365OnCalendarUpdatedItemsTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.office365","itemType":"GraphCalendarEventClientReceive","moduleName":"office365"}}],
        ["OnFlaggedEmailV4",{"typescript":{"itemType":"GraphClientReceiveMessage","importPath":"@azure/connectors/generated/Office365Extensions","helper":"office365.onFlaggedEmail"},"csharp":{"namespace":"Azure.Connectors.Sdk.Office365.Models","payloadType":"Office365OnFlaggedEmailTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.office365","itemType":"GraphClientReceiveMessage","moduleName":"office365"}}],
        ["OnNewEmailV3",{"typescript":{"itemType":"GraphClientReceiveMessage","importPath":"@azure/connectors/generated/Office365Extensions","helper":"office365.onNewEmail"},"csharp":{"namespace":"Azure.Connectors.Sdk.Office365.Models","payloadType":"Office365OnNewEmailTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.office365","itemType":"GraphClientReceiveMessage","moduleName":"office365"}}],
        ["OnNewMentionMeEmailV3",{"typescript":{"itemType":"GraphClientReceiveMessage","importPath":"@azure/connectors/generated/Office365Extensions","helper":"office365.onNewEmailMentioningMe"},"csharp":{"namespace":"Azure.Connectors.Sdk.Office365.Models","payloadType":"Office365OnNewEmailMentioningMeTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.office365","itemType":"GraphClientReceiveMessage","moduleName":"office365"}}],
        ["OnUpcomingEventsV3",{"typescript":{"itemType":"GraphCalendarEventClientReceive","importPath":"@azure/connectors/generated/Office365Extensions","helper":"office365.onUpcomingEvents"},"csharp":{"namespace":"Azure.Connectors.Sdk.Office365.Models","payloadType":"Office365OnUpcomingEventsTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.office365","itemType":"GraphCalendarEventClientReceive","moduleName":"office365"}}],
        ["SharedMailboxOnNewEmailV2",{"typescript":{"itemType":"GraphClientReceiveMessage","importPath":"@azure/connectors/generated/Office365Extensions","helper":"office365.onSharedMailboxNewEmail"},"csharp":{"namespace":"Azure.Connectors.Sdk.Office365.Models","payloadType":"Office365OnSharedMailboxNewEmailTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.office365","itemType":"GraphClientReceiveMessage","moduleName":"office365"}}],
    ]],
    ["office365groups", [
        ["OnGroupMembershipChange",{"typescript":{"itemType":"Record<string, unknown>"},"csharp":{"namespace":"Azure.Connectors.Sdk.Office365Groups.Models","payloadType":"Office365GroupsOnGroupMembershipChangeTriggerPayload"}}],
        ["OnNewEvent",{"typescript":{"itemType":"Record<string, unknown>"},"csharp":{"namespace":"Azure.Connectors.Sdk.Office365Groups.Models","payloadType":"Office365GroupsOnNewEventTriggerPayload"}}],
    ]],
    ["office365groupsmail", [
        ["OnNewEmailInGroup",{"typescript":{"itemType":"ConversationTriggerResponse","importPath":"@azure/connectors/generated/Office365groupsmailExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Office365GroupsMail.Models","payloadType":"Office365GroupsMailOnNewEmailInGroupTriggerPayload"}}],
    ]],
    ["onedrive", [
        ["OnDeletedFiles",{"typescript":{},"csharp":{"namespace":"Azure.Connectors.Sdk.OneDrive.Models","payloadType":"OneDriveOnDeletedFilesTriggerPayload"}}],
        ["OnNewFilesV2",{"typescript":{},"csharp":{"namespace":"Azure.Connectors.Sdk.OneDrive.Models","payloadType":"OneDriveOnNewFilesTriggerPayload"}}],
        ["OnUpdatedFilesV2",{"typescript":{},"csharp":{"namespace":"Azure.Connectors.Sdk.OneDrive.Models","payloadType":"OneDriveOnUpdatedFilesTriggerPayload"}}],
    ]],
    ["onedriveforbusiness", [
        ["OnNewFilesV2",{"typescript":{"itemType":"BlobMetadata","importPath":"@azure/connectors/generated/OnedriveforbusinessExtensions","helper":"onedriveforbusiness.onNewFiles"},"csharp":{"namespace":"Azure.Connectors.Sdk.OneDriveForBusiness.Models","payloadType":"OneDriveForBusinessOnNewFilesTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.onedriveforbusiness","itemType":"BlobMetadata","moduleName":"onedriveforbusiness"}}],
        ["OnUpdatedFilesV2",{"typescript":{"itemType":"BlobMetadata","importPath":"@azure/connectors/generated/OnedriveforbusinessExtensions","helper":"onedriveforbusiness.onUpdatedFiles"},"csharp":{"namespace":"Azure.Connectors.Sdk.OneDriveForBusiness.Models","payloadType":"OneDriveForBusinessOnUpdatedFilesTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.onedriveforbusiness","itemType":"BlobMetadata","moduleName":"onedriveforbusiness"}}],
    ]],
    ["onenote", [
        ["OnNewPageInSection",{"typescript":{"itemType":"Page","importPath":"@azure/connectors/generated/OnenoteExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Onenote.Models","payloadType":"OnenoteOnNewPageInSectionTriggerPayload"}}],
        ["OnNewSectionGroupInNotebook",{"typescript":{"itemType":"SectionGroupResponse","importPath":"@azure/connectors/generated/OnenoteExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Onenote.Models","payloadType":"OnenoteOnNewSectionGroupInNotebookTriggerPayload"}}],
        ["OnNewSectionInNotebook",{"typescript":{"itemType":"SectionResponse","importPath":"@azure/connectors/generated/OnenoteExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Onenote.Models","payloadType":"OnenoteOnNewSectionInNotebookTriggerPayload"}}],
    ]],
    ["outlook", [
        ["CalendarGetOnChangedItemsV2",{"typescript":{"itemType":"CalendarEventClientWithActionType","importPath":"@azure/connectors/generated/OutlookExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Outlook.Models","payloadType":"OutlookOnCalendarGetOnChangedItemsTriggerPayload"}}],
        ["CalendarGetOnNewItemsV2",{"typescript":{"itemType":"CalendarEventClientReceive","importPath":"@azure/connectors/generated/OutlookExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Outlook.Models","payloadType":"OutlookOnCalendarGetOnNewItemsTriggerPayload"}}],
        ["CalendarGetOnUpdatedItemsV2",{"typescript":{"itemType":"CalendarEventClientReceive","importPath":"@azure/connectors/generated/OutlookExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Outlook.Models","payloadType":"OutlookOnCalendarGetOnUpdatedItemsTriggerPayload"}}],
        ["OnFlaggedEmailV2",{"typescript":{"itemType":"ClientReceiveMessage","importPath":"@azure/connectors/generated/OutlookExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Outlook.Models","payloadType":"OutlookOnFlaggedEmailTriggerPayload"}}],
        ["OnNewEmailV2",{"typescript":{"itemType":"ClientReceiveMessage","importPath":"@azure/connectors/generated/OutlookExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Outlook.Models","payloadType":"OutlookOnNewEmailTriggerPayload"}}],
        ["OnNewMentionMeEmailV2",{"typescript":{"itemType":"ClientReceiveMessage","importPath":"@azure/connectors/generated/OutlookExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Outlook.Models","payloadType":"OutlookOnNewMentionMeEmailTriggerPayload"}}],
        ["OnUpcomingEventsV2",{"typescript":{"itemType":"CalendarEventClientReceive","importPath":"@azure/connectors/generated/OutlookExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Outlook.Models","payloadType":"OutlookOnUpcomingEventsTriggerPayload"}}],
    ]],
    ["pipedrive", [
        ["TrigNewActivity",{"typescript":{"itemType":"ActivityResponse","importPath":"@azure/connectors/generated/PipedriveExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Pipedrive.Models","payloadType":"PipedriveOnTrigNewActivityTriggerPayload"}}],
        ["TrigNewDealV2",{"typescript":{"itemType":"DealResponseV2","importPath":"@azure/connectors/generated/PipedriveExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Pipedrive.Models","payloadType":"PipedriveOnTrigNewDealTriggerPayload"}}],
    ]],
    ["planner", [
        ["OnCompleteTask_V3",{"typescript":{"itemType":"GetTaskResponseV2","importPath":"@azure/connectors/generated/PlannerExtensions","helper":"planner.onCompleteTask"},"csharp":{"namespace":"Azure.Connectors.Sdk.Planner.Models","payloadType":"PlannerOnCompleteTaskTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.planner","itemType":"GetTaskResponseV2","moduleName":"planner"}}],
        ["OnNewTask_V3",{"typescript":{"itemType":"GetTaskResponseV2","importPath":"@azure/connectors/generated/PlannerExtensions","helper":"planner.onNewTask"},"csharp":{"namespace":"Azure.Connectors.Sdk.Planner.Models","payloadType":"PlannerOnNewTaskTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.planner","itemType":"GetTaskResponseV2","moduleName":"planner"}}],
        ["OnTaskAssignedToMe_V2",{"typescript":{"itemType":"GetTaskResponseV2","importPath":"@azure/connectors/generated/PlannerExtensions","helper":"planner.onTaskAssignedToMe"},"csharp":{"namespace":"Azure.Connectors.Sdk.Planner.Models","payloadType":"PlannerOnTaskAssignedToMeTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.planner","itemType":"GetTaskResponseV2","moduleName":"planner"}}],
    ]],
    ["rss", [
        ["OnNewFeed",{"typescript":{"itemType":"FeedItem","importPath":"@azure/connectors/generated/RssExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Rss.Models","payloadType":"RssOnNewFeedTriggerPayload"}}],
    ]],
    ["salesforce", [
        ["GetOnNewItems",{"typescript":{"itemType":"Item","importPath":"@azure/connectors/generated/SalesforceExtensions","helper":"salesforce.onNewItems"},"csharp":{"namespace":"Azure.Connectors.Sdk.Salesforce.Models","payloadType":"SalesforceOnNewItemsTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.salesforce","itemType":"Item","moduleName":"salesforce"}}],
        ["GetOnUpdatedItems",{"typescript":{"itemType":"Item","importPath":"@azure/connectors/generated/SalesforceExtensions","helper":"salesforce.onUpdatedItems"},"csharp":{"namespace":"Azure.Connectors.Sdk.Salesforce.Models","payloadType":"SalesforceOnUpdatedItemsTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.salesforce","itemType":"Item","moduleName":"salesforce"}}],
    ]],
    ["servicebus", [
        ["GetMessagesFromQueue",{"typescript":{"itemType":"ServiceBusMessage","importPath":"@azure/connectors/generated/ServicebusExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Servicebus.Models","payloadType":"ServicebusOnGetMessagesFromQueueTriggerPayload"}}],
        ["GetMessagesFromTopic",{"typescript":{"itemType":"ServiceBusMessage","importPath":"@azure/connectors/generated/ServicebusExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Servicebus.Models","payloadType":"ServicebusOnGetMessagesFromTopicTriggerPayload"}}],
        ["GetNewMessagesFromQueueWithPeekLock",{"typescript":{"itemType":"ServiceBusMessage","importPath":"@azure/connectors/generated/ServicebusExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Servicebus.Models","payloadType":"ServicebusOnGetNewMessagesFromQueueWithPeekLockTriggerPayload"}}],
        ["GetNewMessagesFromTopicWithPeekLock",{"typescript":{"itemType":"ServiceBusMessage","importPath":"@azure/connectors/generated/ServicebusExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Servicebus.Models","payloadType":"ServicebusOnGetNewMessagesFromTopicWithPeekLockTriggerPayload"}}],
    ]],
    ["sharepointonline", [
        ["GetOnChangedItems",{"typescript":{"itemType":"Item","importPath":"@azure/connectors/generated/SharepointonlineExtensions","helper":"sharepoint.onChangedItems"},"csharp":{"namespace":"Azure.Connectors.Sdk.SharePointOnline.Models","payloadType":"SharePointOnlineOnChangedItemsTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.sharepointonline","itemType":"Item","moduleName":"sharepointonline"}}],
        ["GetOnDeletedFileItems",{"typescript":{"itemType":"DeletedItem","importPath":"@azure/connectors/generated/SharepointonlineExtensions","helper":"sharepoint.onDeletedFileItems"},"csharp":{"namespace":"Azure.Connectors.Sdk.SharePointOnline.Models","payloadType":"SharePointOnlineOnDeletedFileItemsTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.sharepointonline","itemType":"DeletedItem","moduleName":"sharepointonline"}}],
        ["GetOnDeletedItems",{"typescript":{"itemType":"DeletedItem","importPath":"@azure/connectors/generated/SharepointonlineExtensions","helper":"sharepoint.onDeletedItems"},"csharp":{"namespace":"Azure.Connectors.Sdk.SharePointOnline.Models","payloadType":"SharePointOnlineOnDeletedItemsTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.sharepointonline","itemType":"DeletedItem","moduleName":"sharepointonline"}}],
        ["GetOnNewFileItems",{"typescript":{"itemType":"Item","importPath":"@azure/connectors/generated/SharepointonlineExtensions","helper":"sharepoint.onNewFileItems"},"csharp":{"namespace":"Azure.Connectors.Sdk.SharePointOnline.Models","payloadType":"SharePointOnlineOnNewFileItemsTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.sharepointonline","itemType":"Item","moduleName":"sharepointonline"}}],
        ["GetOnNewItems",{"typescript":{"itemType":"Item","importPath":"@azure/connectors/generated/SharepointonlineExtensions","helper":"sharepoint.onNewItems"},"csharp":{"namespace":"Azure.Connectors.Sdk.SharePointOnline.Models","payloadType":"SharePointOnlineOnNewItemsTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.sharepointonline","itemType":"Item","moduleName":"sharepointonline"}}],
        ["GetOnNewItemsFromForm",{"typescript":{"itemType":"Item","importPath":"@azure/connectors/generated/SharepointonlineExtensions","helper":"sharepoint.onNewItemsFromForm"},"csharp":{"namespace":"Azure.Connectors.Sdk.SharePointOnline.Models","payloadType":"SharePointOnlineOnNewItemsFromFormTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.sharepointonline","itemType":"Item","moduleName":"sharepointonline"}}],
        ["GetOnRecurrenceDigest",{"typescript":{"itemType":"Item","importPath":"@azure/connectors/generated/SharepointonlineExtensions","helper":"sharepoint.onRecurrenceDigest"},"csharp":{"namespace":"Azure.Connectors.Sdk.SharePointOnline.Models","payloadType":"SharePointOnlineOnRecurrenceDigestTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.sharepointonline","itemType":"Item","moduleName":"sharepointonline"}}],
        ["GetOnUpdatedFileClassifiedTimes",{"typescript":{"itemType":"Item","importPath":"@azure/connectors/generated/SharepointonlineExtensions","helper":"sharepoint.onUpdatedFileClassifiedTimes"},"csharp":{"namespace":"Azure.Connectors.Sdk.SharePointOnline.Models","payloadType":"SharePointOnlineOnUpdatedFileClassifiedTimesTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.sharepointonline","itemType":"Item","moduleName":"sharepointonline"}}],
        ["GetOnUpdatedFileItems",{"typescript":{"itemType":"Item","importPath":"@azure/connectors/generated/SharepointonlineExtensions","helper":"sharepoint.onUpdatedFileItems"},"csharp":{"namespace":"Azure.Connectors.Sdk.SharePointOnline.Models","payloadType":"SharePointOnlineOnUpdatedFileItemsTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.sharepointonline","itemType":"Item","moduleName":"sharepointonline"}}],
        ["GetOnUpdatedItems",{"typescript":{"itemType":"Item","importPath":"@azure/connectors/generated/SharepointonlineExtensions","helper":"sharepoint.onUpdatedItems"},"csharp":{"namespace":"Azure.Connectors.Sdk.SharePointOnline.Models","payloadType":"SharePointOnlineOnUpdatedItemsTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.sharepointonline","itemType":"Item","moduleName":"sharepointonline"}}],
        ["OnNewFile",{"typescript":{"helper":"sharepoint.onNewFile"}}],
        ["OnUpdatedFile",{"typescript":{"helper":"sharepoint.onUpdatedFile"}}],
    ]],
    ["slack", [
        ["OnNewFile",{"typescript":{"itemType":"Record<string, unknown>"},"csharp":{"namespace":"Azure.Connectors.Sdk.Slack.Models","payloadType":"SlackOnNewFileTriggerPayload"}}],
    ]],
    ["sql", [
        ["GetOnNewItems_V2",{"typescript":{"itemType":"SqlItem","importPath":"@azure/connectors/generated/SqlExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Sql.Models","payloadType":"SqlOnNewItemsTriggerPayload"}}],
        ["GetOnUpdatedItems_V2",{"typescript":{"itemType":"SqlItem","importPath":"@azure/connectors/generated/SqlExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Sql.Models","payloadType":"SqlOnUpdatedItemsTriggerPayload"}}],
    ]],
    ["teams", [
        ["OnGroupMembershipAdd",{"typescript":{"itemType":"Record<string, unknown>","helper":"teams.onTeamMemberAdded"},"csharp":{"namespace":"Azure.Connectors.Sdk.Teams.Models","payloadType":"TeamsOnTeamMemberAddedTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.teams","itemType":"OnGroupMemberChangeResponse","moduleName":"teams"}}],
        ["OnGroupMembershipRemoval",{"typescript":{"itemType":"Record<string, unknown>","helper":"teams.onTeamMemberRemoved"},"csharp":{"namespace":"Azure.Connectors.Sdk.Teams.Models","payloadType":"TeamsOnTeamMemberRemovedTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.teams","itemType":"OnGroupMemberChangeResponse","moduleName":"teams"}}],
        ["OnNewChannelMessage",{"typescript":{"itemType":"ChatMessage","importPath":"@azure/connectors/generated/TeamsExtensions","helper":"teams.onNewChannelMessage"},"csharp":{"namespace":"Azure.Connectors.Sdk.Teams.Models","payloadType":"TeamsOnNewChannelMessageTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.teams","itemType":"ChatMessage","moduleName":"teams"}}],
        ["OnNewChannelMessageMentioningMe",{"typescript":{"itemType":"ChatMessage","importPath":"@azure/connectors/generated/TeamsExtensions","helper":"teams.onNewChannelMessageMentioningMe"},"csharp":{"namespace":"Azure.Connectors.Sdk.Teams.Models","payloadType":"TeamsOnNewChannelMessageMentioningMeTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.teams","itemType":"ChatMessage","moduleName":"teams"}}],
    ]],
    ["todo", [
        ["OnNewToDoInFolderV2",{"typescript":{"itemType":"ToDo","importPath":"@azure/connectors/generated/TodoExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Todo.Models","payloadType":"TodoOnNewToDoInFolderTriggerPayload"}}],
        ["OnUpdateToDoInFolderV2",{"typescript":{"itemType":"ToDo","importPath":"@azure/connectors/generated/TodoExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Todo.Models","payloadType":"TodoOnUpdateToDoInFolderTriggerPayload"}}],
    ]],
    ["trello", [
        ["OnNewCardInBoardV3",{"typescript":{"itemType":"CardInAction","importPath":"@azure/connectors/generated/TrelloExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Trello.Models","payloadType":"TrelloOnNewCardInBoardTriggerPayload"}}],
        ["OnNewCardInListV3",{"typescript":{"itemType":"CardInAction","importPath":"@azure/connectors/generated/TrelloExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Trello.Models","payloadType":"TrelloOnNewCardInListTriggerPayload"}}],
    ]],
    ["twitter", [
        ["OnNewTweet",{"typescript":{"itemType":"TweetModel","importPath":"@azure/connectors/generated/TwitterExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Twitter.Models","payloadType":"TwitterOnNewTweetTriggerPayload"}}],
    ]],
    ["visualstudioteamservices", [
        ["OnBuildCompleted",{"typescript":{"itemType":"BuildResult","importPath":"@azure/connectors/generated/VisualstudioteamservicesExtensions","helper":"vsts.onBuildCompleted"},"csharp":{"namespace":"Azure.Connectors.Sdk.VisualStudioTeamServices.Models","payloadType":"VisualStudioTeamServicesOnBuildCompletedTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.visualstudioteamservices","itemType":"BuildResult","moduleName":"visualstudioteamservices"}}],
        ["OnGitPullClosed",{"typescript":{"itemType":"GitPullRequest","importPath":"@azure/connectors/generated/VisualstudioteamservicesExtensions","helper":"vsts.onGitPullClosed"},"csharp":{"namespace":"Azure.Connectors.Sdk.VisualStudioTeamServices.Models","payloadType":"VisualStudioTeamServicesOnGitPullClosedTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.visualstudioteamservices","itemType":"GitPullRequest","moduleName":"visualstudioteamservices"}}],
        ["OnGitPullCreated",{"typescript":{"itemType":"GitPullRequest","importPath":"@azure/connectors/generated/VisualstudioteamservicesExtensions","helper":"vsts.onGitPullCreated"},"csharp":{"namespace":"Azure.Connectors.Sdk.VisualStudioTeamServices.Models","payloadType":"VisualStudioTeamServicesOnGitPullCreatedTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.visualstudioteamservices","itemType":"GitPullRequest","moduleName":"visualstudioteamservices"}}],
        ["OnGitPush",{"typescript":{"itemType":"GitPush","importPath":"@azure/connectors/generated/VisualstudioteamservicesExtensions","helper":"vsts.onGitPush"},"csharp":{"namespace":"Azure.Connectors.Sdk.VisualStudioTeamServices.Models","payloadType":"VisualStudioTeamServicesOnGitPushTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.visualstudioteamservices","itemType":"GitPush","moduleName":"visualstudioteamservices"}}],
        ["OnTfvcCheckIn",{"typescript":{"itemType":"TfvcChangeset","importPath":"@azure/connectors/generated/VisualstudioteamservicesExtensions","helper":"vsts.onTfvcCheckIn"},"csharp":{"namespace":"Azure.Connectors.Sdk.VisualStudioTeamServices.Models","payloadType":"VisualStudioTeamServicesOnTfvcCheckInTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.visualstudioteamservices","itemType":"TfvcChangeset","moduleName":"visualstudioteamservices"}}],
        ["OnWorkItemAssignedV2",{"typescript":{"itemType":"TriggerWorkItemResponse","importPath":"@azure/connectors/generated/VisualstudioteamservicesExtensions","helper":"vsts.onWorkItemAssigned"},"csharp":{"namespace":"Azure.Connectors.Sdk.VisualStudioTeamServices.Models","payloadType":"VisualStudioTeamServicesOnWorkItemAssignedTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.visualstudioteamservices","itemType":"TriggerWorkItemResponse","moduleName":"visualstudioteamservices"}}],
        ["OnWorkItemClosedV2",{"typescript":{"itemType":"TriggerWorkItemResponse","importPath":"@azure/connectors/generated/VisualstudioteamservicesExtensions","helper":"vsts.onWorkItemClosed"},"csharp":{"namespace":"Azure.Connectors.Sdk.VisualStudioTeamServices.Models","payloadType":"VisualStudioTeamServicesOnWorkItemClosedTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.visualstudioteamservices","itemType":"TriggerWorkItemResponse","moduleName":"visualstudioteamservices"}}],
        ["OnWorkItemCreatedV2",{"typescript":{"itemType":"TriggerWorkItemResponse","importPath":"@azure/connectors/generated/VisualstudioteamservicesExtensions","helper":"vsts.onWorkItemCreated"},"csharp":{"namespace":"Azure.Connectors.Sdk.VisualStudioTeamServices.Models","payloadType":"VisualStudioTeamServicesOnWorkItemCreatedTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.visualstudioteamservices","itemType":"TriggerWorkItemResponse","moduleName":"visualstudioteamservices"}}],
        ["OnWorkItemUpdatedV2",{"typescript":{"itemType":"TriggerWorkItemResponse","importPath":"@azure/connectors/generated/VisualstudioteamservicesExtensions","helper":"vsts.onWorkItemUpdated"},"csharp":{"namespace":"Azure.Connectors.Sdk.VisualStudioTeamServices.Models","payloadType":"VisualStudioTeamServicesOnWorkItemUpdatedTriggerPayload"},"python":{"importPath":"azurefunctions.extensions.connectors.visualstudioteamservices","itemType":"TriggerWorkItemResponse","moduleName":"visualstudioteamservices"}}],
    ]],
    ["wdatp", [
        ["OnNewRemediationActivity",{"typescript":{"itemType":"RemediationActivity","importPath":"@azure/connectors/generated/WdatpExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Wdatp.Models","payloadType":"WdatpOnNewRemediationActivityTriggerPayload"}}],
    ]],
    ["zendesk", [
        ["GetOnNewItems",{"typescript":{"itemType":"Item","importPath":"@azure/connectors/generated/ZendeskExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Zendesk.Models","payloadType":"ZendeskOnNewItemsTriggerPayload"}}],
        ["GetOnUpdatedItemsV2",{"typescript":{"itemType":"Item","importPath":"@azure/connectors/generated/ZendeskExtensions"},"csharp":{"namespace":"Azure.Connectors.Sdk.Zendesk.Models","payloadType":"ZendeskOnUpdatedItemsTriggerPayload"}}],
    ]],
];

export const connectorSdkBindings: Readonly<Record<string, Readonly<Record<string, ConnectorTriggerSdkBinding>>>> =
    Object.fromEntries(bindingEntries.map(([connector, events]) => [connector, Object.fromEntries(events)]));
