import { useState, useMemo } from 'react'
import './AllergenResults.css'

function AllergenResults({ results, selectedAllergens, onEditAllergens, onReset }) {
  const [activeFilter, setActiveFilter] = useState('All')

  // Function to parse description and highlight allergen mentions
  const parseDescription = (description, category) => {
    if (!description) return null

    const parts = []
    let lastIndex = 0
    const regex = /\[([^\]]+)\]/g
    let match

    while ((match = regex.exec(description)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(description.substring(lastIndex, match.index))
      }

      // Add highlighted text
      parts.push(
        <span
          key={match.index}
          className={`allergen-highlight ${category === 'avoid' ? 'avoid' : ''}`}
        >
          {match[1]}
        </span>
      )

      lastIndex = match.index + match[0].length
    }

    // Add remaining text
    if (lastIndex < description.length) {
      parts.push(description.substring(lastIndex))
    }

    return parts.length > 0 ? parts : description
  }

  // Categorize results
  const categorized = useMemo(() => {
    const safe = results.filter(item => item.category === 'safe')
    const askStaff = results.filter(item => item.category === 'ask-staff')
    const avoid = results.filter(item => item.category === 'avoid')

    return { safe, askStaff, avoid }
  }, [results])

  // Get filtered results based on active filter
  const filteredResults = useMemo(() => {
    switch (activeFilter) {
      case 'Safe':
        return categorized.safe
      case 'Ask staff':
        return categorized.askStaff
      case 'Avoid':
        return categorized.avoid
      default:
        return results
    }
  }, [activeFilter, results, categorized])

  return (
    <div className="allergen-results">
      <h2>Allergen results</h2>

      {/* Screening Section */}
      <div className="screening-section">
        <span className="screening-label">Screening for:</span>
        <div className="screening-chips">
          {selectedAllergens.map((allergen, index) => (
            <span key={index} className="screening-chip">{allergen}</span>
          ))}
        </div>
        <button className="edit-btn" onClick={onEditAllergens}>Edit</button>
      </div>

      {/* Disclaimer */}
      <div className="disclaimer-warning">
        <strong>⚠️ Important:</strong> This is an automated suggestion only. Always double check with the restaurant directly about allergens and ingredients. This tool may not detect all allergens or cross-contamination risks.
      </div>

      {/* Summary Counts */}
      <div className="summary-counts">
        <div className="count-item safe-count">
          <div className="count-number">{categorized.safe.length}</div>
          <div className="count-label">Safe</div>
        </div>
        <div className="count-item ask-count">
          <div className="count-number">{categorized.askStaff.length}</div>
          <div className="count-label">Ask staff</div>
        </div>
        <div className="count-item avoid-count">
          <div className="count-number">{categorized.avoid.length}</div>
          <div className="count-label">Avoid</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="filter-tabs">
        <button
          className={`filter-tab ${activeFilter === 'All' ? 'active' : ''}`}
          onClick={() => setActiveFilter('All')}
        >
          All ({results.length})
        </button>
        <button
          className={`filter-tab ${activeFilter === 'Safe' ? 'active' : ''}`}
          onClick={() => setActiveFilter('Safe')}
        >
          Safe ({categorized.safe.length})
        </button>
        <button
          className={`filter-tab ${activeFilter === 'Ask staff' ? 'active' : ''}`}
          onClick={() => setActiveFilter('Ask staff')}
        >
          Ask staff ({categorized.askStaff.length})
        </button>
        <button
          className={`filter-tab ${activeFilter === 'Avoid' ? 'active' : ''}`}
          onClick={() => setActiveFilter('Avoid')}
        >
          Avoid ({categorized.avoid.length})
        </button>
      </div>

      {/* Results */}
      <div className="results-container">
        {(activeFilter === 'All' || activeFilter === 'Safe') && categorized.safe.length > 0 && (
          <div className="results-section">
            <h3 className="section-header safe-header">SAFE TO EAT</h3>
            {categorized.safe.map((item, index) => (
              <div key={index} className="menu-item safe-item">
                <div className="item-indicator safe-indicator"></div>
                <div className="item-content">
                  <h4 className="item-name">{item.name}</h4>
                  <p className="item-description">
                    {parseDescription(item.description, 'safe')}
                  </p>
                  {item.tags && item.tags.length > 0 && (
                    <div className="item-tags">
                      {item.tags.map((tag, i) => (
                        <span key={i} className="item-tag safe-tag">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {(activeFilter === 'All' || activeFilter === 'Ask staff') && categorized.askStaff.length > 0 && (
          <div className="results-section">
            <h3 className="section-header ask-header">ASK THE STAFF</h3>
            {categorized.askStaff.map((item, index) => (
              <div key={index} className="menu-item ask-item">
                <div className="item-indicator ask-indicator"></div>
                <div className="item-content">
                  <h4 className="item-name">{item.name}</h4>
                  <p className="item-description">
                    {parseDescription(item.description, 'ask-staff')}
                  </p>
                  {item.reason && (
                    <p className="item-reason ask-reason">{item.reason}</p>
                  )}
                  {item.questions && item.questions.length > 0 && (
                    <div className="item-questions ask-questions">
                      <p className="questions-label">Ask your waiter:</p>
                      <ul className="questions-list">
                        {item.questions.map((q, i) => (
                          <li key={i} className="question-item">{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {item.tags && item.tags.length > 0 && (
                    <div className="item-tags">
                      {item.tags.map((tag, i) => (
                        <span key={i} className="item-tag ask-tag">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {(activeFilter === 'All' || activeFilter === 'Avoid') && categorized.avoid.length > 0 && (
          <div className="results-section">
            <h3 className="section-header avoid-header">AVOID</h3>
            {categorized.avoid.map((item, index) => (
              <div key={index} className="menu-item avoid-item">
                <div className="item-indicator avoid-indicator"></div>
                <div className="item-content">
                  <h4 className="item-name">{item.name}</h4>
                  <p className="item-description">
                    {parseDescription(item.description, 'avoid')}
                  </p>
                  {item.reason && (
                    <p className="item-reason avoid-reason">{item.reason}</p>
                  )}
                  {item.questions && item.questions.length > 0 && (
                    <div className="item-questions avoid-questions">
                      <p className="questions-label">Ask your waiter:</p>
                      <ul className="questions-list">
                        {item.questions.map((q, i) => (
                          <li key={i} className="question-item">{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {item.tags && item.tags.length > 0 && (
                    <div className="item-tags">
                      {item.tags.map((tag, i) => (
                        <span key={i} className="item-tag avoid-tag">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action Button */}
      <button className="scan-another-btn" onClick={onReset}>
        Scan another menu
      </button>
    </div>
  )
}

export default AllergenResults
