import { useState } from 'react'
import './App.css'
import FileUpload from './components/FileUpload'
import AllergenResults from './components/AllergenResults'

function App() {
  const [analyzing, setAnalyzing] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState({ current: 0, total: 0 })

  const handleFileUpload = async (files) => {
    setAnalyzing(true)
    setError(null)
    setResults(null)
    setProgress({ current: 0, total: files.length })

    try {
      // Process all files
      const allAllergens = []
      const errors = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setProgress({ current: i + 1, total: files.length })

        try {
          const formData = new FormData()
          formData.append('file', file)

          const response = await fetch('/api/analyze', {
            method: 'POST',
            body: formData,
          })

          if (!response.ok) {
            const errorData = await response.json()
            errors.push(`${file.name}: ${errorData.error || 'Failed to analyze'}`)
            continue
          }

          const data = await response.json()
          allAllergens.push(...data.allergens)
        } catch (err) {
          errors.push(`${file.name}: ${err.message}`)
        }
      }

      if (errors.length > 0 && allAllergens.length === 0) {
        throw new Error(errors.join(', '))
      }

      if (errors.length > 0) {
        setError(`Some files failed: ${errors.join(', ')}`)
      }

      setResults(allAllergens)
    } catch (err) {
      setError(err.message)
    } finally {
      setAnalyzing(false)
      setProgress({ current: 0, total: 0 })
    }
  }

  return (
    <div className="app">
      <div className="floating-circle"></div>

      <div className="content">
        <header>
          <h1>Allergen Menu Analyzer</h1>
          <p className="subtitle">Upload a food menu to identify potential allergens</p>
        </header>

        <main>
          {!results && !analyzing && (
            <FileUpload onFileSelect={handleFileUpload} />
          )}

          {analyzing && (
            <div className="analyzing">
              <div className="spinner"></div>
              <p>
                Analyzing menu for allergens...
                {progress.total > 1 && ` (${progress.current}/${progress.total})`}
              </p>
            </div>
          )}

          {error && (
            <div className="error">
              <p>{error}</p>
              <button onClick={() => setError(null)}>Try Again</button>
            </div>
          )}

          {results && !analyzing && (
            <>
              <AllergenResults results={results} />
              <button className="reset-btn" onClick={() => setResults(null)}>
                Analyze Another Menu
              </button>
            </>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
