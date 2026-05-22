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

// Check for input file arguments
let logFilePath = null;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--file' || args[i] === '-f') && args[i + 1]) {
        logFilePath = args[i + 1];
        break;
    }
}

// Fallback to direct argument if no switch
if (!logFilePath && args[0] && !args[0].startsWith('-')) {
    logFilePath = args[0];
}

if (!logFilePath) {
    console.error(`\n${C.bold}${C.red}Error: No input log file specified.${C.reset}`);
    console.log(`\nUsage:`);
    console.log(`  node logAnalyzer.js <path-to-log-file>`);
    console.log(`  node logAnalyzer.js --file <path-to-log-file>`);
    console.log(`\nExample:`);
    console.log(`  node logAnalyzer.js ./test_logs.log\n`);
    process.exit(1);
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

// Initialize analytics metric aggregations
let totalLines = 0;
let validLines = 0;
let jsonCount = 0;
let standardCount = 0;

// Resiliency/Skipping Metrics
const malformedCategories = {};

// Performance & Latency metrics
let minLatency = Infinity;
let maxLatency = -Infinity;
let sumLatency = 0;
const pathLatencyStats = {}; // { path: { sumMs: 0, count: 0, maxMs: -Infinity } }

// Traffic distribution mapping
const pathHits = {};
const ipHits = {};

// Health Indicators: status distribution mapping
const statusDistribution = {
    '1xx': 0,
    '2xx': 0,
    '3xx': 0,
    '4xx': 0,
    '5xx': 0,
    'Unknown/Missing': 0
};
let errorCount = 0; // Counts of 4xx and 5xx Status codes

// Read the log file line by line using memory-safe streams
const fileStream = fs.createReadStream(resolvedPath);
const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
});

rl.on('line', (line) => {
    totalLines++;

    const result = parseLine(line);
    if (!result.valid) {
        // Record skips and malformed items categorized by parsing failure reason / blank checks
        const trimmed = line.trim();
        let reason = result.reason || 'unrecognized format';
        if (trimmed === '') {
            reason = 'blank lines';
        } else if (trimmed.startsWith('at ') || trimmed.includes('.java:') || trimmed.includes('.js:')) {
            reason = 'java/node stack trace line';
        } else if (trimmed.startsWith('Exception in thread')) {
            reason = 'app core runtime exceptions';
        }
        malformedCategories[reason] = (malformedCategories[reason] || 0) + 1;
        return;
    }

    // Record valid counts
    validLines++;
    if (result.format === 'json') {
        jsonCount++;
    } else {
        standardCount++;
    }

    // Accumulate traffic patterns
    const pathVal = result.path;
    pathHits[pathVal] = (pathHits[pathVal] || 0) + 1;

    const ipVal = result.ip;
    ipHits[ipVal] = (ipHits[ipVal] || 0) + 1;

    // Accumulate latency metrics
    const ms = result.responseTimeMs;
    if (ms !== null) {
        sumLatency += ms;
        if (ms < minLatency) minLatency = ms;
        if (ms > maxLatency) maxLatency = ms;

        // Track path specific averages to capture true routing bottlenecks
        if (!pathLatencyStats[pathVal]) {
            pathLatencyStats[pathVal] = { sumMs: 0, count: 0, maxMs: -Infinity };
        }
        pathLatencyStats[pathVal].sumMs += ms;
        pathLatencyStats[pathVal].count++;
        if (ms > pathLatencyStats[pathVal].maxMs) {
            pathLatencyStats[pathVal].maxMs = ms;
        }
    }

    // Record statusCode categories
    const code = result.statusCode;
    if (code === null || code === undefined) {
        statusDistribution['Unknown/Missing']++;
    } else {
        // Categorize
        if (code >= 100 && code < 200) statusDistribution['1xx']++;
        else if (code >= 200 && code < 300) statusDistribution['2xx']++;
        else if (code >= 300 && code < 400) statusDistribution['3xx']++;
        else if (code >= 400 && code < 500) {
            statusDistribution['4xx']++;
            errorCount++;
        } else if (code >= 500 && code < 600) {
            statusDistribution['5xx']++;
            errorCount++;
        } else {
            statusDistribution['Unknown/Missing']++;
        }
    }
});

// Once line reading wraps, compute diagnostics and print dashboard
rl.on('close', () => {
    const invalidLines = totalLines - validLines;

    // Handle completely empty/blank document edge cases
    if (totalLines === 0) {
        console.log(`${C.bold}${C.red}✖ Server Log Parsing Complete. File was completely empty!${C.reset}\n`);
        process.exit(0);
    }

    // Ratios
    const validRate = ((validLines / totalLines) * 100).toFixed(1);
    const invalidRate = ((invalidLines / totalLines) * 100).toFixed(1);
    const avgLatency = validLines > 0 ? (sumLatency / validLines).toFixed(1) : 0;
    const errorRate = validLines > 0 ? ((errorCount / validLines) * 100).toFixed(1) : 0;

    // Top list helpers
    const getTopListed = (map, limit = 5) => {
        return Object.entries(map)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit);
    };

    const getTopSlowestEndpoints = (limit = 5) => {
        return Object.entries(pathLatencyStats)
            .map(([pathStr, stats]) => ({
                path: pathStr,
                avg: stats.sumMs / stats.count,
                count: stats.count,
                max: stats.maxMs
            }))
            .sort((a, b) => b.avg - a.avg)
            .slice(0, limit);
    };

    const topPaths = getTopListed(pathHits);
    const topIps = getTopListed(ipHits);
    const topSlowEndpoints = getTopSlowestEndpoints();

    // Print Dashboard Report
    console.log(`${C.bold}${C.cyan}✨ SERVER LOG ANALYSIS DASHBOARD ✨${C.reset}`);
    console.log(`${C.gray}-${C.reset}`.repeat(71));

    // SECTION 1: SYSTEM AUDIT PROFILE
    console.log(`\n${C.bold}${C.bgCyan} 📊 SECTION 1: SYSTEM AUDIT PROFILE ${C.reset}\n`);

    const barLength = 30;
    const validBarCount = Math.round((validLines / totalLines) * barLength);
    const invalidBarCount = barLength - validBarCount;
    const graphBar = `${C.green}${'█'.repeat(validBarCount)}${C.red}${'█'.repeat(invalidBarCount)}${C.reset}`;

    console.log(`   Processed Volume:  ${C.bold}${totalLines}${C.reset} lines`);
    console.log(`   Audited Ratios:    [${graphBar}]`);
    console.log(`   └─ ${C.green}Valid Entries:${C.reset}    ${C.bold}${validLines}${C.reset} (${validRate}%)`);
    console.log(`   └─ ${C.red}Malformed Skips:${C.reset}  ${C.bold}${invalidLines}${C.reset} (${invalidRate}%)`);

    if (validLines > 0) {
        console.log(`\n   Config Layer Classification:`);
        console.log(`   ├─ ${C.blue}JSON Struct Logs:${C.reset}  ${C.bold}${jsonCount}${C.reset} lines`);
        console.log(`   └─ ${C.white}Standard Text Logs:${C.reset} ${C.bold}${standardCount}${C.reset} lines`);
    }

    // Print details of malformed skip categories
    if (invalidLines > 0) {
        console.log(`\n   ${C.bold}${C.yellow}Anomaly Tracking (Gracefully Dropped):${C.reset}`);
        Object.entries(malformedCategories).forEach(([category, count]) => {
            const catRate = ((count / invalidLines) * 100).toFixed(1);
            console.log(`   ├─ [${C.red}${count} skips${C.gray} - ${catRate}%${C.reset}] ${category}`);
        });
    }

    // SECTION 2: HEALTH INDICATORS
    console.log(`\n${C.bold}${C.bgYellow}${C.white} 🚦 SECTION 2: WEB SERVICE HEALTH REPORT ${C.reset}\n`);
    if (validLines === 0) {
        console.log(`   ${C.dim}No valid log entries successfully processed to summarize health metrics.${C.reset}`);
    } else {
        // Generate ASCII bar chart for HTTP status breakdown
        Object.entries(statusDistribution).forEach(([cat, count]) => {
            const percent = ((count / validLines) * 100).toFixed(1);
            const categoryBarCount = Math.round((count / validLines) * 20);
            const color = cat.startsWith('2') ? C.green : (cat.startsWith('3') ? C.cyan : (cat.startsWith('4') ? C.yellow : (cat.startsWith('5') ? C.red : C.gray)));

            const rateBar = `${color}${'█'.repeat(categoryBarCount)}${C.gray}${'░'.repeat(20 - categoryBarCount)}${C.reset}`;
            console.log(`   ${cat.padEnd(16)}: ${rateBar} ${C.bold}${count.toString().padStart(6)}${C.reset} (${percent}%)`);
        });

        console.log(`\n   Overall Error Rate (4xx/5xx): ${errorRate > 5 ? C.red : C.green}${C.bold}${errorRate}%${C.reset}`);
    }

    // SECTION 3: LATENCY ENGINE DIAGNOSTICS
    console.log(`\n${C.bold}${C.bgGreen}${C.white} ⚡ SECTION 3: PERFORMANCE & LATENCY ENGINE ${C.reset}\n`);
    if (validLines === 0) {
        console.log(`   ${C.dim}No response time metrics processed.${C.reset}`);
    } else {
        console.log(`   Average Request Latency:  ${C.bold}${C.cyan}${avgLatency} ms${C.reset}`);
        console.log(`   Fastest Verified Route:   ${C.green}${minLatency === Infinity ? 0 : minLatency} ms${C.reset}`);
        console.log(`   Slowest Verified Route:   ${C.red}${maxLatency === -Infinity ? 0 : maxLatency} ms${C.reset}`);
    }

    // SECTION 4: TRAFFIC ENGAGEMENT DIAGNOSTICS
    console.log(`\n${C.bold}${C.bgMagenta} 👥 SECTION 4: TRAFFIC ENGAGEMENT DIAGNOSTICS ${C.reset}\n`);
    if (validLines === 0) {
        console.log(`   ${C.dim}No engagement metrics processed.${C.reset}`);
    } else {
        console.log(`   ${C.bold}Top 5 Client IP Targets:${C.reset}`);
        topIps.forEach(([ip, hits], idx) => {
            const percent = ((hits / validLines) * 100).toFixed(1);
            console.log(`   ${idx + 1}. [${hits.toString().padStart(5)} requests - ${percent}%]  ${C.cyan}${ip}${C.reset}`);
        });

        console.log(`\n   ${C.bold}Top 5 Most Visited Endpoints:${C.reset}`);
        topPaths.forEach(([pathVal, hits], idx) => {
            const percent = ((hits / validLines) * 100).toFixed(1);
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

    console.log(`\n${C.gray}-${C.reset}`.repeat(71));
    console.log(`${C.bold}${C.green}✔ Processing and analytics dashboard report successfully rendered.${C.reset}\n`);
});
