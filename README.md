## 🚀 Quick Start: Web Dashboard (React & Vite)

For a premium, interactive, and beautiful inspection of your logs:

1. **Step 1: Enter Dashboard Directory**
   Navigate into the frontend dashboard folder:
   ```bash
   cd dashboard
   ```

2. **Step 2: Install Dependencies**
   Install all required Node.js packages:
   ```bash
   npm install
   ```

3. **Step 3: Start the Local Development Server**
   Launch Vite’s ultra-fast hot-reloading development server:
   ```bash
   npm run dev
   ```
   *The client dev environment will be available at `http://localhost:5173/`.*

4. **Step 4: Play with the Web App Interface**
   - Click **"Load Preset Log Data"** on the introductory playground screen to inspect simulated service metrics (exceptions, JSON logs, and standard formats).
   - Explore **visual distribution charts** and **diagnostic bottleneck tables**.
   - Use the **Natural Language Query Engine** with inputs like `"show errors"` or `"slowest routes"` to extract analytical insights.

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
node logAnalyzer.js 

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
