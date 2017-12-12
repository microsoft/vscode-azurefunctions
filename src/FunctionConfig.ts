/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ErrorData } from "./ErrorData";
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
        let parseError: string | undefined;

        try {
            if (data === null || data === undefined) {
                parseError = localize('noDataError', 'No data was supplied.');
            } else {
                // tslint:disable-next-line:no-unsafe-any
                this.disabled = data.disabled === true;

                // tslint:disable-next-line:no-unsafe-any
                if (!data.bindings || !(data.bindings instanceof Array)) {
                    parseError = localize('expectedBindings', 'Expected "bindings" element of type "Array".');
                } else {
                    this.functionJson = <IFunctionJson>data;

                    const inBinding: IFunctionBinding | undefined = this.functionJson.bindings.find((b: IFunctionBinding) => b.direction === BindingDirection.in);
                    if (inBinding === undefined) {
                        parseError = localize('noInBindingError', 'Expected a binding with direction "in".');
                    } else {
                        this.inBinding = inBinding;
                        if (!inBinding.type) {
                            parseError = localize('inBindingTypeError', 'The binding with direction "in" must have a type.');
                        } else {
                            this.inBindingType = inBinding.type;
                            if (inBinding.type.toLowerCase() === 'httptrigger') {
                                this.isHttpTrigger = true;
                                if (inBinding.authLevel) {
                                    const authLevel: HttpAuthLevel | undefined = <HttpAuthLevel>HttpAuthLevel[inBinding.authLevel.toLowerCase()];
                                    if (authLevel === undefined) {
                                        parseError = localize('unrecognizedAuthLevel', 'Unrecognized auth level "{0}".', inBinding.authLevel);
                                    } else {
                                        this.authLevel = authLevel;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (error) {
            parseError = (new ErrorData(error)).message;
        }

        if (parseError !== undefined) {
            throw new Error(localize('functionJsonParseError', 'Failed to parse function.json: {0}', parseError));
        }
    }
}
