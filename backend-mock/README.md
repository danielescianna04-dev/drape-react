# 🖼️ Unsplash Gallery

A beautiful React app that fetches and displays images from the Unsplash API with a modern, responsive design.

## Features

- ✨ **Search functionality** - Find images by keywords
- 📱 **Responsive design** - Works great on desktop and mobile
- 🎨 **Beautiful UI** - Modern gradient design with smooth animations
- 🔒 **Secure API key handling** - Environment variables for security
- ⚡ **Fast loading** - Optimized image loading with lazy loading
- 👤 **Artist attribution** - Proper credit to photographers
- 🌐 **Direct links** - View images on Unsplash

## Setup

1. **Get an Unsplash API key:**
   - Go to [Unsplash Developers](https://unsplash.com/developers)
   - Create a new application
   - Copy your Access Key

2. **Configure the API key:**
   - Edit `.env.local` file in this project
   - Replace `your_access_key_here` with your actual API key:
     ```
     VITE_UNSPLASH_ACCESS_KEY=AbCdEf1234567890...
     ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

5. **Open in browser:**
   - Go to `http://localhost:5173`

## Usage

- Enter search terms in the search box (e.g., "nature", "cats", "architecture")
- Press Enter or click Search
- Browse through beautiful high-quality images
- Click on photographer names or "View on Unsplash" to visit original images

## Technology Stack

- **React** - UI framework
- **Vite** - Build tool and dev server
- **Axios** - HTTP client for API calls
- **Unsplash API** - Image source
- **CSS Grid** - Responsive layout
- **CSS Animations** - Smooth interactions

## API Rate Limits

The Unsplash API has the following limits:
- **Demo/Development**: 50 requests per hour
- **Production**: Up to 5,000 requests per hour (with approval)

For production use, make sure to apply for increased rate limits on the Unsplash Developer portal.

## License

This project is open source and available under the MIT License.

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
# Updated Tue Oct  7 00:57:54 CEST 2025
