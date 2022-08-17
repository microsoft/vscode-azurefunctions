/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { IScriptFunctionTemplate } from '../../../templates/script/parseScriptTemplates';
import { nonNullProp } from '../../../utils/nonNull';
import { FunctionCreateStepBase } from '../FunctionCreateStepBase';
import { FunctionLocation, IPythonFunctionWizardContext } from './IPythonFunctionWizardContext';
import { showMarkdownPreviewContent } from '../../../utils/textUtils';

function createMarkdown(name: string, content: string): string {
    return `# ${name}
\`\`\` python
${content}
\`\`\``;
}

export class PythonFunctionCreateStep extends FunctionCreateStepBase<IPythonFunctionWizardContext> {
    public async executeCore(context: IPythonFunctionWizardContext): Promise<string> {
        const template: IScriptFunctionTemplate = nonNullProp(context, 'functionTemplate');
        const content = template.templateFiles['function_app.py'];

        if (context.functionLocation === FunctionLocation.Document) {
            const name = nonNullProp(template, 'name');
            const filename = `${name}.md`;

            const markdownFilename = Object.keys(template.templateFiles).find(filename => filename.toLowerCase().endsWith('.md'));

            const markdownContent =
                markdownFilename
                    ? template.templateFiles[markdownFilename]
                    : createMarkdown(name, content);

            await showMarkdownPreviewContent(markdownContent, filename);

            // NOTE: No "real" file being generated...
            return '';
        } else {
            const functionScript = nonNullProp(context, 'functionScript');
            const functionScriptPath: string = path.isAbsolute(functionScript) ? functionScript : path.join(context.projectPath, functionScript);

            await fse.appendFile(functionScriptPath, '\r\n' + content);

            return functionScriptPath;
        }
    }
}
