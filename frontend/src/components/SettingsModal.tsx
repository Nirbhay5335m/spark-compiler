import React, { useState } from 'react';
import { X, Settings as SettingsIcon, Save, RotateCcw, Sliders, Monitor } from 'lucide-react';
import { IDESettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: IDESettings;
  onSave: (newSettings: IDESettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
}) => {
  const [formData, setFormData] = useState<IDESettings>(settings);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  const handleReset = () => {
    const defaultSettings: IDESettings = {
      sparkMaster: 'local[1]',
      driverMemory: '2g',
      shufflePartitions: 1,
      autoSave: true,
      fontSize: 13,
      wordWrap: 'on',
      minimap: true,
    };
    setFormData(defaultSettings);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-row">
            <SettingsIcon size={18} className="modal-title-icon" />
            <h2 className="modal-title">Settings & Preferences</h2>
          </div>
          <button className="icon-btn-tiny" onClick={onClose} aria-label="Close settings">
            <X size={16} />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSave} className="modal-form">
          <div className="modal-body">
            {/* Spark Cluster Section */}
            <div className="settings-section">
              <div className="section-title-row">
                <Sliders size={15} color="var(--primary)" />
                <h3 className="section-title">Spark Execution Engine</h3>
              </div>

              <div className="form-group">
                <label className="form-label">Spark Master URL</label>
                <select
                  className="form-select"
                  value={formData.sparkMaster}
                  onChange={(e) => setFormData({ ...formData, sparkMaster: e.target.value })}
                >
                  <option value="local[1]">local[1] (Single Core • Dev Mode)</option>
                  <option value="local[*]">local[*] (All Available Cores)</option>
                  <option value="spark://localhost:7077">Standalone Cluster (spark://localhost:7077)</option>
                </select>
                <span className="form-hint">Controls the Spark cluster deployment master target.</span>
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label className="form-label">Driver Memory</label>
                  <select
                    className="form-select"
                    value={formData.driverMemory}
                    onChange={(e) => setFormData({ ...formData, driverMemory: e.target.value })}
                  >
                    <option value="1g">1 GB</option>
                    <option value="2g">2 GB (Recommended)</option>
                    <option value="4g">4 GB</option>
                    <option value="8g">8 GB</option>
                  </select>
                </div>

                <div className="form-group flex-1">
                  <label className="form-label">Shuffle Partitions</label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    className="form-input"
                    value={formData.shufflePartitions}
                    onChange={(e) => setFormData({ ...formData, shufflePartitions: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>
            </div>

            {/* Editor Preferences Section */}
            <div className="settings-section">
              <div className="section-title-row">
                <Monitor size={15} color="var(--accent-cyan)" />
                <h3 className="section-title">Editor Experience</h3>
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label className="form-label">Font Size</label>
                  <select
                    className="form-select"
                    value={formData.fontSize}
                    onChange={(e) => setFormData({ ...formData, fontSize: parseInt(e.target.value) })}
                  >
                    <option value={12}>12 px</option>
                    <option value={13}>13 px (Default)</option>
                    <option value={14}>14 px</option>
                    <option value={16}>16 px</option>
                  </select>
                </div>

                <div className="form-group flex-1">
                  <label className="form-label">Word Wrap</label>
                  <select
                    className="form-select"
                    value={formData.wordWrap}
                    onChange={(e) => setFormData({ ...formData, wordWrap: e.target.value as 'on' | 'off' })}
                  >
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </select>
                </div>
              </div>

              <div className="form-checkbox-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.minimap}
                    onChange={(e) => setFormData({ ...formData, minimap: e.target.checked })}
                  />
                  <span>Show Monaco Code Minimap</span>
                </label>
              </div>
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={handleReset}>
              <RotateCcw size={14} />
              <span>Reset Defaults</span>
            </button>
            <div className="footer-right-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                <Save size={14} />
                <span>Save Preferences</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
