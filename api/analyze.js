import Anthropic from '@anthropic-ai/sdk'
import busboy from 'busboy'
import { extractText, getDocumentProxy } from 'unpdf'
import sharp from 'sharp'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Maps each allergen to its ingredient synonyms for recognition
const ALLERGEN_FAMILIES = {
  'Dairy': 'milk, cheese, butter, cream, ghee, whey, casein, lactose, yogurt, sour cream, aioli, béchamel, parmesan, mozzarella, cheddar, brie — NOTE: butter and garlic butter are DAIRY',
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

// Build allergen recognition section for only the selected allergens
function buildAllergenGuide(selectedAllergens) {
  const lines = selectedAllergens
    .filter(a => ALLERGEN_FAMILIES[a])
    .map(a => `- ${a}: ${ALLERGEN_FAMILIES[a]}`)
  return lines.length > 0
    ? `ALLERGEN RECOGNITION (ONLY for the selected allergens above):\n${lines.join('\n')}`
    : ''
}

// Compress image if it exceeds Anthropic's 5MB base64 limit
async function compressImageIfNeeded(buffer, mimeType) {
  // Base64 encoding increases size by ~33%
  // So we need the buffer to be under ~3.75MB to stay under 5MB when base64 encoded
  const MAX_BASE64_SIZE = 5 * 1024 * 1024 // 5MB
  const SAFE_BUFFER_SIZE = Math.floor(MAX_BASE64_SIZE / 1.33) // ~3.75MB

  let base64Image = buffer.toString('base64')

  // If already under limit, return as-is
  if (base64Image.length <= MAX_BASE64_SIZE) {
    return { buffer, base64: base64Image, mimeType }
  }

  console.log(`Image too large (${base64Image.length} bytes), compressing...`)

  // Try compression with decreasing quality levels
  let quality = 85
  let compressedBuffer = buffer

  while (quality >= 40) {
    try {
      // Use sharp to compress the image
      const sharpInstance = sharp(buffer)
      const metadata = await sharpInstance.metadata()

      // Resize if image is very large
      let resizedInstance = sharpInstance
      if (metadata.width > 2048 || metadata.height > 2048) {
        resizedInstance = sharpInstance.resize(2048, 2048, {
          fit: 'inside',
          withoutEnlargement: true
        })
      }

      // Convert to JPEG with quality setting
      compressedBuffer = await resizedInstance
        .jpeg({ quality })
        .toBuffer()

      base64Image = compressedBuffer.toString('base64')

      console.log(`Compressed at quality ${quality}: ${base64Image.length} bytes`)

      if (base64Image.length <= MAX_BASE64_SIZE) {
        console.log(`Compression successful at quality ${quality}`)
        return { buffer: compressedBuffer, base64: base64Image, mimeType: 'image/jpeg' }
      }

      quality -= 10
    } catch (error) {
      console.error(`Error compressing at quality ${quality}:`, error)
      quality -= 10
    }
  }

  // If still too large after all attempts, throw error
  throw new Error(`Unable to compress image below 5MB limit. Final size: ${base64Image.length} bytes`)
}

async function analyzeImageDirectly(buffer, mimeType, selectedAllergens = []) {
  // Compress image if needed to stay under 5MB base64 limit
  const { base64: base64Image, mimeType: finalMimeType } = await compressImageIfNeeded(buffer, mimeType)

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
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: finalMimeType,
              data: base64Image,
            },
          },
          {
            type: 'text',
            text: `You are analyzing a food menu to identify allergen risks. The user is ONLY allergic to: ${allergenList}

CRITICAL: You must ONLY flag the allergens listed above. Do NOT flag any other allergens. If the user did not select Dairy, do not flag dairy. If they did not select Shellfish, do not flag shellfish. Only the allergens in the list above matter.

${allergenGuide}

CLASSIFICATION RULES - Apply these two questions IN ORDER for each menu item:

QUESTION 1: Does this item explicitly contain one of the user's selected allergens (${allergenList})?
- Explicitly named in ingredients or dish name
- The allergen is a defining component the dish cannot exist without
→ If YES: Classify as AVOID.
→ If NO: Move to Question 2.

QUESTION 2: Might this item contain one of the user's selected allergens (${allergenList}) through hidden ingredients, sub-ingredients, or cuisine patterns?
- Unlisted sub-ingredients that typically contain a selected allergen
- Cuisine patterns known to use a selected allergen
- Ambiguous ingredient names that might be a selected allergen
→ If YES: Classify as ASK_STAFF.
→ If NO: Classify as SAFE.

CRITICAL RULES:
- ONLY flag allergens from this list: ${allergenList}
- Never flag an allergen the user did not select, even if you notice it
- Err toward ASK_STAFF over SAFE when uncertain, but NEVER toward AVOID over ASK_STAFF
- Every ASK_STAFF item MUST include a specific reason AND a specific question for the server
- Every AVOID item MUST name the exact allergen found

FORMATTING FOR menu_description — THIS IS CRITICAL:
- Copy the EXACT original menu text for this item (the description/ingredients as printed on the menu)
- For AVOID items: wrap every ingredient/word that CONTAINS the allergen in [square brackets]
- For ASK_STAFF items: wrap every ingredient/word that IS THE REASON for the flag in [square brackets] — even if the ingredient doesn't directly name the allergen (e.g. "hollandaise" flagged for tree nuts → [hollandaise])
- Do NOT add any explanation, commentary, or text that is not from the original menu
- Do NOT leave flagged ingredients unhighlighted — the specific ingredient(s) causing the flag MUST be in [brackets]
  - CORRECT: "applewood-smoked bacon, [hollandaise sauce], brioche"  (hollandaise flagged for tree nuts)
  - CORRECT: "romaine with [shaved parmesan], soft boiled egg & [croutons]"
  - CORRECT: "Warm Pull Apart Rolls with [garlic butter]"  (garlic butter = dairy)
  - INCORRECT: "applewood-smoked bacon, hollandaise sauce, brioche"  (hollandaise NOT bracketed when it's the reason for the flag)
  - INCORRECT: "romaine with shaved parmesan, soft boiled egg & croutons"  (missing brackets)
- For SAFE items with no allergens: return the original text as-is with no brackets
- If the menu item has no listed description, use just the item name (with brackets if the name contains allergen words)

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

Analyze EVERY item on this menu and return ONLY the JSON object.`
          }
        ]
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

    // Transform new format to old format expected by frontend
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

CLASSIFICATION RULES - Apply these two questions IN ORDER for each menu item:

QUESTION 1: Does this item explicitly contain one of the user's selected allergens (${allergenList})?
- Explicitly named in ingredients or dish name
- The allergen is a defining component the dish cannot exist without
→ If YES: Classify as AVOID.
→ If NO: Move to Question 2.

QUESTION 2: Might this item contain one of the user's selected allergens (${allergenList}) through hidden ingredients, sub-ingredients, or cuisine patterns?
- Unlisted sub-ingredients that typically contain a selected allergen
- Cuisine patterns known to use a selected allergen
- Ambiguous ingredient names that might be a selected allergen
→ If YES: Classify as ASK_STAFF.
→ If NO: Classify as SAFE.

CRITICAL RULES:
- ONLY flag allergens from this list: ${allergenList}
- Never flag an allergen the user did not select, even if you notice it
- Err toward ASK_STAFF over SAFE when uncertain, but NEVER toward AVOID over ASK_STAFF
- Every ASK_STAFF item MUST include a specific reason AND a specific question for the server
- Every AVOID item MUST name the exact allergen found

FORMATTING FOR menu_description — THIS IS CRITICAL:
- Copy the EXACT original menu text for this item (the description/ingredients as printed on the menu)
- For AVOID items: wrap every ingredient/word that CONTAINS the allergen in [square brackets]
- For ASK_STAFF items: wrap every ingredient/word that IS THE REASON for the flag in [square brackets] — even if the ingredient doesn't directly name the allergen (e.g. "hollandaise" flagged for tree nuts → [hollandaise])
- Do NOT add any explanation, commentary, or text that is not from the original menu
- Do NOT leave flagged ingredients unhighlighted — the specific ingredient(s) causing the flag MUST be in [brackets]
  - CORRECT: "applewood-smoked bacon, [hollandaise sauce], brioche"  (hollandaise flagged for tree nuts)
  - CORRECT: "romaine with [shaved parmesan], soft boiled egg & [croutons]"
  - CORRECT: "Warm Pull Apart Rolls with [garlic butter]"  (garlic butter = dairy)
  - INCORRECT: "applewood-smoked bacon, hollandaise sauce, brioche"  (hollandaise NOT bracketed when it's the reason for the flag)
  - INCORRECT: "romaine with shaved parmesan, soft boiled egg & croutons"  (missing brackets)
- For SAFE items with no allergens: return the original text as-is with no brackets
- If the menu item has no listed description, use just the item name (with brackets if the name contains allergen words)

For reason: Write a brief explanation of WHY this item is flagged, including concentration levels in parentheses: (trace), (low amounts), (moderate amounts), (high amounts). Null for SAFE items.

Menu text:
${menuText}

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

    // Transform new format to old format expected by frontend
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

function parseMultipartForm(req) {
  return new Promise((resolve, reject) => {
    const bb = busboy({ headers: req.headers })
    const result = { fields: {}, files: [] }

    bb.on('file', (fieldname, file, info) => {
      const { filename, encoding, mimeType } = info
      const chunks = []

      file.on('data', (data) => {
        chunks.push(data)
      })

      file.on('end', () => {
        result.files.push({
          fieldname,
          originalFilename: filename,
          mimetype: mimeType,
          buffer: Buffer.concat(chunks)
        })
      })
    })

    bb.on('field', (fieldname, value) => {
      result.fields[fieldname] = value
    })

    bb.on('finish', () => {
      resolve(result)
    })

    bb.on('error', (error) => {
      reject(error)
    })

    req.pipe(bb)
  })
}

export const config = {
  api: {
    bodyParser: false,
  },
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
    console.log('Starting file upload parsing...')

    const { fields, files } = await parseMultipartForm(req)

    console.log('Files parsed:', files.length)

    const file = files[0]

    if (!file) {
      console.error('No file found in upload')
      return res.status(400).json({ error: 'No file uploaded' })
    }

    console.log(`Processing file: ${file.originalFilename} (${file.mimetype})`)
    console.log(`Buffer size: ${file.buffer.length}`)

    // Parse selected allergens from form data
    let selectedAllergens = []
    if (fields.allergens) {
      try {
        selectedAllergens = JSON.parse(fields.allergens)
      } catch (e) {
        console.error('Failed to parse allergens:', e)
      }
    }

    console.log('Selected allergens:', selectedAllergens)

    let allergenData

    if (file.mimetype.startsWith('image/')) {
      // Use Claude's vision API for images
      allergenData = await analyzeImageDirectly(file.buffer, file.mimetype, selectedAllergens)
    } else if (file.mimetype === 'text/plain') {
      // Use text analysis for plain text
      const menuText = file.buffer.toString('utf-8')
      allergenData = await analyzeMenuWithClaude(menuText, selectedAllergens)
    } else if (file.mimetype === 'application/pdf') {
      // Extract text from PDF and analyze using unpdf (serverless-compatible)
      console.log('Parsing PDF...')
      const pdf = await getDocumentProxy(new Uint8Array(file.buffer))
      const { text } = await extractText(pdf, { mergePages: true })
      console.log('PDF parsed successfully, text length:', text.length)
      allergenData = await analyzeMenuWithClaude(text, selectedAllergens)
    } else {
      return res.status(400).json({ error: `Unsupported file type: ${file.mimetype}` })
    }

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
