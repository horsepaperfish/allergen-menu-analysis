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
  'Corn'
]

function AllergenSelector({ onContinue, initialAllergens = null }) {
  const [selectedAllergens, setSelectedAllergens] = useState([])
  const [customAllergen, setCustomAllergen] = useState('')

  useEffect(() => {
    // If initialAllergens is provided (editing existing selection), use that
    // Otherwise, start fresh with empty selection
    if (initialAllergens !== null) {
      setSelectedAllergens(initialAllergens)
    }
  }, [initialAllergens])

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
    onContinue(selectedAllergens)
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      addCustomAllergen()
    }
  }

  // Get custom allergens (ones not in the common list)
  const customAllergens = selectedAllergens.filter(
    allergen => !COMMON_ALLERGENS.includes(allergen)
  )

  return (
    <div className="allergen-selector">
      <div className="selector-header">
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

        {customAllergens.length > 0 && (
          <div className="allergen-chips" style={{ marginTop: '12px' }}>
            {customAllergens.map(allergen => (
              <button
                key={allergen}
                className="allergen-chip selected"
                onClick={() => toggleAllergen(allergen)}
              >
                {allergen}
                <span className="close-icon">×</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="tip-text">
        Tip: you can select multiple allergens.
      </p>

      <button className="continue-btn" onClick={handleContinue}>
        Continue
      </button>
    </div>
  )
}

export default AllergenSelector
