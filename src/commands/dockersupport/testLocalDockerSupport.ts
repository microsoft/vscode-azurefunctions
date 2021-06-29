import * as fse from 'fs-extra';
import * as path from 'path';
import { TestInput } from "vscode-azureextensiondev";
import { cleanTestWorkspace, createTestActionContext, testFolderPath, testUserInput } from "../../../test/global.test";
import { getJavaScriptValidateOptions, IValidateProjectOptions } from "../../../test/project/validateProject";
import { getRandomHexString } from "../../utils/fs";
import { localDockerPrompt } from './localDockerSupport';



suite('verifyDockerPrompt', function (this: Mocha.Suite): void {
    //Test project inputs for the Docker Prompt project
    this.timeout(30 * 1000);

    suiteSetup(async () => {
        await cleanTestWorkspace();
    })

    test('Enable Docker Prompt', async () => {
        const mockFiles = [['HttpTriggerJs', 'index.js']];
        await initLocalDockerPrompt(...getJavaScriptValidateOptions(), mockFiles)
    });
});

type MockFilePath = string | string[];

type MockFile = MockFilePath | { fsPath: MockFilePath; contents?: string | object; isDir?: boolean };

interface ProjectTestOptions extends IValidateProjectOptions {
    mockFiles?: MockFile[];
    createProjectInputs?: (string | RegExp | TestInput)[];
    createFunctionInputs?: (string | RegExp | TestInput)[];
    inputs?: (string | RegExp | TestInput)[];
}

async function initLocalDockerPrompt(options: ProjectTestOptions): Promise<void> {
    const projectPath: string = path.join(testFolderPath, getRandomHexString());
    const functionName: string = 'func' + getRandomHexString();

    const mockFiles: MockFile[] = options.mockFiles || [];
    mockFiles.push('local.settings.json', 'host.json', '.funcignore', '.gitignore', { fsPath: '.git', isDir: true });

    await Promise.all(mockFiles.map(async mockFile => {
        mockFile = typeof mockFile == 'string' || Array.isArray(mockFile) ? { fsPath: mockFile } : mockFile;

        const subPaths: string[] = typeof mockFile.fsPath === "string" ? [mockFile.fsPath] : mockFile.fsPath;
        const fullPath: string = path.join(projectPath, ...subPaths);
        mockFile.isDir ? await fse.ensureDir(fullPath) : await fse.ensureFile(fullPath);

        if (typeof mockFile.contents == "object") {
            await fse.writeJSON(fullPath, mockFile.contents);
        } else if (mockFile.contents) {
            await fse.writeFile(fullPath, mockFile.contents);
        }

        await testUserInput.runWithInputs(options.inputs || [], async () => {
            await localDockerPrompt(createTestActionContext(), projectPath, 'devcontainerURI', 'devcontainerNAME', options.language);
        })

    }))
}
