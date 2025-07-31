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

      // Use original and enhanced terms (max 5)
      const allSearchTerms = [searchTerm, ...(enhancedQuery.search_terms || [])].slice(0, 5);

      for (const term of allSearchTerms) {
        searchPromises.push(
          scrapingService.searchEbay(term, location).catch(err => {
            logger.warn(`⚠️ eBay search failed for "${term}":`, err.message);
            return [];
          })
        );
        searchPromises.push(
          scrapingService.searchGumtree(term, location).catch(err => {
            logger.warn(`⚠️ Gumtree search failed for "${term}":`, err.message);
            return [];
          })
        );
      }

      // Await all searches
      const resultsSettled = await Promise.allSettled(searchPromises);

      // Filter fulfilled results and flatten, also filter out any non-array or undefined values
      const allResults = resultsSettled
        .filter(r => r.status === 'fulfilled' && Array.isArray(r.value))
        .map(r => r.value)
        .flat();

      if (allResults.length === 0) {
        logger.warn('⚠️ No results from any marketplace');
        return [];
      }

      // Deduplicate and ensure all results have required fields
      const uniqueResults = this.deduplicateResults(allResults);

      logger.info(`📊 Found ${uniqueResults.length} unique results from ${allResults.length} total`);

      // Score and rank results
      const scoredResults = this.scoreResults(uniqueResults, searchTerm, enhancedQuery);

      // Sort by score and take top 20
      const finalResults = scoredResults
        .filter(r => r && r.title) // extra guard
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);

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
      if (!result || !result.title || !result.price || !result.link) continue;

      const key = `${result.title.toLowerCase().trim()}-${result.price.toLowerCase().trim()}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(result);
      }
    }
    return unique;
  }

  scoreResults(results, originalQuery, enhancedQuery) {
    const queryTerms = originalQuery.toLowerCase().split(/\s+/);
    const enhancedTerms = (enhancedQuery.search_terms || []).map(term => term.toLowerCase());
    const categories = (enhancedQuery.categories || []).map(cat => cat.toLowerCase());

    return results.map(result => {
      let score = 0;
      const title = (result.title || '').toLowerCase();
      const description = (result.description || '').toLowerCase();

      score += 0.1; // base

      for (const term of queryTerms) {
        if (title.includes(term)) score += 0.3;
        if (description.includes(term)) score += 0.1;
      }

      for (const term of enhancedTerms) {
        if (title.includes(term)) score += 0.2;
        if (description.includes(term)) score += 0.05;
      }

      for (const category of categories) {
        if (title.includes(category) || description.includes(category)) score += 0.15;
      }

      if (title.includes(originalQuery.toLowerCase())) score += 0.4;
      if ((result.title || '').length < 20) score -= 0.1;
      if (result.image) score += 0.05;
      if (result.source === 'ebay') score += 0.1;

      score = Math.max(0, Math.min(1, score));
      return { ...result, score: Math.round(score * 100) / 100 };
    });
  }

  convertCurrency(results, targetCurrency) {
    if (targetCurrency === 'GBP') return results;

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

      if (price.includes('$')) currentCurrency = 'USD';
      else if (price.includes('€')) currentCurrency = 'EUR';

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

