/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { nonNullProp } from '@microsoft/vscode-azext-utils';
import * as fse from 'fs-extra';
import * as path from 'path';
import { tsConfigFileName, tsDefaultOutDir } from '../../../constants';
import { IFunctionJson } from '../../../funcConfig/function';
import { IScriptFunctionWizardContext } from './IScriptFunctionWizardContext';
import { ScriptFunctionCreateStep } from './ScriptFunctionCreateStep';

export class TypeScriptFunctionCreateStep extends ScriptFunctionCreateStep {
    protected async editFunctionJson(context: IScriptFunctionWizardContext, functionJson: IFunctionJson): Promise<void> {
        let outDir: string = tsDefaultOutDir;
        try {
            const tsconfigPath: string = path.join(context.projectPath, tsConfigFileName);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            outDir = (await fse.readJSON(tsconfigPath)).compilerOptions.outDir;
        } catch {
            // ignore and use default outDir
        }

        functionJson.scriptFile = path.posix.join('..', outDir, nonNullProp(context, 'functionName'), 'index.js');
    }
}
