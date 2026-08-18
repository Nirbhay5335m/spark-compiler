export interface HealthStatus {
  status: string;
  service: string;
  environment: string;
  timestamp: string;
  uptime_seconds: number;
  latency_ms?: number;
}

export interface SparkStatus {
  status: string;
  spark_available: boolean;
  spark_version: string | null;
  spark_home: string | null;
  java_available: boolean;
  java_version: string | null;
  java_home: string | null;
  pyspark_available: boolean;
  message: string;
  latency_ms?: number;
}

export interface SparkTestResult {
  success: boolean;
  execution_time_ms: number;
  rows_processed: number;
  spark_version?: string;
  app_name?: string;
  results: Record<string, any>[];
  summary?: Record<string, any>;
  error?: string;
}

export interface SchemaField {
  name: string;
  type: string;
}

export interface DataFrameResult {
  columns: string[];
  schema: SchemaField[];
  rows: Record<string, any>[];
  row_count: number;
}

export interface SparkExecutionResult {
  job_id: string;
  success: boolean;
  exit_code: number;
  stdout: string;
  stderr: string;
  execution_time_ms: number;
  dataframe?: DataFrameResult | null;
  error?: string | null;
}

export interface SparkCancelResult {
  job_id: string;
  cancelled: boolean;
  message: string;
}

export interface DatasetItem {
  filename: string;
  path: string;
  size_bytes: number;
  columns: string[];
  schema?: SchemaField[];
  row_count: number;
  modified_at: string;
  is_sample?: boolean;
}

export interface DatasetPreview {
  filename: string;
  path: string;
  size_bytes: number;
  total_rows: number;
  columns: string[];
  schema: SchemaField[];
  rows: Record<string, any>[];
  partitions: number;
}

export interface DatasetUploadResult {
  filename: string;
  original_name: string;
  path: string;
  size_bytes: number;
  row_count: number;
  columns: string[];
  schema: SchemaField[];
  uploaded_at: string;
}

export interface ProjectFile {
  id: string;
  name: string;
  path: string;
  language: string;
  content: string;
  isFolder?: boolean;
  children?: ProjectFile[];
  isExpanded?: boolean;
  isDataset?: boolean;
  datasetName?: string;
}

export interface SparkJobStage {
  id: number;
  name: string;
  status: 'COMPLETED' | 'RUNNING' | 'PENDING' | 'FAILED';
  duration: string;
  tasks: string;
  shuffleRead?: string;
  shuffleWrite?: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  message: string;
  source: string;
}

export interface IDESettings {
  sparkMaster: string;
  driverMemory: string;
  shufflePartitions: number;
  autoSave: boolean;
  fontSize: number;
  wordWrap: 'on' | 'off';
  minimap: boolean;
}

export interface ExecutionHistoryItem {
  id: string;
  job_id: string;
  query: string;
  language: 'sql' | 'pyspark';
  status: 'SUCCESS' | 'FAILED' | 'CANCELLED';
  duration_ms: number;
  row_count: number;
  timestamp: string;
  error?: string | null;
  result: SparkExecutionResult;
}

export interface QueryHistoryItem {
  id: string;
  query: string;
  language: 'sql' | 'pyspark';
  timestamp: string;
  success: boolean;
  row_count: number;
}

