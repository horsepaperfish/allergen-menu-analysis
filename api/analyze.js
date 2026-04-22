import Anthropic from '@anthropic-ai/sdk'
import busboy from 'busboy'
import { extractText, getDocumentProxy } from 'unpdf'
import sharp from 'sharp'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

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

  const allergenList = selectedAllergens.length > 0
    ? selectedAllergens.join(', ')
    : 'Dairy, Eggs, Fish, Shellfish, Tree Nuts, Peanuts, Wheat, Soy, Gluten, Sesame, Corn, Mustard, Celery, Lupin, Molluscs, Sulfites'

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
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
            text: `You are analyzing a food menu to identify allergen risks. The user is allergic to: ${allergenList}

ONLY flag these allergens. Do not mention allergens the user did not select.

ALLERGEN FAMILIES YOU MUST RECOGNIZE:
- Dairy: milk, cheese, butter, cream, ghee, whey, casein, lactose, yogurt, sour cream
- Tree Nuts: almonds, cashews, walnuts, pecans, hazelnuts, pistachios, macadamias, brazil nuts, pine nuts
- Shellfish: shrimp, crab, lobster, crawfish, mussels, clams, oysters, scallops, squid
- Gluten: wheat, barley, rye, malt
- Soy: soy sauce, tofu, edamame, miso, tempeh

CLASSIFICATION RULES - Apply these two questions IN ORDER for each menu item:

QUESTION 1: Is the allergen explicitly named in the ingredients OR a defining, structural component of the dish?
- Explicitly named: "butter," "peanuts," "shrimp," "parmesan" appear in the ingredient list
- Defining component: The allergen IS the dish - removing it makes the dish cease to exist
  Examples: mac and cheese (dairy), pad thai (peanuts), lobster roll (shellfish), cheesecake (dairy)
- Dish name contains the allergen: "walnut-crusted salmon," "butter chicken," "crab cakes"
→ If YES: Classify as AVOID. No kitchen modification can make this safe.
→ If NO: Move to Question 2.

QUESTION 2: Are there hidden risks, ambiguous terms, or cuisine-level patterns that suggest the allergen MIGHT be present?
- Unlisted sub-ingredients: Caesar salad doesn't mention dressing, but dressing likely has parmesan
- Cuisine patterns: Thai food often uses fish sauce/peanuts, Italian risotto uses butter/parmesan, Indian food uses ghee
- Ambiguous terms: "cream sauce" (dairy or coconut?), "crispy coating" (wheat or gluten-free?)
- Cross-contamination: Dish is allergen-free but prepared in shared equipment
→ If YES: Classify as ASK_STAFF. Include specific reason and question to ask server.
→ If NO: Classify as SAFE.

CRITICAL RULES:
- Err toward ASK_STAFF over SAFE when uncertain, but NEVER toward AVOID over ASK_STAFF
- Reserve AVOID strictly for items where no staff conversation can make the dish safe
- Every ASK_STAFF item MUST include a specific reason AND a specific question for the server
- Every AVOID item MUST name the exact allergen found
- Parse the entire dish including the dish name, not just the description

FORMATTING FOR REASONS:
- For ASK_STAFF and AVOID items, highlight allergen components in [brackets]
- Example for ASK_STAFF: "Salad with [dressing that may contain parmesan] — ask if dairy-free option available"
- Example for AVOID: "Pasta with [butter] and [parmesan cheese] (high amounts)"
- Include concentration levels in parentheses: (trace), (low amounts), (moderate amounts), (high amounts)
- For SAFE items, reason should be null

REQUIRED JSON OUTPUT (no markdown, no preamble):
{
  "items": [
    {
      "name": "Exact menu item name",
      "tier": "SAFE" or "ASK_STAFF" or "AVOID",
      "flagged_allergens": ["Allergen1", "Allergen2"] or [],
      "reason": "Explanation with [allergen components in brackets] (concentration) - null for SAFE",
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

  const responseText = message.content[0].text

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
      description: item.reason || 'No allergen concerns detected',
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
        description: item.reason || 'No allergen concerns detected',
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
  const allergenList = selectedAllergens.length > 0
    ? selectedAllergens.join(', ')
    : 'Dairy, Eggs, Fish, Shellfish, Tree Nuts, Peanuts, Wheat, Soy, Gluten, Sesame, Corn, Mustard, Celery, Lupin, Molluscs, Sulfites'

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `You are analyzing a food menu to identify allergen risks. The user is allergic to: ${allergenList}

ONLY flag these allergens. Do not mention allergens the user did not select.

ALLERGEN FAMILIES YOU MUST RECOGNIZE:
- Dairy: milk, cheese, butter, cream, ghee, whey, casein, lactose, yogurt, sour cream
- Tree Nuts: almonds, cashews, walnuts, pecans, hazelnuts, pistachios, macadamias, brazil nuts, pine nuts
- Shellfish: shrimp, crab, lobster, crawfish, mussels, clams, oysters, scallops, squid
- Gluten: wheat, barley, rye, malt
- Soy: soy sauce, tofu, edamame, miso, tempeh

CLASSIFICATION RULES - Apply these two questions IN ORDER for each menu item:

QUESTION 1: Is the allergen explicitly named in the ingredients OR a defining, structural component of the dish?
- Explicitly named: "butter," "peanuts," "shrimp," "parmesan" appear in the ingredient list
- Defining component: The allergen IS the dish - removing it makes the dish cease to exist
  Examples: mac and cheese (dairy), pad thai (peanuts), lobster roll (shellfish), cheesecake (dairy)
- Dish name contains the allergen: "walnut-crusted salmon," "butter chicken," "crab cakes"
→ If YES: Classify as AVOID. No kitchen modification can make this safe.
→ If NO: Move to Question 2.

QUESTION 2: Are there hidden risks, ambiguous terms, or cuisine-level patterns that suggest the allergen MIGHT be present?
- Unlisted sub-ingredients: Caesar salad doesn't mention dressing, but dressing likely has parmesan
- Cuisine patterns: Thai food often uses fish sauce/peanuts, Italian risotto uses butter/parmesan, Indian food uses ghee
- Ambiguous terms: "cream sauce" (dairy or coconut?), "crispy coating" (wheat or gluten-free?)
- Cross-contamination: Dish is allergen-free but prepared in shared equipment
→ If YES: Classify as ASK_STAFF. Include specific reason and question to ask server.
→ If NO: Classify as SAFE.

CRITICAL RULES:
- Err toward ASK_STAFF over SAFE when uncertain, but NEVER toward AVOID over ASK_STAFF
- Reserve AVOID strictly for items where no staff conversation can make the dish safe
- Every ASK_STAFF item MUST include a specific reason AND a specific question for the server
- Every AVOID item MUST name the exact allergen found
- Parse the entire dish including the dish name, not just the description

FORMATTING FOR REASONS:
- For ASK_STAFF and AVOID items, highlight allergen components in [brackets]
- Example for ASK_STAFF: "Salad with [dressing that may contain parmesan] — ask if dairy-free option available"
- Example for AVOID: "Pasta with [butter] and [parmesan cheese] (high amounts)"
- Include concentration levels in parentheses: (trace), (low amounts), (moderate amounts), (high amounts)
- For SAFE items, reason should be null

Menu text:
${menuText}

REQUIRED JSON OUTPUT (no markdown, no preamble):
{
  "items": [
    {
      "name": "Exact menu item name",
      "tier": "SAFE" or "ASK_STAFF" or "AVOID",
      "flagged_allergens": ["Allergen1", "Allergen2"] or [],
      "reason": "Explanation with [allergen components in brackets] (concentration) - null for SAFE",
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

  const responseText = message.content[0].text

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
      description: item.reason || 'No allergen concerns detected',
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
        description: item.reason || 'No allergen concerns detected',
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
