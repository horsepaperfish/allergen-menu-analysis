import Anthropic from '@anthropic-ai/sdk'
import Tesseract from 'tesseract.js'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { PDFParse } = require('pdf-parse')

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

async function extractTextFromFile(file) {
  const mimeType = file.type

  if (mimeType === 'application/pdf') {
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const parser = new PDFParse({ data: buffer })
    const result = await parser.getText()
    await parser.destroy()
    return result.text
  } else if (mimeType.startsWith('image/')) {
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const { data: { text } } = await Tesseract.recognize(buffer, 'eng')
    return text
  } else if (mimeType === 'text/plain') {
    return await file.text()
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
    const contentType = req.headers['content-type'] || ''

    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'Content-Type must be multipart/form-data' })
    }

    // Parse multipart form data
    const formData = await parseMultipartForm(req)
    const file = formData.file

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    console.log(`Processing file: ${file.name} (${file.type})`)

    const menuText = await extractTextFromFile(file)

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

async function parseMultipartForm(req) {
  return new Promise((resolve, reject) => {
    const boundary = req.headers['content-type'].split('boundary=')[1]
    let data = Buffer.alloc(0)

    req.on('data', chunk => {
      data = Buffer.concat([data, chunk])
    })

    req.on('end', () => {
      try {
        const parts = data.toString('binary').split(`--${boundary}`)

        for (const part of parts) {
          if (part.includes('Content-Disposition: form-data; name="file"')) {
            const nameMatch = part.match(/filename="([^"]+)"/)
            const typeMatch = part.match(/Content-Type: ([^\r\n]+)/)

            if (nameMatch && typeMatch) {
              const headerEnd = part.indexOf('\r\n\r\n') + 4
              const fileData = part.substring(headerEnd, part.lastIndexOf('\r\n'))

              const file = {
                name: nameMatch[1],
                type: typeMatch[1],
                arrayBuffer: async () => {
                  const buffer = Buffer.from(fileData, 'binary')
                  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
                },
                text: async () => Buffer.from(fileData, 'binary').toString('utf-8')
              }

              resolve({ file })
              return
            }
          }
        }

        resolve({})
      } catch (error) {
        reject(error)
      }
    })

    req.on('error', reject)
  })
}
