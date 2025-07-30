import { searchService } from './services/searchService.js';
import { logger } from './utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

async function testSearch() {
  try {
    logger.info('🧪 Starting backend test...');
    
    const testQuery = 'strymon ob1';
    logger.info(`Testing search for: "${testQuery}"`);
    
    const results = await searchService.performSearch(testQuery);
    
    logger.info(`✅ Test completed successfully!`);
    logger.info(`📊 Results: ${results.length} listings found`);
    
    if (results.length > 0) {
      logger.info('📝 Sample result:');
      console.log(JSON.stringify(results[0], null, 2));
    }
    
    // Test health check data
    logger.info('🏥 Service status:');
    console.log({
      openai: process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ Missing',
      scrapingbee: process.env.SCRAPINGBEE_API_KEY ? '✅ Configured' : '❌ Missing'
    });
    
  } catch (error) {
    logger.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testSearch();
}