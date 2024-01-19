/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  IActionContext,
  IAzureQuickPickItem,
} from "@microsoft/vscode-azext-utils";
import { localize } from "../localize";
import { feedUtils } from "../utils/feedUtils";

export async function getEventGridFunctionInput(
  context: IActionContext
  //node: FunctionTreeItemBase | IFunction
): Promise<string | {}> {
  const eventGridSourcePicks: IAzureQuickPickItem<
    EventGridSource | undefined
  >[] = supportedEventGridSources.map((source: EventGridSource) => {
    return {
      label: supportedEventGridSourceLabels.get(source) as string,
      data: source,
    };
  });

  // TODO: localize
  const prompt: string = "Select the event source";

  const eventSource: EventGridSource =
    (
      await context.ui.showQuickPick(eventGridSourcePicks, {
        placeHolder: prompt,
        stepName: "eventGridSource",
      })
    ).data ?? "Microsoft.Storage";
  console.log(`Event source is: ${eventSource}`);

  const baseUrl = `https://api.github.com/repos/Azure/azure-rest-api-specs/contents/specification/eventgrid/data-plane`;
  const filesUrl = `${baseUrl}/${eventSource}/stable/2018-01-01/examples/cloud-events-schema/`;

  const sampleFiles: FileMetadata[] = await feedUtils.getJsonFeed(
    context,
    filesUrl
  );

  console.log(`repoJson is: ${JSON.stringify(sampleFiles)}`);

  const fileNames: string[] = sampleFiles.map(
    (fileMetadata) => fileMetadata.name
  );

  const fileNamePicks: IAzureQuickPickItem<string | undefined>[] =
    fileNames.map((name: string) => ({
      data: name,
      label: name,
    }));

  const selectedFileName: string =
    (
      await context.ui.showQuickPick(fileNamePicks, {
        placeHolder: "Select the event type",
        stepName: "eventType",
      })
    ).data ?? "blob_created.json";

  console.log(`event type is ${selectedFileName}`);

  const selectedFileUrl =
    sampleFiles.find((fileMetadata) => fileMetadata.name === selectedFileName)
      ?.download_url || sampleFiles[0].download_url;

  const selectedFileContents = await feedUtils.getJsonFeed(
    context,
    selectedFileUrl
  );

  console.log(
    `selectedFileContents is ${JSON.stringify(selectedFileContents)}`
  );

  const value: string = await promptForCustomizableFields(
    context,
    selectedFileContents
  );

  const inputPrompt: string = localize(
    "enterRequestBody",
    "Enter request body"
  );

  const data: string = await context.ui.showInputBox({
    prompt: inputPrompt,
    value,
    stepName: "requestBody",
  });

  let functionInput: string | {} = "";
  try {
    functionInput = <{}>JSON.parse(data);
  } catch {
    functionInput = data;
  }

  return functionInput;
}

async function promptForCustomizableFields(
  context: IActionContext,
  fileContents: {}
): Promise<string> {
  await replaceCustomizableFields(context, fileContents);
  return JSON.stringify(fileContents, undefined, 2);
}

async function replaceCustomizableFields(
  context: IActionContext,
  obj: {}
): Promise<void> {
  for (const key in obj) {
    if (typeof obj[key] === "string") {
      const regex = /{([^}]+)}/g;
      const matches = (obj[key] as string).match(regex);

      if (!matches) {
        continue;
      }
      for (const match of matches) {
        const fieldName = match.slice(1, -1);
        const userInput = await promptUser(context, fieldName);
        obj[key] = (obj[key] as string).replace(match, userInput);
      }
    } else if (typeof obj[key] === "object") {
      await replaceCustomizableFields(context, obj[key] as {});
    }
  }
}

async function promptUser(
  context: IActionContext,
  fieldName: string
): Promise<string> {
  return await context.ui.showInputBox({
    prompt: `Enter value for "${fieldName}"`,
    stepName: `requestField${fieldName}`,
  });
}

// TODO: Expand to include all types?
type EventGridSource =
  | "Microsoft.Storage"
  | "Microsoft.EventHub"
  | "Microsoft.ServiceBus"
  | "Microsoft.ContainerRegistry"
  | "Microsoft.ApiManagement"
  | "Microsoft.Resources"
  | "Microsoft.HealthcareApis";

const supportedEventGridSources: EventGridSource[] = [
  "Microsoft.Storage",
  "Microsoft.EventHub",
  "Microsoft.ServiceBus",
  "Microsoft.ContainerRegistry",
  "Microsoft.ApiManagement",
  "Microsoft.Resources",
  "Microsoft.HealthcareApis",
];

const supportedEventGridSourceLabels: Map<EventGridSource, string> = new Map([
  ["Microsoft.Storage", "Blob Storage"],
  ["Microsoft.EventHub", "Event Hubs"],
  ["Microsoft.ServiceBus", "Service Bus"],
  ["Microsoft.ContainerRegistry", "Container Registry"],
  ["Microsoft.ApiManagement", "API Management"],
  ["Microsoft.Resources", "Resources"],
  ["Microsoft.HealthcareApis", "Health Data Services"],
]);

type FileMetadata = {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string;
  type: string;
  _links: {
    self: string;
    git: string;
    html: string;
  };
};
