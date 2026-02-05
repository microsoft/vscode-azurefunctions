/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * This script installs PowerShell 7 (pwsh) for test environments.
 * Required for venvUtils tests that run with PowerShell 7.
 *
 * Usage: node scripts/installPwsh.mjs
 */

import { exec, spawn } from 'child_process';
import fse from 'fs-extra';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

const pwshPath = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';

/**
 * Check if PowerShell 7 is already installed
 */
async function isPwshInstalled() {
    try {
        await fs.access(pwshPath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Check if winget is available
 */
async function isWingetAvailable() {
    try {
        await execAsync('winget --version');
        return true;
    } catch {
        return false;
    }
}

/**
 * Install PowerShell using winget (recommended - handles elevation automatically)
 */
async function installWithWinget() {
    console.log('Installing PowerShell 7 using winget...');
    console.log('Note: You may be prompted for administrator privileges.\n');
    
    return new Promise((resolve, reject) => {
        const installer = spawn('winget', [
            'install',
            '--id', 'Microsoft.PowerShell',
            '--source', 'winget',
            '--accept-package-agreements',
            '--accept-source-agreements'
        ], {
            stdio: 'inherit'
        });
        
        installer.on('close', (code) => {
            if (code === 0) {
                console.log('\nPowerShell 7 installed successfully via winget.');
                resolve(true);
            } else {
                console.log(`\nWinget installation exited with code ${code}.`);
                resolve(false);
            }
        });
        
        installer.on('error', (err) => {
            console.log(`Failed to run winget: ${err.message}`);
            resolve(false);
        });
    });
}

/**
 * Get the latest PowerShell 7.x stable release download URL from GitHub
 */
async function getPwshDownloadUrl() {
    console.log('Fetching latest PowerShell 7 release from GitHub...');
    
    const response = await fetch('https://api.github.com/repos/PowerShell/PowerShell/releases', {
        headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'vscode-azurefunctions-test'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Failed to fetch PowerShell releases: ${response.status} ${response.statusText}`);
    }
    
    const releases = await response.json();
    
    // Find the latest stable v7.x release (not a preview/RC)
    const stableRelease = releases.find(release => 
        !release.prerelease && 
        !release.draft &&
        release.tag_name.startsWith('v7.')
    );
    
    if (!stableRelease) {
        throw new Error('Could not find a stable PowerShell 7.x release');
    }
    
    console.log(`Found PowerShell release: ${stableRelease.tag_name}`);
    
    // Find the Windows x64 MSI asset
    const msiAsset = stableRelease.assets.find(asset => 
        asset.name.includes('win-x64') && asset.name.endsWith('.msi')
    );
    
    if (!msiAsset) {
        throw new Error('Could not find Windows x64 MSI installer in release assets');
    }
    
    console.log(`Download URL: ${msiAsset.browser_download_url}`);
    return {
        url: msiAsset.browser_download_url,
        filename: msiAsset.name,
        version: stableRelease.tag_name
    };
}

/**
 * Download a file from URL to target path
 */
async function download(url, targetPath) {
    console.log(`Downloading to ${targetPath}...`);
    
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Download failed with status: ${response.status}`);
    }
    
    await fse.ensureFile(targetPath);
    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(targetPath, Buffer.from(arrayBuffer));
    
    console.log('Download complete.');
}

/**
 * Install PowerShell using the MSI installer (requires elevation)
 */
async function installPwshMsi(msiPath) {
    console.log('Installing PowerShell 7 via MSI...');
    console.log('Note: This requires administrator privileges.\n');
    
    // Use Start-Process with -Verb RunAs to request elevation
    const psCommand = `Start-Process msiexec -ArgumentList '/i "${msiPath}" /qn /norestart ADD_EXPLORER_CONTEXT_MENU_OPENPOWERSHELL=0 ADD_FILE_CONTEXT_MENU_RUNPOWERSHELL=0 ENABLE_PSREMOTING=0 REGISTER_MANIFEST=1 USE_MU=0 ENABLE_MU=0' -Verb RunAs -Wait`;
    
    return new Promise((resolve, reject) => {
        const installer = spawn('powershell', ['-Command', psCommand], {
            stdio: 'inherit'
        });
        
        installer.on('close', (code) => {
            if (code === 0) {
                console.log('PowerShell 7 MSI installation completed.');
                resolve(true);
            } else {
                console.log(`MSI installation exited with code ${code}.`);
                resolve(false);
            }
        });
        
        installer.on('error', (err) => {
            reject(new Error(`Failed to start installer: ${err.message}`));
        });
    });
}

/**
 * Verify the installation
 */
async function verifyInstallation() {
    // Give Windows a moment to register the installation
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (!await isPwshInstalled()) {
        return false;
    }
    
    try {
        const { stdout } = await execAsync(`"${pwshPath}" --version`);
        console.log(`Verified PowerShell installation: ${stdout.trim()}`);
        return true;
    } catch {
        return false;
    }
}

/**
 * Clean up temporary files
 */
async function cleanup(msiPath) {
    try {
        await fse.remove(path.dirname(msiPath));
        console.log('Cleaned up temporary files.');
    } catch {
        console.log('Note: Could not remove temporary MSI file.');
    }
}

// Main execution
async function main() {
    if (process.platform !== 'win32') {
        console.log('This script is only for Windows. On other platforms, install PowerShell via package manager:');
        console.log('  macOS: brew install powershell');
        console.log('  Ubuntu: sudo apt-get install -y powershell');
        process.exit(0);
    }
    
    // Check if already installed
    if (await isPwshInstalled()) {
        console.log(`PowerShell 7 is already installed at ${pwshPath}`);
        await verifyInstallation();
        return;
    }
    
    console.log('PowerShell 7 is not installed. Starting installation...\n');
    
    // Try winget first (preferred method)
    if (await isWingetAvailable()) {
        console.log('Winget is available. Using winget for installation...\n');
        const wingetSuccess = await installWithWinget();
        
        if (wingetSuccess && await verifyInstallation()) {
            console.log('\nPowerShell 7 installation complete!');
            return;
        }
        console.log('\nWinget installation did not complete successfully. Trying MSI fallback...\n');
    } else {
        console.log('Winget is not available. Using MSI installer...\n');
    }
    
    // Fallback to MSI installer
    const { url, filename, version } = await getPwshDownloadUrl();
    
    // Download MSI
    const tempDir = path.join(os.tmpdir(), 'pwsh-install');
    await fse.ensureDir(tempDir);
    const msiPath = path.join(tempDir, filename);
    
    await download(url, msiPath);
    
    // Install
    try {
        const msiSuccess = await installPwshMsi(msiPath);
        
        if (msiSuccess && await verifyInstallation()) {
            console.log(`\nPowerShell ${version} installation complete!`);
        } else {
            console.log('\nInstallation may have completed. Please verify manually:');
            console.log(`  Check if pwsh exists at: ${pwshPath}`);
            console.log('  Or try running: pwsh --version');
        }
    } finally {
        await cleanup(msiPath);
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
