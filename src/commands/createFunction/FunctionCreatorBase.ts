/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAzureUserInput } from "vscode-azureextensionui";
import { ProjectRuntime } from "../../constants";
import { IFunctionTemplate } from "../../templates/IFunctionTemplate";

export abstract class FunctionCreatorBase {
    protected readonly _functionNameRegex: RegExp = /^[a-zA-Z][a-zA-Z\d_\-]*$/;
    protected _functionAppPath: string;
    protected _template: IFunctionTemplate;

    constructor(functionAppPath: string, template: IFunctionTemplate) {
        this._functionAppPath = functionAppPath;
        this._template = template;
    }

    /**
     * Prompt for any settings that are specific to this creator
     * This includes the function name (Since the name could have different restrictions for different languages)
     */
    public abstract async promptForSettings(ui: IAzureUserInput, functionName: string | undefined, functionSettings: { [key: string]: string | undefined }): Promise<void>;
    public abstract async createFunction(userSettings: { [propertyName: string]: string }, runtime: ProjectRuntime): Promise<string | undefined>;
}
