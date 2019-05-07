/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProjectRuntime } from "../constants";

export interface IHostJsonV2 {
    version?: string;
    managedDependency?: {
        enabled?: boolean;
    };
    extensionBundle?: {
        id?: string;
        version?: string;
    };
    extensions?: {
        http?: {
            routePrefix?: string;
        };
    };
}

export interface IHostJsonV1 {
    http?: {
        routePrefix?: string;
    };
}

export interface IParsedHostJson {
    readonly routePrefix: string;
}

const defaultRoutePrefix: string = 'api';

class ParsedHostJsonV2 implements IParsedHostJson {
    public data: IHostJsonV2;

    // tslint:disable-next-line:no-any
    public constructor(data: any) {
        // tslint:disable-next-line:no-unsafe-any
        if (typeof data === 'object' && data !== null) {
            this.data = <IHostJsonV2>data;
        } else {
            this.data = {};
        }
    }

    public get routePrefix(): string {
        // NOTE: Explicitly checking against undefined (an empty string _is_ a valid route prefix)
        if (this.data.extensions && this.data.extensions.http && this.data.extensions.http.routePrefix !== undefined) {
            return this.data.extensions.http.routePrefix;
        } else {
            return defaultRoutePrefix;
        }
    }
}

class ParsedHostJsonV1 implements IParsedHostJson {
    public data: IHostJsonV1;

    // tslint:disable-next-line:no-any
    public constructor(data: any) {
        // tslint:disable-next-line:no-unsafe-any
        if (typeof data === 'object' && data !== null) {
            this.data = <IHostJsonV1>data;
        } else {
            this.data = {};
        }
    }

    public get routePrefix(): string {
        // NOTE: Explicitly checking against undefined (an empty string _is_ a valid route prefix)
        if (this.data.http && this.data.http.routePrefix !== undefined) {
            return this.data.http.routePrefix;
        } else {
            return defaultRoutePrefix;
        }
    }
}

// tslint:disable-next-line:no-any
export function parseHostJson(data: any, runtime: ProjectRuntime | undefined): IParsedHostJson {
    return runtime === ProjectRuntime.v1 ? new ParsedHostJsonV1(data) : new ParsedHostJsonV2(data);
}
