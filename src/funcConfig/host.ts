/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FuncVersion } from "../FuncVersion";

export interface IHostJsonV2 {
    version?: string;
    managedDependency?: {
        enabled?: boolean;
    };
    extensionBundle?: IBundleMetadata;
    extensions?: {
        http?: {
            routePrefix?: string;
        };
    };
}

export interface IBundleMetadata {
    id?: string;
    version?: string;
}

export interface IHostJsonV1 {
    http?: {
        routePrefix?: string;
    };
}

export interface IParsedHostJson {
    readonly routePrefix: string;
    readonly bundle?: IBundleMetadata;
}

const defaultRoutePrefix: string = 'api';

class ParsedHostJsonV2 implements IParsedHostJson {
    public data: IHostJsonV2;

    public constructor(data: unknown) {
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

    public get bundle(): IBundleMetadata | undefined {
        return this.data.extensionBundle;
    }
}

class ParsedHostJsonV1 implements IParsedHostJson {
    public data: IHostJsonV1;

    public constructor(data: unknown) {
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

export function parseHostJson(data: unknown, version: FuncVersion | undefined): IParsedHostJson {
    return version === FuncVersion.v1 ? new ParsedHostJsonV1(data) : new ParsedHostJsonV2(data);
}
