import React, { useState, useEffect } from 'react';
import { parseLine } from './utils/logParser';

export default function App() {
  const [activeTab, setActiveTab] = useState('sandbox'); // 'sandbox' | 'dashboard'

  // Single-Line Sandbox state
  const [sandboxLine, setSandboxLine] = useState(
    '2024-03-15T14:23:01Z 192.168.1.42 GET /api/users 200 142ms'
  );
  const [sandboxResult, setSandboxResult] = useState(null);

  // Bulk / File Input states
  const [bulkText, setBulkText] = useState('');
  const [fileProgress, setFileProgress] = useState('');
  const [isDragActive, setIsDragActive] = useState(false);

  // Compiled metrics dashboard state
  const [metrics, setMetrics] = useState(null);

  // Default sample logs for users to click and load
  const SAMPLE_LOGS = [
    { label: "Standard 200 OK", line: "2024-03-15T14:23:01Z 192.168.1.42 GET /api/users 200 142ms" },
    { label: "Verbal Month Date & Seconds", line: "15-Mar-2024 14:23:01 10.0.0.1 POST /login 401 0.142s" },
    { label: "JSON Bolted-On Log Line", line: '{"timestamp":"2024-03-15T14:23:01Z","ip":"1.1.1.1","method":"GET","path":"/api","status":200,"responseTime":"44ms"}' },
    { label: "Tolerate Extra user-agents", line: '2024-03-15T14:23:02Z 8.8.8.8 GET /index.html 200 12ms "https://google.com" "Mozilla/5.0"' },
    { label: "Missing Status Code (-)", line: "2024-03-15T14:23:01Z 192.168.1.42 GET /api/users - 142ms" },
    { label: "Exception Stack Noise", line: "    at com.example.service.UserService.getUserDetails(UserService.java:42)" }
  ];

  // Resolve live sandbox parsing
  useEffect(() => {
    if (!sandboxLine.trim()) {
      setSandboxResult(null);
      return;
    }
    const parsed = parseLine(sandboxLine);
    setSandboxResult(parsed);
  }, [sandboxLine]);

  // Handle log metrics aggregation
  const processLogData = (textData) => {
    if (!textData || !textData.trim()) return;

    setFileProgress('Parsing log stream...');
    const linesArr = textData.split(/\r?\n/);

    let total = 0;
    let valid = 0;
    let standard = 0;
    let json = 0;

    const malformedMap = {};
    const pathHits = {};
    const ipHits = {};
    const statusMap = {
      '1xx': 0, '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, 'Unknown/Missing': 0
    };

    let minLat = Infinity;
    let maxLat = -Infinity;
    let sumLat = 0;
    const pathLatencyStats = {}; // { path: { sumMs: 0, count: 0, maxMs: -Infinity } }
    let errorCount = 0;

    linesArr.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        // Log blanks safely
        malformedMap['blank lines'] = (malformedMap['blank lines'] || 0) + 1;
        total++;
        return;
      }
      total++;

      const res = parseLine(line);
      if (!res.valid) {
        let reason = res.reason || 'unrecognized format';
        if (trimmed.startsWith('at ') || trimmed.includes('.java:') || trimmed.includes('.js:')) {
          reason = 'java/node stack trace line';
        } else if (trimmed.startsWith('Exception in thread')) {
          reason = 'app core runtime exceptions';
        }
        malformedMap[reason] = (malformedMap[reason] || 0) + 1;
        return;
      }

      valid++;
      if (res.format === 'json') {
        json++;
      } else {
        standard++;
      }

      // Hits count
      const p = res.path;
      pathHits[p] = (pathHits[p] || 0) + 1;

      const ip = res.ip;
      ipHits[ip] = (ipHits[ip] || 0) + 1;

      // Latencies mapping
      const ms = res.responseTimeMs;
      if (ms !== null) {
        sumLat += ms;
        if (ms < minLat) minLat = ms;
        if (ms > maxLat) maxLat = ms;

        if (!pathLatencyStats[p]) {
          pathLatencyStats[p] = { sumMs: 0, count: 0, maxMs: -Infinity };
        }
        pathLatencyStats[p].sumMs += ms;
        pathLatencyStats[p].count++;
        if (ms > pathLatencyStats[p].maxMs) {
          pathLatencyStats[p].maxMs = ms;
        }
      }

      // Status classifications
      const status = res.statusCode;
      if (status === null || status === undefined) {
        statusMap['Unknown/Missing']++;
      } else {
        if (status >= 100 && status < 200) statusMap['1xx']++;
        else if (status >= 200 && status < 300) statusMap['2xx']++;
        else if (status >= 300 && status < 400) statusMap['3xx']++;
        else if (status >= 400 && status < 500) {
          statusMap['4xx']++;
          errorCount++;
        } else if (status >= 500 && status < 600) {
          statusMap['5xx']++;
          errorCount++;
        } else {
          statusMap['Unknown/Missing']++;
        }
      }
    });

    setMetrics({
      totalLines: total,
      validLines: valid,
      invalidLines: total - valid,
      jsonCount: json,
      standardCount: standard,
      malformedCategories: malformedMap,
      minLatency: minLat === Infinity ? 0 : minLat,
      maxLatency: maxLat === -Infinity ? 0 : maxLat,
      avgLatency: valid > 0 ? Math.round(sumLat / valid) : 0,
      pathHits,
      ipHits,
      statusDistribution: statusMap,
      errorRate: valid > 0 ? ((errorCount / valid) * 100).toFixed(1) : '0.0',
      pathLatencyStats
    });

    setFileProgress('');
    setActiveTab('dashboard');
  };

  // Drag and Drop File Handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setFileProgress(`Loading file: ${file.name}...`);
      const reader = new FileReader();

      reader.onload = (event) => {
        processLogData(event.target.result);
      };
      reader.readAsText(file);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFileProgress(`Loading file: ${file.name}...`);
      const reader = new FileReader();

      reader.onload = (event) => {
        processLogData(event.target.result);
      };
      reader.readAsText(file);
    }
  };

  // Latency bottlenecks calculators
  const getBottlenecks = () => {
    if (!metrics) return [];
    return Object.entries(metrics.pathLatencyStats)
      .map(([pathStr, stats]) => ({
        path: pathStr,
        avg: Math.round(stats.sumMs / stats.count),
        max: stats.maxMs,
        count: stats.count
      }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5);
  };

  const getTopHits = (map) => {
    if (!metrics) return [];
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  };

  return (
    <div>
      {/* 🚀 Brand Header navbar */}
      <header className="app-header">
        <div className="header-container">
          <div className="brand-section">
            <svg className="brand-logo-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
            <h1 className="brand-title">LogAnalyzer CLI & Dashboard</h1>
          </div>

          <nav className="tabs-header" style={{ width: '280px', margin: 0 }}>
            <button
              className={`tab-btn ${activeTab === 'sandbox' ? 'active' : ''}`}
              onClick={() => setActiveTab('sandbox')}
            >
              Playground
            </button>
            <button
              className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => {
                if (!metrics) {
                  alert("Please load or paste logs first to populate metrics!");
                  return;
                }
                setActiveTab('dashboard');
              }}
            >
              Dashboard
            </button>
          </nav>
        </div>
      </header>

      {/* Main page margins */}
      <main className="main-wrapper">

        {activeTab === 'sandbox' && (
          <div className="deck-grid">

            {/* LEFT COLUMN: Controls Sandbox */}
            <div className="glass-panel playground-card">
              <h2 className="playground-title">
                📊 Client Log Sandbox
              </h2>
              <div className="form-group">
                <label className="form-label">Single Line Live Playground</label>
                <input
                  type="text"
                  className="input-field"
                  value={sandboxLine}
                  onChange={(e) => setSandboxLine(e.target.value)}
                  placeholder="Paste a raw log line here..."
                />
              </div>

              {/* Sample Preset Buttons */}
              <div className="form-group">
                <label className="form-label">Preset Examples (Click to load)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {SAMPLE_LOGS.map((sample, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSandboxLine(sample.line)}
                      style={{
                        padding: '6px 10px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '6px',
                        color: 'var(--c-text-muted)',
                        fontSize: '0.78rem',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: '0.2s',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.color = '#fff';
                        e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.color = 'var(--c-text-muted)';
                        e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                      }}
                    >
                      💡 {sample.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bulk uploading / Pasting boundaries */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1.25rem' }}>
                <h3 className="form-label" style={{ fontWeight: 700, marginBottom: '10px' }}>⚡ Batch Log File Upload (Drag & Drop)</h3>

                <div
                  className={`drag-zone ${isDragActive ? 'active' : ''}`}
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                >
                  <svg className="drag-zone-svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                  </svg>
                  <p style={{ fontSize: '0.8rem', fontWeight: 600 }}>Drag file here or <span style={{ color: 'var(--c-cyan)', textDecoration: 'underline' }}>browse</span></p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--c-text-muted)' }}>Supports .log, .txt files up to 50,000+ lines</p>
                  <input
                    type="file"
                    accept=".log,.txt"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                    id="file-element-input"
                  />
                  <label htmlFor="file-element-input" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, cursor: 'pointer' }}></label>
                </div>

                {fileProgress && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--c-cyan)', marginTop: '8px', textAlign: 'center' }}>
                    ⌛ {fileProgress}
                  </p>
                )}

                {/* Textarea bulk pasting */}
                <div style={{ marginTop: '1.25rem' }}>
                  <label className="form-label">Or paste multi-line raw logs here</label>
                  <textarea
                    className="input-field textarea-field"
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder="2024-03-15T14:23:01Z 192.168.1.42 GET /api/users 200 142ms&#10;2024/03/15 14:23:02 10.0.0.7 POST /api/login 401 89ms"
                  />
                  <button
                    onClick={() => processLogData(bulkText)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: 'var(--c-accent)',
                      border: 0,
                      borderRadius: '6px',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      marginTop: '8px',
                      boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)'
                    }}
                  >
                    Analyze Batch Logs
                  </button>
                </div>
              </div>

            </div>

            {/* RIGHT COLUMN: Parse Result visualization */}
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <h2 className="playground-title" style={{ color: 'var(--c-accent)' }}>
                🔍 Live Parser Result Properties
              </h2>

              {sandboxResult ? (
                <div>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                    <span className={`chip ${sandboxResult.valid ? 'valid' : 'invalid'}`}>
                      {sandboxResult.valid ? '✔ Valid Log' : '✖ Malformed'}
                    </span>
                    {sandboxResult.valid && (
                      <span className={`chip ${sandboxResult.format}`}>
                        Format: {sandboxResult.format}
                      </span>
                    )}
                  </div>

                  {sandboxResult.valid ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '1.5rem' }}>
                      <div style={{ padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--c-text-muted)', display: 'block' }}>HTTP Method</span>
                        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--c-cyan)' }}>{sandboxResult.method}</span>
                      </div>
                      <div style={{ padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--c-text-muted)', display: 'block' }}>Status Code</span>
                        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: sandboxResult.statusCode >= 400 ? 'var(--c-red)' : 'var(--c-green)' }}>
                          {sandboxResult.statusCode || '-'}
                        </span>
                      </div>
                      <div style={{ padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--c-text-muted)', display: 'block' }}>Response Time</span>
                        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--c-green)' }}>{sandboxResult.responseTimeMs} ms</span>
                      </div>
                      <div style={{ padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--c-text-muted)', display: 'block' }}>Visitor IP</span>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, display: 'block', marginTop: '3px' }}>{sandboxResult.ip}</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#fca5a5', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                      <strong>Skipping Reason:</strong> {sandboxResult.reason || 'unrecognized format'}
                    </div>
                  )}

                  <div style={{ marginBottom: '1.25rem' }}>
                    <span className="form-label">Resource Target URL Path</span>
                    <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--c-accent)', background: 'rgba(0,0,0,0.2)', padding: '6px 12px', borderRadius: '6px', fontFamily: 'var(--font-mono)' }}>
                      {sandboxResult.path || 'N/A'}
                    </p>
                  </div>

                  <div style={{ marginBottom: '1.25rem' }}>
                    <span className="form-label">Normalised Timestamp Object Date</span>
                    <p style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                      {sandboxResult.timestamp ? sandboxResult.timestamp.toString() : 'Invalid Date Object'}
                    </p>
                  </div>

                  <div>
                    <span className="form-label">Normalized Mapping Output Schema (JSON)</span>
                    <pre className={`json-display ${!sandboxResult.valid ? 'invalid' : ''}`}>
                      {JSON.stringify({
                        ...sandboxResult,
                        timestamp: sandboxResult.timestamp ? sandboxResult.timestamp.toISOString() : null
                      }, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : (
                <p style={{ color: 'var(--c-text-muted)', fontSize: '0.9rem', textAlign: 'center', marginTop: '4rem' }}>
                  💡 Enter or select a log line on the left to see instant parsed details.
                </p>
              )}
            </div>
          </div>
        )}

        {/* 📊 DASHBOARD SECTION PANEL */}
        {activeTab === 'dashboard' && metrics && (
          <div>

            {/* ROW 1: Summaries Grid */}
            <div className="metrics-row">
              <div className="glass-panel metric-card accent">
                <span className="metric-title">Volume Audited</span>
                <div className="metric-value">{metrics.totalLines}</div>
                <span className="metric-subtitle">Processed lines</span>
              </div>
              <div className="glass-panel metric-card green">
                <span className="metric-title">Log Sanity Code</span>
                <div className="metric-value" style={{ color: 'var(--c-green)' }}>
                  {((metrics.validLines / metrics.totalLines) * 100).toFixed(1)}%
                </div>
                <span className="metric-subtitle">{metrics.validLines} valid entries / {metrics.invalidLines} skipped</span>
              </div>
              <div className="glass-panel metric-card cyan">
                <span className="metric-title">Average Latency</span>
                <div className="metric-value" style={{ color: 'var(--c-cyan)' }}>{metrics.avgLatency} ms</div>
                <span className="metric-subtitle">Range: {metrics.minLatency}ms to {metrics.maxLatency}ms</span>
              </div>
              <div className="glass-panel metric-card red">
                <span className="metric-title">Service Error Rate</span>
                <div className="metric-value" style={{ color: parseFloat(metrics.errorRate) > 5 ? 'var(--c-red)' : 'var(--c-green)' }}>
                  {metrics.errorRate}%
                </div>
                <span className="metric-subtitle">4xx and 5xx Status codes ratio</span>
              </div>
            </div>

            {/* ROW 2: Custom Charts Grid */}
            <div className="charts-grid">

              {/* Graphic 1: Clean responsive SVG Status Frequency bar chart */}
              <div className="glass-panel chart-card">
                <h3 className="chart-title">🚦 HTTP Code Severity Distribution</h3>
                <div className="svg-chart-container">
                  <svg width="100%" height="220" viewBox="0 0 320 220" style={{ overflow: 'visible' }}>
                    {/* Draw borders & gridlines */}
                    <line x1="40" y1="180" x2="300" y2="180" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                    <line x1="40" y1="30" x2="40" y2="180" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />

                    {/* Yield vertical graph bars */}
                    {Object.entries(metrics.statusDistribution).map(([category, count], idx) => {
                      const maxHits = Math.max(...Object.values(metrics.statusDistribution)) || 1;
                      const barHeight = Math.round((count / maxHits) * 130);
                      const x = 55 + idx * 42;
                      const y = 180 - barHeight;

                      let fillcolor = 'var(--c-green)';
                      if (category.startsWith('3')) fillcolor = 'var(--c-cyan)';
                      else if (category.startsWith('4')) fillcolor = 'var(--c-yellow)';
                      else if (category.startsWith('5')) fillcolor = 'var(--c-red)';
                      else if (category.startsWith('Unk')) fillcolor = 'var(--c-text-muted)';

                      return (
                        <g key={idx}>
                          {/* Hover group overlay tooltip */}
                          <title>{`${category}: ${count} hits (${metrics.validLines > 0 ? ((count / metrics.validLines) * 100).toFixed(1) : 0}%)`}</title>
                          <rect
                            x={x}
                            y={y}
                            width="24"
                            height={barHeight}
                            fill={fillcolor}
                            opacity="0.85"
                            className="chart-bar"
                            rx="3"
                          />
                          {/* Label values */}
                          <text x={x + 12} y={y - 6} fill="#fff" fontSize="9" textAnchor="middle" fontWeight="bold">
                            {count}
                          </text>
                          {/* Label titles on X axis */}
                          <text x={x + 12} y="195" fill="var(--c-text-muted)" fontSize="9" textAnchor="middle">
                            {category.replace('/Missing', '')}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>

              {/* Graphic 2: Anomaly Category skips list */}
              <div className="glass-panel chart-card">
                <h3 className="chart-title">⚠️ Log Exception / Anomaly Classification</h3>
                <div className="metric-list" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {Object.keys(metrics.malformedCategories).length > 0 ? (
                    Object.entries(metrics.malformedCategories).map(([reason, count], idx) => (
                      <div key={idx} className={`metric-list-item ${reason.includes('exception') || reason.includes('trace') ? 'fault' : 'warning'}`}>
                        <div className="item-left">
                          <span className="item-title">{reason}</span>
                          <span className="item-details">Anomalous log frame drops</span>
                        </div>
                        <div className="item-right">
                          {count}
                          <span className="item-unit">skips</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p style={{ color: 'var(--c-green)', fontSize: '0.85rem', textAlign: 'center', marginTop: '3rem' }}>
                      ✔ Incredible! 0 anomalous skips or malformed codes reported.
                    </p>
                  )}
                </div>
              </div>

            </div>

            {/* ROW 3: Grid diagnostics */}
            <div className="charts-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>

              {/* Box 1: Slow Endpoints Table */}
              <div className="glass-panel table-card">
                <h3 className="chart-title" style={{ borderBottomColor: 'rgba(239, 68, 68, 0.15)', color: 'var(--c-yellow)' }}>
                  🐢 Slowest Service Bottlenecks
                </h3>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Path Endpoint</th>
                        <th>Avg ms</th>
                        <th>Max ms</th>
                        <th>Requests</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getBottlenecks().map((item, idx) => (
                        <tr key={idx}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{item.path}</td>
                          <td style={{ color: 'var(--c-red)', fontWeight: 700 }}>{item.avg} ms</td>
                          <td>{item.max} ms</td>
                          <td>{item.count}</td>
                        </tr>
                      ))}
                      {getBottlenecks().length === 0 && (
                        <tr>
                          <td colSpan="4" style={{ textAlign: 'center', color: 'var(--c-text-muted)' }}>
                            No response times available
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Box 2: Top Active IP Visitors */}
              <div className="glass-panel table-card">
                <h3 className="chart-title" style={{ borderBottomColor: 'rgba(6, 182, 212, 0.15)', color: 'var(--c-cyan)' }}>
                  👥 Top Client IP Visitors
                </h3>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>IP Address</th>
                        <th>Hits</th>
                        <th>Proportion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getTopHits(metrics.ipHits).map(([ip, count], idx) => (
                        <tr key={idx}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{ip}</td>
                          <td style={{ fontWeight: 700 }}>{count}</td>
                          <td style={{ color: 'var(--c-cyan)' }}>
                            {((count / metrics.validLines) * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Box 3: Top Hits paths */}
              <div className="glass-panel table-card">
                <h3 className="chart-title">🚀 Hot Request Routes</h3>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Endpoint URL</th>
                        <th>Hits</th>
                        <th>Traffic Weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getTopHits(metrics.pathHits).map(([p, count], idx) => (
                        <tr key={idx}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--c-accent)' }}>{p}</td>
                          <td style={{ fontWeight: 700 }}>{count}</td>
                          <td>{((count / metrics.validLines) * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

          </div>
        )
        }

      </main >
    </div >
  );
}
