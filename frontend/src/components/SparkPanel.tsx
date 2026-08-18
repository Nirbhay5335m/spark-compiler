import { 
  Cpu, 
  CheckCircle2, 
  XCircle, 
  Zap, 
  RefreshCw, 
  Info
} from 'lucide-react';
import { SparkStatus, HealthStatus } from '../types';

interface SparkPanelProps {
  sparkStatus: SparkStatus | null;
  health: HealthStatus | null;
  onRefresh: () => void;
  isLoading: boolean;
}

export const SparkPanel: React.FC<SparkPanelProps> = ({
  sparkStatus,
  health,
  onRefresh,
  isLoading,
}) => {
  return (
    <aside className="spark-panel-container">
      {/* Panel Header */}
      <div className="spark-panel-header">
        <div className="spark-panel-title">
          <Cpu size={16} className="panel-title-icon" />
          <span>Spark Runtime</span>
        </div>
        <button
          className="icon-btn-tiny"
          onClick={onRefresh}
          disabled={isLoading}
          title="Refresh Spark Diagnostics"
        >
          <RefreshCw size={13} className={isLoading ? 'spin-icon' : ''} />
        </button>
      </div>

      <div className="spark-panel-scroll">
        {/* Readiness Card */}
        <div className="spark-card status-card">
          <div className="status-header">
            <div className="status-title-box">
              <span className="status-label">Engine State</span>
              <span className="status-value">
                {sparkStatus?.spark_available ? 'READY' : 'UNAVAILABLE'}
              </span>
            </div>
            {sparkStatus?.spark_available ? (
              <CheckCircle2 size={24} color="var(--accent-emerald)" />
            ) : (
              <XCircle size={24} color="var(--accent-rose)" />
            )}
          </div>
          <p className="status-desc">
            {sparkStatus?.message || 'Inspecting local Java and Spark environment...'}
          </p>
        </div>

        {/* Runtime Metrics List */}
        <div className="spark-card">
          <h4 className="card-section-title">Environment & Runtime</h4>

          <div className="metric-row">
            <span className="metric-name">Spark Version:</span>
            <span className="metric-value font-mono">
              {sparkStatus?.spark_version || 'Not Detected'}
            </span>
          </div>

          <div className="metric-row">
            <span className="metric-name">Java Runtime:</span>
            <span className="metric-value font-mono" title={sparkStatus?.java_version || ''}>
              {sparkStatus?.java_version ? 'OpenJDK 17.0.20' : 'Missing'}
            </span>
          </div>

          <div className="metric-row">
            <span className="metric-name">PySpark Bridge:</span>
            <span className="metric-value">
              {sparkStatus?.pyspark_available ? (
                <span className="badge-pill success">Connected</span>
              ) : (
                <span className="badge-pill error">Offline</span>
              )}
            </span>
          </div>

          <div className="metric-row">
            <span className="metric-name">Spark Home:</span>
            <span className="metric-value font-mono" title={sparkStatus?.spark_home || ''}>
              {sparkStatus?.spark_home || 'N/A'}
            </span>
          </div>
        </div>

        {/* Cluster & Driver Configuration */}
        <div className="spark-card">
          <h4 className="card-section-title">Execution Context</h4>

          <div className="metric-row">
            <span className="metric-name">Master URL:</span>
            <span className="metric-value font-mono">local[1]</span>
          </div>

          <div className="metric-row">
            <span className="metric-name">Driver Host:</span>
            <span className="metric-value font-mono">127.0.0.1</span>
          </div>

          <div className="metric-row">
            <span className="metric-name">Lifecycle Mode:</span>
            <span className="metric-value" style={{ color: 'var(--accent-cyan)' }}>
              <Zap size={12} style={{ display: 'inline', marginRight: 4 }} />
              Lazy On-Demand
            </span>
          </div>

          <div className="metric-row">
            <span className="metric-name">Backend Uptime:</span>
            <span className="metric-value font-mono">
              {health ? `${Math.floor(health.uptime_seconds)}s` : 'Connecting...'}
            </span>
          </div>

          <div className="metric-row">
            <span className="metric-name">UI Port:</span>
            <span className="metric-value">Lightweight (Disabled)</span>
          </div>
        </div>

        {/* Diagnostic info note */}
        <div className="spark-info-box">
          <Info size={16} className="info-icon" />
          <div className="info-text">
            <strong>Zero Startup Overhead</strong>: SparkSession is instantiated on-demand only when a job is executed, avoiding continuous background resource consumption.
          </div>
        </div>
      </div>
    </aside>
  );
};
