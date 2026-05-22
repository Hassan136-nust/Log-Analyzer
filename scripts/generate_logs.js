const fs = require('fs');
const path = require('path');

// Extract arguments e.g., --file <path> --lines <number>
let linesCount = 2000;
let outputPath = path.join(__dirname, '..', 'test_logs.log');

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--lines' || args[i] === '-l') && args[i + 1]) {
        linesCount = parseInt(args[i + 1], 10) || linesCount;
    }
    if ((args[i] === '--file' || args[i] === '-f') && args[i + 1]) {
        outputPath = path.isAbsolute(args[i + 1]) ? args[i + 1] : path.resolve(process.cwd(), args[i + 1]);
    }
}

console.log(`Generating ${linesCount} log lines to ${outputPath}...`);

const ips = ['192.168.1.42', '10.0.0.7', '172.16.254.1', '8.8.8.8', '127.0.0.1', '1.1.1.1'];
const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'];
const paths = ['/api/users', '/api/login', '/api/users/12', '/api/test', '/api/v1/health', '/api/status', '/products/item-99', '/cart/checkout', '/search?q=nodejs'];
const userAgents = [
    '"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"',
    '"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15"',
    '"curl/8.4.0"',
    '"PostmanRuntime/7.36.0"',
    '"Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36"'
];
const referrers = [
    '"https://google.com"',
    '"https://github.com"',
    '"https://news.ycombinator.com"',
    '"-"'
];

const writeStream = fs.createWriteStream(outputPath);

let index = 0;
function write() {
    let ok = true;
    while (index < linesCount && ok) {
        const line = generateRandomLine(index);
        ok = writeStream.write(line + '\n');
        index++;
    }
    if (index < linesCount) {
        writeStream.once('drain', write);
    } else {
        writeStream.end(() => {
            console.log(`Successfully completed log generation!`);
        });
    }
}

function generateRandomLine(idx) {
    // Random time calculations
    const dateObj = new Date(Date.now() - Math.floor(Math.random() * 10 * 24 * 60 * 60 * 1000));
    const isoDateStr = dateObj.toISOString();

    const ip = ips[Math.floor(Math.random() * ips.length)];
    const method = methods[Math.floor(Math.random() * methods.length)];
    const pathVal = paths[Math.floor(Math.random() * paths.length)];

    // Weights:
    // 82% Standard log format
    // 2% Custom slashed timestamp
    // 2% Custom verbal month timestamp
    // 2% Epoch seconds timestamp
    // 2% Missing status code
    // 3% JSON formatted log line
    // 7% Completely malformed & noise (blank lines, Java stack traces)
    const roll = Math.random();

    if (roll < 0.82) {
        // 1. Standard log format
        const status = Math.random() < 0.05 ? 500 : (Math.random() < 0.15 ? 404 : (Math.random() < 0.1 ? 301 : 200));
        const rt = Math.floor(Math.random() * 500) + 'ms';
        // Append optional fields occasionally (in 30% of standard lines)
        if (Math.random() < 0.3) {
            const ua = userAgents[Math.floor(Math.random() * userAgents.length)];
            const ref = referrers[Math.floor(Math.random() * referrers.length)];
            return `  ${isoDateStr} ${ip} ${method} ${pathVal} ${status} ${rt} ${ref} ${ua}  `; // standard check variable spacing
        }
        return `${isoDateStr} ${ip} ${method} ${pathVal} ${status} ${rt}`;
    } else if (roll < 0.84) {
        // 2. Custom slash timestamp: YYYY/MM/DD HH:mm:ss
        const pad = (n) => String(n).padStart(2, '0');
        const slashStr = `${dateObj.getFullYear()}/${pad(dateObj.getMonth() + 1)}/${pad(dateObj.getDate())} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}:${pad(dateObj.getSeconds())}`;
        const status = Math.random() < 0.2 ? 401 : 200;
        const rt = Math.floor(Math.random() * 500) + 'ms';
        return `${slashStr} ${ip} ${method} ${pathVal} ${status} ${rt}`;
    } else if (roll < 0.86) {
        // 3. Custom verbal month: DD-MMM-YYYY HH:mm:ss
        const pad = (n) => String(n).padStart(2, '0');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const verbalDateStr = `${pad(dateObj.getDate())}-${months[dateObj.getMonth()]}-${dateObj.getFullYear()} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}:${pad(dateObj.getSeconds())}`;
        const status = 200;
        const rt = (Math.random() * 0.5).toFixed(3) + 's'; // decimal seconds
        return `${verbalDateStr} ${ip} ${method} ${pathVal} ${status} ${rt}`;
    } else if (roll < 0.88) {
        // 4. Unix Epoch timestamp: 1710512581 (seconds)
        const epochSec = Math.floor(dateObj.getTime() / 1000);
        const status = 200;
        const rt = Math.floor(Math.random() * 300); // unitless
        return `${epochSec} ${ip} ${method} ${pathVal} ${status} ${rt}`;
    } else if (roll < 0.90) {
        // 5. Missing status code
        const rt = Math.floor(Math.random() * 200) + 'ms';
        return `${isoDateStr} ${ip} ${method} ${pathVal} - ${rt}`;
    } else if (roll < 0.93) {
        // 6. JSON formatted layout
        const statusVal = Math.random() < 0.1 ? '-' : (Math.random() < 0.1 ? 500 : 200);
        const rtVal = Math.random() < 0.5 ? Math.floor(Math.random() * 150) + 'ms' : Math.floor(Math.random() * 150);
        const jsonOutput = {
            timestamp: isoDateStr,
            ip: ip,
            method: method,
            path: pathVal,
            status: statusVal,
            responseTime: rtVal
        };
        // Include some optional extra metadata to make it realistic
        if (Math.random() < 0.5) {
            jsonOutput.userAgent = 'SyntheticGenerator/1.0';
        }
        return JSON.stringify(jsonOutput);
    } else {
        // 7. Completely malformed lines & noise
        const noiseRoll = Math.random();
        if (noiseRoll < 0.25) {
            return ''; // empty line
        } else if (noiseRoll < 0.5) {
            return '   '; // spaces line
        } else if (noiseRoll < 0.75) {
            // Java/Node error stack line
            return 'Exception in thread "main" java.lang.NullPointerException: Cannot invoke "String.toLowerCase()" because "input" is null';
        } else {
            // Stack trace line
            const traces = [
                '    at com.example.service.UserService.getUserDetails(UserService.java:42)',
                '    at com.example.controller.UserApiController.getUser(UserApiController.java:18)',
                '    at javax.servlet.http.HttpServlet.service(HttpServlet.java:620)'
            ];
            return traces[Math.floor(Math.random() * traces.length)];
        }
    }
}

write();
