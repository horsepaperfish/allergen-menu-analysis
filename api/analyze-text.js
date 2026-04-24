import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const ALLERGEN_FAMILIES = {
  'Dairy': 'milk, cheese, butter, cream, ghee, whey, casein, lactose, yogurt, sour cream, aioli, béchamel, parmesan, mozzarella, cheddar — NOTE: butter and garlic butter are DAIRY',
  'Eggs': 'egg, eggs, mayonnaise, hollandaise, meringue, aioli',
  'Fish': 'fish, salmon, tuna, cod, halibut, anchovies, sardines, tilapia, bass, snapper',
  'Shellfish': 'shrimp, crab, lobster, crawfish, prawns, mussels, clams, oysters, scallops',
  'Tree Nuts': 'almonds, cashews, walnuts, pecans, hazelnuts, pistachios, macadamias, brazil nuts, pine nuts, almond flour, praline, marzipan — NOTE: "butter" alone is NOT a tree nut',
  'Peanuts': 'peanut, peanuts, peanut butter, groundnut, satay, pad thai',
  'Wheat': 'wheat, flour, bread, breading, croutons, battered, pasta, noodles, roux',
  'Soy': 'soy, soy sauce, tofu, edamame, miso, tempeh',
  'Gluten': 'wheat, barley, rye, malt, flour, breading, croutons, battered',
  'Sesame': 'sesame, tahini, sesame oil, sesame seeds',
  'Corn': 'corn, cornstarch, polenta, grits, corn syrup',
  'Mustard': 'mustard, mustard seed, mustard oil',
  'Celery': 'celery, celeriac, celery salt, celery seed',
  'Lupin': 'lupin, lupine flour',
  'Molluscs': 'squid, octopus, snails, mussels, clams, oysters, scallops',
  'Sulfites': 'sulfites, sulphites, wine, dried fruit, vinegar',
}

const ALLERGEN_TERMS = {
  'Dairy': ['milk', 'cheese', 'butter', 'cream', 'ghee', 'whey', 'casein', 'lactose', 'yogurt', 'sour cream', 'aioli', 'béchamel', 'parmesan', 'mozzarella', 'cheddar', 'brie', 'garlic butter', 'gouda', 'gruyère', 'gruyere', 'beurre'],
  'Eggs': ['egg', 'eggs', 'mayonnaise', 'mayo', 'hollandaise', 'meringue', 'aioli'],
  'Fish': ['fish', 'salmon', 'tuna', 'cod', 'halibut', 'anchovies', 'sardines', 'tilapia', 'bass', 'snapper', 'anchovy'],
  'Shellfish': ['shrimp', 'crab', 'lobster', 'crawfish', 'prawn', 'prawns', 'mussels', 'clams', 'oysters', 'scallops'],
  'Tree Nuts': ['almond', 'almonds', 'cashew', 'cashews', 'walnut', 'walnuts', 'pecan', 'pecans', 'hazelnut', 'hazelnuts', 'pistachio', 'pistachios', 'macadamia', 'brazil nut', 'pine nut', 'pine nuts', 'almond flour', 'praline', 'marzipan'],
  'Peanuts': ['peanut', 'peanuts', 'peanut butter', 'groundnut', 'satay'],
  'Wheat': ['wheat', 'flour', 'bread', 'breading', 'croutons', 'battered', 'pasta', 'noodles', 'roux', 'brioche', 'pretzel', 'bun', 'roll', 'toast'],
  'Soy': ['soy', 'soy sauce', 'tofu', 'edamame', 'miso', 'tempeh'],
  'Gluten': ['wheat', 'barley', 'rye', 'malt', 'flour', 'breading', 'croutons', 'battered'],
  'Sesame': ['sesame', 'tahini', 'sesame oil', 'sesame seeds'],
  'Corn': ['corn', 'cornstarch', 'polenta', 'grits', 'corn syrup'],
  'Mustard': ['mustard', 'mustard seed', 'mustard oil'],
  'Celery': ['celery', 'celeriac', 'celery salt', 'celery seed'],
  'Lupin': ['lupin', 'lupine'],
  'Molluscs': ['squid', 'octopus', 'snails', 'mussels', 'clams', 'oysters', 'scallops'],
  'Sulfites': ['sulfites', 'sulphites', 'wine', 'dried fruit', 'vinegar'],
}

function ensureBracketsPresent(description, tier, flaggedAllergens) {
  if (!description || tier === 'SAFE') return description
  if (/\[/.test(description)) return description

  if (!flaggedAllergens || flaggedAllergens.length === 0) return description

  const terms = []
  for (const allergen of flaggedAllergens) {
    const allergenTerms = ALLERGEN_TERMS[allergen] || []
    terms.push(...allergenTerms)
  }
  terms.sort((a, b) => b.length - a.length)

  let result = description
  const alreadyBracketed = new Set()

  for (const term of terms) {
    if (alreadyBracketed.has(term.toLowerCase())) continue
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`(?<!\\[)\\b${escaped}\\b(?![^\\[]*\\])`, 'gi')
    const newResult = result.replace(regex, `[$&]`)
    if (newResult !== result) {
      alreadyBracketed.add(term.toLowerCase())
      result = newResult
    }
  }

  return result
}

function buildAllergenGuide(selectedAllergens) {
  const lines = selectedAllergens
    .filter(a => ALLERGEN_FAMILIES[a])
    .map(a => `- ${a}: ${ALLERGEN_FAMILIES[a]}`)
  return lines.length > 0
    ? `ALLERGEN RECOGNITION (ONLY for the selected allergens above):\n${lines.join('\n')}`
    : ''
}

async function analyzeMenuWithClaude(menuText, selectedAllergens = []) {
  const effectiveAllergens = selectedAllergens.length > 0
    ? selectedAllergens
    : ['Dairy', 'Eggs', 'Fish', 'Shellfish', 'Tree Nuts', 'Peanuts', 'Wheat', 'Soy', 'Gluten', 'Sesame', 'Corn', 'Mustard', 'Celery', 'Lupin', 'Molluscs', 'Sulfites']
  const allergenList = effectiveAllergens.join(', ')
  const allergenGuide = buildAllergenGuide(effectiveAllergens)

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8096,
    messages: [
      {
        role: 'user',
        content: `You are analyzing a food menu to identify allergen risks. The user is ONLY allergic to: ${allergenList}

CRITICAL: You must ONLY flag the allergens listed above. Do NOT flag any other allergens. If the user did not select Dairy, do not flag dairy. If they did not select Shellfish, do not flag shellfish. Only the allergens in the list above matter.

${allergenGuide}

Categorize each item:
- "SAFE": No selected allergens detected
- "ASK_STAFF": Item might contain one of the user's selected allergens (${allergenList})
- "AVOID": Item definitely contains one of the user's selected allergens (${allergenList})

CRITICAL RULES:
- ONLY flag allergens from this list: ${allergenList}
- Never flag an allergen the user did not select, even if you notice it
- Err toward ASK_STAFF over SAFE when uncertain, but NEVER toward AVOID over ASK_STAFF

FORMATTING FOR menu_description — THIS IS CRITICAL AND MANDATORY:
- Copy the EXACT original menu text for this item (the description/ingredients as printed on the menu)
- For AVOID items: wrap EVERY ingredient/word that CONTAINS the allergen in [square brackets]
- For ASK_STAFF items: wrap EVERY ingredient/word that IS THE REASON for the flag in [square brackets] — even if the ingredient doesn't directly name the allergen
- RULE: If an item is ASK_STAFF or AVOID, its menu_description MUST contain at least one [bracketed] term. No exceptions.
- Do NOT add any explanation, commentary, or text that is not from the original menu
- Do NOT leave flagged ingredients unhighlighted — the specific ingredient(s) causing the flag MUST be in [brackets]
  - CORRECT: "applewood-smoked bacon, [hollandaise sauce], brioche"  (hollandaise flagged for eggs)
  - CORRECT: "romaine with [shaved parmesan], soft boiled egg & [croutons]"  (parmesan=dairy, croutons=wheat)
  - CORRECT: "Warm Pull Apart Rolls with [garlic butter]"  (garlic butter = dairy)
  - CORRECT: "steakhouse chili"  → "[steakhouse chili]"  (if the dish name itself is the reason)
  - INCORRECT: "applewood-smoked bacon, hollandaise sauce, brioche"  (hollandaise NOT bracketed — WRONG)
  - INCORRECT: "romaine with shaved parmesan, soft boiled egg & croutons"  (no brackets — WRONG)
- For SAFE items: return the original text as-is with no brackets
- If the menu item has no listed description, use just the item name (with brackets if the name itself is the reason for flagging)

For reason: Write a brief explanation of WHY this item is flagged, including concentration levels in parentheses: (trace), (low amounts), (moderate amounts), (high amounts). Null for SAFE items.

For ask_server: Generate 2–3 short, practical questions a diner can ask the waiter about this specific dish and allergen. Return as a JSON array of strings. The questions should be specific to the dish — not generic. Examples:
- ASK_STAFF (dairy, truffle cream): ["Does the truffle cream contain any dairy or cream?", "Can the truffle cream be left off or swapped for a dairy-free option?"]
- AVOID (dairy, cheese burger): ["Is it possible to make this burger without cheese?", "Does the patty or sauce contain any butter or dairy?"]
- SAFE: null (no questions needed)

REQUIRED JSON OUTPUT (no markdown, no preamble):
{
  "items": [
    {
      "name": "Exact menu item name",
      "tier": "SAFE" or "ASK_STAFF" or "AVOID",
      "flagged_allergens": ["Allergen1", "Allergen2"] or [],
      "menu_description": "Original menu text with [allergen words in brackets] — only text from the actual menu",
      "reason": "Brief explanation with concentration level - null for SAFE",
      "ask_server": ["Question 1 to ask the waiter?", "Question 2?"]
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
      description: ensureBracketsPresent(item.menu_description || 'No description available', item.tier, item.flagged_allergens),
      reason: item.reason || null,
      questions: Array.isArray(item.ask_server) ? item.ask_server : (item.ask_server ? [item.ask_server] : null),
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
        description: ensureBracketsPresent(item.menu_description || 'No description available', item.tier, item.flagged_allergens),
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
