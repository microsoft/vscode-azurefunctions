
import { type ParsedSite } from "@microsoft/vscode-azext-azureappservice";
import { type IActionContext } from "@microsoft/vscode-azext-utils";

export interface RoleAssignmentContext extends IActionContext {
    site?: ParsedSite;
}

