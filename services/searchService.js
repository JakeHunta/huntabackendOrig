import { openaiService } from './openaiService.js';
import { scrapingService } from './scrapingService.js';
import { logger } from '../utils/logger.js';

/**
 * Helpers
 */
const SOURCE_WEIGHTS = {
  ebay: 1.0,
  gumtree: 0.9,
  cashConverters: 0.8,
  facebook: 0.7,
  vinted: 0.7,
  depop: 0.7,
  discogs: 0.8,
  googleShopping: 0.6,
  googleResults: 0.6,
};

function normalizeText(s) {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function extractDomain(url = '') {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function parsePriceNumber(str) {
  if (typeof str === 'number') return str;
  if (!str) return null;
  const m = String(str).replace(/,/g, '').match(/(-?\d+(?:\.\d{1,2})?)/);
  return m ? parseFloat(m[1]) : null;
}

function median(nums) {
  const a = nums.slice().sort((x, y) => x - y);
  if (!a.length) return null;
  return a[Math.floor(a.length / 2)];
}

function priceClosenessScore(amount, med) {
  if (!amount || !med) return 0.5;
  const diffPct = Math.abs(amount - med) / (med + 1e-6); // 0 is exact, higher is worse
  return Math.max(0, 1 - Math.min(1, diffPct)); // 1 when exact, 0 when very far
}

function recencyScore(iso) {
  if (!iso) return 0.5;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return 0.5;
  const days = (Date.now() - ts) / (1000 * 60 * 60 * 24);
  if (days <= 1) return 1.0;
  if (days <= 7) return 0.8;
  if (days <= 30) return 0.6;
  if (days <= 90) return 0.4;
  return 0.2;
}

function uniqKey(result) {
  const t = normalizeText(result?.title);
  const priceNum = parsePriceNumber(result?.price);
  const dom = extractDomain(result?.link);
  return `${t}::${priceNum ?? 'na'}::${dom}`;
}

/**
 * Build the list of sources to query based on what exists on scrapingService
 * and optional `options.sources` (array of keys).
 */
function getActiveSources(options) {
  const maybe = [
    ['ebay', scrapingService.searchEbay],
    ['gumtree', scrapingService.searchGumtree],
    ['cashConverters', scrapingService.searchCashConverters],
    ['facebook', scrapingService.searchFacebookMarketplace],
    ['vinted', scrapingService.searchVinted],
    ['depop', scrapingService.searchDepop],
    ['discogs', scrapingService.searchDiscogs],
    ['googleShopping', scrapingService.searchGoogleShopping],
    ['googleResults', scrapingService.searchGoogleResults],
  ];

  const available = maybe
    .filter(([_, fn]) => typeof fn === 'function')
    .map(([key, fn]) => ({ key, fn }));

  if (!options?.sources || !Array.isArray(options.sources) || options.sources.length === 0) {
    return available;
  }

  const allow = new Set(options.sources.map(s => s.toLowerCase()));
  return available.filter(s => allow.has(s.key.toLowerCase()));
}

class SearchService {
  constructor() {
    this.lastEnhancedQuery = null;
  }

  /**
   * Perform a search across multiple marketplaces.
   * @param {string} searchTerm
   * @param {string} [location='UK']
   * @param {string} [currency='GBP']
   * @param {object} [options] - optional: { sources?: string[], maxPages?: number }
   * @returns {Promise<Array>} array of ranked result objects
   */
  async performSearch(searchTerm, location = 'UK', currency = 'GBP', options = {}) {
    const startedAt = Date.now();
    try {
      logger.info(`🔍 Starting comprehensive search for "${searchTerm}" (loc=${location}, cur=${currency})`);

      // 1) Enhance query via OpenAI (graceful fallback)
      let enhancedQuery;
      try {
        logger.info('🤖 Enhancing search query with OpenAI...');
        enhancedQuery = await openaiService.enhanceSearchQuery(searchTerm);
        this.lastEnhancedQuery = enhancedQuery;
      } catch (error) {
        logger.warn(`⚠️ OpenAI enhancement failed, falling back. ${error?.message || error}`);
        enhancedQuery = openaiService.getFallbackEnhancement(searchTerm);
        this.lastEnhancedQuery = enhancedQuery;
      }

      // Build list of search terms to try (original + expansions, cap at 5)
      const expansions = Array.isArray(enhancedQuery?.search_terms) ? enhancedQuery.search_terms : [];
      const allSearchTerms = [searchTerm, ...expansions]
        .map(s => String(s || '').trim())
        .filter(Boolean)
        .slice(0, 5);

      // 2) Pick sources
      const activeSources = getActiveSources(options);
      if (activeSources.length === 0) {
        logger.warn('⚠️ No scraping sources available.');
        return [];
      }

      logger.info(`🕷️ Scraping ${activeSources.length} sources with up to ${allSearchTerms.length} terms...`);

      // 3) Fire searches in parallel; each safely caught
      const searchPromises = [];
      for (const term of allSearchTerms) {
        for (const { key, fn } of activeSources) {
          searchPromises.push(
            Promise.resolve()
              .then(() => fn(term, location, options?.maxPages))
              .catch(err => {
                logger.warn(`⚠️ ${key} search failed for "${term}": ${err?.message || err}`);
                return [];
              })
              .then(items => Array.isArray(items) ? items : [])
          );
        }
      }

      const settled = await Promise.allSettled(searchPromises);
      const allResults = settled
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value)
        .filter(Boolean);

      if (allResults.length === 0) {
        logger.warn('⚠️ No results from any marketplace');
        return [];
      }

      // 4) Deduplicate
      const seen = new Set();
      const unique = [];
      for (const r of allResults) {
        // normalize essentials
        const title = r?.title ?? '';
        const price = r?.price ?? '';
        const link = r?.link ?? '';
        if (!title || !link) continue;

        const key = uniqKey({ title, price, link });
        if (seen.has(key)) continue;
        seen.add(key);

        // store numeric price for ranking
        const priceAmount = parsePriceNumber(price);
        unique.push({ ...r, priceAmount });
      }

      logger.info(`📊 Found ${unique.length} unique results from ${allResults.length} total`);

      // 5) Compute median price for ranking
      const priceNums = unique.map(x => x.priceAmount).filter(n => typeof n === 'number' && !Number.isNaN(n));
      const med = median(priceNums);

      // Precompute term sets
      const queryTerms = normalizeText(searchTerm).split(' ').filter(Boolean);
      const enhancedTerms = (enhancedQuery?.search_terms || []).map(normalizeText).filter(Boolean);
      const categories = (enhancedQuery?.categories || []).map(normalizeText).filter(Boolean);

      // 6) Score
      const scored = unique.map((result) => {
        const title = normalizeText(result.title);
        const description = normalizeText(result.description || '');
        const source = result.source || extractDomain(result.link);

        // term match scores
        let matchScore = 0;
        for (const t of queryTerms) {
          if (t && title.includes(t)) matchScore += 0.30;
          if (t && description.includes(t)) matchScore += 0.10;
        }
        for (const t of enhancedTerms) {
          if (t && title.includes(t)) matchScore += 0.20;
          if (t && description.includes(t)) matchScore += 0.05;
        }
        for (const c of categories) {
          if (c && (title.includes(c) || description.includes(c))) matchScore += 0.15;
        }
        if (title.includes(normalizeText(searchTerm))) matchScore += 0.25;

        // quality tweaks
        if ((result.title || '').length < 20) matchScore -= 0.05;
        if (result.image) matchScore += 0.03;

        // price & recency
        const priceScore = priceClosenessScore(result.priceAmount, med) * 0.15;
        const recScore = recencyScore(result.postedAt) * 0.10;

        // source trust
        const srcWeight = (SOURCE_WEIGHTS[source] ?? 0.6) * 0.05;

        let score = 0.50 * Math.min(1, Math.max(0, matchScore))
                  + priceScore
                  + recScore
                  + srcWeight;

        score = Math.max(0, Math.min(1, score));
        return { ...result, score: Math.round(score * 100) / 100 };
      });

      // 7) Sort & take top N
      const finalResults = scored
        .filter(r => r && r.title)
        .sort((a, b) => b.score - a.score)
        .slice(0, 40);

      // 8) Convert currency if needed (your simple approach)
      const converted = this.convertCurrency(finalResults, currency);

      const ms = Date.now() - startedAt;
      logger.info(`✅ Returning ${converted.length} results in ${ms}ms`);
      return converted;

    } catch (error) {
      logger.error('💥 Search service error:', error?.stack || error);
      throw new Error(`Search failed: ${error?.message || error}`);
    }
  }

  getLastEnhancedQuery() {
    return this.lastEnhancedQuery;
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

      if (typeof price === 'number') {
        // If you later store numeric prices per currency, wire that here
        return result;
      }

      if (!price) return result;

      if (price.includes('$')) currentCurrency = 'USD';
      else if (price.includes('€')) currentCurrency = 'EUR';

      const numericPrice = parsePriceNumber(price);

      if (currentCurrency !== targetCurrency && !isNaN(numericPrice)) {
        const rateKey = `${currentCurrency}_TO_${targetCurrency}`;
        const rate = rates[rateKey];
        if (rate) {
          const convertedPrice = Math.round(numericPrice * rate);
          const symbol = targetCurrency === 'USD' ? '$' : targetCurrency === 'EUR' ? '€' : '£';
          price = `${symbol}${convertedPrice}`;
          return { ...result, price };
        }
      }
      return result;
    });
  }
}

export const searchService = new SearchService();
