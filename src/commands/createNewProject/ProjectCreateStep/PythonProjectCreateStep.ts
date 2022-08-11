/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import * as semver from 'semver';
import { Progress, Uri, window, workspace } from 'vscode';
import { ProjectLanguage, pythonFunctionAppFileName, requirementsFileName } from '../../../constants';
import { IHostJsonV2 } from '../../../funcConfig/host';
import { getLocalFuncCoreToolsVersion } from '../../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { confirmOverwriteFile } from '../../../utils/fs';
import { isPythonV2Plus } from '../../../utils/pythonUtils';
import { IProjectWizardContext } from '../IProjectWizardContext';
import { ScriptProjectCreateStep } from './ScriptProjectCreateStep';

// Starting after this version, the func cli does not require a virtual environment and comes pre-packaged with the below dependencies
const oldFuncVersion: string = '2.4.419';
const oldRequirements: string = `azure-functions==1.0.0b3
azure-functions-worker==1.0.0b4
grpcio==1.14.2
grpcio-tools==1.14.2
protobuf==3.7.1
six==1.12.0
`;

const defaultRequirements: string = `# DO NOT include azure-functions-worker in this file
# The Python Worker is managed by Azure Functions platform
# Manually managing azure-functions-worker may cause unexpected issues

azure-functions
`;

const azureWebJobsFeatureFlagsKey = 'AzureWebJobsFeatureFlags';

const defaultFunctionAppSource = `import azure.functions as func

app = func.FunctionApp(auth_level=func.AuthLevel.ANONYMOUS)

# Uncomment to create an HTTP trigger-based function.
# @app.function_name(name="HttpTrigger1")
# @app.route(route="hello")
# def test_function(req: func.HttpRequest) -> func.HttpResponse:
#    return func.HttpResponse("HttpTrigger1 function processed a request!!!")
`;

export class PythonProjectCreateStep extends ScriptProjectCreateStep {
    protected gitignore: string = pythonGitignore;

    constructor(private readonly model?: number) {
        super();
    }

    public async executeCore(context: IProjectWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        // The Python V2+ model requires enabling worker indexing...
        if (this.isModelV2Plus) {
            this.localSettingsJson.Values = this.localSettingsJson.Values ?? {};

            this.localSettingsJson.Values[azureWebJobsFeatureFlagsKey] = 'EnableWorkerIndexing';
        }

        await super.executeCore(context, progress);

        const requirementsPath: string = path.join(context.projectPath, requirementsFileName);
        if (await confirmOverwriteFile(context, requirementsPath)) {
            let isOldFuncCli: boolean;
            try {
                const currentVersion: string | null = await getLocalFuncCoreToolsVersion(context, context.workspacePath);
                isOldFuncCli = !!currentVersion && semver.lte(currentVersion, oldFuncVersion);
            } catch {
                isOldFuncCli = false;
            }

            await AzExtFsExtra.writeFile(requirementsPath, isOldFuncCli ? oldRequirements : defaultRequirements);
        }

        // The Python V2+ model has a single, project-level source file.
        if (this.isModelV2Plus)
        {
            const functionAppPath: string = path.join(context.projectPath, pythonFunctionAppFileName);

            if (await confirmOverwriteFile(context, functionAppPath)) {
                await AzExtFsExtra.writeFile(functionAppPath, defaultFunctionAppSource);
                await window.showTextDocument(await workspace.openTextDocument(Uri.file(functionAppPath)));
            }
        }
    }

    protected async getHostContent(context: IActionContext): Promise<IHostJsonV2> {
        const hostJson: IHostJsonV2 = await super.getHostContent(context);

        // Python V2+ model currently does not work when extension bundles are specified.
        if (this.isModelV2Plus) {
            hostJson.extensionBundle = undefined;
        }

        return hostJson;
    }

    private get isModelV2Plus(): boolean {
        return isPythonV2Plus(ProjectLanguage.Python, this.model);
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
