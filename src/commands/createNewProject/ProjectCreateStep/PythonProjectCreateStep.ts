/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import * as semver from 'semver';
import { type Progress } from 'vscode';
import { requirementsFileName } from '../../../constants';
import { getLocalFuncCoreToolsVersion } from '../../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { confirmOverwriteFile } from '../../../utils/fs';
import { type IProjectWizardContext } from '../IProjectWizardContext';
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

const defaultRequirements: string = `# Uncomment to enable Azure Monitor OpenTelemetry
# Ref: aka.ms/functions-azure-monitor-python
# azure-monitor-opentelemetry

azure-functions
`;

export class PythonProjectCreateStep extends ScriptProjectCreateStep {
    protected gitignore: string = pythonGitignore;

    public async executeCore(context: IProjectWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
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
