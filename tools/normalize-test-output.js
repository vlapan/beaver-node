#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const outputRoot = process.argv[2];
if (!outputRoot) {
    console.error('Usage: normalize-test-output.js <outputRoot>');
    process.exit(1);
}

const concurrency = Math.max(1, Math.min(32, ((os.cpus() || []).length || 4) * 4));
let inFlight = 0;
const queue = [];
function runTask(task) {
    return new Promise((resolve, reject) => {
        const run = async () => {
            inFlight++;
            try {
                resolve(await task());
            } catch (error) {
                reject(error);
            } finally {
                inFlight--;
                const next = queue.shift();
                if (next) next();
            }
        };
        if (inFlight < concurrency) run();
        else queue.push(run);
    });
}

function isSavedPath(filePath) {
    return path.sep + filePath.split(path.sep).some((part) => part.endsWith('-saved')) + '';
}

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name.endsWith('-saved')) continue;
            walk(fullPath, out);
        } else if (entry.isFile()) {
            out.push(fullPath);
        }
    }
    return out;
}

function relative(filePath) {
    return path.relative(outputRoot, filePath);
}

async function writeSibling(source, suffix, content) {
    await fs.promises.writeFile(source + suffix, content, 'utf8');
}

function filterCsrText(output) {
    return output
        .split('\n')
        .filter((line) => {
            if (/[a-z0-9]:[a-z0-9]/.test(line)) return false;
            if (/Signature Value:/.test(line)) return false;
            if (/Modulus:/.test(line)) return false;
            if (/pub:/.test(line)) return false;
            if (/^\s*[0-9a-f]{2}\s*$/.test(line)) return false;
            return true;
        })
        .join('\n');
}

function filterCertText(output) {
    return output
        .split('\n')
        .filter((line) => {
            if (/pub:/.test(line)) return false;
            if (/Signature Value:/.test(line)) return false;
            if (/Modulus:/.test(line)) return false;
            if (/X509v3 Authority Key Identifier:/.test(line)) return false;
            if (/X509v3 Subject Key Identifier:/.test(line)) return false;
            if (/Serial Number:/.test(line)) return false;
            if (/Validity/.test(line)) return false;
            if (/Not Before:/.test(line)) return false;
            if (/Not After :/.test(line)) return false;
            if (/pub: $/.test(line)) return false;
            if (/:..$/.test(line)) return false;
            if (/:..:$/.test(line)) return false;
            if (line === '') return false;
            if (/^\s*[0-9a-f]{2}\s*$/.test(line)) return false;
            return true;
        })
        .join('\n');
}

function asn1CsrOutput(stdout) {
    const lines = stdout.split('\n');
    const result = [];
    for (const line of lines) {
        const fields = line.trim().split(/\s+/);
        if (fields[4] === 'prim:') {
            result.push(fields.slice(5).join(' ') + (fields.length > 5 ? ' ' : ''));
        }
    }
    // The original awk builds s with a trailing space after each token, including the last.
    // Rebuild exactly with trailing space on each collected line.
    const fixed = [];
    for (const line of lines) {
        const fields = line.trim().split(/\s+/);
        if (fields[4] === 'prim:') {
            let s = '';
            for (let i = 5; i < fields.length; i++) s += fields[i] + ' ';
            fixed.push(s);
        }
    }
    return fixed.join('\n') + (fixed.length ? '\n' : '');
}

function asn1CertOutput(stdout) {
    const lines = stdout.split('\n');
    const result = [];
    let count = 0;
    let skipBecauseIdentifier = false;
    for (const line of lines) {
        const fields = line.trim().split(/\s+/);
        if (fields[4] === 'prim:' && fields[5] !== 'UTCTIME') {
            count++;
            if (count === 2) continue;
            if (skipBecauseIdentifier) {
                skipBecauseIdentifier = false;
                continue;
            }
            if (line.includes('Subject Key Identifier')) {
                skipBecauseIdentifier = true;
                continue;
            }
            let s = '';
            for (let i = 5; i < fields.length; i++) s += fields[i] + ' ';
            result.push(s);
        }
    }
    return result.join('\n') + (result.length ? '\n' : '');
}

async function normalizeCert(source) {
    const isCsr = source.endsWith('.csr');
    const opensslArgs = isCsr
        ? ['req', '-text', '-noout', '-in', source]
        : ['x509', '-in', source, '-text', '-noout'];
    const asnArgs = ['asn1parse', '-in', source];
    const [textResult, asnResult] = await Promise.all([
        execFileAsync('openssl', opensslArgs, { maxBuffer: 64 * 1024 * 1024 }),
        execFileAsync('openssl', asnArgs, { maxBuffer: 64 * 1024 * 1024 }),
    ]);
    const filteredText = isCsr
        ? filterCsrText(textResult.stdout)
        : filterCertText(textResult.stdout);
    await writeSibling(source, '.txt', filteredText.endsWith('\n') ? filteredText : filteredText + '\n');
    const asnText = isCsr
        ? asn1CsrOutput(asnResult.stdout)
        : asn1CertOutput(asnResult.stdout);
    await writeSibling(source, '.asn.txt', asnText);
}

async function normalizeDns(filePath) {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    const lines = raw.split('\n');
    const out = lines.filter((line) => !/^; Exported/.test(line) && !/;serial$/.test(line));
    await fs.promises.writeFile(filePath, out.join('\n'), 'utf8');
}

async function normalizeNotificator(filePath) {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    const zero = (new Date(0)).toISOString();
    for (const item of data) {
        item.date = zero;
        if (typeof item.message === 'string') {
            item.message = item.message.replace(/\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z)/g, zero);
            const parts = item.message.split('\n');
            item.message = [parts.shift(), ...parts.sort((a, b) => a.localeCompare(b))].join('\n');
        }
    }
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 4), 'utf8');
}

async function normalizeLast(filePath) {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    data.date = new Date(0);
    data.version = 'dev';
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 4), 'utf8');
}

async function normalizeState(filePath) {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    for (const key of Object.keys(data)) data[key] = new Date(0);
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 4), 'utf8');
}

(async function main() {
    const files = walk(outputRoot, []);
    const certJobs = [];
    const dnsJobs = [];
    const jsonJobs = [];
    for (const file of files) {
        const base = path.basename(file);
        if (base.endsWith('.csr') || base.endsWith('.crt') || base.endsWith('.ca') || base.endsWith('.ca-crt')) {
            certJobs.push(file);
        } else if (base.endsWith('.dns')) {
            dnsJobs.push(file);
        } else if (base === 'notificator.json') {
            jsonJobs.push(() => normalizeNotificator(file));
        } else if (base === 'last.json') {
            jsonJobs.push(() => normalizeLast(file));
        } else if (base === 'state.json') {
            jsonJobs.push(() => normalizeState(file));
        }
    }

    const allJobs = [
        ...dnsJobs.map((file) => () => normalizeDns(file)),
        ...jsonJobs.map((job) => job),
        ...certJobs.map((file) => () => normalizeCert(file)),
    ];
    await Promise.all(allJobs.map((job) => runTask(job)));

    console.log(`Normalized ${certJobs.length} cert sources, ${dnsJobs.length} DNS files, and ${jsonJobs.length} JSON state files.`);
})().catch((error) => {
    console.error(error);
    process.exit(1);
});