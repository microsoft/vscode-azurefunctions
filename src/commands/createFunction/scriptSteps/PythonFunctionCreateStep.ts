/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { IFunctionBinding } from '../../../funcConfig/function';
import { IScriptFunctionTemplate } from '../../../templates/script/parseScriptTemplates';
import { nonNullProp } from '../../../utils/nonNull';
import { FunctionCreateStepBase } from '../FunctionCreateStepBase';
import { getBindingSetting } from '../IFunctionWizardContext';
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
        const triggerBinding: IFunctionBinding = nonNullProp(template.functionJson, 'triggerBinding');

        for (const setting of template.userPromptedSettings) {
            triggerBinding[setting.name] = getBindingSetting(context, setting);
        }

        // TODO: Pull out correct content once it's actually in the feed.
        const content = template.templateFiles['__init__.py'];

        if (context.functionLocation === FunctionLocation.Document) {
            const name = nonNullProp(template, 'name');
            const filename = `${name}.md`;

            await showMarkdownPreviewContent(createMarkdown(name, content), filename);

            return ''; // TODO: Allow not returning filename.
        } else {
            const functionScript = nonNullProp(context, 'functionScript');
            const functionScriptPath: string = path.isAbsolute(functionScript) ? functionScript : path.join(context.projectPath, functionScript);

            await fse.appendFile(functionScriptPath, '\r\n' + content);

            return functionScriptPath;
        }
    }
}
