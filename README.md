# Allergen Menu Analyzer

A modern web application that analyzes food menus and identifies potential allergens using AI. Upload a menu in PDF, image, or text format, and get instant allergen detection for each menu item.

## Features

- File upload support for PDF, images, and text files
- AI-powered allergen detection using Claude API
- Modern, minimalistic UI with Rethink Sans font
- Animated background for visual appeal
- Responsive design for all devices
- Real-time analysis with loading states

## Tech Stack

- React + Vite
- Express.js backend
- Anthropic Claude API
- Tesseract.js for OCR
- PDF-parse for PDF text extraction

## Prerequisites

- Node.js 18 or higher
- Anthropic API key

## Setup Instructions

1. Clone the repository or navigate to the project directory:

```bash
cd allergen-menu-analyzer
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

4. Add your Anthropic API key to the `.env` file:

```
ANTHROPIC_API_KEY=your_api_key_here
```

You can get an API key from [Anthropic Console](https://console.anthropic.com/).

5. Start the development server:

```bash
npm run dev
```

This will start both the backend API server on port 3001 and the frontend development server on port 5173.

6. Open your browser and navigate to:

```
http://localhost:5173
```

## Usage

1. Click the upload area or drag and drop a menu file
2. Supported formats: PDF, TXT, PNG, JPG
3. Wait for the AI to analyze the menu
4. View the allergen analysis for each menu item
5. Click "Analyze Another Menu" to start over

## Detected Allergens

The application identifies the following common allergens:

- Dairy
- Eggs
- Fish
- Shellfish
- Tree Nuts
- Peanuts
- Wheat
- Soy
- Gluten
- Sesame

## Project Structure

```
allergen-menu-analyzer/
├── src/
│   ├── components/
│   │   ├── FileUpload.jsx
│   │   ├── FileUpload.css
│   │   ├── AllergenResults.jsx
│   │   └── AllergenResults.css
│   ├── App.jsx
│   ├── App.css
│   ├── index.css
│   └── main.jsx
├── server.js
├── .env.example
├── package.json
└── vite.config.js
```

## Scripts

- `npm run dev` - Start both frontend and backend in development mode
- `npm run server` - Start only the backend server
- `npm run client` - Start only the frontend
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## Design Features

- Rethink Sans typography for modern aesthetics
- Animated dark blue circle in the background
- Clean, minimalistic interface
- No gradients or unnecessary decorations
- Smooth transitions and hover effects
- Fully responsive layout

## API Endpoint

### POST /api/analyze

Analyzes menu text and returns allergen information.

**Request Body:**
```json
{
  "menuText": "Menu item descriptions..."
}
```

**Response:**
```json
{
  "allergens": [
    {
      "name": "Menu Item Name",
      "allergens": ["Dairy", "Eggs"],
      "description": "Brief description"
    }
  ]
}
```

## License

MIT
