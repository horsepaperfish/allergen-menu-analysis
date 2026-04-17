import { useState } from 'react'
import './App.css'
import AllergenSelector from './components/AllergenSelector'
import FileUpload from './components/FileUpload'
import AllergenResults from './components/AllergenResults'

function App() {
  const [step, setStep] = useState('select') // 'select', 'upload', 'results'
  const [selectedAllergens, setSelectedAllergens] = useState([])
  const [analyzing, setAnalyzing] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState({ current: 0, total: 0 })

  const handleAllergenSelection = (allergens) => {
    setSelectedAllergens(allergens)
    setStep('upload')
  }

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

        // Simulate gradual progress during file processing
        let simulatedProgress = 0
        const progressInterval = setInterval(() => {
          simulatedProgress += 0.5
          if (simulatedProgress < 95) {
            setProgress({ current: i + (simulatedProgress / 100), total: files.length })
          }
        }, 100)

        try {
          const formData = new FormData()
          formData.append('file', file)
          formData.append('allergens', JSON.stringify(selectedAllergens))

          const response = await fetch('/api/analyze', {
            method: 'POST',
            body: formData,
          })

          clearInterval(progressInterval)

          if (!response.ok) {
            const errorData = await response.json()
            errors.push(`${file.name}: ${errorData.error || 'Failed to analyze'}`)
            continue
          }

          const data = await response.json()
          allAllergens.push(...data.allergens)

          // Set to completed for this file
          setProgress({ current: i + 1, total: files.length })
        } catch (err) {
          clearInterval(progressInterval)
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
      setStep('results')
    } catch (err) {
      setError(err.message)
    } finally {
      setAnalyzing(false)
      setProgress({ current: 0, total: 0 })
    }
  }

  const handleTextAnalyze = async (menuText) => {
    setAnalyzing(true)
    setError(null)
    setResults(null)
    setProgress({ current: 0, total: 1 })

    // Simulate gradual progress
    let simulatedProgress = 0
    const progressInterval = setInterval(() => {
      simulatedProgress += 0.5
      if (simulatedProgress < 95) {
        setProgress({ current: simulatedProgress / 100, total: 1 })
      }
    }, 100)

    try {
      const response = await fetch('/api/analyze-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          menuText,
          allergens: selectedAllergens,
        }),
      })

      clearInterval(progressInterval)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to analyze menu')
      }

      const data = await response.json()
      setResults(data.allergens)
      setProgress({ current: 1, total: 1 })
      setStep('results')
    } catch (err) {
      clearInterval(progressInterval)
      setError(err.message)
    } finally {
      setAnalyzing(false)
      setProgress({ current: 0, total: 0 })
    }
  }

  const handleReset = () => {
    setResults(null)
    setError(null)
    setStep('upload')
  }

  const handleChangeAllergens = () => {
    setResults(null)
    setError(null)
    setStep('select')
  }

  const handleStartOver = () => {
    setSelectedAllergens([])
    setResults(null)
    setError(null)
    setStep('select')
  }

  return (
    <div className="app">
      <div className="floating-circle"></div>

      <div className="content">
        {step === 'select' && (
          <AllergenSelector
            onContinue={handleAllergenSelection}
            initialAllergens={selectedAllergens.length > 0 ? selectedAllergens : null}
          />
        )}

        {step === 'upload' && (
          <>
            <header>
              <h1>Scan menu</h1>
              <p className="subtitle">Upload or paste the menu to analyze</p>
            </header>

            <main>
              {!analyzing && (
                <FileUpload
                  onFileSelect={handleFileUpload}
                  onTextAnalyze={handleTextAnalyze}
                  selectedAllergens={selectedAllergens}
                  onEditAllergens={handleChangeAllergens}
                />
              )}

              {analyzing && (
                <div className="analyzing">
                  <div className="spinner"></div>
                  <p>Analyzing menu for allergens...</p>
                  {progress.total > 0 && (
                    <div className="progress-container">
                      <div
                        className="progress-bar"
                        style={{ width: `${(progress.current / progress.total) * 100}%` }}
                      ></div>
                      <div className="progress-text">
                        {Math.round((progress.current / progress.total) * 100)}%
                      </div>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="error">
                  <p>{error}</p>
                  <button onClick={() => setError(null)}>Try Again</button>
                </div>
              )}
            </main>
          </>
        )}

        {step === 'results' && (
          <main>
            <AllergenResults
              results={results}
              selectedAllergens={selectedAllergens}
              onEditAllergens={handleChangeAllergens}
              onReset={handleReset}
            />
          </main>
        )}
      </div>
    </div>
  )
}

export default App
