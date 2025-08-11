/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ActivityAttributes } from "@microsoft/vscode-azext-utils";

export class CommandAttributes {

    static readonly Deploy: ActivityAttributes = {
        description: "Deploys application code to an Azure Functions app using deployment methods such as zip deployment, Azure CLI, or GitHub Actions. This action publishes the app to the specified Function App resource, making it live in the target environment.",
        troubleshooting: [
            "Deployment succeeds but the app fails to start — check Application Insights or log stream for runtime errors.",
            "Deployment fails due to '403 Forbidden' or '401 Unauthorized' — verify the publishing profile, service principal, or deployment credentials have appropriate permissions.",
            "Code changes are not reflected — ensure you're not deploying to a staging slot or that deployment caching isn't interfering.",
            "Missing or invalid host.json or function.json — validate your app's structure and configuration files.",
            "Dependencies not installed — make sure your build step restores packages before deployment (e.g., npm install, pip install).",
            "Cold start latency after deployment — this is normal for Consumption Plan apps and usually resolves after the first few executions.",
            "Function runtime version mismatch — verify the target runtime version in Azure matches your local dev/runtime settings.",
            "Zip deployment fails with 'conflicting changes' — ensure no simultaneous deployments or file locks are interfering.",
            "Continuous deployment stuck or outdated — check your deployment center logs for GitHub/DevOps pipeline issues.",
            "App Service Plan quota exceeded — check if the Function App’s resource usage has hit limits for memory, CPU, or file system.",
        ],
    };

    static readonly Deploy_DTSSetup: ActivityAttributes = {
        description: "A preflight operations that ensures that a new Durable Task Scheduler (DTS) resource and hub is created, configured, and ready for connection to the function app.",
        troubleshooting: [
            "DTS resource creation takes a long time (25+ minutes) and then fails - possible temporary service issue; you should recommend that the user try again a short time later and delete any unused resources that were created.",
            "Task hub creation fails — if a parent DTS resource was selected, check that the parent DTS resource is not stuck in a provisioning state.",
        ],
    };

}
