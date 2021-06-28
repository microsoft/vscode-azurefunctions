import { cpUtils } from "../../utils/cpUtils";

/**
 * Function that checks if Docker is installed on the system or remote container
 * @returns true/false boolean checking if Docker is installed
 */
export async function validateDockerInstalled(): Promise<boolean> {
    let installed: boolean = false;

    // TODO: Checking remote container for Docker?
    try {
        // Not sure if this command works for other Operating Systems - CHECK IF COMMAND CALLS TO BASH & ZSHELL
        await cpUtils.executeCommand(undefined, undefined, 'docker', '--version'); // can add the 'docker' as a variable instead
        installed = true;
    } catch (error) {
        // note: can change this to add a prompt to download Docker if the user chooses to
        installed = false;
    }

    return installed;
}
