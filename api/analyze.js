import Anthropic from '@anthropic-ai/sdk'
import Tesseract from 'tesseract.js'
import busboy from 'busboy'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

async function extractTextFromBuffer(buffer, mimeType) {
  if (mimeType === 'application/pdf') {
    throw new Error('PDF parsing not supported in serverless environment. Please use images or text files.')
  } else if (mimeType.startsWith('image/')) {
    const { data: { text } } = await Tesseract.recognize(buffer, 'eng', {
      logger: m => console.log(m),
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js',
      workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
    })
    return text
  } else if (mimeType === 'text/plain') {
    return buffer.toString('utf-8')
  } else {
    throw new Error(`Unsupported file type: ${mimeType}`)
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

    const menuText = await extractTextFromBuffer(file.buffer, file.mimetype)

    if (!menuText || menuText.trim().length === 0) {
      console.error('No text extracted from file')
      return res.status(400).json({ error: 'Could not extract text from file' })
    }

    console.log('Extracted text length:', menuText.length)

    const allergenData = await analyzeMenuWithClaude(menuText)

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
