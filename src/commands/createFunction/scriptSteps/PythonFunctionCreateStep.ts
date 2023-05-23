/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { pythonFunctionAppFileName, pythonFunctionBodyFileName } from '../../../constants';
import { IScriptFunctionTemplate } from '../../../templates/script/parseScriptTemplates';
import { nonNullProp } from '../../../utils/nonNull';
import { showMarkdownPreviewContent } from '../../../utils/textUtils';
import { FunctionCreateStepBase } from '../FunctionCreateStepBase';
import { FunctionLocation, IPythonFunctionWizardContext } from './IPythonFunctionWizardContext';

function createMarkdown(name: string, content: string): string {
    return `# ${name}
\`\`\` python
${content}
\`\`\``;
}

function escapeRegExp(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class PythonFunctionCreateStep extends FunctionCreateStepBase<IPythonFunctionWizardContext> {
    public async executeCore(context: IPythonFunctionWizardContext): Promise<string> {
        const template: IScriptFunctionTemplate = nonNullProp(context, 'functionTemplate');
        let content = template.templateFiles[pythonFunctionBodyFileName];

        if (context.functionLocation === FunctionLocation.Document) {
            const name = nonNullProp(template, 'name');
            const filename = `${name}.md`;

            const markdownFilename = Object.keys(template.templateFiles).find(filename => filename.toLowerCase().endsWith('.md'));

            const markdownContent =
                markdownFilename
                    ? template.templateFiles[markdownFilename]
                    : createMarkdown(name, content);

            await showMarkdownPreviewContent(markdownContent, filename, /* openToSide: */ true);

            // NOTE: No "real" file being generated...
            return '';
        } else {
            const functionScript = nonNullProp(context, 'functionScript');
            const functionScriptPath: string = path.isAbsolute(functionScript) ? functionScript : path.join(context.projectPath, functionScript);

            // if it doesn't exist, then we should create the file
            await AzExtFsExtra.ensureFile(functionScriptPath);

            const existingContent = await AzExtFsExtra.readFile(functionScriptPath);
            // is the existingContent file is empty, this is start of a function app and we need to use the function_app.py template
            const isFunctionApp: boolean = !existingContent;

            content = isFunctionApp ?
                template.templateFiles[pythonFunctionAppFileName] :
                template.templateFiles[pythonFunctionBodyFileName];

            for (const setting of template.userPromptedSettings) {
                if (setting.assignTo) {
                    // the setting name keys are lowercased
                    content = content.replace(new RegExp(escapeRegExp(setting.assignTo), 'g'), context[setting.name.toLowerCase()]);
                }
            }
            // NOTE: AzExtFsExtra doesn't have fs-extra's handy appendFile() function.
            // NOTE: We add two (end-of-)lines to ensure an empty line between functions definitions for function_body.
            await AzExtFsExtra.writeFile(functionScriptPath, existingContent + (isFunctionApp ? '' : '\r\n\r\n') + content);

            return functionScriptPath;
        }
    }
}
