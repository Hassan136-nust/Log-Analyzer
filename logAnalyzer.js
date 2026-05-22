const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { parseLine } = require('./logParser');

// Colors helper using ANSI escape codes
const C = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
    bgMagenta: '\x1b[45m',
    bgCyan: '\x1b[46m',
    bgDarkGray: '\x1b[100m'
};

/**
 * Modular Log Analytics Aggregator class
 * Computes logs auditing, HTTP health distributions, latencies, and traffic bottlenecks.
 */
class LogAnalyticsTracker {
    constructor() {
        this.totalLines = 0;
        this.validLines = 0;
        this.jsonCount = 0;
        this.standardCount = 0;

        // Resilience categorizations
        this.malformedCategories = {};

        // Performance
        this.minLatency = Infinity;
        this.maxLatency = -Infinity;
        this.sumLatency = 0;
        this.pathLatencyStats = {}; // { path: { sumMs: 0, count: 0, maxMs: -Infinity } }

        // Distributions
        this.pathHits = {};
        this.ipHits = {};
        this.statusDistribution = {
            '1xx': 0, '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, 'Unknown/Missing': 0
        };
        this.errorCount = 0;
    }

    /**
     * Parse and record a single raw line of log entry.
     */
    processLine(line) {
        this.totalLines++;

        const result = parseLine(line);
        if (!result.valid) {
            const trimmed = String(line || '').trim();
            let reason = result.reason || 'unrecognized format';
            if (trimmed === '') {
                reason = 'blank lines';
            } else if (trimmed.startsWith('at ') || trimmed.includes('.java:') || trimmed.includes('.js:')) {
                reason = 'java/node stack trace line';
            } else if (trimmed.startsWith('Exception in thread')) {
                reason = 'app core runtime exceptions';
            }
            this.malformedCategories[reason] = (this.malformedCategories[reason] || 0) + 1;
            return result;
        }

        this.validLines++;
        if (result.format === 'json') {
            this.jsonCount++;
        } else {
            this.standardCount++;
        }

        const pathVal = result.path;
        this.pathHits[pathVal] = (this.pathHits[pathVal] || 0) + 1;

        const ipVal = result.ip;
        this.ipHits[ipVal] = (this.ipHits[ipVal] || 0) + 1;

        const ms = result.responseTimeMs;
        if (ms !== null) {
            this.sumLatency += ms;
            if (ms < this.minLatency) this.minLatency = ms;
            if (ms > this.maxLatency) this.maxLatency = ms;

            if (!this.pathLatencyStats[pathVal]) {
                this.pathLatencyStats[pathVal] = { sumMs: 0, count: 0, maxMs: -Infinity };
            }
            this.pathLatencyStats[pathVal].sumMs += ms;
            this.pathLatencyStats[pathVal].count++;
            if (ms > this.pathLatencyStats[pathVal].maxMs) {
                this.pathLatencyStats[pathVal].maxMs = ms;
            }
        }

        const code = result.statusCode;
        if (code === null || code === undefined) {
            this.statusDistribution['Unknown/Missing']++;
        } else {
            if (code >= 100 && code < 200) this.statusDistribution['1xx']++;
            else if (code >= 200 && code < 300) this.statusDistribution['2xx']++;
            else if (code >= 300 && code < 400) this.statusDistribution['3xx']++;
            else if (code >= 400 && code < 500) {
                this.statusDistribution['4xx']++;
                this.errorCount++;
            } else if (code >= 500 && code < 600) {
                this.statusDistribution['5xx']++;
                this.errorCount++;
            } else {
                this.statusDistribution['Unknown/Missing']++;
            }
        }

        return result;
    }

    /**
     * Compute and output the gorgeous ANSI analytics dashboard in terminal.
     */
    printDashboard() {
        const invalidLines = this.totalLines - this.validLines;

        if (this.totalLines === 0) {
            console.log(`\n   ${C.bold}${C.red}✖ Server Log Parsing Complete. System was completely empty!${C.reset}\n`);
            return;
        }

        const validRate = ((this.validLines / this.totalLines) * 100).toFixed(1);
        const invalidRate = ((invalidLines / this.totalLines) * 100).toFixed(1);
        const avgLatency = this.validLines > 0 ? (this.sumLatency / this.validLines).toFixed(1) : 0;
        const errorRate = this.validLines > 0 ? ((this.errorCount / this.validLines) * 100).toFixed(1) : 0;

        const getTopListed = (map, limit = 5) => {
            return Object.entries(map)
                .sort((a, b) => b[1] - a[1])
                .slice(0, limit);
        };

        const getTopSlowestEndpoints = (limit = 5) => {
            return Object.entries(this.pathLatencyStats)
                .map(([pathStr, stats]) => ({
                    path: pathStr,
                    avg: stats.sumMs / stats.count,
                    count: stats.count,
                    max: stats.maxMs
                }))
                .sort((a, b) => b.avg - a.avg)
                .slice(0, limit);
        };

        const topPaths = getTopListed(this.pathHits);
        const topIps = getTopListed(this.ipHits);
        const topSlowEndpoints = getTopSlowestEndpoints();

        console.log(`\n${C.bold}${C.cyan}✨ SERVER LOG ANALYSIS DASHBOARD ✨${C.reset}`);
        console.log(C.gray + '-'.repeat(71) + C.reset);

        // SECTION 1: SYSTEM AUDIT PROFILE
        console.log(`\n${C.bold}${C.bgCyan} 📊 SECTION 1: SYSTEM AUDIT PROFILE ${C.reset}\n`);

        const barLength = 30;
        const validBarCount = Math.round((this.validLines / this.totalLines) * barLength);
        const invalidBarCount = Math.max(0, barLength - validBarCount);
        const graphBar = `${C.green}${'█'.repeat(validBarCount)}${C.red}${'█'.repeat(invalidBarCount)}${C.reset}`;

        console.log(`   Processed Volume:  ${C.bold}${this.totalLines}${C.reset} lines`);
        console.log(`   Audited Ratios:    [${graphBar}]`);
        console.log(`   └─ ${C.green}Valid Entries:${C.reset}    ${C.bold}${this.validLines}${C.reset} (${validRate}%)`);
        console.log(`   └─ ${C.red}Malformed Skips:${C.reset}  ${C.bold}${invalidLines}${C.reset} (${invalidRate}%)`);

        if (this.validLines > 0) {
            console.log(`\n   Config Layer Classification:`);
            console.log(`   ├─ ${C.blue}JSON Struct Logs:${C.reset}  ${C.bold}${this.jsonCount}${C.reset} lines`);
            console.log(`   └─ ${C.white}Standard Text Logs:${C.reset} ${C.bold}${this.standardCount}${C.reset} lines`);
        }

        if (invalidLines > 0) {
            console.log(`\n   ${C.bold}${C.yellow}Anomaly Tracking (Gracefully Dropped):${C.reset}`);
            Object.entries(this.malformedCategories).forEach(([category, count]) => {
                const catRate = ((count / invalidLines) * 100).toFixed(1);
                console.log(`   ├─ [${C.red}${count} skips${C.gray} - ${catRate}%${C.reset}] ${category}`);
            });
        }

        // SECTION 2: HEALTH INDICATORS
        console.log(`\n${C.bold}${C.bgYellow}${C.white} 🚦 SECTION 2: WEB SERVICE HEALTH REPORT ${C.reset}\n`);
        if (this.validLines === 0) {
            console.log(`   ${C.dim}No valid log entries successfully processed to summarize health metrics.${C.reset}`);
        } else {
            Object.entries(this.statusDistribution).forEach(([cat, count]) => {
                const percent = ((count / this.validLines) * 100).toFixed(1);
                const categoryBarCount = Math.round((count / this.validLines) * 20);
                const color = cat.startsWith('2') ? C.green : (cat.startsWith('3') ? C.cyan : (cat.startsWith('4') ? C.yellow : (cat.startsWith('5') ? C.red : C.gray)));

                const rateBar = `${color}${'█'.repeat(categoryBarCount)}${C.gray}${'░'.repeat(20 - categoryBarCount)}${C.reset}`;
                console.log(`   ${cat.padEnd(16)}: ${rateBar} ${C.bold}${count.toString().padStart(6)}${C.reset} (${percent}%)`);
            });

            console.log(`\n   Overall Error Rate (4xx/5xx): ${errorRate > 5 ? C.red : C.green}${C.bold}${errorRate}%${C.reset}`);
        }

        // SECTION 3: LATENCY ENGINE DIAGNOSTICS
        console.log(`\n${C.bold}${C.bgGreen}${C.white} ⚡ SECTION 3: PERFORMANCE & LATENCY ENGINE ${C.reset}\n`);
        if (this.validLines === 0) {
            console.log(`   ${C.dim}No response time metrics processed.${C.reset}`);
        } else {
            console.log(`   Average Request Latency:  ${C.bold}${C.cyan}${avgLatency} ms${C.reset}`);
            console.log(`   Fastest Verified Route:   ${C.green}${this.minLatency === Infinity ? 0 : this.minLatency} ms${C.reset}`);
            console.log(`   Slowest Verified Route:   ${C.red}${this.maxLatency === -Infinity ? 0 : this.maxLatency} ms${C.reset}`);
        }

        // SECTION 4: TRAFFIC ENGAGEMENT DIAGNOSTICS
        console.log(`\n${C.bold}${C.bgMagenta} 👥 SECTION 4: TRAFFIC ENGAGEMENT DIAGNOSTICS ${C.reset}\n`);
        if (this.validLines === 0) {
            console.log(`   ${C.dim}No engagement metrics processed.${C.reset}`);
        } else {
            console.log(`   ${C.bold}Top 5 Client IP Targets:${C.reset}`);
            topIps.forEach(([ip, hits], idx) => {
                const percent = ((hits / this.validLines) * 100).toFixed(1);
                console.log(`   ${idx + 1}. [${hits.toString().padStart(5)} requests - ${percent}%]  ${C.cyan}${ip}${C.reset}`);
            });

            console.log(`\n   ${C.bold}Top 5 Most Visited Endpoints:${C.reset}`);
            topPaths.forEach(([pathVal, hits], idx) => {
                const percent = ((hits / this.validLines) * 100).toFixed(1);
                console.log(`   ${idx + 1}. [${hits.toString().padStart(5)} requests - ${percent}%]  ${C.blue}${pathVal}${C.reset}`);
            });
        }

        // SECTION 5: PERFORMANCE BOTTLENECKS
        console.log(`\n${C.bold}${C.bgRed} 🐢 SECTION 5: CRITICAL BOTTLENECK PROFILE ${C.reset}\n`);
        if (topSlowEndpoints.length === 0) {
            console.log(`   ${C.dim}No valid response timestamps captured to calculate endpoint latencies.${C.reset}`);
        } else {
            console.log(`   Ranked by Consistently Slow average latency (identifies real structural slowdowns):`);
            topSlowEndpoints.forEach((item, idx) => {
                console.log(`   ${idx + 1}. ${C.yellow}${item.path.padEnd(20)}${C.reset} -> ${C.red}Avg: ${item.avg.toFixed(1)} ms${C.gray} | Max: ${item.max} ms | Hits: ${item.count}${C.reset}`);
            });
        }

        console.log('\n' + C.gray + '-'.repeat(71) + C.reset);
        console.log(`${C.bold}${C.green}✔ Processing and analytics dashboard report successfully rendered.${C.reset}\n`);
    }
}

// -------------------------------------------------------------
// Interactive readline query managers and prompts
// -------------------------------------------------------------

function renderInteractiveTitle() {
    console.clear();
    console.log(`${C.cyan}+---------------------------------------------------------------------+`);
    console.log(`|           🚀 SERVER LOG CLINICAL DIAGNOSTIC ANALYZER                |`);
    console.log(`+---------------------------------------------------------------------+${C.reset}`);
}

function promptReturnToMenu(rl, callback) {
    rl.question(`\n${C.dim}Press ENTER to return to main menu...${C.reset}`, () => {
        callback();
    });
}

/**
 * Sandbox live evaluator. Highlighting log parser details dynamically inside console.
 */
function handleSandboxMode(rl, callback) {
    renderInteractiveTitle();
    console.log(`\n${C.bold}${C.magenta}✨ MODE 1: INTERACTIVE PARSER SANDBOX ${C.reset}`);
    console.log(`${C.dim}Enter/paste any raw server log to trace parameters. Type 'exit' to return.${C.reset}\n`);

    const askLine = () => {
        rl.question(`${C.bold}${C.cyan}LOG PIN>${C.reset} `, (line) => {
            const trimmed = line.trim();
            if (trimmed.toLowerCase() === 'exit') {
                callback();
                return;
            }
            if (trimmed === '') {
                askLine();
                return;
            }

            const res = parseLine(line);
            console.log('\n' + C.gray + '-'.repeat(50) + C.reset);
            console.log(`  Parsed Validity: ${res.valid ? `${C.green}✔ VALID LOG${C.reset}` : `${C.red}✖ MALFORMED / SKIPPED${C.reset}`}`);
            if (res.valid) {
                console.log(`  Target Format:   ${C.bold}${C.yellow}${res.format.toUpperCase()}${C.reset}`);
                console.log(`  Request Method:  ${C.blue}${res.method}${C.reset}`);
                console.log(`  Status Code:     ${res.statusCode >= 400 ? C.red : C.green}${res.statusCode || '-'}${C.reset}`);
                console.log(`  Latency TimeMessage: ${C.green}${res.responseTimeMs} ms${C.reset}`);
                console.log(`  Visitor Host IP: ${C.cyan}${res.ip}${C.reset}`);
                console.log(`  Request Path URL:${C.white}${res.path}${C.reset}`);
                console.log(`  Timestamp Date:  ${C.gray}${res.timestamp ? res.timestamp.toString() : 'Invalid'}${C.reset}`);
                console.log(`\n  ${C.dim}Identified Properties JSON Payload:${C.reset}`);
                console.log(C.gray + JSON.stringify({
                    ...res,
                    timestamp: res.timestamp ? res.timestamp.toISOString() : null
                }, null, 2) + C.reset);
            } else {
                console.log(`  Parser Reason:   ${C.red}${res.reason || 'unrecognized format'}${C.reset}`);
            }
            console.log(C.gray + '-'.repeat(50) + C.reset + '\n');
            askLine();
        });
    };
    askLine();
}

/**
 * Standard logs paste list. Collects strings until empty carriage return.
 */
function handleBatchMode(rl, callback) {
    renderInteractiveTitle();
    console.log(`\n${C.bold}${C.green}✨ MODE 2: BATCH BULK LOG PASTING ${C.reset}`);
    console.log(`${C.dim}Paste/Type multiple raw log records. Press ENTER on an empty line to compile:${C.reset}\n`);

    const tracker = new LogAnalyticsTracker();
    const linesCollected = [];

    const onLineInput = (line) => {
        const trimmed = line.trim();
        if (trimmed === "" && linesCollected.length > 0) {
            // Unregister listener to cleanly avoid intercepting future prompts
            rl.removeListener('line', onLineInput);

            console.log(`\n⌛ Auditing ${linesCollected.length} logs records. Computing charts...`);
            linesCollected.forEach(l => tracker.processLine(l));
            tracker.printDashboard();
            promptReturnToMenu(rl, callback);
        } else {
            linesCollected.push(line);
        }
    };

    // Stdin lines routing
    rl.on('line', onLineInput);
}

/**
 * Dynamic Filepath inputs. Streams files inside node aggregator.
 */
function handleFilePathPrompt(rl, callback) {
    renderInteractiveTitle();
    console.log(`\n${C.bold}${C.cyan}✨ MODE 3: FULL REGULAR FILE AUDITING ${C.reset}\n`);

    rl.question(`${C.bold}Enter filepath target:${C.reset} `, (filePathStr) => {
        const tgt = filePathStr.trim();
        if (!tgt) {
            console.log(`${C.red}Invalid Path. Returning...${C.reset}`);
            setTimeout(callback, 1000);
            return;
        }

        const resolved = path.isAbsolute(tgt) ? tgt : path.resolve(process.cwd(), tgt);
        if (!fs.existsSync(resolved)) {
            console.log(`\n${C.bold}${C.red}✖ Error: Target path is unreachable or file does not exist.${C.reset}`);
            console.log(`  ${C.dim}${resolved}${C.reset}\n`);
            promptReturnToMenu(rl, callback);
            return;
        }

        console.log(`\n⌛ Mounting stream target: ${resolved}`);
        const tracker = new LogAnalyticsTracker();
        const fileStream = fs.createReadStream(resolved);
        const rlFile = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        rlFile.on('line', (line) => {
            tracker.processLine(line);
        });

        rlFile.on('close', () => {
            tracker.printDashboard();
            promptReturnToMenu(rl, callback);
        });
    });
}

/**
 * Main active readline menu query loops.
 */
function launchInteractiveMenu() {
    // Create unified stdin readline console controller
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const showMenu = () => {
        renderInteractiveTitle();
        console.log(`\n${C.bold}SELECT YOUR DIAGNOSTIC INPUT METHOD:${C.reset}\n`);
        console.log(`  ${C.bold}${C.cyan}[1]${C.reset} Live Playground Sandbox (Single Log Line Auditor)`);
        console.log(`  ${C.bold}${C.green}[2]${C.reset} Paste Bulk Server Logs (Multi-Line Workspace Paste)`);
        console.log(`  ${C.bold}${C.yellow}[3]${C.reset} Load Log File From Path (Interactive File Stream)`);
        console.log(`  ${C.bold}${C.red}[4]${C.reset} Terminate Suite`);
        console.log(C.gray + '-'.repeat(71) + C.reset);

        rl.question(`\n${C.bold}Enter option choice (1-4):${C.reset} `, (opt) => {
            const ch = opt.trim();
            switch (ch) {
                case '1':
                    handleSandboxMode(rl, showMenu);
                    break;
                case '2':
                    handleBatchMode(rl, showMenu);
                    break;
                case '3':
                    handleFilePathPrompt(rl, showMenu);
                    break;
                case '4':
                    console.log(`\n${C.bold}${C.green}👋 Terminating Log Analyzer CLI Suite. Goodbye!${C.reset}\n`);
                    rl.close();
                    process.exit(0);
                    break;
                default:
                    console.log(`\n${C.red}Invalid option selection. Please try again.${C.reset}`);
                    setTimeout(showMenu, 1200);
                    break;
            }
        });
    };

    showMenu();
}

// -------------------------------------------------------------
// Core System Initialization / Backwards compatibility routing
// -------------------------------------------------------------

function runDirectBatchCLI(args) {
    let logFilePath = null;
    for (let i = 0; i < args.length; i++) {
        if ((args[i] === '--file' || args[i] === '-f') && args[i + 1]) {
            logFilePath = args[i + 1];
            break;
        }
    }

    if (!logFilePath && args[0] && !args[0].startsWith('-')) {
        logFilePath = args[0];
    }

    const resolvedPath = path.isAbsolute(logFilePath) ? logFilePath : path.resolve(process.cwd(), logFilePath);

    if (!fs.existsSync(resolvedPath)) {
        console.error(`\n${C.bold}${C.red}Error: Specified file does not exist at path:${C.reset}`);
        console.error(`  ${C.dim}${resolvedPath}${C.reset}\n`);
        process.exit(1);
    }

    console.log(`${C.cyan}+---------------------------------------------------------------------+`);
    console.log(`|             🚀 SERVER LOG ANALYZER: STREAM-PARSING...               |`);
    console.log(`+---------------------------------------------------------------------+${C.reset}`);
    console.log(`${C.gray}Parsing file: ${C.white}${resolvedPath}${C.reset}\n`);

    const tracker = new LogAnalyticsTracker();
    const fileStream = fs.createReadStream(resolvedPath);
    const rlFile = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    rlFile.on('line', (line) => {
        tracker.processLine(line);
    });

    rlFile.on('close', () => {
        tracker.printDashboard();
        process.exit(0);
    });
}

// Staging entry checks
const argsList = process.argv.slice(2);
if (argsList.length > 0) {
    runDirectBatchCLI(argsList);
} else {
    launchInteractiveMenu();
}
