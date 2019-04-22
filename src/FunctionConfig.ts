/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "./localize";

export interface IFunctionJson {
    disabled?: boolean;
    scriptFile?: string;
    bindings?: IFunctionBinding[];
}

export interface IFunctionBinding {
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

    // tslint:disable-next-line:no-any
    public constructor(data: any) {
        // tslint:disable-next-line:no-unsafe-any
        if (typeof data === 'object' && data !== null && (data.bindings === undefined || data.bindings instanceof Array)) {
            this.functionJson = <IFunctionJson>data;
        } else {
            this.functionJson = {};
        }
    }

    public get bindings(): IFunctionBinding[] {
        // tslint:disable-next-line: strict-boolean-expressions
        return this.functionJson.bindings || [];
    }

    public get disabled(): boolean {
        return this.functionJson.disabled === true;
    }

    public get inBinding(): IFunctionBinding | undefined {
        let inBinding: IFunctionBinding | undefined = this.bindings.find((b: IFunctionBinding) => b.direction === BindingDirection.in);
        if (inBinding === undefined && this.bindings.length > 0) {
            // The generated 'function.json' file for C# class libraries doesn't have direction information (by design), so just use the first
            inBinding = this.bindings[0];
        }

        return inBinding;
    }

    public get isHttpTrigger(): boolean {
        return !!this.inBinding && !!this.inBinding.type && /^http/i.test(this.inBinding.type);
    }

    public get isTimerTrigger(): boolean {
        return !!this.inBinding && !!this.inBinding.type && /^timer/i.test(this.inBinding.type);
    }

    public get authLevel(): HttpAuthLevel {
        if (this.inBinding && this.inBinding.authLevel) {
            const authLevel: HttpAuthLevel | undefined = <HttpAuthLevel>HttpAuthLevel[this.inBinding.authLevel.toLowerCase()];
            if (authLevel === undefined) {
                throw new Error(localize('unrecognizedAuthLevel', 'Unrecognized auth level "{0}".', this.inBinding.authLevel));
            } else {
                return authLevel;
            }
        } else {
            return HttpAuthLevel.function;
        }
    }
}
