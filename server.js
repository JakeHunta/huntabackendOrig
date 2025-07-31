import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { searchService } from './services/searchService.js';

// Load environment variables first
dotenv.config();

// Verify environment variables are loaded correctly
console.log('🔧 Environment check:');
console.log('- OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? `✅ Loaded (${process.env.OPENAI_API_KEY.substring(0, 10)}...)` : '❌ Missing');
console.log('- SCRAPINGBEE_API_KEY:', process.env.SCRAPINGBEE_API_KEY ? `✅ Loaded (${process.env.SCRAPINGBEE_API_KEY.substring(0, 10)}...)` : '❌ Missing');
console.log('- NODE_ENV:', process.env.NODE_ENV || 'development');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory user stats
const userStats = {
  totalSearches: 0
};

// Utility function to log with timestamp
const logWithTimestamp = (level, message, data = {}) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
  if (Object.keys(data).length > 0) {
    console.log('Data:', JSON.stringify(data, null, 2));
  }
};

// Routes

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Hunta Backend API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      'POST /search': 'Search for second-hand items',
      'GET /health': 'Health check',
      'GET /user-stats': 'User and usage statistics',
      'GET /': 'API information'
    },
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      openai: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
      scrapingbee: process.env.SCRAPINGBEE_API_KEY ? 'configured' : 'missing'
    },
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// User stats endpoint
app.get('/user-stats', (req, res) => {
  res.json({
    uptimeSeconds: Math.floor(process.uptime()),
    totalSearches: userStats.totalSearches,
    timestamp: new Date().toISOString()
  });
});

// Search endpoint
app.post('/search', async (req, res) => {
  const startTime = Date.now();

  try {
    const { search_term, location = 'UK', currency = 'GBP' } = req.body;

    // Validate input
    if (!search_term || typeof search_term !== 'string' || search_term.trim().length === 0) {
      logWithTimestamp('warn', 'Invalid search term provided', { search_term });
      return res.status(400).json({
        error: 'Invalid search term',
        message: 'Please provide a non-empty search term as a string',
        timestamp: new Date().toISOString()
      });
    }

    const cleanSearchTerm = search_term.trim();
    const searchLocation = location?.trim() || '';
    const searchCurrency = currency || 'GBP';

    logWithTimestamp('info', `Starting search process`, {
      searchTerm: cleanSearchTerm,
      location: searchLocation,
      currency: searchCurrency
    });

    // Increment total searches
    userStats.totalSearches++;

    // Use the search service to perform the search
    const listings = await searchService.performSearch(cleanSearchTerm, searchLocation, searchCurrency);

    // Get enhanced query from search service (it's already generated during the search)
    const enhancedQuery = searchService.getLastEnhancedQuery();

    const processingTime = Date.now() - startTime;

    logWithTimestamp('info', 'Search completed successfully', {
      searchTerm: cleanSearchTerm,
      location: searchLocation,
      currency: searchCurrency,
      resultsCount: listings.length,
      processingTimeMs: processingTime
    });

    // Return results
    res.json({
      listings: listings,
      enhancedQuery: enhancedQuery
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;

    console.error('💥 Full search error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      processingTimeMs: processingTime,
      searchTerm: req.body.search_term
    });

    logWithTimestamp('error', 'Search request failed', {
      message: error.message,
      stack: error.stack,
      processingTimeMs: processingTime,
      name: error.name,
      code: error.code
    });

    res.status(500).json({
      error: 'Search failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      code: error.code,
      name: error.name,
      timestamp: new Date().toISOString(),
      processingTime: `${processingTime}ms`
    });
  }
});

// 404 handler
app.use((req, res) => {
  logWithTimestamp('warn', '404 - Endpoint not found', {
    method: req.method,
    path: req.path,
    ip: req.ip
  });

  res.status(404).json({
    error: 'Endpoint not found',
    message: `${req.method} ${req.path} is not a valid endpoint`,
    availableEndpoints: {
      'POST /search': 'Search for second-hand items',
      'GET /health': 'Health check',
      'GET /user-stats': 'User and usage statistics',
      'GET /': 'API information'
    },
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((error, req, res, next) => {
  logWithTimestamp('error', 'Unhandled server error', {
    message: error.message,
    stack: error.stack,
    name: error.name,
    code: error.code,
    method: req.method,
    path: req.path
  });

  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred',
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  logWithTimestamp('info', `🎯 Hunta Backend API started successfully`);
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🔍 Search endpoint: POST http://localhost:${PORT}/search`);
  console.log(`🏥 Health check: GET http://localhost:${PORT}/health`);
  console.log(`🔑 OpenAI API: ${process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log(`🕷️ ScrapingBee API: ${process.env.SCRAPINGBEE_API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
