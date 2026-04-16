import { useState, useRef } from 'react'
import './FileUpload.css'

function FileUpload({ onFileSelect, onTextAnalyze, selectedAllergens, onEditAllergens }) {
  const [isDragging, setIsDragging] = useState(false)
  const [pastedText, setPastedText] = useState('')
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

  const handleBoxClick = () => {
    fileInputRef.current?.click()
  }

  const handleAnalyze = () => {
    if (pastedText.trim()) {
      onTextAnalyze(pastedText.trim())
    }
  }

  return (
    <div className="upload-container">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.png,.jpg,.jpeg,image/*"
        multiple
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <div className="screening-section">
        <span className="screening-label">Screening for:</span>
        <div className="screening-chips">
          {selectedAllergens.map((allergen, index) => (
            <span key={index} className="screening-chip">{allergen}</span>
          ))}
        </div>
        <button className="edit-btn" onClick={onEditAllergens}>Edit</button>
      </div>

      <div
        className={`file-upload ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleBoxClick}
      >
        <div className="upload-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </div>

        <h2>Upload a menu photo</h2>
        <p className="file-types">JPG, PNG, or PDF</p>
      </div>

      <p className="or-divider">OR</p>

      <textarea
        className="paste-area"
        placeholder="Paste menu items here..."
        value={pastedText}
        onChange={(e) => setPastedText(e.target.value)}
      ></textarea>

      <button
        className={`analyze-btn ${!pastedText.trim() ? 'disabled' : ''}`}
        onClick={handleAnalyze}
        disabled={!pastedText.trim()}
      >
        Analyze menu
      </button>
    </div>
  )
}

export default FileUpload
