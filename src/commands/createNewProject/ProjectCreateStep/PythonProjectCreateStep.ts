/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import * as semver from 'semver';
import { Progress, QuickPickItem } from 'vscode';
import { IAzureQuickPickOptions, parseError } from 'vscode-azureextensionui';
import { extensionPrefix } from '../../../constants';
import { ext } from '../../../extensionVariables';
import { getLocalFuncCoreToolsVersion } from '../../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { localize } from "../../../localize";
import { cpUtils } from "../../../utils/cpUtils";
import { confirmOverwriteFile } from '../../../utils/fs';
import { venvUtils } from '../../../utils/venvUtils';
import { getGlobalSetting, getWorkspaceSetting } from '../../../vsCodeConfig/settings';
import { IProjectWizardContext } from '../IProjectWizardContext';
import { ScriptProjectCreateStep } from './ScriptProjectCreateStep';

const minPythonVersion: string = '3.6.0';
const maxPythonVersion: string = '3.7.0';
const minPythonVersionLabel: string = '3.6.x'; // Use invalid semver as the label to make it more clear that any patch version is allowed

// Starting after this version, the func cli does not require a virtual environment and comes pre-packaged with the below dependencies
const oldFuncVersion: string = '2.4.419';
const oldRequirements: string = `azure-functions==1.0.0b3
azure-functions-worker==1.0.0b4
grpcio==1.14.2
grpcio-tools==1.14.2
protobuf==3.7.1
six==1.12.0
`;

export class PythonProjectCreateStep extends ScriptProjectCreateStep {
    // tslint:disable-next-line: no-use-before-declare
    protected gitignore: string = pythonGitignore;

    public async executeCore(wizardContext: IProjectWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        const settingKey: string = 'createPythonVenv';
        const createPythonVenv: boolean = !!getWorkspaceSetting(settingKey, wizardContext.workspacePath);
        wizardContext.actionContext.properties.createPythonVenv = String(createPythonVenv);
        if (createPythonVenv && !await getExistingVenv(wizardContext.projectPath)) {
            progress.report({ message: localize('creatingVenv', 'Creating virtual environment... To skip this step in the future, modify "{0}.{1}".', extensionPrefix, settingKey) });
            const defaultVenvName: string = '.env';
            await createVirtualEnviornment(defaultVenvName, wizardContext.projectPath);
            progress.report({ message: this.creatingMessage });
        }

        await super.executeCore(wizardContext, progress);

        const requirementsPath: string = path.join(wizardContext.projectPath, 'requirements.txt');
        if (await confirmOverwriteFile(requirementsPath)) {
            let isOldFuncCli: boolean;
            try {
                const currentVersion: string | null = await getLocalFuncCoreToolsVersion();
                isOldFuncCli = !!currentVersion && semver.lte(currentVersion, oldFuncVersion);
            } catch {
                isOldFuncCli = false;
            }

            // Add "azure.functions" for the intellisense, even though it's not technically needed to debug/deploy (The 'a' includes pre-release)
            await fse.writeFile(requirementsPath, isOldFuncCli ? oldRequirements : 'azure.functions~=1.0a');
        }
    }
}

export async function getExistingVenv(projectPath: string): Promise<string | undefined> {
    const venvs: string[] = [];
    const fsPaths: string[] = await fse.readdir(projectPath);
    await Promise.all(fsPaths.map(async (venvName: string) => {
        if (await venvUtils.venvExists(venvName, projectPath)) {
            venvs.push(venvName);
        }
    }));

    if (venvs.length === 0) {
        return undefined;
    } else if (venvs.length === 1) {
        return venvs[0];
    } else {
        const picks: QuickPickItem[] = venvs.map((venv: string) => { return { label: venv }; });
        const options: IAzureQuickPickOptions = {
            placeHolder: localize('multipleVenv', 'Detected multiple virtual environments. Select one to use for your project.'),
            suppressPersistence: true
        };
        return (await ext.ui.showQuickPick(picks, options)).label;
    }
}

/**
 * Returns undefined if valid or an error message if not
 */
async function validatePythonAlias(pyAlias: string, validateMaxVersion: boolean = false): Promise<string | undefined> {
    try {
        const result: cpUtils.ICommandResult = await cpUtils.tryExecuteCommand(undefined /*don't display output*/, undefined /*default to cwd*/, `${pyAlias} --version`);
        if (result.code !== 0) {
            return localize('failValidate', 'Failed to validate version: {0}', result.cmdOutputIncludingStderr);
        }

        const matches: RegExpMatchArray | null = result.cmdOutputIncludingStderr.match(/^Python (\S*)/i);
        if (matches === null || !matches[1]) {
            return localize('failedParse', 'Failed to parse version: {0}', result.cmdOutputIncludingStderr);
        } else {
            const pyVersion: string = matches[1];
            if (semver.lt(pyVersion, minPythonVersion)) {
                return localize('tooLowVersion', 'Python version "{0}" is below minimum version of "{1}".', pyVersion, minPythonVersion);
            } else if (validateMaxVersion && semver.gte(pyVersion, maxPythonVersion)) {
                return localize('tooHighVersion', 'Python version "{0}" is greater than or equal to the maximum version of "{1}".', pyVersion, maxPythonVersion);
            } else {
                return undefined;
            }
        }
    } catch (error) {
        return parseError(error).message;
    }
}

async function getPythonAlias(): Promise<string> {
    const aliasesToTry: string[] = ['python3.6', 'py -3.6', 'python3', 'python', 'py'];
    const globalPythonPathSetting: string | undefined = getGlobalSetting('pythonPath', 'python');
    if (globalPythonPathSetting) {
        aliasesToTry.unshift(globalPythonPathSetting);
    }

    for (const alias of aliasesToTry) {
        // Validate max version when silently picking the alias for the user
        const errorMessage: string | undefined = await validatePythonAlias(alias, true /* validateMaxVersion */);
        if (!errorMessage) {
            return alias;
        }
    }

    const prompt: string = localize('pyAliasPlaceholder', 'Enter the alias or full path of the Python "{0}" executable to use.', minPythonVersionLabel);
    // Don't validate max version when prompting (because the Functions team will assumably support 3.7+ at some point and we don't want to block people from using that)
    return await ext.ui.showInputBox({ prompt, validateInput: validatePythonAlias });
}

export async function createVirtualEnviornment(venvName: string, projectPath: string): Promise<void> {
    const pythonAlias: string = await getPythonAlias();
    await cpUtils.executeCommand(ext.outputChannel, projectPath, pythonAlias, '-m', 'venv', venvName);
}

// https://raw.githubusercontent.com/github/gitignore/master/Python.gitignore
// tslint:disable-next-line:no-multiline-string
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
