/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import * as vscode from 'vscode';
import { Progress, Uri, window, workspace } from 'vscode';
import { ProjectLanguage, hostFileName, localSettingsFileName, pythonFunctionAppFileName } from '../../../constants';
import { IHostJsonV2 } from '../../../funcConfig/host';
import { ILocalSettingsJson } from '../../../funcConfig/local.settings';
import { localize } from "../../../localize";
import { PysteinTemplateProvider } from '../../../templates/script/PysteinTemplateProvider';
import { IScriptFunctionTemplate } from '../../../templates/script/parseScriptTemplates';
import { confirmOverwriteFile } from '../../../utils/fs';
import { showMarkdownPreviewFile } from '../../../utils/textUtils';
import { IProjectWizardContext } from '../IProjectWizardContext';
import { ScriptProjectCreateStep } from './ScriptProjectCreateStep';

const gettingStartedFileName = 'getting_started.md';

async function fileExists(uri: vscode.Uri): Promise<boolean> {
    try {
        const result = await vscode.workspace.fs.stat(uri);

        return result.type === vscode.FileType.File;
    } catch {
        return false;
    }
}

// TODO: This file needs to be completely refactored to create with the "actions" step
export class PysteinProjectCreateStep extends ScriptProjectCreateStep {
    protected gitignore: string = pythonGitignore;

    public async executeCore(context: IProjectWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        const projectTemplate = await PysteinProjectCreateStep.getProjectTemplate(context);
        const localSettingsContent = projectTemplate.templateFiles[localSettingsFileName];

        if (localSettingsContent) {
            this.localSettingsJson = JSON.parse(localSettingsContent) as ILocalSettingsJson;
        } else {
            // Python V2+ model currently requires the EnableWorkerIndexing feature flag be enabled.
            this.localSettingsJson.Values ??= {};
            this.localSettingsJson.Values['AzureWebJobsFeatureFlags'] = 'EnableWorkerIndexing';
        }

        await super.executeCore(context, progress);

        const explicitlyHandledFiles = [
            localSettingsFileName,
            hostFileName
        ];

        // NOTE: We want to add all files in the templates *except* those we've explicitly handled (above and below).
        const filesToAdd =
            Object
                .keys(projectTemplate.templateFiles)
                .filter(file => !explicitlyHandledFiles.includes(file));

        for (const file of filesToAdd) {
            // skip the old default function app file since we let users pick the trigger now
            if (file === pythonFunctionAppFileName) {
                continue;
            }

            const fileContent = projectTemplate.templateFiles[file];

            if (!fileContent) {
                throw new Error(localize('pysteinTemplateFileNotFound', 'The expected {0} file could not be found in the project template.', file));
            }

            const filePath = path.join(context.projectPath, file);

            if (await confirmOverwriteFile(context, filePath)) {
                await AzExtFsExtra.writeFile(filePath, fileContent);
            }
        }

        const functionAppPath = Uri.file(path.join(context.projectPath, pythonFunctionAppFileName));

        // Only open the documents if they're part of the existing/new workspace.
        // NOTE: We don't currently have a way to open specific documents in the new (or reloaded) window.
        if (context.openBehavior === 'AddToWorkspace' || context.openBehavior === 'AlreadyOpen') {
            if (await fileExists(functionAppPath)) {
                await window.showTextDocument(await workspace.openTextDocument(functionAppPath));
            }

            const gettingStartedPath = Uri.file(path.join(context.projectPath, gettingStartedFileName));

            if (await fileExists(gettingStartedPath)) {
                await showMarkdownPreviewFile(gettingStartedPath, /* openToSide: */ true);
            }
        }
    }

    protected async getHostContent(context: IProjectWizardContext): Promise<IHostJsonV2> {
        const projectTemplate = await PysteinProjectCreateStep.getProjectTemplate(context);
        const hostContent = projectTemplate.templateFiles[hostFileName];

        let hostJson: IHostJsonV2;

        if (hostContent) {
            hostJson = JSON.parse(hostContent) as IHostJsonV2;
        } else {
            hostJson = await super.getHostContent(context);
        }

        return hostJson;
    }

    private static async getProjectTemplate(context: IProjectWizardContext): Promise<IScriptFunctionTemplate> {
        const templateProvider = new PysteinTemplateProvider(context.version, context.projectPath, ProjectLanguage.Python, context.projectTemplateKey);

        const projectTemplate = await templateProvider.getProjectTemplate();

        if (!projectTemplate) {
            throw new Error(localize('pysteinNoProjectTemplate', 'No PyStein project template could be found.'));
        }

        return projectTemplate;
    }
}

// https://raw.githubusercontent.com/github/gitignore/master/Python.gitignore
const pythonGitignore: string = `# Byte-compiled / optimized / DLL files
__pycache__/
*.py[cod]
*$py.class

# C extensions
*.so

# Distribution / packaging
.Python
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
wheels/
pip-wheel-metadata/
share/python-wheels/
*.egg-info/
.installed.cfg
*.egg
MANIFEST

# PyInstaller
#  Usually these files are written by a python script from a template
#  before PyInstaller builds the exe, so as to inject date/other infos into it.
*.manifest
*.spec

# Installer logs
pip-log.txt
pip-delete-this-directory.txt

# Unit test / coverage reports
htmlcov/
.tox/
.nox/
.coverage
.coverage.*
.cache
nosetests.xml
coverage.xml
*.cover
.hypothesis/
.pytest_cache/

# Translations
*.mo
*.pot

# Django stuff:
*.log
local_settings.py
db.sqlite3

# Flask stuff:
instance/
.webassets-cache

# Scrapy stuff:
.scrapy

# Sphinx documentation
docs/_build/

# PyBuilder
target/

# Jupyter Notebook
.ipynb_checkpoints

# IPython
profile_default/
ipython_config.py

# pyenv
.python-version

# pipenv
#   According to pypa/pipenv#598, it is recommended to include Pipfile.lock in version control.
#   However, in case of collaboration, if having platform-specific dependencies or dependencies
#   having no cross-platform support, pipenv may install dependencies that don’t work, or not
#   install all needed dependencies.
#Pipfile.lock

# celery beat schedule file
celerybeat-schedule

# SageMath parsed files
*.sage.py

# Environments
.env
.venv
env/
venv/
ENV/
env.bak/
venv.bak/

# Spyder project settings
.spyderproject
.spyproject

# Rope project settings
.ropeproject

# mkdocs documentation
/site

# mypy
.mypy_cache/
.dmypy.json
dmypy.json

# Pyre type checker
.pyre/
`;
