import React, { useState, useMemo } from 'react';
import { 
  Terminal, 
  Database, 
  Cpu, 
  ListOrdered, 
  Trash2, 
  Maximize2, 
  Minimize2, 
  X, 
  CheckCircle2, 
  Clock, 
  FileCode, 
  Search, 
  AlertTriangle, 
  FileText, 
  Table as TableIcon, 
  Layers,
  Upload,
  Loader2,
  FileSpreadsheet,
  BarChart2,
  History,
  CheckCircle,
  XCircle,
  Eye,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { 
  SparkExecutionResult, 
  LogEntry, 
  SparkJobStage, 
  DatasetItem, 
  DatasetPreview,
  ExecutionHistoryItem
} from '../types';
import { ResultChart } from './ResultChart';

interface BottomPanelProps {
  activeTab: 'output' | 'result' | 'data' | 'jobs' | 'logs';
  onTabChange: (tab: 'output' | 'result' | 'data' | 'jobs' | 'logs') => void;
  onClose: () => void;
  executionResult: SparkExecutionResult | null;
  isRunning: boolean;
  logs: LogEntry[];
  onClearLogs: () => void;
  stages: SparkJobStage[];
  datasets: DatasetItem[];
  selectedDatasetName: string;
  onSelectDataset: (filename: string) => void;
  activeDatasetPreview: DatasetPreview | null;
  isLoadingDataset: boolean;
  onUploadClick: () => void;
  onDeleteDataset?: (filename: string) => void;
  jobHistory?: ExecutionHistoryItem[];
  onSelectHistoryJob?: (item: ExecutionHistoryItem) => void;
}

export const BottomPanel: React.FC<BottomPanelProps> = ({
  activeTab,
  onTabChange,
  onClose,
  executionResult,
  isRunning,
  logs,
  onClearLogs,
  stages,
  datasets,
  selectedDatasetName,
  onSelectDataset,
  activeDatasetPreview,
  isLoadingDataset,
  onUploadClick,
  onDeleteDataset,
  jobHistory = [],
  onSelectHistoryJob,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [outputViewMode, setOutputViewMode] = useState<'console' | 'json'>('console');
  const [resultViewMode, setResultViewMode] = useState<'table' | 'chart' | 'json'>('table');
  const [jobsTabMode, setJobsTabMode] = useState<'history' | 'stages'>('history');
  const [showTraceback, setShowTraceback] = useState(false);
  const [resultSearch, setResultSearch] = useState('');
  const [dataSearch, setDataSearch] = useState('');
  const [logFilter, setLogFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR'>('ALL');
  const [logSearch, setLogSearch] = useState('');

  // Filtered DataFrame rows for Result tab
  const filteredResultRows = useMemo(() => {
    if (!executionResult?.dataframe?.rows) return [];
    if (!resultSearch.trim()) return executionResult.dataframe.rows;

    const query = resultSearch.toLowerCase();
    return executionResult.dataframe.rows.filter((row) =>
      Object.values(row).some((val) =>
        String(val).toLowerCase().includes(query)
      )
    );
  }, [executionResult, resultSearch]);

  // Filtered Data viewer rows for Data tab
  const filteredDataRows = useMemo(() => {
    if (!activeDatasetPreview?.rows) return [];
    if (!dataSearch.trim()) return activeDatasetPreview.rows;

    const query = dataSearch.toLowerCase();
    return activeDatasetPreview.rows.filter((row) =>
      Object.values(row).some((val) =>
        String(val).toLowerCase().includes(query)
      )
    );
  }, [activeDatasetPreview, dataSearch]);

  const filteredLogs = logs.filter((log) => {
    if (logFilter !== 'ALL' && log.level !== logFilter) return false;
    if (logSearch && !log.message.toLowerCase().includes(logSearch.toLowerCase())) return false;
    return true;
  });

  return (
    <section className={`bottom-panel ${isMaximized ? 'maximized' : ''}`}>
      {/* Tab Navigation & Panel Header Controls */}
      <div className="panel-header">
        <div className="panel-tabs">
          {/* 1. Execution Output Tab */}
          <button
            className={`panel-tab ${activeTab === 'output' ? 'active' : ''}`}
            onClick={() => onTabChange('output')}
          >
            <Terminal size={14} />
            <span>Output</span>
            {executionResult && (
              <span className={`status-indicator-dot ${executionResult.success ? 'success' : 'error'}`} />
            )}
          </button>

          {/* 2. Structured Result Tab */}
          <button
            className={`panel-tab ${activeTab === 'result' ? 'active' : ''}`}
            onClick={() => onTabChange('result')}
          >
            <TableIcon size={14} />
            <span>Result</span>
            {executionResult?.dataframe && (
              <span className="badge-pill count">
                {executionResult.dataframe.row_count} rows
              </span>
            )}
          </button>

          {/* 3. Dataset Viewer Tab */}
          <button
            className={`panel-tab ${activeTab === 'data' ? 'active' : ''}`}
            onClick={() => onTabChange('data')}
          >
            <Database size={14} />
            <span>Data</span>
            <span className="badge-pill">
              {selectedDatasetName || 'Datasets'}
            </span>
          </button>

          {/* 4. Spark Jobs Tab */}
          <button
            className={`panel-tab ${activeTab === 'jobs' ? 'active' : ''}`}
            onClick={() => onTabChange('jobs')}
          >
            <History size={14} />
            <span>Jobs & History</span>
            <span className="badge-pill">{jobHistory.length} runs</span>
          </button>

          {/* 5. Logs Tab */}
          <button
            className={`panel-tab ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => onTabChange('logs')}
          >
            <ListOrdered size={14} />
            <span>Logs</span>
            <span className="badge-pill">{logs.length}</span>
          </button>
        </div>

        <div className="panel-actions">
          {activeTab === 'output' && executionResult && (
            <div className="view-mode-toggle">
              <button
                className={`toggle-btn ${outputViewMode === 'console' ? 'active' : ''}`}
                onClick={() => setOutputViewMode('console')}
                title="Console Output"
              >
                <FileText size={13} />
              </button>
              <button
                className={`toggle-btn ${outputViewMode === 'json' ? 'active' : ''}`}
                onClick={() => setOutputViewMode('json')}
                title="JSON Payload"
              >
                <FileCode size={13} />
              </button>
            </div>
          )}

          {activeTab === 'result' && executionResult?.dataframe && (
            <div className="view-mode-toggle">
              <button
                className={`toggle-btn ${resultViewMode === 'table' ? 'active' : ''}`}
                onClick={() => setResultViewMode('table')}
                title="Table View"
              >
                <TableIcon size={13} />
                <span>Table</span>
              </button>
              <button
                className={`toggle-btn ${resultViewMode === 'chart' ? 'active' : ''}`}
                onClick={() => setResultViewMode('chart')}
                title="Chart Visualization"
              >
                <BarChart2 size={13} />
                <span>Chart</span>
              </button>
              <button
                className={`toggle-btn ${resultViewMode === 'json' ? 'active' : ''}`}
                onClick={() => setResultViewMode('json')}
                title="JSON Payload"
              >
                <FileCode size={13} />
                <span>JSON</span>
              </button>
            </div>
          )}

          {activeTab === 'logs' && (
            <button className="icon-btn-tiny" onClick={onClearLogs} title="Clear Logs">
              <Trash2 size={14} />
            </button>
          )}

          <button
            className="icon-btn-tiny"
            onClick={() => setIsMaximized(!isMaximized)}
            title={isMaximized ? 'Restore Panel' : 'Maximize Panel'}
          >
            {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          <button className="icon-btn-tiny" onClick={onClose} title="Close Panel (Ctrl+J)">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Panel Body Content */}
      <div className="panel-body">
        {/* 1. OUTPUT TAB (stdout / stderr / clean error) */}
        {activeTab === 'output' && (
          <div className="tab-content output-content">
            {isRunning ? (
              <div className="panel-loading-state">
                <div className="spinner-glow" />
                <p>Executing Spark job in isolated subprocess...</p>
              </div>
            ) : executionResult ? (
              <div className="terminal-output-view">
                {/* Clean user-friendly error card if execution failed */}
                {!executionResult.success && (
                  <div className="clean-error-card">
                    <div className="clean-error-header">
                      <AlertTriangle size={15} className="clean-error-icon" />
                      <span className="clean-error-title">
                        {executionResult.error ? 'Execution Error' : `Execution Failed (Exit Code ${executionResult.exit_code})`}
                      </span>
                    </div>
                    <div className="clean-error-body">
                      <p className="clean-error-msg">
                        {executionResult.error || 'Execution encountered an error while processing DataFrame operations.'}
                      </p>
                    </div>
                    {executionResult.stderr && (
                      <div className="traceback-toggle-wrap">
                        <button
                          className="traceback-toggle-btn"
                          onClick={() => setShowTraceback(!showTraceback)}
                        >
                          {showTraceback ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          <span>{showTraceback ? 'Hide Technical Stack Trace' : 'View Full Technical Stack Trace'}</span>
                        </button>
                        {showTraceback && (
                          <pre className="terminal-stderr-details">{executionResult.stderr}</pre>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Execution Meta Bar */}
                <div className="terminal-meta-ribbon">
                  <div className={`metric-chip ${executionResult.success ? 'success' : 'error'}`}>
                    {executionResult.success ? (
                      <>
                        <CheckCircle2 size={14} />
                        <span>Process Succeeded (Exit 0)</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={14} />
                        <span>Process Failed (Exit {executionResult.exit_code})</span>
                      </>
                    )}
                  </div>
                  <div className="metric-chip">
                    <Clock size={14} />
                    <span>Duration: {executionResult.execution_time_ms} ms</span>
                  </div>
                  <div className="metric-chip">
                    <Terminal size={14} />
                    <span>Job ID: {executionResult.job_id}</span>
                  </div>
                </div>

                {/* Console stdout or raw JSON */}
                {outputViewMode === 'console' ? (
                  <div className="terminal-stdout-container">
                    {executionResult.stdout && (
                      <pre className="terminal-stdout">{executionResult.stdout}</pre>
                    )}

                    {executionResult.stderr && !executionResult.error && (
                      <div className="terminal-stderr-box">
                        <div className="stderr-header">
                          <AlertTriangle size={14} />
                          <span>Standard Error (stderr):</span>
                        </div>
                        <pre className="terminal-stderr">{executionResult.stderr}</pre>
                      </div>
                    )}

                    {!executionResult.stdout && !executionResult.stderr && !executionResult.error && (
                      <div className="panel-empty-state">
                        <p>Process completed with no output.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <pre className="json-viewer">
                    {JSON.stringify(executionResult, null, 2)}
                  </pre>
                )}
              </div>
            ) : (
              <div className="panel-empty-state">
                <Terminal size={32} className="empty-icon" />
                <p>No execution output yet. Click <strong>Run</strong> (<kbd>Ctrl</kbd>+<kbd>Enter</kbd>) to execute the active editor script.</p>
              </div>
            )}
          </div>
        )}

        {/* 2. STRUCTURED RESULT TAB (DataFrame table / chart / JSON) */}
        {activeTab === 'result' && (
          <div className="tab-content result-content">
            {isRunning ? (
              <div className="panel-loading-state">
                <div className="spinner-glow" />
                <p>Evaluating DataFrame DAG and materializing results...</p>
              </div>
            ) : executionResult?.dataframe ? (
              <div className="dataframe-result-view">
                {/* Result header ribbon */}
                <div className="dataframe-header-ribbon">
                  <div className="df-meta-chips">
                    <div className="metric-chip success">
                      <Layers size={14} />
                      <span>Spark DataFrame Materialized</span>
                    </div>
                    <div className="metric-chip">
                      <TableIcon size={14} />
                      <span>{executionResult.dataframe.row_count} total rows</span>
                    </div>
                    <div className="metric-chip">
                      <span>{executionResult.dataframe.columns.length} columns</span>
                    </div>
                    <div className="metric-chip">
                      <Clock size={14} />
                      <span>{executionResult.execution_time_ms} ms</span>
                    </div>
                  </div>

                  {/* Filter Search */}
                  {resultViewMode === 'table' && (
                    <div className="result-search-box">
                      <Search size={13} />
                      <input
                        type="text"
                        placeholder="Search DataFrame rows..."
                        value={resultSearch}
                        onChange={(e) => setResultSearch(e.target.value)}
                        className="result-search-input"
                      />
                    </div>
                  )}
                </div>

                {/* Table, Chart or JSON view */}
                {resultViewMode === 'table' && (
                  <div className="data-table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          {executionResult.dataframe.columns.map((col) => {
                            const fieldSchema = executionResult.dataframe?.schema.find(
                              (s) => s.name === col
                            );
                            return (
                              <th key={col}>
                                <span>{col}</span>
                                {fieldSchema && (
                                  <span className="col-type">
                                    {fieldSchema.type.replace('Type()', '').replace('Type', '')}
                                  </span>
                                )}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredResultRows.length > 0 ? (
                          filteredResultRows.map((row, idx) => (
                            <tr key={idx}>
                              {executionResult.dataframe!.columns.map((col) => {
                                const val = row[col];
                                return (
                                  <td key={col}>
                                    {typeof val === 'boolean' ? (
                                      <span className={`badge-bool ${val ? 'true' : 'false'}`}>
                                        {val ? 'TRUE' : 'FALSE'}
                                      </span>
                                    ) : col === 'status' || col === 'throughput_tier' ? (
                                      <span className={`badge-status ${String(val).toLowerCase()}`}>
                                        {String(val)}
                                      </span>
                                    ) : (
                                      String(val !== undefined && val !== null ? val : 'null')
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td 
                              colSpan={executionResult.dataframe.columns.length} 
                              style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-dim)' }}
                            >
                              No matching rows found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {resultViewMode === 'chart' && (
                  <ResultChart dataframe={executionResult.dataframe} />
                )}

                {resultViewMode === 'json' && (
                  <pre className="json-viewer">
                    {JSON.stringify(executionResult.dataframe, null, 2)}
                  </pre>
                )}
              </div>
            ) : (
              <div className="panel-empty-state">
                <TableIcon size={32} className="empty-icon" />
                <p>No structured DataFrame result yet. Run PySpark or Spark SQL code returning a DataFrame to inspect columns, schema, rows, and charts here.</p>
              </div>
            )}
          </div>
        )}

        {/* 3. DATA TAB (dataset & file viewer with schema preview) */}
        {activeTab === 'data' && (
          <div className="tab-content data-content">
            <div className="dataset-header-row">
              {/* Dataset Selector Dropdown */}
              <div className="dataset-select-wrap">
                <FileSpreadsheet size={15} className="dataset-icon" />
                <select
                  value={selectedDatasetName}
                  onChange={(e) => onSelectDataset(e.target.value)}
                  className="dataset-dropdown"
                >
                  {datasets.map((d) => (
                    <option key={d.filename} value={d.filename}>
                      {d.filename} ({d.row_count} rows, {(d.size_bytes / 1024).toFixed(1)} KB)
                    </option>
                  ))}
                </select>
                <button
                  className="btn-upload-dataset-small"
                  onClick={onUploadClick}
                  title="Upload new CSV dataset"
                >
                  <Upload size={12} />
                  <span>Upload CSV</span>
                </button>
                {datasets.find((d) => d.filename === selectedDatasetName && !d.is_sample) && onDeleteDataset && (
                  <button
                    className="btn-delete-dataset-small"
                    onClick={() => onDeleteDataset(selectedDatasetName)}
                    title={`Delete dataset ${selectedDatasetName}`}
                  >
                    <Trash2 size={12} />
                    <span>Delete</span>
                  </button>
                )}
              </div>

              {/* Dataset Summary Stats & Search */}
              <div className="dataset-stats-actions">
                {activeDatasetPreview && (
                  <div className="dataset-stats">
                    <span>Rows: {activeDatasetPreview.total_rows}</span>
                    <span>Columns: {activeDatasetPreview.columns.length}</span>
                    <span>Size: {(activeDatasetPreview.size_bytes / 1024).toFixed(1)} KB</span>
                    <span>Partitions: {activeDatasetPreview.partitions}</span>
                  </div>
                )}
                <div className="data-search-box">
                  <Search size={13} />
                  <input
                    type="text"
                    placeholder="Search dataset rows..."
                    value={dataSearch}
                    onChange={(e) => setDataSearch(e.target.value)}
                    className="data-search-input"
                  />
                </div>
              </div>
            </div>

            {/* Dataset Table Content */}
            {isLoadingDataset ? (
              <div className="panel-loading-state">
                <Loader2 size={24} className="spin-icon" />
                <p>Loading dataset preview & schema...</p>
              </div>
            ) : activeDatasetPreview && activeDatasetPreview.columns.length > 0 ? (
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      {activeDatasetPreview.columns.map((col) => {
                        const fieldSchema = activeDatasetPreview.schema.find(
                          (s) => s.name === col
                        );
                        return (
                          <th key={col}>
                            <span>{col}</span>
                            {fieldSchema && (
                              <span className="col-type">{fieldSchema.type}</span>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDataRows.length > 0 ? (
                      filteredDataRows.map((row, i) => (
                        <tr key={i}>
                          {activeDatasetPreview.columns.map((col) => {
                            const val = row[col];
                            return (
                              <td key={col}>
                                {typeof val === 'boolean' ? (
                                  <span className={`badge-bool ${val ? 'true' : 'false'}`}>
                                    {val ? 'TRUE' : 'FALSE'}
                                  </span>
                                ) : col === 'status' ? (
                                  <span className={`badge-status ${String(val).toLowerCase()}`}>
                                    {String(val)}
                                  </span>
                                ) : (
                                  String(val !== undefined && val !== null ? val : '')
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td 
                          colSpan={activeDatasetPreview.columns.length} 
                          style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-dim)' }}
                        >
                          No matching records found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="panel-empty-state">
                <Database size={32} className="empty-icon" />
                <p>No dataset loaded. Click <strong>Upload CSV</strong> to add your first dataset.</p>
              </div>
            )}
          </div>
        )}

        {/* 4. JOBS & EXECUTION HISTORY TAB */}
        {activeTab === 'jobs' && (
          <div className="tab-content jobs-content">
            <div className="jobs-subnav-bar">
              <div className="jobs-subnav-pills">
                <button
                  className={`subnav-pill ${jobsTabMode === 'history' ? 'active' : ''}`}
                  onClick={() => setJobsTabMode('history')}
                >
                  <History size={13} />
                  <span>Execution History ({jobHistory.length})</span>
                </button>
                <button
                  className={`subnav-pill ${jobsTabMode === 'stages' ? 'active' : ''}`}
                  onClick={() => setJobsTabMode('stages')}
                >
                  <Cpu size={13} />
                  <span>Spark Stages ({stages.length})</span>
                </button>
              </div>
            </div>

            {jobsTabMode === 'history' ? (
              <div className="history-timeline-list">
                {jobHistory.length > 0 ? (
                  jobHistory.map((item) => (
                    <div key={item.id} className={`history-job-card ${item.status.toLowerCase()}`}>
                      <div className="history-card-header">
                        <div className="history-header-left">
                          {item.status === 'SUCCESS' ? (
                            <CheckCircle size={15} className="history-status-icon success" />
                          ) : (
                            <XCircle size={15} className="history-status-icon failed" />
                          )}
                          <span className="history-job-id">{item.job_id}</span>
                          <span className={`history-lang-badge ${item.language}`}>
                            {item.language === 'sql' ? 'SPARK SQL' : 'PYSPARK'}
                          </span>
                        </div>
                        <div className="history-header-right">
                          <span className="history-time">{item.timestamp}</span>
                          {onSelectHistoryJob && (
                            <button
                              className="btn-history-inspect"
                              onClick={() => onSelectHistoryJob(item)}
                              title="Open Result & Output for this job"
                            >
                              <Eye size={12} />
                              <span>Inspect</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="history-card-body">
                        <div className="history-metrics-row">
                          <div className="history-metric">
                            <span className="h-label">Status:</span>
                            <span className={`h-val ${item.status.toLowerCase()}`}>{item.status}</span>
                          </div>
                          <div className="history-metric">
                            <span className="h-label">Duration:</span>
                            <span className="h-val">{item.duration_ms} ms</span>
                          </div>
                          <div className="history-metric">
                            <span className="h-label">Rows Materialized:</span>
                            <span className="h-val">{item.row_count}</span>
                          </div>
                        </div>

                        {item.query && (
                          <div className="history-query-snippet">
                            <code>{item.query.trim().split('\n')[0].substring(0, 100)}</code>
                          </div>
                        )}

                        {item.error && (
                          <div className="history-error-snippet">
                            <span>{item.error}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="panel-empty-state">
                    <History size={32} className="empty-icon" />
                    <p>No job executions recorded yet. Run a PySpark or Spark SQL script to track execution history here.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="jobs-timeline-list">
                {stages.length > 0 ? (
                  stages.map((stage) => (
                    <div key={stage.id} className="job-stage-card">
                      <div className="stage-header">
                        <div className="stage-left">
                          <span className={`stage-status-dot ${stage.status.toLowerCase()}`} />
                          <span className="stage-title">{stage.name}</span>
                        </div>
                        <span className={`stage-badge ${stage.status.toLowerCase()}`}>
                          {stage.status}
                        </span>
                      </div>
                      <div className="stage-details">
                        <div className="stage-metric">
                          <span className="metric-label">Tasks:</span>
                          <span className="metric-val">{stage.tasks}</span>
                        </div>
                        <div className="stage-metric">
                          <span className="metric-label">Duration:</span>
                          <span className="metric-val">{stage.duration}</span>
                        </div>
                        {stage.shuffleRead && (
                          <div className="stage-metric">
                            <span className="metric-label">Shuffle Read:</span>
                            <span className="metric-val">{stage.shuffleRead}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="panel-empty-state">
                    <Cpu size={32} className="empty-icon" />
                    <p>No active Spark stages in flight.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 5. LOGS TAB */}
        {activeTab === 'logs' && (
          <div className="tab-content logs-content">
            {/* Filter bar */}
            <div className="logs-filter-bar">
              <div className="log-level-pills">
                {(['ALL', 'INFO', 'WARN', 'ERROR'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    className={`level-pill ${logFilter === lvl ? 'active' : ''} ${lvl.toLowerCase()}`}
                    onClick={() => setLogFilter(lvl)}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
              <div className="log-search-box">
                <Search size={13} />
                <input
                  type="text"
                  placeholder="Filter logs..."
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  className="log-search-input"
                />
              </div>
            </div>

            {/* Log Stream */}
            <div className="logs-stream">
              {filteredLogs.map((log) => (
                <div key={log.id} className={`log-line ${log.level.toLowerCase()}`}>
                  <span className="log-time">{log.timestamp}</span>
                  <span className={`log-badge ${log.level.toLowerCase()}`}>[{log.level}]</span>
                  <span className="log-source">{log.source}:</span>
                  <span className="log-msg">{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
