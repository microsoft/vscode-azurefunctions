import { AzureWizardPromptStep, type IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../localize";
import { feedUtils } from "../../../utils/feedUtils";
import { type ExecuteEventGridFunctionContext } from "./ExecuteEventGridFunctionContext";

const sampleFilesUrl =
    'https://api.github.com/repos/Azure/azure-rest-api-specs/contents/specification/eventgrid/data-plane/' +
    '{eventSource}' +
    '/stable/2018-01-01/examples/cloud-events-schema/';

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

export class EventGridEventTypeStep extends AzureWizardPromptStep<ExecuteEventGridFunctionContext> {
    public hideStepCount: boolean = false;

    public async prompt(context: ExecuteEventGridFunctionContext): Promise<void> {
        if (!context.eventSource) {
            throw new Error('Event source is required');
        }

        // Get sample files for event source
        const samplesUrl = sampleFilesUrl.replace('{eventSource}', context.eventSource);
        const sampleFiles: FileMetadata[] = await feedUtils.getJsonFeed(context, samplesUrl);
        const fileNames: string[] = sampleFiles.map((fileMetadata) => fileMetadata.name);

        // Prompt for event type
        const eventTypePicks: IAzureQuickPickItem<string | undefined>[] = fileNames.map((name: string) => ({
            data: name,
            // give human-readable name for event type from file name
            label: name
                .replace(/\.json$/, '')
                .split('_')
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' '),
        }));

        context.selectedFileName =
            (
                await context.ui.showQuickPick(eventTypePicks, {
                    placeHolder: localize('selectEventType', 'Select the event type'),
                    stepName: 'eventType',
                })
            ).data ?? 'blob_created.json';

        context.selectedFileUrl = sampleFiles.find((fileMetadata) => fileMetadata.name === context.selectedFileName)?.download_url || sampleFiles[0].download_url;

    }

    public shouldPrompt(context: ExecuteEventGridFunctionContext): boolean {
        return !context.selectedFileName;
    }
}
