/**
 * Log Parser Module for Node.js
 * 
 * This module exports the main `parseLine` function and several helper functions 
 * to parse and normalize logs of different textual formats, including space-delimited
 * formats and JSON formats.
 * 
 * Features:
 * - Robust regex text parsing with backward-matching strategy to isolate timestamps.
 * - Versatile timestamp normalizer for ISO, YYYY/MM/DD, DD-MMM-YYYY, and Unix Epoch.
 * - Millisecond-level conversion for response times ('ms', 's', unitless).
 * - Gracious parsing of missing status codes ('-' maps to null).
 * - Safely maps and parses JSON-structured logs.
 * - Never throws or crashes, returning valid: false objects on corruption.
 */

/**
 * Normalizes a response time string into integer milliseconds.
 * Supported cases:
 * - "142ms" => 142
 * - "0.142s" => 142 (resolves decimals safely to integer)
 * - "142" => 142
 * 
 * @param {string|number} rtStr Response time input
 * @returns {number|null} Normalized response time in ms, or null if unparseable
 */
function normalizeResponseTime(rtStr) {
  if (rtStr === undefined || rtStr === null) {
    return null;
  }

  // Coerce to string to safely process
  let str = String(rtStr).trim();
  if (str === '') {
    return null;
  }

  // Handle standard "ms" units
  if (str.endsWith('ms')) {
    const val = parseFloat(str.slice(0, -2));
    return isNaN(val) ? null : Math.round(val);
  }

  // Handle second-based decimals (e.g. 0.142s)
  if (str.endsWith('s')) {
    const val = parseFloat(str.slice(0, -1));
    return isNaN(val) ? null : Math.round(val * 1000);
  }

  // Handle unitless representations (default: milliseconds)
  const val = parseFloat(str);
  return isNaN(val) ? null : Math.round(val);
}

/**
 * Resiliently parses timestamp strings in multiple standard formats.
 * Supports:
 * - ISO format: "2024-03-15T14:23:01Z"
 * - Slashed format: "2024/03/15 14:23:01"
 * - English character month format: "15-Mar-2024 14:23:01"
 * - Unix epoch timestamp (seconds): "1710512581"
 * 
 * @param {string} tsStr Raw timestamp representation
 * @returns {Date|null} Date object, or null if parsing fails
 */
function parseTimestamp(tsStr) {
  if (!tsStr) {
    return null;
  }

  let str = String(tsStr).trim();

  // Support 1: Unix epoch timestamp in seconds (typically 10 digits)
  // Check if string contains only digits.
  if (/^\d+$/.test(str)) {
    const num = parseInt(str, 10);
    // If number matches unix seconds scale (< 30 billion), scale up to ms
    if (num < 30000000000) {
      return new Date(num * 1000);
    }
    return new Date(num);
  }

  // Support 2: Custom Date Engine parsing
  // JS engine natively parses most standard ISO dates.
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d;
  }

  // Support 3: Manual parsing for "15-Mar-2024 14:23:01" type formats.
  // RegEx isolates: Day-Month-Year Hours:Minutes:Seconds
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

    // Construct local date time (resiliently fallback to standard constructor)
    const customDate = new Date(year, monthIndex, day, hour, min, sec);
    if (!isNaN(customDate.getTime())) {
      return customDate;
    }
  }

  // Support 4: Slash alternate formatting like "2024/03/15 14:23:01" 
  const matchSlash = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (matchSlash) {
    const year = parseInt(matchSlash[1], 10);
    const month = parseInt(matchSlash[2], 10) - 1; // 0-indexed in JS Dates
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

/**
 * Safely parses logs structured as JSON lines.
 * Example input:
 * '{"timestamp":"2024-03-15T14:23:01Z","ip":"1.1.1.1","method":"GET","path":"/api","status":200,"responseTime":"44ms"}'
 * 
 * @param {string} line Raw input log line
 * @returns {object|null} Parsed and normalized result, or null if line format doesn't match JSON log
 */
function parseJsonLog(line) {
  try {
    const str = line.trim();
    // A quick defensive constraint to prevent passing general strings to JSON.parse
    if (!str.startsWith('{') || !str.endsWith('}')) {
      return null;
    }

    const data = JSON.parse(str);

    // Validate expected structure exists
    if (!data.timestamp || !data.ip || !data.method || !data.path) {
      return null;
    }

    const ts = parseTimestamp(data.timestamp);
    if (!ts) {
      return null;
    }

    // Capture missing or nullified status codes safely
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
    // Fail silently, letting outer layers process
    return null;
  }
}

// -------------------------------------------------------------
// Regex Patterns
// -------------------------------------------------------------

// Regex 1: Standard layout
// Strategy: Since timestamps can have variable internal styles and spaces,
// we isolate components backwards from the end of the log line using trailing spacing.
// Component sequence at end: [IP] [Method] [Path] [Status] [ResponseTime]
// Matches suffix to leave the prefix as the dynamic timestamp portion.
const logStandardRegex = /^\s*(.*?)\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+([A-Z]+)\s+(\S+)\s+(\d{3}|-)\s+(\d+(?:\.\d+)?(?:ms|s)?)(?:\s+(.*))?\s*$/;

// Regex 2: Bracketed Timestamp layout
// Fits logs that wrap timestamps inside square brackets, e.g. "[2024-03-15T14:23:01Z] 192.168.1.42 ..."
const logBracketRegex = /^\s*\[(.*?)\]\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+([A-Z]+)\s+(\S+)\s+(\d{3}|-)\s+(\d+(?:\.\d+)?(?:ms|s)?)(?:\s+(.*))?\s*$/;

/**
 * Attempts text-based standard log match and normalization.
 * 
 * @param {string} line Raw input log line
 * @returns {object|null} Parsed result, or null if match fails
 */
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
    return null; // Timestamp is malformed or invalid
  }

  const statusCode = rawStatus === '-' ? null : parseInt(rawStatus, 10);
  const responseTimeMs = normalizeResponseTime(rawResponse);
  if (responseTimeMs === null) {
    return null; // Response time is malformed
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

/**
 * Attempts alternate text log parsing (specifically bracketed timestamp blocks).
 * 
 * @param {string} line Raw input log line
 * @returns {object|null} Parsed result, or null if match fails
 */
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
    format: "standard", // Still counts as standard layout with unified output Schema
    timestamp: ts,
    ip: ip,
    method: method,
    path: path,
    statusCode: statusCode,
    responseTimeMs: responseTimeMs,
    raw: line
  };
}

/**
 * Main parser entry point.
 * Robustly layers parsing attempts:
 * 1. Safely tries JSON parsing
 * 2. Tries standard RegEx text parser
 * 3. Tries alternate RegEx text parser
 * 4. Yields descriptive failure format rather than throwing
 * 
 * @param {string} line The actual log string to parse
 * @returns {object} Normalized outcome schema
 */
function parseLine(line) {
  try {
    // Defense: Validate input parameter type
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

    // Strategy Layer 1: JSON formatted log line
    const jsonResult = parseJsonLog(line);
    if (jsonResult) {
      return jsonResult;
    }

    // Strategy Layer 2: Text matching (Standard whitespace-agnostic parser)
    const standardResult = parseStandardLog(line);
    if (standardResult) {
      return standardResult;
    }

    // Strategy Layer 3: Text matching (Alternate patterns like Bracketed timestamps)
    const alternateResult = parseAlternateLog(line);
    if (alternateResult) {
      return alternateResult;
    }

    // Fallback: Line did not conform to any matching standard or custom layer
    return {
      valid: false,
      reason: "unrecognized format",
      raw: line
    };
  } catch (error) {
    // Critical: Never allow parsing errors to crash processing loops
    return {
      valid: false,
      reason: "unrecognized format",
      raw: line
    };
  }
}

// Export the APIs for CLI tool integration
module.exports = {
  parseLine,
  parseTimestamp,
  normalizeResponseTime,
  parseJsonLog
};

// -------------------------------------------------------------
// Local Self-Test Suite & Demonstration
// -------------------------------------------------------------
if (require.main === module) {
  console.log("=====================================================================");
  console.log("             LOG PARSER MODULE SELF-TEST RUNTIME                     ");
  console.log("=====================================================================\n");

  const testCases = [
    {
      title: "Standard log format",
      raw: "2024-03-15T14:23:01Z 192.168.1.42 GET /api/users 200 142ms"
    },
    {
      title: "Log line with extra space padding",
      raw: "  2024-03-15T14:23:04Z 192.168.1.42 GET /api/users/12 200 53ms  "
    },
    {
      title: "Slash-based timestamp alignment",
      raw: "2024/03/15 14:23:01 10.0.0.1 GET /api/test 200 120ms"
    },
    {
      title: "English-verbal Date & Second decimals ('s')",
      raw: "15-Mar-2024 14:23:01 10.0.0.1 POST /login 401 0.142s"
    },
    {
      title: "Epoch unitless timestamp format",
      raw: "1710512581 127.0.0.1 GET /health 200 142"
    },
    {
      title: "Graceful missing status code",
      raw: "2024-03-15T14:23:01Z 192.168.1.42 GET /api/users - 142ms"
    },
    {
      title: "JSON formatted payload string",
      raw: '{"timestamp":"2024-03-15T14:23:01Z","ip":"1.1.1.1","method":"GET","path":"/api","status":200,"responseTime":"44ms"}'
    },
    {
      title: "Custom alternate bracketed formatting",
      raw: "[2024-03-15T14:23:01Z] 192.168.1.42 GET /api/users 200 142ms"
    },
    {
      title: "Malformed sample: stack trace entry",
      raw: "Exception in thread"
    },
    {
      title: "Malformed sample: broken words",
      raw: "random broken line"
    },
    {
      title: "Malformed sample: blank lines",
      raw: "     "
    },
    {
      title: "Malformed sample: non-string argument types",
      raw: null
    }
  ];

  let succCount = 0;
  testCases.forEach((tc, idx) => {
    console.log(`[Test CASE #${idx + 1}] Description: ${tc.title}`);
    console.log(`   Input Line: ${tc.raw === null ? "null" : JSON.stringify(tc.raw)}`);

    // Parse the test input
    const output = parseLine(tc.raw);
    console.log(`   Outcome Validation:`, output.valid ? "\x1b[32m✔ VALID\x1b[0m" : "\x1b[31m✖ MALFORMED\x1b[0m");
    console.log(`   Output Content:`, JSON.stringify(output, null, 2));
    console.log("-".repeat(80));

    // Verify properties for valid parser executions
    if (output.valid) {
      const isDate = output.timestamp instanceof Date && !isNaN(output.timestamp.getTime());
      const hasCorrectMs = typeof output.responseTimeMs === 'number';
      if (isDate && hasCorrectMs) {
        succCount++;
      } else {
        console.error("\x1b[31m   FAIL: Timestamp or Response time was not properly normalized.\x1b[0m");
      }
    } else {
      // For cases intended to fail
      if (tc.title.startsWith("Malformed")) {
        succCount++;
      }
    }
  });

  console.log("\n=====================================================================");
  console.log(`Self-TeSt summary: Passed ${succCount} of ${testCases.length} conditions.`);
  console.log("=====================================================================\n");
}
