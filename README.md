# Hunta Backend API

A robust Node.js backend for the Hunta smart second-hand marketplace search application.

## Features

- 🤖 **AI-Powered Query Enhancement** - Uses OpenAI to optimize search terms
- 🕷️ **Multi-Marketplace Scraping** - Searches eBay and Gumtree via ScrapingBee
- 🎯 **Intelligent Result Scoring** - Ranks results by relevance
- ⚡ **Response Caching** - Improves performance with intelligent caching
- 🛡️ **Security & Rate Limiting** - Production-ready security features
- 📊 **Comprehensive Logging** - Detailed logging for monitoring

## Quick Start

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```

Edit `.env` with your API keys:
```env
OPENAI_API_KEY=your_openai_api_key_here
SCRAPINGBEE_API_KEY=your_scrapingbee_api_key_here
PORT=3001
NODE_ENV=production
```

### 3. Start the Server
```bash
# Production
npm start

# Development (with auto-reload)
npm run dev
```

### 4. Test the API
```bash
# Run built-in tests
npm test

# Manual test
curl -X POST http://localhost:3001/search \
  -H "Content-Type: application/json" \
  -d '{"search_term": "strymon ob1"}'
```

## API Endpoints

### POST /search
Search for second-hand items across marketplaces.

**Request:**
```json
{
  "search_term": "strymon ob1"
}
```

**Response:**
```json
[
  {
    "title": "Strymon OB.1 Optical Compressor Pedal",
    "image": "https://example.com/image.jpg",
    "price": "£280",
    "link": "https://www.ebay.com/itm/123456",
    "source": "ebay",
    "description": "Strymon OB.1 Optical Compressor Pedal",
    "score": 0.92
  }
]
```

### GET /health
Check API health and service status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-08T10:30:00.000Z",
  "services": {
    "openai": "configured",
    "scrapingbee": "configured"
  }
}
```

## Architecture

### Services

- **SearchService** - Orchestrates the entire search process
- **OpenAIService** - Handles query enhancement using GPT-4
- **ScrapingService** - Manages marketplace scraping via ScrapingBee

### Key Features

1. **Query Enhancement**: OpenAI analyzes search terms and generates optimized variations
2. **Multi-Source Scraping**: Simultaneously searches eBay and Gumtree
3. **Result Scoring**: Intelligent algorithm ranks results by relevance
4. **Deduplication**: Removes duplicate listings across sources
5. **Caching**: 5-minute cache for improved performance
6. **Error Handling**: Graceful degradation when services are unavailable

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key for query enhancement | Required |
| `SCRAPINGBEE_API_KEY` | ScrapingBee API key for web scraping | Required |
| `PORT` | Server port | 3001 |
| `NODE_ENV` | Environment (development/production) | development |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window in milliseconds | 900000 |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | 100 |
| `CACHE_TTL_SECONDS` | Cache time-to-live in seconds | 300 |

### Rate Limiting

- **Default**: 100 requests per 15 minutes per IP
- **Configurable** via environment variables
- **Headers**: Returns rate limit info in response headers

### Security Features

- **Helmet.js** - Security headers
- **CORS** - Configurable cross-origin requests
- **Input validation** - Sanitizes and validates all inputs
- **Error handling** - Prevents information leakage

## Deployment

### Render.com (Recommended)

1. Connect your GitHub repository to Render
2. Set environment variables in Render dashboard
3. Deploy with these settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Node Version**: 18+

### Other Platforms

The backend is compatible with:
- Heroku
- Railway
- DigitalOcean App Platform
- AWS Elastic Beanstalk
- Google Cloud Run

## Monitoring & Debugging

### Logs

The application provides structured logging:

```bash
# View logs in development
npm run dev

# Production logs (JSON format)
tail -f logs/app.log
```

### Health Checks

Monitor service health:
```bash
curl http://localhost:3001/health
```

### Performance

- **Caching**: Responses cached for 5 minutes
- **Concurrent Scraping**: Multiple sources scraped simultaneously
- **Timeout Handling**: 45-second timeout for scraping requests
- **Memory Management**: Automatic cleanup of old cache entries

## Troubleshooting

### Common Issues

1. **"OpenAI API key not configured"**
   - Set `OPENAI_API_KEY` in your `.env` file

2. **"ScrapingBee API key not configured"**
   - Set `SCRAPINGBEE_API_KEY` in your `.env` file

3. **"Search request timed out"**
   - ScrapingBee requests can take 30-60 seconds
   - Check your ScrapingBee account limits

4. **"Rate limit exceeded"**
   - Wait for the rate limit window to reset
   - Consider upgrading your API plan

### Debug Mode

Enable detailed logging:
```bash
NODE_ENV=development npm run dev
```

## API Keys Setup

### OpenAI API Key
1. Visit [OpenAI API](https://platform.openai.com/api-keys)
2. Create a new API key
3. Add to `.env` as `OPENAI_API_KEY`

### ScrapingBee API Key
1. Visit [ScrapingBee](https://www.scrapingbee.com/)
2. Sign up for an account
3. Get your API key from the dashboard
4. Add to `.env` as `SCRAPINGBEE_API_KEY`

## Support

For issues and questions:
1. Check the logs for error details
2. Verify API keys are correctly configured
3. Test individual services using the test script
4. Check API service status pages (OpenAI, ScrapingBee)

## License

MIT License - see LICENSE file for details.