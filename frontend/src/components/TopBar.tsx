import { 
  Flame, 
  Play, 
  Square, 
  Settings as SettingsIcon, 
  PanelLeft, 
  PanelBottom, 
  Cpu, 
  RefreshCw, 
  Clock 
} from 'lucide-react';
import { HealthStatus, SparkStatus } from '../types';

interface TopBarProps {
  health: HealthStatus | null;
  sparkStatus: SparkStatus | null;
  isRunning: boolean;
  onRun: () => void;
  onStop: () => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  isBottomPanelOpen: boolean;
  onToggleBottomPanel: () => void;
  isSparkPanelOpen: boolean;
  onToggleSparkPanel: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  health,
  sparkStatus,
  isRunning,
  onRun,
  onStop,
  onRefresh,
  onOpenSettings,
  isSidebarOpen,
  onToggleSidebar,
  isBottomPanelOpen,
  onToggleBottomPanel,
  isSparkPanelOpen,
  onToggleSparkPanel,
}) => {
  const isHealthy = health?.status === 'healthy';
  const isSparkReady = sparkStatus?.spark_available === true;

  return (
    <header className="topbar">
      {/* Left: Branding & Window actions */}
      <div className="topbar-left">
        <button 
          className={`icon-btn ${isSidebarOpen ? 'active' : ''}`}
          onClick={onToggleSidebar}
          title="Toggle File Explorer (Ctrl+B)"
          aria-label="Toggle Sidebar"
        >
          <PanelLeft size={18} />
        </button>

        <div className="brand-badge">
          <div className="brand-icon-box">
            <Flame size={20} className="flame-icon" />
          </div>
          <div className="brand-text">
            <span className="brand-title">Spark Compiler</span>
            <span className="brand-version">v1.0 • Spark 4.2</span>
          </div>
        </div>
      </div>

      {/* Center: Execution & Control Actions */}
      <div className="topbar-center">
        <div className="action-button-group">
          <button 
            className={`btn-run ${isRunning ? 'running' : ''}`}
            onClick={onRun}
            disabled={isRunning}
            title="Execute Spark Job (Ctrl+Enter)"
          >
            {isRunning ? (
              <>
                <RefreshCw size={15} className="spin-icon" />
                <span>Running...</span>
              </>
            ) : (
              <>
                <Play size={15} fill="currentColor" />
                <span>Run</span>
              </>
            )}
          </button>

          <button 
            className="btn-stop"
            onClick={onStop}
            disabled={!isRunning}
            title="Stop Execution"
          >
            <Square size={14} fill="currentColor" />
            <span>Stop</span>
          </button>
        </div>

        {/* Live Status Pill */}
        <div className="status-pill" onClick={onRefresh} title="Click to refresh service status">
          <span 
            className={`status-indicator-dot ${
              isHealthy && isSparkReady ? 'healthy' : isHealthy ? 'warning' : 'error'
            }`} 
          />
          <span className="status-text">
            {isHealthy && isSparkReady 
              ? 'Spark Ready' 
              : isHealthy 
              ? 'Degraded' 
              : 'Disconnected'}
          </span>
          {health?.latency_ms !== undefined && (
            <span className="status-latency">
              <Clock size={11} />
              {health.latency_ms}ms
            </span>
          )}
        </div>
      </div>

      {/* Right: Panel Toggles & Settings */}
      <div className="topbar-right">
        <button 
          className={`icon-btn ${isBottomPanelOpen ? 'active' : ''}`}
          onClick={onToggleBottomPanel}
          title="Toggle Terminal & Output Panel (Ctrl+J)"
          aria-label="Toggle Bottom Panel"
        >
          <PanelBottom size={18} />
        </button>

        <button 
          className={`icon-btn ${isSparkPanelOpen ? 'active' : ''}`}
          onClick={onToggleSparkPanel}
          title="Toggle Spark Runtime Inspector"
          aria-label="Toggle Spark Inspector"
        >
          <Cpu size={18} />
        </button>

        <div className="topbar-divider" />

        <button 
          className="icon-btn"
          onClick={onOpenSettings}
          title="IDE & Spark Settings"
          aria-label="Settings"
        >
          <SettingsIcon size={18} />
        </button>
      </div>
    </header>
  );
};
