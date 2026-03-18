import { useState, useMemo } from 'react'
import './AllergenResults.css'

function AllergenResults({ results }) {
  const [selectedAllergen, setSelectedAllergen] = useState('All')

  const allergenColors = {
    'Dairy': '#f59e0b',
    'Eggs': '#fbbf24',
    'Fish': '#60a5fa',
    'Shellfish': '#3b82f6',
    'Tree Nuts': '#b45309',
    'Peanuts': '#92400e',
    'Wheat': '#eab308',
    'Soy': '#a3e635',
    'Gluten': '#facc15',
    'Sesame': '#d97706',
    'Corn': '#fde047',
    'Mustard': '#fef08a',
    'Celery': '#84cc16',
    'Lupin': '#a78bfa',
    'Molluscs': '#818cf8',
    'Sulfites': '#f472b6'
  }

  // Get all unique allergens from results
  const allAllergens = useMemo(() => {
    const allergenSet = new Set()
    results.forEach(item => {
      if (item.allergens) {
        item.allergens.forEach(allergen => allergenSet.add(allergen))
      }
    })
    return Array.from(allergenSet).sort()
  }, [results])

  // Filter results based on selected allergen
  const filteredResults = useMemo(() => {
    if (selectedAllergen === 'All') {
      return results
    }
    return results.filter(item =>
      item.allergens && item.allergens.includes(selectedAllergen)
    )
  }, [results, selectedAllergen])

  return (
    <div className="allergen-results">
      <h2>Allergen Analysis</h2>

      <div className="disclaimer-warning">
        <strong>⚠️ Important:</strong> This is an automated suggestion only. Always double check with the restaurant directly about allergens and ingredients. This tool may not detect all allergens or cross-contamination risks.
      </div>

      <div className="allergen-filters">
        <button
          className={`filter-tab ${selectedAllergen === 'All' ? 'active' : ''}`}
          onClick={() => setSelectedAllergen('All')}
        >
          All Items ({results.length})
        </button>
        {allAllergens.map(allergen => {
          const count = results.filter(item =>
            item.allergens && item.allergens.includes(allergen)
          ).length
          return (
            <button
              key={allergen}
              className={`filter-tab ${selectedAllergen === allergen ? 'active' : ''}`}
              onClick={() => setSelectedAllergen(allergen)}
              style={{
                borderBottomColor: selectedAllergen === allergen ? allergenColors[allergen] : 'transparent'
              }}
            >
              {allergen} ({count})
            </button>
          )
        })}
      </div>

      <div className="results-grid">
        {filteredResults.map((item, index) => (
          <div key={index} className="menu-item-card">
            <h3>{item.name}</h3>
            {item.allergens && item.allergens.length > 0 ? (
              <div className="allergen-tags">
                {item.allergens.map((allergen, i) => (
                  <span
                    key={i}
                    className="allergen-tag"
                    style={{ backgroundColor: allergenColors[allergen] || '#64748b' }}
                  >
                    {allergen}
                  </span>
                ))}
              </div>
            ) : (
              <p className="no-allergens">No common allergens detected</p>
            )}
            {item.description && (
              <p className="item-description">{item.description}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default AllergenResults
