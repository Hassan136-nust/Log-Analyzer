# CLI Log Analyzer Tool

A robust, modular, and high-performance server log analysis CLI tool developed in plain Node.js. It efficiently processes standard and custom layout server logs alongside malformed and JSON BOLT-ON data without crashing, reporting actionable system statistics to terminal operators.

---

## 📂 Codebase Layout

```
.
├── scripts/
│   └── generate_logs.js    # Multi-pattern synthetic log file generator
├── logParser.js            # Resilient core parser library
├── logAnalyzer.js          # CLI stream analyst & terminal dashboard
├── ANSWERS.md              # Technical design & reliability decisions
└── README.md               # User guide & operations manual
```

---

## 🚀 Quick Start Guide

You only need **Node.js** (v14+) installed. There are **no external npm dependencies**.

### 1. Generating Representative Test Data
Execute the synthetic log generator script to create a sample log file containing valid web service traffic interspersed with roughly 8% format deviations and malformed noise (stack traces, slashed/verbal timestamps, JSON log lines, unit decimal response times, extra trail fields):

```bash
# Generate 5,000 log lines to the default "test_logs.log" path
node scripts/generate_logs.js --lines 5000

# Custom output details (e.g. generate 10,000 lines to a custom file)
node scripts/generate_logs.js --lines 10000 --file ./custom_test.log
```

**Parameters supported by generator:**
* `--lines` / `-l`: Number of log entries to generate (default: `2000`).
* `--file` / `-f`: Path to write the output log file (default: `./test_logs.log`).

### 2. Performing Log Analysis & Diagnostics
Run the streaming log analyzer against your generated log data (or any target server log file):

```bash
# Basic run
node logAnalyzer.js test_logs.log

# CLI switch format
node logAnalyzer.js --file ./test_logs.log
```

---

## 📊 Analytics Dashboard Profile

The terminal output renders a beautiful ANSI-colored diagnostic profile separated into five key compartments:
1. **System Audit Profile**: Overall sanity statistics, classification of Standard vs JSON log layouts, and categorized reasons for dropped/malformed lines (e.g. empty lines, unrecognized formats, app runtime exception boundaries).
2. **Web Service Health Report**: Frequency distributions of HTTP status code categories (1xx, 2xx, 3xx, 4xx, 5xx, missing) represented as colored ASCII bar charts. Surfaced aggregate **Error Rate (%)**.
3. **Performance & Latency**: Average request response latency, fastest route delay, and absolute slowest route delay.
4. **Traffic Engagement Diagnostics**: Top 5 client target IP addresses and top 5 most visited resource endpoints (with hits percentage).
5. **Critical Bottleneck Profiler**: Ranks resources by their **consistently slow average response latency** (rather than simple maximum latency spikes), isolating structural routing bottlenecks in the service code.
