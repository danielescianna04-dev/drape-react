import { useState, useEffect } from 'react'
import axios from 'axios'
import './App.css'

function App() {
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('nature')
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false)

  // Check if API key is configured
  useEffect(() => {
    const apiKey = import.meta.env.VITE_UNSPLASH_ACCESS_KEY
    if (apiKey && apiKey !== 'your_access_key_here') {
      setApiKeyConfigured(true)
    }
  }, [])

  const fetchImages = async (query = searchQuery, page = 1) => {
    const apiKey = import.meta.env.VITE_UNSPLASH_ACCESS_KEY
    
    if (!apiKey || apiKey === 'your_access_key_here') {
      setError('Please configure your Unsplash API key in .env.local')
      return
    }

    setLoading(true)
    setError('')
    
    try {
      const response = await axios.get('https://api.unsplash.com/search/photos', {
        params: {
          query,
          page,
          per_page: 12,
          client_id: apiKey
        }
      })
      
      setImages(response.data.results)
    } catch (err) {
      console.error('Error fetching images:', err)
      setError(`Error fetching images: ${err.response?.data?.error || err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      fetchImages(searchQuery.trim())
    }
  }

  useEffect(() => {
    if (apiKeyConfigured) {
      fetchImages()
    }
  }, [apiKeyConfigured])

  if (!apiKeyConfigured) {
    return (
      <div className="app">
        <div className="api-setup">
          <h1>🖼️ Unsplash Gallery</h1>
          <div className="setup-instructions">
            <h2>Setup Required</h2>
            <p>To use this app, you need to configure your Unsplash API key:</p>
            <ol>
              <li>Go to <a href="https://unsplash.com/developers" target="_blank" rel="noopener noreferrer">Unsplash Developers</a></li>
              <li>Create a new application or use an existing one</li>
              <li>Copy your Access Key</li>
              <li>Edit the <code>.env.local</code> file in this project</li>
              <li>Replace <code>your_access_key_here</code> with your actual API key</li>
              <li>Restart the development server</li>
            </ol>
            <p>Your API key should look like: <code>AbCdEf1234567890...</code></p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>🖼️ Unsplash Gallery</h1>
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for images..."
            className="search-input"
          />
          <button type="submit" className="search-button" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>
      </header>

      {error && (
        <div className="error">
          <p>❌ {error}</p>
        </div>
      )}

      {loading && (
        <div className="loading">
          <p>🔄 Loading beautiful images...</p>
        </div>
      )}

      <div className="gallery">
        {images.map((image) => (
          <div key={image.id} className="image-card">
            <img
              src={image.urls.small}
              alt={image.alt_description || 'Unsplash image'}
              loading="lazy"
            />
            <div className="image-info">
              <p className="image-author">
                📸 by{' '}
                <a
                  href={image.user.links.html}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {image.user.name}
                </a>
              </p>
              <a
                href={image.links.html}
                target="_blank"
                rel="noopener noreferrer"
                className="view-on-unsplash"
              >
                View on Unsplash
              </a>
            </div>
          </div>
        ))}
      </div>

      {images.length === 0 && !loading && !error && (
        <div className="no-results">
          <p>🔍 No images found. Try a different search term!</p>
        </div>
      )}
    </div>
  )
}

export default App
