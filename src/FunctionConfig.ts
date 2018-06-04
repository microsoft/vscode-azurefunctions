/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parseError } from 'vscode-azureextensionui';
import { localize } from "./localize";

interface IFunctionJson {
    disabled?: boolean;
    bindings: IFunctionBinding[];
}

interface IFunctionBinding {
    // tslint:disable-next-line:no-reserved-keywords
    type?: string;
    name?: string;
    direction?: string;
    authLevel?: string;
    [propertyName: string]: string | undefined;
}

export enum HttpAuthLevel {
    admin = 'admin',
    function = 'function',
    anonymous = 'anonymous'
}

enum BindingDirection {
    in = 'in',
    out = 'out'
}

/**
 * Basic config for a function, stored in the 'function.json' file at the root of the function's folder
 * Since the user can manually edit their 'function.json' file, we can't assume it will have the proper schema
 */
export class FunctionConfig {
    public readonly functionJson: IFunctionJson;
    public readonly disabled: boolean;
    public readonly inBinding: IFunctionBinding;
    public readonly inBindingType: string;
    public readonly isHttpTrigger: boolean = false;
    public readonly authLevel: HttpAuthLevel = HttpAuthLevel.function;

    // tslint:disable-next-line:no-any
    public constructor(data: any) {
        let errMessage: string | undefined;

        try {
            if (data === null || data === undefined) {
                errMessage = localize('noDataError', 'No data was supplied.');
            } else {
                // tslint:disable-next-line:no-unsafe-any
                this.disabled = data.disabled === true;

                // tslint:disable-next-line:no-unsafe-any
                if (!data.bindings || !(data.bindings instanceof Array)) {
                    errMessage = localize('expectedBindings', 'Expected "bindings" element of type "Array".');
                } else {
                    this.functionJson = <IFunctionJson>data;

                    const inBinding: IFunctionBinding | undefined = this.functionJson.bindings.find((b: IFunctionBinding) => b.direction === BindingDirection.in);
                    if (inBinding === undefined) {
                        // The generated 'function.json' file for C# class libraries doesn't have direction information (by design), so just use the first
                        this.inBinding = this.functionJson.bindings[0];
                    } else {
                        this.inBinding = inBinding;
                    }

                    if (!this.inBinding.type) {
                        errMessage = localize('inBindingTypeError', 'The binding with direction "in" must have a type.');
                    } else {
                        this.inBindingType = this.inBinding.type;
                        if (this.inBinding.type.toLowerCase() === 'httptrigger') {
                            this.isHttpTrigger = true;
                            if (this.inBinding.authLevel) {
                                const authLevel: HttpAuthLevel | undefined = <HttpAuthLevel>HttpAuthLevel[this.inBinding.authLevel.toLowerCase()];
                                if (authLevel === undefined) {
                                    errMessage = localize('unrecognizedAuthLevel', 'Unrecognized auth level "{0}".', this.inBinding.authLevel);
                                } else {
                                    this.authLevel = authLevel;
                                }
                            }
                        }
                    }
                }
            }
        } catch (error) {
            errMessage = (parseError(error)).message;
        }

        if (errMessage !== undefined) {
            throw new Error(localize('functionJsonParseError', 'Failed to parse function.json: {0}', errMessage));
        }
    }
}
