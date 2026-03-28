import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import multer from 'multer'
import Anthropic from '@anthropic-ai/sdk'
import Tesseract from 'tesseract.js'
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

async function extractTextFromFile(file) {
  const mimeType = file.mimetype

  if (mimeType === 'application/pdf') {
    const parser = new PDFParse({ data: file.buffer })
    const result = await parser.getText()
    await parser.destroy()
    return result.text
  } else if (mimeType.startsWith('image/')) {
    const { data: { text } } = await Tesseract.recognize(file.buffer, 'eng')
    return text
  } else if (mimeType === 'text/plain') {
    return file.buffer.toString('utf-8')
  } else {
    throw new Error('Unsupported file type')
  }
}

async function analyzeMenuWithClaude(menuText) {
  const message = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `Analyze the following food menu and identify allergens in each item.

For EACH item, you MUST include:
1. The item name
2. List of allergens from: Dairy, Eggs, Fish, Shellfish, Tree Nuts, Peanuts, Wheat, Soy, Gluten, Sesame, Corn, Mustard, Celery, Lupin, Molluscs, Sulfites
3. Allergen concentration info (e.g. "Dairy: major (cheese is primary ingredient), Wheat: minor (in sauce)")
4. What the dish actually is (e.g. "Grilled chicken sandwich with lettuce and tomato")

REQUIRED JSON format:
[
  {
    "name": "Item name",
    "allergens": ["Allergen1", "Allergen2"],
    "description": "Dairy: major (cheese), Wheat: minor (sauce)",
    "dishInfo": "Grilled chicken sandwich with lettuce and tomato"
  }
]

Menu text:
${menuText}

Return ONLY the JSON array. The description field MUST contain concentration info.`
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

app.post('/api/analyze', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    console.log(`Processing file: ${req.file.originalname} (${req.file.mimetype})`)

    const menuText = await extractTextFromFile(req.file)

    if (!menuText || menuText.trim().length === 0) {
      return res.status(400).json({ error: 'Could not extract text from file' })
    }

    console.log('Extracted text length:', menuText.length)

    const allergenData = await analyzeMenuWithClaude(menuText)

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
