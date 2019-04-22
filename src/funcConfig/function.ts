/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "../localize";

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

/**
 * Basic config for a function, stored in the 'function.json' file at the root of the function's folder
 * Since the user can manually edit their 'function.json' file, we can't assume it will have the proper schema
 */
export class ParsedFunctionJson {
    public readonly data: IFunctionJson;

    // tslint:disable-next-line:no-any
    public constructor(data: any) {
        // tslint:disable-next-line:no-unsafe-any
        if (typeof data === 'object' && data !== null && (data.bindings === undefined || data.bindings instanceof Array)) {
            this.data = <IFunctionJson>data;
        } else {
            this.data = {};
        }
    }

    public get bindings(): IFunctionBinding[] {
        // tslint:disable-next-line: strict-boolean-expressions
        return this.data.bindings || [];
    }

    public get disabled(): boolean {
        return this.data.disabled === true;
    }

    /**
     * A trigger defines how a function is invoked and a function must have exactly one trigger.
     * https://docs.microsoft.com/azure/azure-functions/functions-triggers-bindings
     */
    public get triggerBinding(): IFunctionBinding | undefined {
        // tslint:disable-next-line: strict-boolean-expressions
        return this.bindings.find(b => /trigger$/i.test(b.type || ''));
    }

    public get isHttpTrigger(): boolean {
        return !!this.triggerBinding && !!this.triggerBinding.type && /^http/i.test(this.triggerBinding.type);
    }

    public get isTimerTrigger(): boolean {
        return !!this.triggerBinding && !!this.triggerBinding.type && /^timer/i.test(this.triggerBinding.type);
    }

    public get authLevel(): HttpAuthLevel {
        if (this.triggerBinding && this.triggerBinding.authLevel) {
            const authLevel: HttpAuthLevel | undefined = <HttpAuthLevel>HttpAuthLevel[this.triggerBinding.authLevel.toLowerCase()];
            if (authLevel === undefined) {
                throw new Error(localize('unrecognizedAuthLevel', 'Unrecognized auth level "{0}".', this.triggerBinding.authLevel));
            } else {
                return authLevel;
            }
        } else {
            return HttpAuthLevel.function;
        }
    }
}
