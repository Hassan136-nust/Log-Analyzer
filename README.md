# High-Performance Log Analyzer System

A complete full-stack log analysis solution featuring a **CLI terminal stream analyzer** and an **interactive React log query dashboard**. Both systems are immune to malformed inputs, require zero database servers, and process logarithmic scales of data with zero footprint.

---

## 🚀 Quick Start: Web Dashboard (React & Vite)
For a premium, interactive, and beautiful inspection of your logs:

1. **Step 1: Install Dependencies**
   Navigate to the repository root directory and install all node packages:
   ```bash
   npm install
   ```

2. **Step 2: Start the Local Development Server**
   Start Vite's ultra-fast hot reloading server:
   ```bash
   npm run dev
   ```
   *The client dev environment launches at `http://localhost:5173/`.*

3. **Step 3: Play with the Web App Interface**
   - Click **"Load Preset Log Data"** on the introductory playground screen to inspect simulated service metrics (with exceptions, JSON, and standard formats).
   - Explore **visual distribution charts** and **diagnostic bottleneck tables**.
   - Input questions into the **Natural Language Query Engine** like `"show errors"` or `"slowest routes"` to extract AI-informed metrics.

---

## 💻 Quick Start: CLI Log Stream Analyzer
If you prefer a lightning-fast UNIX-style stream processor inside your terminal:

### 1. Generating Representative Test Data
Generate synthetic server traffic logs containing standard text logs, structured JSON layouts, multi-line stack trace drops, unrecognized noise, verbal dates, and diverse response time units (`s`, `ms`, unitless):
```bash
# Generate 5,000 log lines to default "test_logs.log"
node scripts/generate_logs.js --lines 5000
```
*Options: `--lines` (number of entries) and `--file` (destination path).*

### 2. Performing Streaming Term Diagnostics
Run the streaming command line tool, which reads data line-by-line using a Node reading interface to guarantee constant memory ($O(1)$ space):
```bash
# Pass filepath directly
node logAnalyzer.js test_logs.log

# Or pass file using the parameter flag
node logAnalyzer.js --file ./test_logs.log
```

---

## 📂 Repository File System Architecture
```
.
├── dashboard/              # React + Vite client web application source code
│   ├── src/
│   │   ├── App.jsx         # Beautiful Black-&-Gold Dashboard & Chat UI
│   │   ├── index.css       # Clean glassmorphic design system
│   │   └── utils/
│   │       └── logParser.js
├── scripts/
│   └── generate_logs.js    # Multi-pattern synthetic log file generator
├── logParser.js            # Unified Parser Engine library (never throws)
├── logAnalyzer.js          # Constant-memory stream analyzer & CLI dashboard
├── ANSWERS.md              # Technical answers & engineering decisions
└── README.md               # Quick-start manual
```
