import { useState } from 'react'
import './App.css'
import FileUpload from './components/FileUpload'
import AllergenResults from './components/AllergenResults'

function App() {
  const [analyzing, setAnalyzing] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)

  const handleFileUpload = async (file) => {
    setAnalyzing(true)
    setError(null)
    setResults(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to analyze menu')
      }

      const data = await response.json()
      setResults(data.allergens)
    } catch (err) {
      setError(err.message)
    } finally {
      setAnalyzing(false)
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
              <p>Analyzing menu for allergens...</p>
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
