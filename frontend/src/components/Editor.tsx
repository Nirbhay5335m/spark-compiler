import React from 'react';
import MonacoEditor, { OnMount } from '@monaco-editor/react';
import { 
  X, 
  FileCode, 
  ChevronRight, 
  Layers, 
  FileSpreadsheet, 
  Database,
  Terminal,
  Code
} from 'lucide-react';
import { ProjectFile, IDESettings, DatasetItem } from '../types';

interface EditorProps {
  openTabs: ProjectFile[];
  activeFile: ProjectFile | null;
  onSelectTab: (file: ProjectFile) => void;
  onCloseTab: (fileId: string, e: React.MouseEvent) => void;
  onContentChange: (content: string) => void;
  settings: IDESettings;
  editorMode: 'pyspark' | 'sql';
  onToggleMode: (mode: 'pyspark' | 'sql') => void;
  datasets?: DatasetItem[];
}

export const Editor: React.FC<EditorProps> = ({
  openTabs,
  activeFile,
  onSelectTab,
  onCloseTab,
  onContentChange,
  settings,
  editorMode,
  onToggleMode,
  datasets = [],
}) => {
  const datasetsRef = React.useRef<DatasetItem[]>(datasets);
  datasetsRef.current = datasets;

  const handleEditorDidMount: OnMount = (_editor, monaco) => {
    // Custom editor theme configuration
    monaco.editor.defineTheme('sparkDarkTheme', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'ff79c6', fontStyle: 'bold' },
        { token: 'string', foreground: 'f1fa8c' },
        { token: 'number', foreground: 'bd93f9' },
        { token: 'function', foreground: '50fa7b' },
      ],
      colors: {
        'editor.background': '#0c111c',
        'editor.foreground': '#f8fafc',
        'editor.lineHighlightBackground': '#1e293b55',
        'editorLineNumber.foreground': '#475569',
        'editorLineNumber.activeForeground': '#f59e0b',
        'editorIndentGuide.background1': '#1e293b',
        'editorIndentGuide.activeBackground1': '#f59e0b44',
      },
    });
    monaco.editor.setTheme('sparkDarkTheme');

    // Register Spark SQL Autocomplete Provider (Ctrl+Space)
    monaco.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems: (model: any, position: any) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions: any[] = [];
        const currentDatasets = datasetsRef.current;

        // 1. Dynamic Dataset / Temporary Table Names
        currentDatasets.forEach((dataset) => {
          const tableName = dataset.filename.replace(/\.csv$/i, '').replace(/[^a-zA-Z0-9_]/g, '_');
          suggestions.push({
            label: tableName,
            kind: monaco.languages.CompletionItemKind.Struct,
            insertText: tableName,
            detail: `Table (${dataset.row_count} rows, CSV View)`,
            documentation: `Temporary Spark SQL view auto-registered from '${dataset.filename}'.`,
            range,
          });

          // 2. Columns with Inferred Types
          if (dataset.schema && Array.isArray(dataset.schema)) {
            dataset.schema.forEach((colField: { name: string; type: string }) => {
              suggestions.push({
                label: colField.name,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: colField.name,
                detail: `Column: ${colField.type} (in ${tableName})`,
                documentation: `Column '${colField.name}' of type '${colField.type}' in table '${tableName}'.`,
                range,
              });
            });
          } else if (Array.isArray(dataset.columns)) {
            dataset.columns.forEach((colName) => {
              suggestions.push({
                label: colName,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: colName,
                detail: `Column in ${tableName}`,
                documentation: `Column '${colName}' in table '${tableName}'.`,
                range,
              });
            });
          }
        });

        // 3. Spark SQL Keywords & Snippets
        const sqlKeywords = [
          'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT',
          'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN',
          'ON', 'AS', 'DISTINCT', 'UNION ALL', 'UNION', 'WITH', 'OVER', 'PARTITION BY',
          'DESC', 'ASC', 'BETWEEN', 'LIKE', 'IN', 'IS NULL', 'IS NOT NULL', 'AND', 'OR', 'NOT',
          'COUNT(*)', 'SUM()', 'AVG()', 'MIN()', 'MAX()', 'ROUND()', 'COALESCE()',
          'CAST()', 'CASE WHEN', 'THEN', 'ELSE', 'END'
        ];

        sqlKeywords.forEach((kw) => {
          suggestions.push({
            label: kw,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: kw,
            detail: 'Spark SQL Keyword',
            range,
          });
        });

        return { suggestions };
      },
    });
  };

  const getTabIcon = (filename: string) => {
    if (filename.endsWith('.py')) return <FileCode size={14} className="file-icon python" />;
    if (filename.endsWith('.sql')) return <Database size={14} className="file-icon sql" />;
    if (filename.endsWith('.csv')) return <FileSpreadsheet size={14} className="file-icon csv" />;
    if (filename.endsWith('.json')) return <Database size={14} className="file-icon json" />;
    return <FileCode size={14} className="file-icon text" />;
  };

  const activeLanguage = activeFile?.name.endsWith('.sql') 
    ? 'sql' 
    : (activeFile?.language || (editorMode === 'sql' ? 'sql' : 'python'));

  return (
    <div className="editor-wrapper">
      {/* Tabs bar */}
      <div className="editor-tabs-bar">
        <div className="tabs-list">
          {openTabs.map((tab) => {
            const isActive = activeFile?.id === tab.id;
            return (
              <div
                key={tab.id}
                className={`editor-tab ${isActive ? 'active' : ''}`}
                onClick={() => onSelectTab(tab)}
              >
                {getTabIcon(tab.name)}
                <span className="tab-name">{tab.name}</span>
                <button
                  className="tab-close-btn"
                  onClick={(e) => onCloseTab(tab.id, e)}
                  title="Close tab"
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Mode Switcher Pill */}
        <div className="editor-mode-switch-container">
          <div className="editor-mode-pills">
            <button
              className={`mode-pill ${editorMode === 'pyspark' ? 'active' : ''}`}
              onClick={() => onToggleMode('pyspark')}
              title="Switch to PySpark DataFrame Pipeline Editor"
            >
              <Code size={12} />
              <span>PySpark</span>
            </button>
            <button
              className={`mode-pill ${editorMode === 'sql' ? 'active' : ''}`}
              onClick={() => onToggleMode('sql')}
              title="Switch to Spark SQL Query Editor"
            >
              <Database size={12} />
              <span>Spark SQL</span>
            </button>
          </div>
        </div>
      </div>

      {/* Breadcrumb Path Bar */}
      {activeFile && (
        <div className="editor-breadcrumbs">
          <div className="breadcrumbs-left">
            <Layers size={13} className="breadcrumb-icon" />
            <span className="breadcrumb-segment">spark-compiler</span>
            <ChevronRight size={12} className="breadcrumb-sep" />
            {activeFile.path.split('/').filter(Boolean).map((part, idx, arr) => (
              <React.Fragment key={idx}>
                <span className={`breadcrumb-segment ${idx === arr.length - 1 ? 'current' : ''}`}>
                  {part}
                </span>
                {idx < arr.length - 1 && <ChevronRight size={12} className="breadcrumb-sep" />}
              </React.Fragment>
            ))}
          </div>

          <div className="breadcrumbs-right">
            <span className={`lang-badge ${activeLanguage}`}>
              {activeLanguage.toUpperCase()}
            </span>
          </div>
        </div>
      )}

      {/* Monaco Code Editor Canvas */}
      <div className="editor-canvas">
        {activeFile ? (
          <MonacoEditor
            height="100%"
            language={activeLanguage}
            value={activeFile.content}
            theme="vs-dark"
            onChange={(val) => onContentChange(val || '')}
            onMount={handleEditorDidMount}
            options={{
              fontSize: settings.fontSize,
              lineNumbers: 'on',
              minimap: { enabled: settings.minimap },
              scrollBeyondLastLine: false,
              wordWrap: settings.wordWrap,
              automaticLayout: true,
              tabSize: 4,
              insertSpaces: true,
              fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace",
              fontLigatures: true,
              cursorBlinking: 'smooth',
              smoothScrolling: true,
              renderLineHighlight: 'all',
              bracketPairColorization: { enabled: true },
            }}
          />
        ) : (
          <div className="empty-editor-placeholder">
            <Terminal size={40} className="empty-icon" />
            <p>Select a file from the explorer or create a new one to begin editing.</p>
          </div>
        )}
      </div>
    </div>
  );
};
