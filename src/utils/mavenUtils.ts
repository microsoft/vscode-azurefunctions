/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as xml2js from 'xml2js';
import { localize } from '../localize';
import { cpUtils } from './cpUtils';

export namespace mavenUtils {
    const mvnCommand: string = 'mvn';
    export async function validateMavenInstalled(workingDirectory: string): Promise<void> {
        try {
            await cpUtils.executeCommand(undefined, workingDirectory, mvnCommand, '--version');
        } catch (error) {
            throw new Error(localize('azFunc.mvnNotFound', 'Failed to find "maven" on path.'));
        }
    }

    export async function getFunctionAppNameInPom(pomLocation: string): Promise<string | undefined> {
        const pomString: string = await fse.readFile(pomLocation, 'utf-8');
        return await new Promise((resolve: (ret: string | undefined) => void): void => {
            // tslint:disable-next-line:no-any
            xml2js.parseString(pomString, { explicitArray: false }, (err: any, result: any): void => {
                if (result && !err) {
                    // tslint:disable-next-line:no-string-literal no-unsafe-any
                    if (result['project'] && result['project']['properties']) {
                        // tslint:disable-next-line:no-string-literal no-unsafe-any
                        resolve(result['project']['properties']['functionAppName']);
                        return;
                    }
                }
                resolve(undefined);
            });
        });
    }
}
