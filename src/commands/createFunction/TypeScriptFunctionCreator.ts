/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { tsConfigFileName, tsDefaultOutDir } from '../../constants';
import { IFunctionJson } from '../../FunctionConfig';
import { ScriptFunctionCreator } from './ScriptFunctionCreator';

export class TypeScriptFunctionCreator extends ScriptFunctionCreator {
    protected async editFunctionJson(functionJson: IFunctionJson): Promise<void> {
        let outDir: string = tsDefaultOutDir;
        try {
            const tsconfigPath: string = path.join(this._functionAppPath, tsConfigFileName);
            // tslint:disable-next-line:no-unsafe-any
            outDir = (await fse.readJSON(tsconfigPath)).compilerOptions.outDir;
        } catch {
            // ignore and use default outDir
        }

        functionJson.scriptFile = path.join('..', outDir, this._functionName, 'index.js');
    }
}
