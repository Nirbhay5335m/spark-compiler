import React, { useState, useRef } from 'react';
import { 
  Folder, 
  FolderOpen, 
  FileCode, 
  FileText, 
  FileSpreadsheet, 
  ChevronRight, 
  ChevronDown, 
  Plus, 
  Search, 
  Code2, 
  Database,
  Upload,
  Loader2,
  Trash2,
  History
} from 'lucide-react';
import { ProjectFile, DatasetItem, QueryHistoryItem } from '../types';

interface SidebarProps {
  files: ProjectFile[];
  activeFileId: string;
  onSelectFile: (file: ProjectFile) => void;
  onNewFile: () => void;
  datasets: DatasetItem[];
  selectedDatasetName: string;
  onSelectDataset: (filename: string) => void;
  onUploadDataset: (file: File) => Promise<void>;
  onDeleteDataset: (filename: string, e: React.MouseEvent) => void;
  isUploading: boolean;
  uploadProgress: number;
  queryHistory?: QueryHistoryItem[];
  onSelectQuery?: (item: QueryHistoryItem) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  files,
  activeFileId,
  onSelectFile,
  onNewFile,
  datasets,
  selectedDatasetName,
  onSelectDataset,
  onUploadDataset,
  onDeleteDataset,
  isUploading,
  uploadProgress,
  queryHistory = [],
  onSelectQuery,
}) => {
  const [filterText, setFilterText] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    'workspace-root': true,
    'section-datasets': true,
    'section-history': true,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleFolder = (id: string) => {
    setExpandedFolders((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await onUploadDataset(file);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const getFileIcon = (file: ProjectFile) => {
    if (file.isFolder) {
      return expandedFolders[file.id] ? (
        <FolderOpen size={16} className="file-icon folder" />
      ) : (
        <Folder size={16} className="file-icon folder" />
      );
    }
    if (file.name.endsWith('.py')) {
      return <FileCode size={16} className="file-icon python" />;
    }
    if (file.name.endsWith('.csv')) {
      return <FileSpreadsheet size={16} className="file-icon csv" />;
    }
    if (file.name.endsWith('.json')) {
      return <Database size={16} className="file-icon json" />;
    }
    return <FileText size={16} className="file-icon text" />;
  };

  const renderFileTree = (items: ProjectFile[], depth = 0) => {
    return items
      .filter((item) => {
        if (!filterText) return true;
        if (item.name.toLowerCase().includes(filterText.toLowerCase())) return true;
        if (item.children?.some((c) => c.name.toLowerCase().includes(filterText.toLowerCase()))) return true;
        return false;
      })
      .map((item) => {
        const isExpanded = expandedFolders[item.id] ?? false;
        const isActive = activeFileId === item.id;

        if (item.isFolder) {
          return (
            <div key={item.id} className="file-tree-group">
              <div 
                className="file-tree-item folder-item"
                style={{ paddingLeft: `${depth * 14 + 10}px` }}
                onClick={() => toggleFolder(item.id)}
              >
                <span className="chevron-icon">
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
                {getFileIcon(item)}
                <span className="file-name">{item.name}</span>
              </div>
              {isExpanded && item.children && (
                <div className="folder-children">
                  {renderFileTree(item.children, depth + 1)}
                </div>
              )}
            </div>
          );
        }

        return (
          <div
            key={item.id}
            className={`file-tree-item ${isActive ? 'active' : ''}`}
            style={{ paddingLeft: `${depth * 14 + 24}px` }}
            onClick={() => onSelectFile(item)}
          >
            {getFileIcon(item)}
            <span className="file-name">{item.name}</span>
          </div>
        );
      });
  };

  const isDatasetsExpanded = expandedFolders['section-datasets'] ?? true;

  return (
    <aside className="sidebar-container">
      {/* Hidden File Input for CSV Upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".csv,text/csv"
        style={{ display: 'none' }}
      />

      {/* Explorer Header */}
      <div className="sidebar-header">
        <div className="sidebar-title-row">
          <span className="sidebar-title">EXPLORER</span>
          <div className="sidebar-header-actions">
            <button 
              className="icon-btn-tiny"
              onClick={() => fileInputRef.current?.click()}
              title="Upload Dataset (CSV)"
              aria-label="Upload Dataset"
              disabled={isUploading}
            >
              {isUploading ? <Loader2 size={14} className="spin-icon" /> : <Upload size={14} />}
            </button>
            <button 
              className="icon-btn-tiny"
              onClick={onNewFile}
              title="Create New File"
              aria-label="New File"
            >
              <Plus size={15} />
            </button>
          </div>
        </div>

        {/* File search filter */}
        <div className="sidebar-search-box">
          <Search size={13} className="search-icon" />
          <input 
            type="text" 
            placeholder="Search files & datasets..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="sidebar-search-input"
          />
        </div>
      </div>

      {/* Upload Progress Indicator */}
      {isUploading && (
        <div className="sidebar-upload-banner">
          <div className="upload-banner-header">
            <div className="upload-meta">
              <Loader2 size={13} className="spin-icon" />
              <span>Uploading dataset...</span>
            </div>
            <span className="upload-pct">{uploadProgress}%</span>
          </div>
          <div className="progress-bar-track">
            <div 
              className="progress-bar-fill"
              style={{ width: `${Math.max(5, uploadProgress)}%` }}
            />
          </div>
        </div>
      )}

      {/* File Tree & Datasets Section */}
      <div className="sidebar-file-tree">
        {/* Project Files */}
        <div className="tree-project-root">
          <Code2 size={14} className="root-icon" />
          <span>WORKSPACE</span>
        </div>
        {renderFileTree(files)}

        {/* Datasets Section */}
        <div className="sidebar-datasets-section">
          <div 
            className="section-header-row"
            onClick={() => toggleFolder('section-datasets')}
          >
            <div className="section-header-left">
              <span className="chevron-icon">
                {isDatasetsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              <Database size={14} className="dataset-section-icon" />
              <span className="section-header-title">DATASETS</span>
            </div>
            <button
              className="section-add-btn"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              title="Upload CSV dataset"
            >
              <Plus size={12} />
            </button>
          </div>

          {isDatasetsExpanded && (
            <div className="datasets-list">
              {datasets
                .filter((d) => !filterText || d.filename.toLowerCase().includes(filterText.toLowerCase()))
                .map((dataset) => {
                  const isSelected = selectedDatasetName === dataset.filename;
                  const sizeKb = (dataset.size_bytes / 1024).toFixed(1);

                  return (
                    <div
                      key={dataset.filename}
                      className={`dataset-tree-item ${isSelected ? 'active' : ''}`}
                      onClick={() => onSelectDataset(dataset.filename)}
                      title={`${dataset.filename} (${dataset.row_count} rows, ${sizeKb} KB)`}
                    >
                      <FileSpreadsheet size={15} className="file-icon csv" />
                      <div className="dataset-item-info">
                        <span className="dataset-item-name">{dataset.filename}</span>
                        <span className="dataset-item-meta">
                          {dataset.row_count > 0 ? `${dataset.row_count} rows` : `${sizeKb} KB`}
                        </span>
                      </div>
                      {!dataset.is_sample && (
                        <button
                          className="dataset-trash-btn"
                          onClick={(e) => onDeleteDataset(dataset.filename, e)}
                          title={`Delete ${dataset.filename}`}
                          aria-label={`Delete ${dataset.filename}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  );
                })}

              {datasets.length === 0 && (
                <div 
                  className="dataset-empty-action"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={13} />
                  <span>Click to upload CSV</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Query History Section */}
        <div className="sidebar-history-section">
          <div 
            className="section-header-row"
            onClick={() => toggleFolder('section-history')}
          >
            <div className="section-header-left">
              <span className="chevron-icon">
                {expandedFolders['section-history'] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              <History size={14} className="history-section-icon" />
              <span className="section-header-title">QUERY HISTORY</span>
            </div>
            <span className="history-count-pill">{queryHistory.length}</span>
          </div>

          {expandedFolders['section-history'] && (
            <div className="history-query-list">
              {queryHistory.slice(0, 15).map((item) => {
                const firstLine = item.query.trim().split('\n')[0] || 'Query';
                return (
                  <div
                    key={item.id}
                    className="history-query-item"
                    onClick={() => onSelectQuery && onSelectQuery(item)}
                    title={`Click to load into editor:\n${item.query.substring(0, 200)}`}
                  >
                    <div className="history-query-top">
                      <span className={`query-lang-tag ${item.language}`}>
                        {item.language === 'sql' ? 'SQL' : 'PY'}
                      </span>
                      <span className="query-snippet">
                        {firstLine.length > 26 ? firstLine.substring(0, 24) + '…' : firstLine}
                      </span>
                    </div>
                    <div className="history-query-sub">
                      <span className="query-time">{item.timestamp}</span>
                      <span className={`query-status-dot ${item.success ? 'success' : 'failed'}`} />
                    </div>
                  </div>
                );
              })}

              {queryHistory.length === 0 && (
                <div className="history-empty-hint">
                  <span>No recent queries yet</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sidebar Footer Info */}
      <div className="sidebar-footer">
        <div className="env-tag">
          <span className="env-badge">SPARK</span>
          <div className="env-details">
            <span className="env-name">Storage: data/uploads/</span>
            <span className="env-sub">{datasets.length} datasets ready</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
