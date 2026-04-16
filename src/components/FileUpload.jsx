import { useState, useRef } from 'react'
import './FileUpload.css'

function FileUpload({ onFileSelect }) {
  const [isDragging, setIsDragging] = useState(false)
  const cameraInputRef = useRef(null)
  const fileInputRef = useRef(null)

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      onFileSelect(files)
    }
  }

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files)
    if (files.length > 0) {
      onFileSelect(files)
    }
  }

  const handleCameraClick = () => {
    cameraInputRef.current?.click()
  }

  const handleBoxClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="upload-container">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.png,.jpg,.jpeg,image/*"
        multiple
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <div className="upload-options">
        <button className="upload-btn camera-btn" onClick={handleCameraClick}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          Take Photo
        </button>
      </div>

      <p className="or-divider">or</p>

      <div
        className={`file-upload ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleBoxClick}
      >
        <div className="upload-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>

        <h2>Upload Files</h2>
        <p className="drag-text">Drag and drop files here or click to browse</p>
        <p className="file-types">Supports PDF, PNG, JPG (multiple files allowed)</p>
      </div>
    </div>
  )
}

export default FileUpload
