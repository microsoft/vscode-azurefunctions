/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createNewAppInsightsPick, createNewAppServicePlanPick, createNewResourceGroupPick, createNewStorageAccountPick, createNewUserAssignedIdentityPick, locationDefaultPick, nodeRuntimePick } from "../constants";

export namespace createFunctionAppUtils {
    export function generateBasicCreateInputs(appName: string, folderName: string, runtime: Runtime, storageConnection: ConnectionType): (string | RegExp)[] {
        return [
            folderName,
            appName,
            locationDefaultPick,
            getRuntimePick(runtime),
            new RegExp(storageConnection, 'i'),
        ];
    }

    export function generateAdvancedCreateInputs(appName: string, folderName: string, runtime: Runtime, storageConnection: ConnectionType, plan: PlanType, os?: OperatingSystem): (string | RegExp)[] {
        switch (plan) {
            case PlanType.FlexConsumption:
                return [
                    folderName,
                    appName,
                    new RegExp(plan, 'i'),
                    locationDefaultPick,
                    getRuntimePick(runtime),
                    '2048',
                    '100',
                    createNewResourceGroupPick,
                    appName,
                    ...getConnectionTypeInputs(storageConnection),
                    createNewStorageAccountPick,
                    appName,
                    createNewAppInsightsPick,
                    appName,
                ];
            case PlanType.Premium:
                return [
                    folderName,
                    appName,
                    new RegExp(plan, 'i'),
                    locationDefaultPick,
                    getRuntimePick(runtime),
                    ...(os ? [new RegExp(os, 'i')] : []),
                    createNewAppServicePlanPick,
                    appName,
                    /EP1/i,
                    createNewResourceGroupPick,
                    appName,
                    ...getConnectionTypeInputs(storageConnection),
                    createNewStorageAccountPick,
                    appName,
                    createNewAppInsightsPick,
                    appName,
                ];
            case PlanType.LegacyConsumption:
                return [
                    folderName,
                    appName,
                    new RegExp(plan, 'i'),
                    locationDefaultPick,
                    getRuntimePick(runtime),
                    ...(os ? [new RegExp(os, 'i')] : []),
                    createNewResourceGroupPick,
                    appName,
                    ...getConnectionTypeInputs(storageConnection),
                    createNewStorageAccountPick,
                    appName,
                    createNewAppInsightsPick,
                    appName,
                ];
            case PlanType.AppService:
                return [
                    folderName,
                    appName,
                    new RegExp(plan, 'i'),
                    locationDefaultPick,
                    getRuntimePick(runtime),
                    ...(os ? [new RegExp(os, 'i')] : []),
                    createNewAppServicePlanPick,
                    appName,
                    /S1/i,
                    createNewResourceGroupPick,
                    appName,
                    ...getConnectionTypeInputs(storageConnection),
                    createNewStorageAccountPick,
                    appName,
                    createNewAppInsightsPick,
                    appName,
                ];
        }
    }

    export function getStorageConnectionDescription(storageConnection: ConnectionType): string {
        return storageConnection === ConnectionType.Secrets ?
            'storage:secrets' :
            'storage:mi';
    }

    function getRuntimePick(runtime: Runtime): RegExp | string {
        switch (runtime) {
            // case Runtime.Python:
            case Runtime.Node:
                return nodeRuntimePick;
            // case Runtime.DotNetIsolated:
            // case Runtime.DotNetInProc:
            default:
                throw new Error(`Runtime "${runtime}" not yet supported in "createFunctionAppUtils.generateBasicCreateInputs".`);
        }
    }

    function getConnectionTypeInputs(connection: ConnectionType): (string | RegExp)[] {
        return connection === ConnectionType.ManagedIdentity ?
            [new RegExp(connection, 'i'), createNewUserAssignedIdentityPick] :
            [new RegExp(connection, 'i')];
    }
}

export enum ConnectionType {
    Secrets = 'Secrets',
    ManagedIdentity = 'Managed Identity',
}

export enum OperatingSystem {
    Linux = 'Linux',
    Windows = 'Windows',
}

export enum PlanType {
    FlexConsumption = 'Flex Consumption',
    Premium = 'Premium',
    LegacyConsumption = 'Legacy',
    AppService = 'App Service Plan',
}

export enum CreateMode {
    Basic = 'Basic',
    Advanced = 'Advanced',
}

export enum Runtime {
    Node = 'Node',
    Python = 'Python',
    DotNetIsolated = '.NET Isolated',
    DotNetInProc = '.NET In-Proc'
}
