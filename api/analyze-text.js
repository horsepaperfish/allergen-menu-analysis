import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

async function analyzeMenuWithClaude(menuText, selectedAllergens = []) {
  const allergenList = selectedAllergens.length > 0
    ? selectedAllergens.join(', ')
    : 'Dairy, Eggs, Fish, Shellfish, Tree Nuts, Peanuts, Wheat, Soy, Gluten, Sesame, Corn, Mustard, Celery, Lupin, Molluscs, Sulfites'

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8096,
    messages: [
      {
        role: 'user',
        content: `You are analyzing a food menu to identify allergen risks. The user is allergic to: ${allergenList}

ONLY flag these allergens. Do not mention allergens the user did not select.

ALLERGEN FAMILIES YOU MUST RECOGNIZE:
- Dairy: milk, cheese, butter, cream, ghee, whey, casein, lactose, yogurt, sour cream, aioli, béchamel
  IMPORTANT: "butter" and "garlic butter" are DAIRY, NOT tree nuts. Never flag butter as a tree nut.
- Tree Nuts: almonds, cashews, walnuts, pecans, hazelnuts, pistachios, macadamias, brazil nuts, pine nuts, almond flour, praline
  IMPORTANT: Only flag tree nuts when an actual nut is explicitly named or strongly implied. Do NOT flag butter, seeds, or general sauces as tree nuts.
- Shellfish: shrimp, crab, lobster, crawfish, mussels, clams, oysters, scallops, squid
- Gluten: wheat, barley, rye, malt, flour, breading, croutons, battered
- Soy: soy sauce, tofu, edamame, miso, tempeh

Categorize each item:
- "SAFE": No allergens detected, completely safe
- "ASK_STAFF": Uncertain or may contain allergens (cross-contamination risk, "may contain", unlisted sub-ingredients, etc.)
- "AVOID": Definitely contains one or more allergens

FORMATTING FOR menu_description — THIS IS CRITICAL:
- Copy the EXACT original menu text for this item (the description/ingredients as printed on the menu)
- You MUST wrap every allergen-containing word or phrase that appears in the original text in [square brackets]
- This includes both AVOID and ASK_STAFF items — always bracket the allergen words
- Do NOT add any explanation, commentary, or text that is not from the original menu
- Do NOT leave allergen words unhighlighted — every allergen mention in the text must be in [brackets]
  - CORRECT: "romaine with [shaved parmesan], soft boiled egg & [croutons]"
  - CORRECT: "Warm Pull Apart Rolls with [garlic butter]"  (garlic butter = dairy)
  - INCORRECT: "romaine with shaved parmesan, soft boiled egg & croutons"  (missing brackets)
- For SAFE items with no allergens: return the original text as-is with no brackets
- If the menu item has no listed description, use just the item name (with brackets if the name contains allergen words)
- NEVER conflate allergen families: butter = dairy, not tree nuts

For reason: Write a brief explanation of WHY this item is flagged, including concentration levels in parentheses: (trace), (low amounts), (moderate amounts), (high amounts). Null for SAFE items.

REQUIRED JSON OUTPUT (no markdown, no preamble):
{
  "items": [
    {
      "name": "Exact menu item name",
      "tier": "SAFE" or "ASK_STAFF" or "AVOID",
      "flagged_allergens": ["Allergen1", "Allergen2"] or [],
      "menu_description": "Original menu text with [allergen words in brackets] — only text from the actual menu",
      "reason": "Brief explanation with concentration level - null for SAFE",
      "ask_server": "Specific question to ask (only for ASK_STAFF, null otherwise)"
    }
  ],
  "summary": {
    "safe_count": 0,
    "ask_staff_count": 0,
    "avoid_count": 0,
    "total": 0
  }
}

Menu text:
${menuText}

Analyze EVERY item on this menu and return ONLY the JSON object.`
      }
    ]
  })

  const rawText = message.content[0].text
  // Strip markdown code fences if present
  const responseText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')

  // Try to extract JSON object from response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error('No JSON object found in response')
    return []
  }

  try {
    const response = JSON.parse(jsonMatch[0])

    const allergenData = response.items.map(item => ({
      name: item.name,
      category: item.tier.toLowerCase().replace('_', '-'),
      allergens: item.flagged_allergens,
      description: item.menu_description || 'No description available',
      reason: item.reason || null,
      tags: item.tier === 'ASK_STAFF'
        ? item.flagged_allergens.map(a => `${a} — confirm`)
        : item.flagged_allergens
    }))

    return allergenData
  } catch (error) {
    console.error('JSON parse error:', error.message)
    console.error('Response text:', responseText.substring(0, 500))
    // Try to clean up common JSON errors
    try {
      const cleaned = jsonMatch[0]
        .replace(/,(\s*[}\]])/g, '$1')
        .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":')
      const response = JSON.parse(cleaned)

      const allergenData = response.items.map(item => ({
        name: item.name,
        category: item.tier.toLowerCase().replace('_', '-'),
        allergens: item.flagged_allergens,
        description: item.menu_description || 'No description available',
        reason: item.reason || null,
        tags: item.tier === 'ASK_STAFF'
          ? item.flagged_allergens.map(a => `${a} — confirm`)
          : item.flagged_allergens
      }))

      return allergenData
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
