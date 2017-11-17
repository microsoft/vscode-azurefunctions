/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { TemplateLanguage } from '../templates/Template';

export namespace projectUtils {
    export async function getProjectType(projectPath: string): Promise<string> {
        let language: string = TemplateLanguage.JavaScript;
        if (await fse.pathExists(path.join(projectPath, 'pom.xml'))) {
            language = TemplateLanguage.Java;
        }
        return language;
    }
}
