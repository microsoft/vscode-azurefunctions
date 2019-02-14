/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parseError } from 'vscode-azureextensionui';
import { localize } from "./localize";

export interface IFunctionJson {
    disabled?: boolean;
    scriptFile?: string;
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
    public readonly isHttpTrigger: boolean = false;
    public readonly authLevel: HttpAuthLevel = HttpAuthLevel.function;

    private readonly _inBinding: IFunctionBinding | undefined;
    private readonly _inBindingType: string | undefined;
    private readonly _noInBindingError: Error = new Error(localize('noInBinding', 'Failed to find binding with direction "in" for this function.'));

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
                    if (inBinding === undefined && this.functionJson.bindings.length > 0) {
                        // The generated 'function.json' file for C# class libraries doesn't have direction information (by design), so just use the first
                        this._inBinding = this.functionJson.bindings[0];
                    } else {
                        this._inBinding = inBinding;
                    }

                    if (this._inBinding) {
                        if (!this._inBinding.type) {
                            errMessage = localize('inBindingTypeError', 'The binding with direction "in" must have a type.');
                        } else {
                            this._inBindingType = this._inBinding.type;
                            if (this._inBinding.type.toLowerCase() === 'httptrigger') {
                                this.isHttpTrigger = true;
                                if (this._inBinding.authLevel) {
                                    const authLevel: HttpAuthLevel | undefined = <HttpAuthLevel>HttpAuthLevel[this._inBinding.authLevel.toLowerCase()];
                                    if (authLevel === undefined) {
                                        errMessage = localize('unrecognizedAuthLevel', 'Unrecognized auth level "{0}".', this._inBinding.authLevel);
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
            errMessage = (parseError(error)).message;
        }

        if (errMessage !== undefined) {
            throw new Error(localize('functionJsonParseError', 'Failed to parse function.json: {0}', errMessage));
        }
    }

    public get inBinding(): IFunctionBinding {
        if (!this._inBinding) {
            throw this._noInBindingError;
        } else {
            return this._inBinding;
        }
    }

    public get inBindingType(): string {
        if (!this._inBindingType) {
            throw this._noInBindingError;
        } else {
            return this._inBindingType;
        }
    }
}
