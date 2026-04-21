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
    model: 'claude-3-5-haiku-20250110',
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
            text: `Analyze this food menu image and categorize EVERY item based on these allergens: ${allergenList}

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

Return ONLY the JSON array with ALL menu items categorized.`
          }
        ]
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

async function analyzeMenuWithClaude(menuText, selectedAllergens = []) {
  const allergenList = selectedAllergens.length > 0
    ? selectedAllergens.join(', ')
    : 'Dairy, Eggs, Fish, Shellfish, Tree Nuts, Peanuts, Wheat, Soy, Gluten, Sesame, Corn, Mustard, Celery, Lupin, Molluscs, Sulfites'

  const message = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20250110',
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
