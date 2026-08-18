import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { BottomPanel } from './components/BottomPanel';
import { SparkPanel } from './components/SparkPanel';
import { SettingsModal } from './components/SettingsModal';
import { INITIAL_FILES } from './constants/initialFiles';
import { 
  ProjectFile, 
  HealthStatus, 
  SparkStatus, 
  SparkExecutionResult, 
  LogEntry, 
  SparkJobStage, 
  IDESettings,
  DatasetItem,
  DatasetPreview,
  ExecutionHistoryItem,
  QueryHistoryItem
} from './types';
import { 
  fetchHealth, 
  fetchSparkStatus, 
  executeSparkCode, 
  executeSparkSQL,
  cancelSparkJob,
  fetchDatasets,
  fetchDatasetPreview,
  uploadDataset,
  deleteDataset
} from './services/api';

const DEFAULT_SETTINGS: IDESettings = {
  sparkMaster: 'local[1]',
  driverMemory: '2g',
  shufflePartitions: 1,
  autoSave: true,
  fontSize: 13,
  wordWrap: 'on',
  minimap: true,
};

export const App: React.FC = () => {
  // File state
  const [files, setFiles] = useState<ProjectFile[]>(INITIAL_FILES);
  const [openTabs, setOpenTabs] = useState<ProjectFile[]>([INITIAL_FILES[0], INITIAL_FILES[1]]);
  const [activeFile, setActiveFile] = useState<ProjectFile | null>(INITIAL_FILES[0]);
  const [editorMode, setEditorMode] = useState<'pyspark' | 'sql'>('pyspark');

  // Layout state
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(true);
  const [isSparkPanelOpen, setIsSparkPanelOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [bottomTab, setBottomTab] = useState<'output' | 'result' | 'data' | 'jobs' | 'logs'>('output');

  // Dataset State
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [selectedDatasetName, setSelectedDatasetName] = useState<string>('ecommerce.csv');
  const [activeDatasetPreview, setActiveDatasetPreview] = useState<DatasetPreview | null>(null);
  const [isLoadingDataset, setIsLoadingDataset] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const globalFileInputRef = useRef<HTMLInputElement>(null);

  // Settings
  const [settings, setSettings] = useState<IDESettings>(DEFAULT_SETTINGS);

  // Live Service State
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [sparkStatus, setSparkStatus] = useState<SparkStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  // Execution State
  const [isRunning, setIsRunning] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<SparkExecutionResult | null>(null);
  const [stages, setStages] = useState<SparkJobStage[]>([
    { id: 0, name: 'Stage 0: Ingest & Schema Inference', status: 'COMPLETED', duration: '120 ms', tasks: '1/1' },
    { id: 1, name: 'Stage 1: withColumn(module_upper) & Filtering', status: 'COMPLETED', duration: '340 ms', tasks: '1/1', shuffleRead: '4.2 KB' },
    { id: 2, name: 'Stage 2: collect() DataFrame Action', status: 'COMPLETED', duration: '180 ms', tasks: '1/1', shuffleWrite: '1.8 KB' },
  ]);

  // Job Execution & Query History
  const [jobHistory, setJobHistory] = useState<ExecutionHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('spark_ide_job_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [queryHistory, setQueryHistory] = useState<QueryHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('spark_ide_query_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('spark_ide_job_history', JSON.stringify(jobHistory.slice(0, 30)));
    } catch {}
  }, [jobHistory]);

  useEffect(() => {
    try {
      localStorage.setItem('spark_ide_query_history', JSON.stringify(queryHistory.slice(0, 30)));
    } catch {}
  }, [queryHistory]);

  // Console Logs
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'log-1',
      timestamp: new Date().toLocaleTimeString(),
      level: 'INFO',
      source: 'System',
      message: 'Spark Compiler IDE workspace initialized with Spark SQL & PySpark runtimes.',
    },
    {
      id: 'log-2',
      timestamp: new Date().toLocaleTimeString(),
      level: 'INFO',
      source: 'SparkService',
      message: 'PySpark 4.2 / OpenJDK 17 execution bridge online.',
    },
  ]);

  const addLog = useCallback((level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', source: string, message: string) => {
    setLogs((prev) => [
      ...prev,
      {
        id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        timestamp: new Date().toLocaleTimeString(),
        level,
        source,
        message,
      },
    ]);
  }, []);

  // Load preview for a dataset
  const loadDatasetPreview = useCallback(async (filename: string) => {
    setIsLoadingDataset(true);
    try {
      const preview = await fetchDatasetPreview(filename);
      setActiveDatasetPreview(preview);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to preview dataset';
      addLog('WARN', 'DatasetViewer', `Could not preview ${filename}: ${msg}`);
    } finally {
      setIsLoadingDataset(false);
    }
  }, [addLog]);

  // Load datasets list
  const loadDatasets = useCallback(async (autoSelectName?: string) => {
    try {
      const res = await fetchDatasets();
      setDatasets(res.datasets);

      const target = autoSelectName || (res.datasets.length > 0 ? res.datasets[0].filename : 'ecommerce.csv');
      setSelectedDatasetName(target);
      if (target) {
        loadDatasetPreview(target);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error fetching datasets';
      addLog('WARN', 'DatasetManager', msg);
    }
  }, [addLog, loadDatasetPreview]);

  // Initial datasets loading on mount
  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  // Select dataset handler
  const handleSelectDataset = useCallback((filename: string) => {
    setSelectedDatasetName(filename);
    loadDatasetPreview(filename);
    setBottomTab('data');
    setIsBottomPanelOpen(true);
  }, [loadDatasetPreview]);

  // Upload dataset handler
  const handleUploadDataset = useCallback(async (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);
    addLog('INFO', 'DatasetUpload', `Uploading ${file.name} (${(file.size / 1024).toFixed(1)} KB)...`);

    try {
      const result = await uploadDataset(file, (percent) => {
        setUploadProgress(percent);
      });

      addLog(
        'INFO',
        'DatasetUpload',
        `Successfully uploaded '${result.filename}' (${result.row_count} rows, auto-registered SQL view '${result.filename.replace('.csv', '')}').`
      );

      // Refresh list and activate newly uploaded dataset
      await loadDatasets(result.filename);
      setBottomTab('data');
      setIsBottomPanelOpen(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      addLog('ERROR', 'DatasetUpload', `Upload failed: ${msg}`);
      alert(`Dataset upload failed: ${msg}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [addLog, loadDatasets]);

  // Delete dataset handler
  const handleDeleteDataset = useCallback(
    async (filename: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();

      const confirmed = window.confirm(
        `Are you sure you want to delete dataset "${filename}"?\n\nThis will permanently delete the file from data/uploads/ and unregister its temporary Spark SQL view. This action cannot be undone.`
      );
      if (!confirmed) return;

      addLog('INFO', 'DatasetManager', `Deleting dataset '${filename}'...`);

      try {
        await deleteDataset(filename);
        addLog('INFO', 'DatasetManager', `Successfully deleted dataset '${filename}'.`);

        // Fetch updated datasets list
        const res = await fetchDatasets();
        setDatasets(res.datasets);

        // If the deleted dataset was currently selected, handle reselection or reset
        if (selectedDatasetName === filename) {
          if (res.datasets.length > 0) {
            const nextDataset = res.datasets[0].filename;
            setSelectedDatasetName(nextDataset);
            loadDatasetPreview(nextDataset);
          } else {
            setSelectedDatasetName('');
            setActiveDatasetPreview(null);
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Delete failed';
        addLog('ERROR', 'DatasetManager', `Failed to delete '${filename}': ${msg}`);
        alert(`Failed to delete dataset: ${msg}`);
      }
    },
    [addLog, selectedDatasetName, loadDatasetPreview]
  );

  // Poll backend health & status
  const pollServiceStatus = useCallback(async () => {
    setIsPolling(true);
    try {
      const [h, s] = await Promise.all([
        fetchHealth().catch(() => null),
        fetchSparkStatus().catch(() => null),
      ]);
      setHealth(h);
      setSparkStatus(s);
    } catch {
      // Handled silently
    } finally {
      setIsPolling(false);
    }
  }, []);

  useEffect(() => {
    pollServiceStatus();
    const interval = setInterval(pollServiceStatus, 10000);
    return () => clearInterval(interval);
  }, [pollServiceStatus]);

  // File Management
  const handleSelectFile = (file: ProjectFile) => {
    if (file.isFolder) return;
    if (!openTabs.some((t) => t.id === file.id)) {
      setOpenTabs((prev) => [...prev, file]);
    }
    setActiveFile(file);
    if (file.name.endsWith('.sql') || file.language === 'sql') {
      setEditorMode('sql');
    } else if (file.name.endsWith('.py') || file.language === 'python') {
      setEditorMode('pyspark');
    }
  };

  const handleCloseTab = (fileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = openTabs.filter((t) => t.id !== fileId);
    setOpenTabs(filtered);

    if (activeFile?.id === fileId) {
      const nextActive = filtered.length > 0 ? filtered[filtered.length - 1] : null;
      setActiveFile(nextActive);
      if (nextActive?.name.endsWith('.sql')) setEditorMode('sql');
      else if (nextActive?.name.endsWith('.py')) setEditorMode('pyspark');
    }
  };

  const handleContentChange = (newContent: string) => {
    if (!activeFile) return;
    const updatedFile = { ...activeFile, content: newContent };
    setActiveFile(updatedFile);

    // Update in files tree
    const updateRecursive = (list: ProjectFile[]): ProjectFile[] =>
      list.map((item) => {
        if (item.id === updatedFile.id) return updatedFile;
        if (item.children) return { ...item, children: updateRecursive(item.children) };
        return item;
      });

    setFiles(updateRecursive(files));
    setOpenTabs((prev) => prev.map((t) => (t.id === updatedFile.id ? updatedFile : t)));
  };

  const handleToggleEditorMode = (mode: 'pyspark' | 'sql') => {
    setEditorMode(mode);
    if (mode === 'sql') {
      const sqlFile = files.find((f) => f.name === 'query.sql') || INITIAL_FILES[1];
      if (sqlFile) {
        handleSelectFile(sqlFile);
      }
    } else {
      const pyFile = files.find((f) => f.name === 'main.py') || INITIAL_FILES[0];
      if (pyFile) {
        handleSelectFile(pyFile);
      }
    }
  };

  const handleNewFile = () => {
    const filename = prompt('Enter new file name (e.g. query.sql or transform.py):');
    if (!filename) return;

    const newFile: ProjectFile = {
      id: `file-${Date.now()}`,
      name: filename,
      path: `/${filename}`,
      language: filename.endsWith('.sql') ? 'sql' : filename.endsWith('.py') ? 'python' : filename.endsWith('.csv') ? 'csv' : 'text',
      content: filename.endsWith('.sql') ? `-- Spark SQL: ${filename}\nSELECT * FROM ecommerce LIMIT 10;\n` : `# Spark Script: ${filename}\n`,
    };

    setFiles((prev) => [...prev, newFile]);
    setOpenTabs((prev) => [...prev, newFile]);
    setActiveFile(newFile);
    if (newFile.language === 'sql') setEditorMode('sql');
    else if (newFile.language === 'python') setEditorMode('pyspark');
    addLog('INFO', 'FileManager', `Created file ${filename}`);
  };

  // Select Job from History
  const handleSelectHistoryJob = useCallback((item: ExecutionHistoryItem) => {
    setExecutionResult(item.result);
    setBottomTab(item.result.dataframe ? 'result' : 'output');
    setIsBottomPanelOpen(true);
    addLog('INFO', 'HistoryManager', `Loaded historical execution ${item.job_id} (${item.language.toUpperCase()}).`);
  }, [addLog]);

  // Select Query from Query History
  const handleSelectQuery = useCallback((item: QueryHistoryItem) => {
    if (item.language === 'sql') {
      setEditorMode('sql');
      const targetFile = files.find((f) => f.name === 'query.sql') || files.find((f) => f.name.endsWith('.sql'));
      if (targetFile) {
        const updated = { ...targetFile, content: item.query };
        setActiveFile(updated);
        handleContentChange(item.query);
      } else {
        const newFile: ProjectFile = {
          id: `file-${Date.now()}`,
          name: 'query.sql',
          path: '/query.sql',
          language: 'sql',
          content: item.query,
        };
        setFiles((prev) => [...prev, newFile]);
        setOpenTabs((prev) => [...prev, newFile]);
        setActiveFile(newFile);
      }
    } else {
      setEditorMode('pyspark');
      const targetFile = files.find((f) => f.name === 'main.py') || files.find((f) => f.name.endsWith('.py'));
      if (targetFile) {
        const updated = { ...targetFile, content: item.query };
        setActiveFile(updated);
        handleContentChange(item.query);
      } else {
        const newFile: ProjectFile = {
          id: `file-${Date.now()}`,
          name: 'main.py',
          path: '/main.py',
          language: 'python',
          content: item.query,
        };
        setFiles((prev) => [...prev, newFile]);
        setOpenTabs((prev) => [...prev, newFile]);
        setActiveFile(newFile);
      }
    }
    addLog('INFO', 'HistoryManager', `Restored ${item.language.toUpperCase()} query to editor.`);
  }, [files, addLog]);

  // Spark Subprocess Execution Handler
  const handleRun = useCallback(async () => {
    if (isRunning || !activeFile) return;

    const isSql = activeFile.language === 'sql' || activeFile.name.endsWith('.sql') || editorMode === 'sql';
    const jobId = `${isSql ? 'sql' : 'job'}-${Math.random().toString(36).substr(2, 8)}`;
    const queryCode = activeFile.content;
    setActiveJobId(jobId);
    setIsRunning(true);
    setIsBottomPanelOpen(true);
    setBottomTab('output');

    const recordExecutionHistory = (res: SparkExecutionResult, lang: 'sql' | 'pyspark') => {
      const hItem: ExecutionHistoryItem = {
        id: `exec-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        job_id: res.job_id,
        query: queryCode,
        language: lang,
        status: res.success ? 'SUCCESS' : 'FAILED',
        duration_ms: res.execution_time_ms,
        row_count: res.dataframe?.row_count || 0,
        timestamp: new Date().toLocaleTimeString(),
        error: res.error,
        result: res,
      };
      setJobHistory((prev) => [hItem, ...prev.slice(0, 49)]);

      const qItem: QueryHistoryItem = {
        id: `query-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        query: queryCode,
        language: lang,
        timestamp: new Date().toLocaleTimeString(),
        success: res.success,
        row_count: res.dataframe?.row_count || 0,
      };
      setQueryHistory((prev) => [qItem, ...prev.filter((q) => q.query.trim() !== queryCode.trim()).slice(0, 29)]);
    };

    if (isSql) {
      addLog('INFO', 'SparkSQL', `Executing Spark SQL query against auto-registered views (${jobId})...`);
      addLog('DEBUG', 'SparkSQL', 'Analyzing SQL syntax and Catalyst execution plan...');

      try {
        const result = await executeSparkSQL(queryCode, jobId);
        setExecutionResult(result);
        recordExecutionHistory(result, 'sql');

        if (result.success) {
          addLog(
            'INFO',
            'SparkSQL',
            `Spark SQL query succeeded in ${result.execution_time_ms} ms.`
          );

          if (result.dataframe) {
            setBottomTab('result');
            addLog(
              'INFO',
              'SparkSQL',
              `Query returned ${result.dataframe.row_count} rows across ${result.dataframe.columns.length} columns.`
            );
          } else {
            setBottomTab('output');
          }

          setStages([
            { id: 0, name: 'Stage 0: Dataset View Registration & AST Parse', status: 'COMPLETED', duration: `${Math.round(result.execution_time_ms * 0.30)} ms`, tasks: '1/1' },
            { id: 1, name: 'Stage 1: Catalyst Optimizer & Physical Plan Evaluation', status: 'COMPLETED', duration: `${Math.round(result.execution_time_ms * 0.50)} ms`, tasks: '1/1', shuffleRead: '3.8 KB' },
            { id: 2, name: 'Stage 2: Materialization & Result Delivery', status: 'COMPLETED', duration: `${Math.round(result.execution_time_ms * 0.20)} ms`, tasks: '1/1', shuffleWrite: '1.5 KB' },
          ]);
        } else {
          setBottomTab('output');
          addLog(
            'ERROR',
            'SparkSQL',
            `Spark SQL query failed: ${result.error || 'SQL Error'}`
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'SQL execution error';
        addLog('ERROR', 'SparkSQL', `SQL error: ${msg}`);
        const failResult: SparkExecutionResult = {
          job_id: jobId,
          success: false,
          exit_code: 1,
          stdout: `=== Spark SQL Execution Error ===\nJob ID: ${jobId}\n`,
          stderr: msg,
          execution_time_ms: 0,
          error: msg,
        };
        setExecutionResult(failResult);
        recordExecutionHistory(failResult, 'sql');
      } finally {
        setIsRunning(false);
        setActiveJobId(null);
      }

    } else {
      // PySpark Subprocess Execution
      addLog('INFO', 'SparkEngine', `Submitting ${activeFile.name} to PySpark Subprocess Executor (${jobId})...`);
      addLog('DEBUG', 'SparkEngine', 'Spawning Python process with bound JAVA_HOME & SPARK_HOME...');

      try {
        const result = await executeSparkCode(queryCode, jobId);
        setExecutionResult(result);
        recordExecutionHistory(result, 'pyspark');

        if (result.success) {
          addLog(
            'INFO',
            'SparkEngine',
            `Job ${jobId} finished with Exit Code 0 in ${result.execution_time_ms} ms.`
          );

          if (result.dataframe) {
            setBottomTab('result');
            addLog(
              'INFO',
              'SparkEngine',
              `Materialized DataFrame: ${result.dataframe.row_count} rows across ${result.dataframe.columns.length} columns.`
            );
          } else {
            setBottomTab('output');
          }

          setStages([
            { id: 0, name: 'Stage 0: Python Subprocess & SparkContext Spawn', status: 'COMPLETED', duration: `${Math.round(result.execution_time_ms * 0.35)} ms`, tasks: '1/1' },
            { id: 1, name: 'Stage 1: DataFrame Transformations & DAG Evaluation', status: 'COMPLETED', duration: `${Math.round(result.execution_time_ms * 0.45)} ms`, tasks: '1/1', shuffleRead: '5.2 KB' },
            { id: 2, name: 'Stage 2: Actions & Clean Session Termination', status: 'COMPLETED', duration: `${Math.round(result.execution_time_ms * 0.20)} ms`, tasks: '1/1', shuffleWrite: '2.1 KB' },
          ]);
        } else {
          setBottomTab('output');
          addLog(
            'ERROR',
            'SparkEngine',
            `Job ${jobId} failed with Exit Code ${result.exit_code}: ${result.error || 'Execution Error'}`
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown execution error';
        addLog('ERROR', 'SparkEngine', `Execution error: ${msg}`);
        const failResult: SparkExecutionResult = {
          job_id: jobId,
          success: false,
          exit_code: -1,
          stdout: '',
          stderr: msg,
          execution_time_ms: 0,
          error: msg,
        };
        setExecutionResult(failResult);
        recordExecutionHistory(failResult, 'pyspark');
      } finally {
        setIsRunning(false);
        setActiveJobId(null);
      }
    }
  }, [isRunning, activeFile, editorMode, addLog]);

  // Stop / Process Cancellation Handler
  const handleStop = useCallback(async () => {
    if (!isRunning) return;

    if (activeJobId) {
      addLog('WARN', 'SparkEngine', `Cancelling running job ${activeJobId}...`);
      try {
        await cancelSparkJob(activeJobId);
        addLog('INFO', 'SparkEngine', `Job ${activeJobId} process tree terminated.`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to cancel job';
        addLog('ERROR', 'SparkEngine', `Error cancelling job: ${msg}`);
      }
    }

    setIsRunning(false);
    setActiveJobId(null);
  }, [isRunning, activeJobId, addLog]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Enter or Cmd+Enter: Run
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRun();
      }
      // Ctrl+B: Toggle Sidebar
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsSidebarOpen((prev) => !prev);
      }
      // Ctrl+J: Toggle Bottom Panel
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setIsBottomPanelOpen((prev) => !prev);
      }
      // Escape: Close Settings
      if (e.key === 'Escape') {
        setIsSettingsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRun]);

  return (
    <div className="ide-layout">
      {/* Hidden File Input for Bottom Panel Upload Button */}
      <input
        type="file"
        ref={globalFileInputRef}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUploadDataset(f);
          if (globalFileInputRef.current) globalFileInputRef.current.value = '';
        }}
        accept=".csv,text/csv"
        style={{ display: 'none' }}
      />

      {/* 1. Top Bar */}
      <TopBar
        health={health}
        sparkStatus={sparkStatus}
        isRunning={isRunning}
        onRun={handleRun}
        onStop={handleStop}
        onRefresh={pollServiceStatus}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        isBottomPanelOpen={isBottomPanelOpen}
        onToggleBottomPanel={() => setIsBottomPanelOpen(!isBottomPanelOpen)}
        isSparkPanelOpen={isSparkPanelOpen}
        onToggleSparkPanel={() => setIsSparkPanelOpen(!isSparkPanelOpen)}
      />

      {/* 2. Main Workbench */}
      <div className="ide-workbench">
        {/* Left Sidebar */}
        {isSidebarOpen && (
          <Sidebar
            files={files}
            activeFileId={activeFile?.id || ''}
            onSelectFile={handleSelectFile}
            onNewFile={handleNewFile}
            datasets={datasets}
            selectedDatasetName={selectedDatasetName}
            onSelectDataset={handleSelectDataset}
            onUploadDataset={handleUploadDataset}
            onDeleteDataset={handleDeleteDataset}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            queryHistory={queryHistory}
            onSelectQuery={handleSelectQuery}
          />
        )}

        {/* Center Editor & Bottom Panel Area */}
        <div className="ide-center-column">
          <main className="ide-editor-area">
            <Editor
              openTabs={openTabs}
              activeFile={activeFile}
              onSelectTab={setActiveFile}
              onCloseTab={handleCloseTab}
              onContentChange={handleContentChange}
              settings={settings}
              editorMode={editorMode}
              onToggleMode={handleToggleEditorMode}
              datasets={datasets}
            />
          </main>

          {/* Bottom Panel */}
          {isBottomPanelOpen && (
            <BottomPanel
              activeTab={bottomTab}
              onTabChange={setBottomTab}
              onClose={() => setIsBottomPanelOpen(false)}
              executionResult={executionResult}
              isRunning={isRunning}
              logs={logs}
              onClearLogs={() => setLogs([])}
              stages={stages}
              datasets={datasets}
              selectedDatasetName={selectedDatasetName}
              onSelectDataset={handleSelectDataset}
              activeDatasetPreview={activeDatasetPreview}
              isLoadingDataset={isLoadingDataset}
              onUploadClick={() => globalFileInputRef.current?.click()}
              onDeleteDataset={handleDeleteDataset}
              jobHistory={jobHistory}
              onSelectHistoryJob={handleSelectHistoryJob}
            />
          )}
        </div>

        {/* Right Spark Status Panel */}
        {isSparkPanelOpen && (
          <SparkPanel
            sparkStatus={sparkStatus}
            health={health}
            onRefresh={pollServiceStatus}
            isLoading={isPolling}
          />
        )}
      </div>

      {/* 3. Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={(newSettings) => {
          setSettings(newSettings);
          addLog('INFO', 'Settings', 'IDE and Spark preferences updated.');
        }}
      />
    </div>
  );
};

export default App;
