import Anthropic from '@anthropic-ai/sdk'
import Tesseract from 'tesseract.js'
import multiparty from 'multiparty'
import { Buffer } from 'buffer'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

async function extractTextFromBuffer(buffer, mimeType) {
  if (mimeType === 'application/pdf') {
    // For Vercel, we'll need to handle PDF differently or skip it for now
    throw new Error('PDF parsing not supported in serverless environment yet. Please use images or text files.')
  } else if (mimeType.startsWith('image/')) {
    const { data: { text } } = await Tesseract.recognize(buffer, 'eng')
    return text
  } else if (mimeType === 'text/plain') {
    return buffer.toString('utf-8')
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
    const form = new multiparty.Form()

    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err)
        else resolve({ fields, files })
      })
    })

    const file = files.file?.[0]

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    console.log(`Processing file: ${file.originalFilename} (${file.headers['content-type']})`)

    const buffer = await require('fs').promises.readFile(file.path)
    const menuText = await extractTextFromBuffer(buffer, file.headers['content-type'])

    // Clean up temp file
    await require('fs').promises.unlink(file.path).catch(() => {})

    if (!menuText || menuText.trim().length === 0) {
      return res.status(400).json({ error: 'Could not extract text from file' })
    }

    console.log('Extracted text length:', menuText.length)

    const allergenData = await analyzeMenuWithClaude(menuText)

    res.status(200).json({ allergens: allergenData })
  } catch (error) {
    console.error('Error analyzing menu:', error)
    res.status(500).json({
      error: 'Failed to analyze menu',
      details: error.message
    })
  }
}
