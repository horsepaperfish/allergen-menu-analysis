import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

async function analyzeMenuWithClaude(menuText, selectedAllergens = []) {
  const allergenList = selectedAllergens.length > 0
    ? selectedAllergens.join(', ')
    : 'Dairy, Eggs, Fish, Shellfish, Tree Nuts, Peanuts, Wheat, Soy, Gluten, Sesame, Corn, Mustard, Celery, Lupin, Molluscs, Sulfites'

  const message = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `Analyze the following food menu and categorize EVERY item based on these allergens: ${allergenList}

Categorize each item:
- "safe": No allergens detected, completely safe
- "ask-staff": Uncertain or may contain allergens (cross-contamination risk, "may contain", etc.)
- "avoid": Definitely contains one or more allergens

For EACH menu item, provide:
1. Item name
2. Category: "safe", "ask-staff", or "avoid"
3. Allergens found (empty array if safe)
4. Description with allergen mentions highlighted in [brackets] and concentration level
   - Example: "Coconut milk, vegetables, rice — [peanut paste sometimes used] (moderate amounts)"
   - Example: "Rice noodles, shrimp, bean sprouts, [crushed peanuts] (high amounts)"
   - Concentration levels: trace, low, moderate, high
5. Tags ONLY for allergens that are PRESENT in the item:
   - For "avoid" items: Include only the allergens detected (e.g., "Peanuts", "Dairy")
   - For "ask-staff" items: Add "— confirm" suffix (e.g., "Peanuts — confirm")
   - For "safe" items: Empty tags array (DO NOT include "X free" tags)

REQUIRED JSON format:
[
  {
    "name": "Item name",
    "category": "safe" or "ask-staff" or "avoid",
    "allergens": ["Allergen1", "Allergen2"] or [],
    "description": "Description with [allergen mentions in brackets] (concentration level)",
    "tags": ["Peanuts", "Dairy"] or ["Peanuts — confirm"] or []
  }
]

Menu text:
${menuText}

Return ONLY the JSON array with ALL menu items categorized.`
      }
    ]
  })

  const responseText = message.content[0].text

  // Try to extract JSON array from response
  const jsonMatch = responseText.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    console.error('No JSON array found in response')
    return []
  }

  try {
    const allergenData = JSON.parse(jsonMatch[0])
    return allergenData
  } catch (error) {
    console.error('JSON parse error:', error.message)
    console.error('Response text:', responseText.substring(0, 500))
    // Try to clean up common JSON errors
    try {
      const cleaned = jsonMatch[0]
        .replace(/,(\s*[}\]])/g, '$1')
        .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":')
      return JSON.parse(cleaned)
    } catch (retryError) {
      console.error('Retry parse also failed')
      return []
    }
  }
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { menuText, allergens } = req.body

    if (!menuText) {
      return res.status(400).json({ error: 'No menu text provided' })
    }

    console.log('Analyzing menu text, length:', menuText.length)
    console.log('Selected allergens:', allergens)

    const allergenData = await analyzeMenuWithClaude(menuText, allergens || [])

    res.status(200).json({ allergens: allergenData })
  } catch (error) {
    console.error('Error analyzing menu:', error)
    console.error('Error stack:', error.stack)
    res.status(500).json({
      error: 'Failed to analyze menu',
      details: error.message
    })
  }
}
