import React, { useRef, useState } from 'react';

interface RideUploadZoneProps {
  uploading: boolean;
  uploadMsg: string | null;
  onHandleFiles: (files: FileList) => void;
}

export const RideUploadZone: React.FC<RideUploadZoneProps> = ({
  uploading,
  uploadMsg,
  onHandleFiles,
}) => {
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <div
        className={`wd-upload-zone wd-upload-zone--empty ${dragOver ? 'wd-upload-zone--over' : ''} ${uploading ? 'wd-upload-zone--loading' : ''}`}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) onHandleFiles(e.dataTransfer.files);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileRef.current?.click()}
        style={{
          margin: '0',
          padding: '30px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px dashed rgba(255, 255, 255, 0.12)',
          borderRadius: '16px',
          background: 'rgba(255, 255, 255, 0.01)',
          cursor: 'pointer',
          transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".fit,.gpx,.tcx"
          hidden
          onChange={(e) => e.target.files && onHandleFiles(e.target.files)}
        />
        {uploading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8' }}>
            <span className="wd-spinner" />
            <span style={{ fontSize: 12, fontWeight: 700 }}>Uploading...</span>
          </div>
        ) : (
          <>
            <span style={{ fontSize: '32px', marginBottom: '8px', filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.15))' }}>📥</span>
            <span style={{ fontWeight: 800, color: '#f8fafc', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Importeer Activiteit</span>
            <span style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', marginTop: 4, lineHeight: 1.5, maxWidth: '200px' }}>
              Drag your <strong>.fit</strong>, <strong>.gpx</strong> or <strong>.tcx</strong> files here or click to browse
            </span>
          </>
        )}
      </div>
      {uploadMsg && (
        <div className="wd-upload-msg" style={{ 
          marginTop: 10, 
          padding: '8px 12px', 
          borderRadius: 8, 
          background: uploadMsg.toLowerCase().includes('success') ? 'rgba(46, 204, 113, 0.1)' : 'rgba(231, 76, 60, 0.1)', 
          border: `1px solid ${uploadMsg.toLowerCase().includes('success') ? 'rgba(46, 204, 113, 0.2)' : 'rgba(231, 76, 60, 0.2)'}`, 
          color: uploadMsg.toLowerCase().includes('success') ? '#2ecc71' : '#e74c3c', 
          fontSize: 10, 
          fontWeight: 700, 
          textAlign: 'center' 
        }}>
          {uploadMsg}
        </div>
      )}
    </>
  );
};
