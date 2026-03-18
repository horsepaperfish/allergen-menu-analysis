import './AllergenResults.css'

function AllergenResults({ results }) {
  const allergenColors = {
    'Dairy': '#f59e0b',
    'Eggs': '#fbbf24',
    'Fish': '#f59e0b',
    'Shellfish': '#d97706',
    'Tree Nuts': '#b45309',
    'Peanuts': '#92400e',
    'Wheat': '#eab308',
    'Soy': '#fbbf24',
    'Gluten': '#f59e0b',
    'Sesame': '#d97706'
  }

  return (
    <div className="allergen-results">
      <h2>Allergen Analysis</h2>
      <div className="results-grid">
        {results.map((item, index) => (
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
