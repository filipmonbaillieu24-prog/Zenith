import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, AlertTriangle, CheckCircle, Bug, Loader } from 'lucide-react';
import './BugReportModal.css';

export interface BugReportSubmitData {
  title: string;
  description: string;
  category: string;
  problemType: string;
  severity: string;
  screenshot: File | null;
  screenshots: File[];
  developerToken?: string;
  developerRepo?: string;
}

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: BugReportSubmitData) => Promise<{ success: boolean; error?: string; githubUrl?: string }>;
  prefilledCategory: string | null;
}

export const BugReportModal: React.FC<BugReportModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  prefilledCategory,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('hub');
  const [problemType, setProblemType] = useState('ui');
  const [severity, setSeverity] = useState('medium');
  
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [screenshotPreviews, setScreenshotPreviews] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; error?: string; githubUrl?: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Reset form on open
      setTitle('');
      setDescription('');
      setCategory(prefilledCategory || 'hub');
      setProblemType('ui');
      setSeverity('medium');
      setScreenshots([]);
      setScreenshotPreviews([]);
      setSubmitResult(null);
    }
  }, [isOpen, prefilledCategory]);

  // Handle category prefill changes
  useEffect(() => {
    if (prefilledCategory) {
      setCategory(prefilledCategory);
    }
  }, [prefilledCategory]);

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFiles = (files: FileList) => {
    const newFiles: File[] = [];
    
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) {
        alert(`Bestand "${file.name}" is geen afbeelding.`);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert(`Afbeelding "${file.name}" is te groot (max 5MB).`);
        return;
      }
      newFiles.push(file);
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setScreenshotPreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
    
    setScreenshots(prev => [...prev, ...newFiles]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  const handleRemoveScreenshot = (index: number) => {
    setScreenshots(prev => prev.filter((_, i) => i !== index));
    setScreenshotPreviews(prev => prev.filter((_, i) => i !== index));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      alert('Vul a.u.b. alle verplichte velden in.');
      return;
    }

    setIsSubmitting(true);
    setSubmitResult(null);

    try {
      const result = await onSubmit({
        title,
        description,
        category,
        problemType,
        severity,
        screenshot: screenshots.length > 0 ? screenshots[0] : null,
        screenshots,
        developerToken: undefined,
        developerRepo: undefined,
      });
      setSubmitResult(result);
    } catch (err: any) {
      setSubmitResult({
        success: false,
        error: err?.message || 'Er is een onbekende fout opgetreden bij het verzenden van het rapport.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bug-modal-overlay animate-fade-in" onClick={onClose}>
      <div className="bug-modal-content animate-slide-up" onClick={(e) => e.stopPropagation()}>
        
        {/* Modal Header */}
        <div className="bug-modal-header">
          <div className="bug-header-title">
            <Bug className="bug-icon-accent" size={20} />
            <h2>Bug Rapporteren</h2>
          </div>
          <button className="bug-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="bug-modal-body">
          {submitResult && submitResult.success ? (
            <div className="bug-success-state animate-fade-in">
              <CheckCircle className="bug-success-icon" size={64} />
              <h3>Bug Succesvol Gerapporteerd!</h3>
              <p>Het probleem is geregistreerd en er is een GitHub issue aangemaakt.</p>
              {submitResult.githubUrl && (
                <a 
                  href={submitResult.githubUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="bug-github-link-btn"
                >
                  Bekijk op GitHub
                </a>
              )}
              <button className="bug-action-btn primary" onClick={onClose} style={{ marginTop: '20px' }}>
                Sluiten
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bug-form">
              {submitResult && !submitResult.success && (
                <div className="bug-error-alert animate-fade-in">
                  <AlertTriangle size={18} />
                  <span>{submitResult.error}</span>
                </div>
              )}

              {/* Form Row: Category & Problem Type */}
              <div className="bug-form-row">
                <div className="bug-form-group">
                  <label htmlFor="category">Categorie/Component *</label>
                  <select 
                    id="category" 
                    value={category} 
                    onChange={(e) => setCategory(e.target.value)}
                    required
                  >
                    <option value="hub">Zenith Hub (Algemeen)</option>
                    <option value="aero">Zenith Aero (Extensie)</option>
                    <option value="vigor">Zenith Vigor (Extensie)</option>
                    <option value="kratos">Zenith Kratos (Extensie)</option>
                    <option value="fuel">Zenith Fuel (Extensie)</option>
                    <option value="mobiel">Zenith Mobiel (APK)</option>
                    <option value="other">Overig</option>
                  </select>
                </div>

                <div className="bug-form-group">
                  <label htmlFor="problemType">Type probleem *</label>
                  <select 
                    id="problemType" 
                    value={problemType} 
                    onChange={(e) => setProblemType(e.target.value)}
                    required
                  >
                    <option value="ui">UI / Visuele Bug</option>
                    <option value="functional">Functionaliteit / Crash</option>
                    <option value="performance">Prestaties / Traagheid</option>
                    <option value="sync">Data-synchronisatie</option>
                    <option value="bluetooth">Bluetooth / BLE Koppeling</option>
                    <option value="feature">Suggestie / Feature Request</option>
                    <option value="other">Overig</option>
                  </select>
                </div>
              </div>

              {/* Form Row: Severity & Title */}
              <div className="bug-form-row">
                <div className="bug-form-group severity-group">
                  <label htmlFor="severity">Urgentie *</label>
                  <div className="severity-selector">
                    {['low', 'medium', 'high', 'critical'].map((sev) => (
                      <button
                        key={sev}
                        type="button"
                        className={`severity-btn ${sev} ${severity === sev ? 'active' : ''}`}
                        onClick={() => setSeverity(sev)}
                      >
                        {sev === 'low' && 'Laag'}
                        {sev === 'medium' && 'Medium'}
                        {sev === 'high' && 'Hoog'}
                        {sev === 'critical' && 'Kritiek'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bug-form-group">
                <label htmlFor="title">Titel / Korte omschrijving *</label>
                <input 
                  type="text" 
                  id="title" 
                  placeholder="Bijv. Bluetooth verbinding valt weg bij Vigor app"
                  value={title} 
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                  required
                />
              </div>

              <div className="bug-form-group">
                <label htmlFor="description">Gedetailleerde beschrijving *</label>
                <textarea 
                  id="description" 
                  placeholder="Beschrijf hier het probleem, de stappen om het te reproduceren en wat er zou moeten gebeuren..."
                  value={description} 
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  required
                />
              </div>

              {/* Image Upload Zone */}
              <div className="bug-form-group">
                <label>Screenshots / Foto's uploaden (optioneel, meerdere toegestaan)</label>
                
                {screenshotPreviews.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                    {screenshotPreviews.map((preview, idx) => (
                      <div key={idx} className="bug-preview-container" style={{ position: 'relative', width: 90, height: 90, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <img src={preview} alt={`Preview ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button 
                          type="button" 
                          onClick={() => handleRemoveScreenshot(idx)} 
                          style={{ 
                            position: 'absolute', 
                            top: 4, 
                            right: 4, 
                            background: 'rgba(0, 0, 0, 0.7)', 
                            color: '#fff', 
                            border: 'none', 
                            borderRadius: '50%', 
                            width: 18, 
                            height: 18, 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            cursor: 'pointer',
                            padding: 0
                          }}
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div 
                  className={`bug-upload-dropzone ${dragActive ? 'active' : ''}`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{ padding: '16px 20px', minHeight: 'auto' }}
                >
                  <Upload size={20} className="bug-upload-icon" style={{ marginBottom: 6 }} />
                  <p style={{ margin: '0 0 4px', fontSize: 11 }}>Sleep afbeeldingen hierheen of klik om te bladeren</p>
                  <span style={{ fontSize: 9, opacity: 0.6 }}>Maximale grootte: 5MB per bestand (PNG, JPG, GIF)</span>
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                  />
                </div>
              </div>



              {/* Modal Actions */}
              <div className="bug-modal-actions">
                <button type="button" className="bug-action-btn secondary" onClick={onClose} disabled={isSubmitting}>
                  Annuleren
                </button>
                <button type="submit" className="bug-action-btn primary" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader className="bug-spinner" size={16} />
                      Bezig met verzenden...
                    </>
                  ) : 'Verzenden naar GitHub'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
