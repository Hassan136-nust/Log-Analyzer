/**
 * Browser-compatible Log Parser Module (ESM)
 * Mirroring precisely the core layered backend parser utility.
 */

export function normalizeResponseTime(rtStr) {
    if (rtStr === undefined || rtStr === null) {
        return null;
    }

    let str = String(rtStr).trim();
    if (str === '') {
        return null;
    }

    if (str.endsWith('ms')) {
        const val = parseFloat(str.slice(0, -2));
        return isNaN(val) ? null : Math.round(val);
    }

    if (str.endsWith('s')) {
        const val = parseFloat(str.slice(0, -1));
        return isNaN(val) ? null : Math.round(val * 1000);
    }

    const val = parseFloat(str);
    return isNaN(val) ? null : Math.round(val);
}

export function parseTimestamp(tsStr) {
    if (!tsStr) {
        return null;
    }

    let str = String(tsStr).trim();

    // 1. Unix epoch seconds checks
    if (/^\d+$/.test(str)) {
        const num = parseInt(str, 10);
        if (num < 30000000000) {
            return new Date(num * 1000);
        }
        return new Date(num);
    }

    // 2. Standard construct parse
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
        return d;
    }

    // 3. Verbal dates (15-Mar-2024 14:23:01)
    const matchDmy = str.match(/^(\d{1,2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-/](\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/i);
    if (matchDmy) {
        const day = parseInt(matchDmy[1], 10);
        const monthStr = matchDmy[2].toLowerCase();
        const year = parseInt(matchDmy[3], 10);
        const hour = parseInt(matchDmy[4], 10);
        const min = parseInt(matchDmy[5], 10);
        const sec = parseInt(matchDmy[6], 10);

        const months = {
            jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
            jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
        };
        const monthIndex = months[monthStr];

        const customDate = new Date(year, monthIndex, day, hour, min, sec);
        if (!isNaN(customDate.getTime())) {
            return customDate;
        }
    }

    // 4. Slashes date formatting (2024/03/15 14:23:01)
    const matchSlash = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
    if (matchSlash) {
        const year = parseInt(matchSlash[1], 10);
        const month = parseInt(matchSlash[2], 10) - 1;
        const day = parseInt(matchSlash[3], 10);
        const hour = parseInt(matchSlash[4], 10);
        const min = parseInt(matchSlash[5], 10);
        const sec = parseInt(matchSlash[6], 10);

        const customDate = new Date(year, month, day, hour, min, sec);
        if (!isNaN(customDate.getTime())) {
            return customDate;
        }
    }

    return null;
}

export function parseJsonLog(line) {
    try {
        const str = line.trim();
        if (!str.startsWith('{') || !str.endsWith('}')) {
            return null;
        }

        const data = JSON.parse(str);

        if (!data.timestamp || !data.ip || !data.method || !data.path) {
            return null;
        }

        const ts = parseTimestamp(data.timestamp);
        if (!ts) {
            return null;
        }

        let statusCode = null;
        if (data.status !== undefined && data.status !== null && data.status !== '-') {
            statusCode = parseInt(data.status, 10);
            if (isNaN(statusCode)) {
                statusCode = null;
            }
        }

        const responseTimeMs = normalizeResponseTime(data.responseTime);
        if (responseTimeMs === null) {
            return null;
        }

        return {
            valid: true,
            format: "json",
            timestamp: ts,
            ip: String(data.ip).trim(),
            method: String(data.method).trim().toUpperCase(),
            path: String(data.path).trim(),
            statusCode: statusCode,
            responseTimeMs: responseTimeMs,
            raw: line
        };
    } catch (err) {
        return null;
    }
}

// Suffix anchor expressions capturing optional trailing segments
const logStandardRegex = /^\s*(.*?)\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+([A-Z]+)\s+(\S+)\s+(\d{3}|-)\s+(\d+(?:\.\d+)?(?:ms|s)?)(?:\s+(.*))?\s*$/;
const logBracketRegex = /^\s*\[(.*?)\]\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+([A-Z]+)\s+(\S+)\s+(\d{3}|-)\s+(\d+(?:\.\d+)?(?:ms|s)?)(?:\s+(.*))?\s*$/;

function parseStandardLog(line) {
    const match = line.match(logStandardRegex);
    if (!match) {
        return null;
    }

    const rawTimestamp = match[1];
    const ip = match[2];
    const method = match[3];
    const path = match[4];
    const rawStatus = match[5];
    const rawResponse = match[6];

    const ts = parseTimestamp(rawTimestamp);
    if (!ts) {
        return null;
    }

    const statusCode = rawStatus === '-' ? null : parseInt(rawStatus, 10);
    const responseTimeMs = normalizeResponseTime(rawResponse);
    if (responseTimeMs === null) {
        return null;
    }

    return {
        valid: true,
        format: "standard",
        timestamp: ts,
        ip: ip,
        method: method,
        path: path,
        statusCode: statusCode,
        responseTimeMs: responseTimeMs,
        raw: line
    };
}

function parseAlternateLog(line) {
    const match = line.match(logBracketRegex);
    if (!match) {
        return null;
    }

    const rawTimestamp = match[1];
    const ip = match[2];
    const method = match[3];
    const path = match[4];
    const rawStatus = match[5];
    const rawResponse = match[6];

    const ts = parseTimestamp(rawTimestamp);
    if (!ts) {
        return null;
    }

    const statusCode = rawStatus === '-' ? null : parseInt(rawStatus, 10);
    const responseTimeMs = normalizeResponseTime(rawResponse);
    if (responseTimeMs === null) {
        return null;
    }

    return {
        valid: true,
        format: "standard",
        timestamp: ts,
        ip: ip,
        method: method,
        path: path,
        statusCode: statusCode,
        responseTimeMs: responseTimeMs,
        raw: line
    };
}

export function parseLine(line) {
    try {
        if (typeof line !== 'string') {
            return {
                valid: false,
                reason: "unrecognized format",
                raw: line
            };
        }

        const trimmed = line.trim();
        if (trimmed === '') {
            return {
                valid: false,
                reason: "unrecognized format",
                raw: line
            };
        }

        const jsonResult = parseJsonLog(line);
        if (jsonResult) {
            return jsonResult;
        }

        const standardResult = parseStandardLog(line);
        if (standardResult) {
            return standardResult;
        }

        const alternateResult = parseAlternateLog(line);
        if (alternateResult) {
            return alternateResult;
        }

        return {
            valid: false,
            reason: "unrecognized format",
            raw: line
        };
    } catch (error) {
        return {
            valid: false,
            reason: "unrecognized format",
            raw: line
        };
    }
}
