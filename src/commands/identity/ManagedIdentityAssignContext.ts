
import { type ParsedSite } from "@microsoft/vscode-azext-azureappservice";
import { type IActionContext } from "@microsoft/vscode-azext-utils";

export interface ManagedIdentityAssignContext extends IActionContext {
    site?: ParsedSite;
    identityResourceId?: string;
    identityPrincipalId?: string;
    identityClientId?: string;
}

