#!/usr/bin/env node
/**
 * Self-contained diagnostic script that exercises the same feed mirror endpoints
 * the extension uses at runtime. Run from the pipeline BEFORE the full test suite
 * to get fast feedback on feed connectivity and auth.
 *
 * Required env vars:
 *   NUGET_MIRROR_FEED_URL  – e.g. https://.../azcode/nuget/v3/flat2
 *   NUGET_MIRROR_PAT       – Bearer token (System.AccessToken)
 *
 * Optional env vars:
 *   PSGALLERY_MIRROR_FEED_URL – e.g. https://.../azcode/nuget/v2
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';

const FEED_URL = process.env.NUGET_MIRROR_FEED_URL;
const PAT = process.env.NUGET_MIRROR_PAT;
const PSGALLERY_URL = process.env.PSGALLERY_MIRROR_FEED_URL;

let failures = 0;

// ── helpers ──────────────────────────────────────────────────────────────────

function get(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        const req = mod.get(url, { headers }, (res) => {
            // Follow redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                console.log(`  ↪ ${res.statusCode} redirect: ${url} → ${res.headers.location}`);
                res.resume();
                get(res.headers.location, headers).then(resolve, reject);
                return;
            }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const body = Buffer.concat(chunks);
                resolve({ status: res.statusCode, headers: res.headers, body });
            });
        });
        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(new Error('timeout')); });
    });
}

async function download(url, destPath, headers = {}) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        const req = mod.get(url, { headers }, (res) => {
            // Follow redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                console.log(`  ↪ ${res.statusCode} redirect: ${url} → ${res.headers.location}`);
                download(res.headers.location, destPath, headers).then(resolve, reject);
                res.resume();
                return;
            }
            const ws = fs.createWriteStream(destPath);
            res.pipe(ws);
            ws.on('finish', () => resolve({ status: res.statusCode, size: ws.bytesWritten }));
            ws.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(new Error('timeout')); });
    });
}

function section(title) {
    console.log(`\n${'─'.repeat(60)}\n  ${title}\n${'─'.repeat(60)}`);
}

function pass(msg) { console.log(`  ✅ ${msg}`); }
function fail(msg) { console.log(`  ❌ ${msg}`); failures++; }
function info(msg) { console.log(`  ℹ️  ${msg}`); }

// ── CLI feed lookup ──────────────────────────────────────────────────────────

async function getCliFeedPackageUrls() {
    section('CLI Feed – resolve template nupkg URLs');
    const { body } = await get('https://aka.ms/funcCliFeedV4');
    const feed = JSON.parse(body.toString());
    const v4Release = feed.tags.v4.release;
    info(`v4 release: ${v4Release}`);
    const release = feed.releases[v4Release];
    const first = Object.entries(release.workerRuntimes.dotnet)[0];
    const [key, runtime] = first;
    info(`Using runtime entry: ${key}`);
    info(`  itemTemplates:    ${runtime.itemTemplates}`);
    info(`  projectTemplates: ${runtime.projectTemplates}`);
    return { itemUrl: runtime.itemTemplates, projectUrl: runtime.projectTemplates };
}

// ── NuGet v3 flat container download ─────────────────────────────────────────

function rewriteToMirror(nugetV2Url) {
    const prefix = 'https://www.nuget.org/api/v2/package/';
    if (!nugetV2Url.startsWith(prefix)) return null;
    const rest = nugetV2Url.substring(prefix.length);
    const slash = rest.indexOf('/');
    const id = rest.substring(0, slash).toLowerCase();
    const version = rest.substring(slash + 1);
    return `${FEED_URL.replace(/\/+$/, '')}/${id}/${version}/${id}.${version}.nupkg`;
}

async function testNugetDownload(label, originalUrl) {
    section(`NuGet download – ${label}`);
    info(`Original:  ${originalUrl}`);
    const mirrorUrl = rewriteToMirror(originalUrl);
    if (!mirrorUrl) { fail('Could not rewrite URL'); return null; }
    info(`Mirror:    ${mirrorUrl}`);

    const headers = PAT ? { Authorization: `Bearer ${PAT}` } : {};
    info(`Auth:      ${PAT ? 'Bearer token set' : 'NONE'}`);

    const tmpFile = path.join(os.tmpdir(), `feed-test-${label.replace(/\s+/g, '-')}.nupkg`);
    try {
        const result = await download(mirrorUrl, tmpFile, headers);
        info(`Status:    ${result.status}`);
        info(`Size:      ${result.size} bytes`);

        if (result.status !== 200) {
            fail(`Expected 200, got ${result.status}`);
            if (result.size < 5000) {
                const content = fs.readFileSync(tmpFile, 'utf8');
                info(`Response body:\n${content.substring(0, 500)}`);
            }
            return null;
        }

        // Check ZIP magic bytes
        const head = Buffer.alloc(4);
        const fd = fs.openSync(tmpFile, 'r');
        fs.readSync(fd, head, 0, 4, 0);
        fs.closeSync(fd);
        const isZip = head[0] === 0x50 && head[1] === 0x4B;
        if (isZip) {
            pass(`Valid ZIP/nupkg (${result.size} bytes)`);
        } else {
            fail(`NOT a valid ZIP. Magic bytes: ${head.toString('hex')}`);
            if (result.size < 5000) {
                info(`Content:\n${fs.readFileSync(tmpFile, 'utf8').substring(0, 500)}`);
            }
        }
        return tmpFile;
    } catch (err) {
        fail(`Download error: ${err.message}`);
        return null;
    }
}

// ── nupkg parsing (same as extension) ────────────────────────────────────────

async function testNupkgParsing(label, nupkgPath) {
    section(`Parse nupkg – ${label}`);
    if (!nupkgPath) { fail('No nupkg to parse (download failed)'); return; }

    try {
        // Use extract-zip if available, otherwise tar
        let extractDir;
        try {
            const { default: extract } = await import('extract-zip');
            extractDir = path.join(os.tmpdir(), `feed-test-extract-${Date.now()}`);
            await extract(nupkgPath, { dir: extractDir });
        } catch {
            // Fallback: use unzip command
            extractDir = path.join(os.tmpdir(), `feed-test-extract-${Date.now()}`);
            fs.mkdirSync(extractDir, { recursive: true });
            try {
                execSync(`unzip -q "${nupkgPath}" -d "${extractDir}"`, { timeout: 10000 });
            } catch (e) {
                fail(`Cannot extract nupkg: ${e.message}`);
                return;
            }
        }

        // Find template.json files
        const templateJsons = [];
        function walk(dir) {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) walk(full);
                else if (entry.name === 'template.json' && full.includes('.template.config'))
                    templateJsons.push(full);
            }
        }
        walk(extractDir);

        info(`Found ${templateJsons.length} template.json files`);
        if (templateJsons.length > 0) {
            pass(`Parsed ${templateJsons.length} templates`);
            for (const f of templateJsons.slice(0, 3)) {
                const j = JSON.parse(fs.readFileSync(f, 'utf8'));
                info(`  - ${j.name || j.identity || '(unknown)'}`);
            }
            if (templateJsons.length > 3) info(`  ... and ${templateJsons.length - 3} more`);
        } else {
            fail('No template.json files found in nupkg');
        }

        // Cleanup
        fs.rmSync(extractDir, { recursive: true, force: true });
    } catch (err) {
        fail(`Parse error: ${err.message}`);
    }
}

// ── PowerShell Gallery v2 query ──────────────────────────────────────────────

async function testPSGalleryQuery() {
    section('PowerShell Gallery – FindPackagesById (Az)');
    if (!PSGALLERY_URL) { info('PSGALLERY_MIRROR_FEED_URL not set, skipping'); return; }

    const url = `${PSGALLERY_URL.replace(/\/+$/, '')}/FindPackagesById()?id='Az'`;
    info(`URL: ${url}`);

    const headers = PAT ? { Authorization: `Bearer ${PAT}` } : {};
    try {
        const { status, body } = await get(url, headers);
        info(`Status: ${status}, Size: ${body.length} bytes`);
        if (status === 200) {
            const xml = body.toString();
            const versionMatches = [...xml.matchAll(/<d:Version>([^<]+)<\/d:Version>/g)];
            if (versionMatches.length > 0) {
                pass(`Got ${versionMatches.length} versions, latest: ${versionMatches[versionMatches.length - 1][1]}`);
            } else {
                fail('200 but no version entries found in response');
                info(`Response preview:\n${xml.substring(0, 300)}`);
            }
        } else {
            fail(`Expected 200, got ${status}`);
            info(`Response:\n${body.toString().substring(0, 500)}`);
        }
    } catch (err) {
        fail(`Query error: ${err.message}`);
    }
}

// ── pip index ────────────────────────────────────────────────────────────────

async function testPipIndex() {
    section('pip – PIP_INDEX_URL');
    const pipUrl = process.env.PIP_INDEX_URL;
    if (!pipUrl) { info('PIP_INDEX_URL not set, skipping'); return; }
    // Don't log the full URL (contains token), just check it works
    info(`URL: ${pipUrl.replace(/\/\/[^@]+@/, '//***@')}`);
    try {
        const { status } = await get(pipUrl);
        if (status === 200) pass(`pip index reachable (${status})`);
        else fail(`pip index returned ${status}`);
    } catch (err) {
        fail(`pip index error: ${err.message}`);
    }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║         Feed Mirror Diagnostic                         ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    info(`NUGET_MIRROR_FEED_URL:    ${FEED_URL || '(not set)'}`);
    info(`NUGET_MIRROR_PAT:         ${PAT ? '(set)' : '(not set)'}`);
    info(`PSGALLERY_MIRROR_FEED_URL: ${PSGALLERY_URL || '(not set)'}`);
    info(`PIP_INDEX_URL:            ${process.env.PIP_INDEX_URL ? '(set)' : '(not set)'}`);

    if (!FEED_URL) {
        info('No NUGET_MIRROR_FEED_URL set — nothing to test.');
        return;
    }

    // 1. Get real package URLs from CLI feed
    const { itemUrl, projectUrl } = await getCliFeedPackageUrls();

    // 2. Test NuGet v3 flat container downloads
    const itemFile = await testNugetDownload('itemTemplates', itemUrl);
    const projectFile = await testNugetDownload('projectTemplates', projectUrl);

    // 3. Parse the downloaded nupkgs
    await testNupkgParsing('itemTemplates', itemFile);
    await testNupkgParsing('projectTemplates', projectFile);

    // 4. Test PowerShell Gallery query
    await testPSGalleryQuery();

    // 5. Test pip
    await testPipIndex();

    // Summary
    section('Summary');
    if (failures === 0) {
        pass('All checks passed!');
    } else {
        fail(`${failures} check(s) failed`);
        process.exitCode = 1;
    }
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exitCode = 1;
});
