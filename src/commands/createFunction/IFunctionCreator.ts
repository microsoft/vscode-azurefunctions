/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserInterface } from "../../IUserInterface";
import { Template } from "../../templates/Template";

export interface IFunctionCreator {
    /**
     * Prompt for any settings that are specific to this creator
     * This includes the function name (Since the name could have different restrictions for different languages)
     */
    promptForSettings(functionAppPath: string, template: Template, ui: IUserInterface): Promise<void>;
    createFunction(functionAppPath: string, template: Template, userSettings: { [propertyName: string]: string }): Promise<string | undefined>;
}
