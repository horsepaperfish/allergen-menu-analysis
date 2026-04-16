import { useState, useEffect } from 'react'
import './AllergenSelector.css'

const COMMON_ALLERGENS = [
  'Peanuts',
  'Tree Nuts',
  'Dairy',
  'Gluten',
  'Shellfish',
  'Eggs',
  'Soy',
  'Fish',
  'Sesame',
  'Wheat',
  'Corn',
  'Mustard',
  'Celery',
  'Sulfites'
]

function AllergenSelector({ onContinue }) {
  const [selectedAllergens, setSelectedAllergens] = useState([])
  const [customAllergen, setCustomAllergen] = useState('')

  useEffect(() => {
    // Load saved allergen profile from localStorage
    const savedAllergens = localStorage.getItem('allergenProfile')
    if (savedAllergens) {
      try {
        setSelectedAllergens(JSON.parse(savedAllergens))
      } catch (e) {
        console.error('Failed to load allergen profile')
      }
    }
  }, [])

  const toggleAllergen = (allergen) => {
    setSelectedAllergens(prev => {
      if (prev.includes(allergen)) {
        return prev.filter(a => a !== allergen)
      } else {
        return [...prev, allergen]
      }
    })
  }

  const addCustomAllergen = () => {
    const trimmed = customAllergen.trim()
    if (trimmed && !selectedAllergens.includes(trimmed)) {
      setSelectedAllergens(prev => [...prev, trimmed])
      setCustomAllergen('')
    }
  }

  const handleContinue = () => {
    if (selectedAllergens.length === 0) {
      alert('Please select at least one allergen')
      return
    }
    // Save to localStorage
    localStorage.setItem('allergenProfile', JSON.stringify(selectedAllergens))
    onContinue(selectedAllergens)
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      addCustomAllergen()
    }
  }

  return (
    <div className="allergen-selector">
      <div className="selector-header">
        <div className="logo-circle">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        </div>
        <h1>Allergen Menu Analyzer</h1>
        <p className="selector-subtitle">Select your allergies, then scan any menu</p>
      </div>

      <div className="allergen-section">
        <h3>Common allergens</h3>
        <div className="allergen-chips">
          {COMMON_ALLERGENS.map(allergen => (
            <button
              key={allergen}
              className={`allergen-chip ${selectedAllergens.includes(allergen) ? 'selected' : ''}`}
              onClick={() => toggleAllergen(allergen)}
            >
              {allergen}
              {selectedAllergens.includes(allergen) && (
                <span className="close-icon">×</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="custom-allergen-section">
        <h3>Add other</h3>
        <div className="custom-input-group">
          <input
            type="text"
            placeholder="e.g. mustard, sulfites, celery..."
            value={customAllergen}
            onChange={(e) => setCustomAllergen(e.target.value)}
            onKeyPress={handleKeyPress}
          />
          <button onClick={addCustomAllergen}>Add</button>
        </div>
      </div>

      <p className="tip-text">
        Tip: you can select multiple allergens. Your profile will be saved for next time.
      </p>

      <button className="continue-btn" onClick={handleContinue}>
        Continue
      </button>
    </div>
  )
}

export default AllergenSelector
