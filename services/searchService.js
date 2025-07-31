import { openaiService } from './openaiService.js';
import { scrapingService } from './scrapingService.js';
import { logger } from '../utils/logger.js';

class SearchService {
  constructor() {
    this.lastEnhancedQuery = null;
  }

  async performSearch(searchTerm, location = 'UK', currency = 'GBP') {
    try {
      logger.info(`🔍 Starting comprehensive search for: "${searchTerm}" in ${location} with ${currency}`);

      // Step 1: Enhance query with OpenAI (with fallback)
      let enhancedQuery;
      try {
        logger.info('🤖 Enhancing search query with OpenAI...');
        enhancedQuery = await openaiService.enhanceSearchQuery(searchTerm);
       this.lastEnhancedQuery = enhancedQuery;
      } catch (error) {
        logger.warn('⚠️ OpenAI enhancement failed, using fallback:', error.message);
        enhancedQuery = openaiService.getFallbackEnhancement(searchTerm);
       this.lastEnhancedQuery = enhancedQuery;
      }
      
      // Step 2: Search marketplaces with enhanced terms
      logger.info('🕷️ Scraping marketplaces...');
      const searchPromises = [];

      // Search with original term and enhanced terms
      const allSearchTerms = [searchTerm, ...enhancedQuery.search_terms].slice(0, 5); // Limit to 5 terms
      
      for (const term of allSearchTerms) {
        // Search eBay with error handling
        searchPromises.push(
          scrapingService.searchEbay(term, location).catch(error => {
            logger.warn(`⚠️ eBay search failed for "${term}":`, error.message);
            return [];
          })
        );

        // Search Gumtree with error handling
        searchPromises.push(
          scrapingService.searchGumtree(term, location).catch(error => {
            logger.warn(`⚠️ Gumtree search failed for "${term}":`, error.message);
            return [];
          })
        );
      }

      // Wait for all searches to complete
      const searchResults = await Promise.allSettled(searchPromises);
      
      // Extract successful results
      const allResults = searchResults
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value)
        .flat();

      if (allResults.length === 0) {
        logger.warn('⚠️ No results from any marketplace');
        return [];
      }

      // Flatten and deduplicate results
      const uniqueResults = this.deduplicateResults(allResults);

      logger.info(`📊 Found ${uniqueResults.length} unique results from ${allResults.length} total`);

      // Step 3: Score and rank results
      const scoredResults = this.scoreResults(uniqueResults, searchTerm, enhancedQuery);

      // Step 4: Sort by score and return top results
      const finalResults = scoredResults
        .sort((a, b) => b.score - a.score)
        .slice(0, 20); // Return top 20 results

      // Convert currency if needed
      const convertedResults = this.convertCurrency(finalResults, currency);
      logger.info(`✅ Returning ${convertedResults.length} scored and ranked results`);

      return convertedResults;

    } catch (error) {
      logger.error('💥 Search service error:', error);
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  getLastEnhancedQuery() {
    return this.lastEnhancedQuery;
  }

  deduplicateResults(results) {
    const seen = new Set();
    const unique = [];

    for (const result of results) {
      // Create a key based on title and price for deduplication
      const key = `${result.title?.toLowerCase().trim()}-${result.price?.toLowerCase().trim()}`;
      
      if (!seen.has(key) && result.title && result.price && result.link) {
        seen.add(key);
        unique.push(result);
      }
    }

    return unique;
  }

  scoreResults(results, originalQuery, enhancedQuery) {
    const queryTerms = originalQuery.toLowerCase().split(/\s+/);
    const enhancedTerms = enhancedQuery.search_terms.map(term => term.toLowerCase());
    const categories = enhancedQuery.categories.map(cat => cat.toLowerCase());

    return results.map(result => {
      let score = 0;
      const title = result.title.toLowerCase();
      const description = (result.description || '').toLowerCase();

      // Base score for having required fields
      score += 0.1;

      // Score based on original query terms in title (highest weight)
      for (const term of queryTerms) {
        if (title.includes(term)) {
          score += 0.3;
        }
        if (description.includes(term)) {
          score += 0.1;
        }
      }

      // Score based on enhanced search terms
      for (const term of enhancedTerms) {
        if (title.includes(term)) {
          score += 0.2;
        }
        if (description.includes(term)) {
          score += 0.05;
        }
      }

      // Score based on categories
      for (const category of categories) {
        if (title.includes(category) || description.includes(category)) {
          score += 0.15;
        }
      }

      // Bonus for exact phrase matches
      if (title.includes(originalQuery.toLowerCase())) {
        score += 0.4;
      }

      // Penalty for very short titles (likely incomplete)
      if (result.title.length < 20) {
        score -= 0.1;
      }

      // Bonus for having an image
      if (result.image && result.image !== '') {
        score += 0.05;
      }

      // Source-based scoring
      if (result.source === 'ebay') {
        score += 0.1; // eBay tends to have good data quality
      }

      // Ensure score is between 0 and 1
      score = Math.max(0, Math.min(1, score));

      return {
        ...result,
        score: Math.round(score * 100) / 100 // Round to 2 decimal places
      };
    });
  }

  convertCurrency(results, targetCurrency) {
    if (targetCurrency === 'GBP') return results;
    
    // Basic currency conversion rates (you can integrate a real API later)
    const rates = {
      'GBP_TO_USD': 1.27,
      'GBP_TO_EUR': 1.17,
      'USD_TO_GBP': 0.79,
      'USD_TO_EUR': 0.92,
      'EUR_TO_GBP': 0.85,
      'EUR_TO_USD': 1.09
    };

    return results.map(result => {
      let price = result.price;
      let currentCurrency = 'GBP';
      
      // Detect current currency
      if (price.includes('$')) currentCurrency = 'USD';
      else if (price.includes('€')) currentCurrency = 'EUR';
      
      // Extract numeric value
      const numericPrice = parseFloat(price.replace(/[£$€,\s]/g, ''));
      
      if (currentCurrency !== targetCurrency && !isNaN(numericPrice)) {
        const rateKey = `${currentCurrency}_TO_${targetCurrency}`;
        const rate = rates[rateKey];
        
        if (rate) {
          const convertedPrice = Math.round(numericPrice * rate);
          const symbol = targetCurrency === 'USD' ? '$' : targetCurrency === 'EUR' ? '€' : '£';
          price = `${symbol}${convertedPrice}`;
        }
      }
      
      return { ...result, price };
    });
  }
}

export const searchService = new SearchService();
