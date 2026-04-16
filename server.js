import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import multer from 'multer'
import Anthropic from '@anthropic-ai/sdk'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { PDFParse } = require('pdf-parse')

dotenv.config()

const app = express()
const port = 3001

app.use(cors())
app.use(express.json({ limit: '10mb' }))

const storage = multer.memoryStorage()
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }
})

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

async function analyzeImageDirectly(buffer, mimeType, selectedAllergens = []) {
  const base64Image = buffer.toString('base64')

  const allergenList = selectedAllergens.length > 0
    ? selectedAllergens.join(', ')
    : 'Dairy, Eggs, Fish, Shellfish, Tree Nuts, Peanuts, Wheat, Soy, Gluten, Sesame, Corn, Mustard, Celery, Lupin, Molluscs, Sulfites'

  const message = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType,
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
5. Tags for allergens with "— confirm" for ask-staff items

REQUIRED JSON format:
[
  {
    "name": "Item name",
    "category": "safe" or "ask-staff" or "avoid",
    "allergens": ["Allergen1", "Allergen2"] or [],
    "description": "Description with [allergen mentions in brackets] (concentration level)",
    "tags": ["Nut free", "Peanuts — confirm", "Dairy", etc.]
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
5. Tags for allergens with "— confirm" for ask-staff items

REQUIRED JSON format:
[
  {
    "name": "Item name",
    "category": "safe" or "ask-staff" or "avoid",
    "allergens": ["Allergen1", "Allergen2"] or [],
    "description": "Description with [allergen mentions in brackets] (concentration level)",
    "tags": ["Nut free", "Peanuts — confirm", "Dairy", etc.]
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
      // Remove trailing commas before closing brackets/braces
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

app.post('/api/analyze-text', async (req, res) => {
  try {
    const { menuText, allergens } = req.body

    if (!menuText) {
      return res.status(400).json({ error: 'No menu text provided' })
    }

    console.log('Analyzing menu text, length:', menuText.length)
    console.log('Selected allergens:', allergens)

    const allergenData = await analyzeMenuWithClaude(menuText, allergens || [])

    res.json({ allergens: allergenData })
  } catch (error) {
    console.error('Error analyzing menu:', error)
    res.status(500).json({
      error: 'Failed to analyze menu',
      details: error.message
    })
  }
})

app.post('/api/analyze', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    console.log(`Processing file: ${req.file.originalname} (${req.file.mimetype})`)

    // Parse selected allergens from form data
    let selectedAllergens = []
    if (req.body.allergens) {
      try {
        selectedAllergens = JSON.parse(req.body.allergens)
      } catch (e) {
        console.error('Failed to parse allergens:', e)
      }
    }

    console.log('Selected allergens:', selectedAllergens)

    let allergenData

    if (req.file.mimetype.startsWith('image/')) {
      // Use Claude's vision API for images
      allergenData = await analyzeImageDirectly(req.file.buffer, req.file.mimetype, selectedAllergens)
    } else if (req.file.mimetype === 'text/plain') {
      // Use text analysis for plain text
      const menuText = req.file.buffer.toString('utf-8')
      allergenData = await analyzeMenuWithClaude(menuText, selectedAllergens)
    } else if (req.file.mimetype === 'application/pdf') {
      // PDF still supported locally
      const parser = new PDFParse({ data: req.file.buffer })
      const result = await parser.getText()
      await parser.destroy()
      allergenData = await analyzeMenuWithClaude(result.text, selectedAllergens)
    } else {
      return res.status(400).json({ error: 'Unsupported file type' })
    }

    res.json({ allergens: allergenData })
  } catch (error) {
    console.error('Error analyzing menu:', error)
    res.status(500).json({
      error: 'Failed to analyze menu',
      details: error.message
    })
  }
})

app.listen(port, () => {
  console.log(`Allergen Analyzer API running on http://localhost:${port}`)
})
