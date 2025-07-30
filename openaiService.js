import axios from 'axios';
import { logger } from '../utils/logger.js';

class OpenAIService {
  constructor() {
    this.baseURL = 'https://api.openai.com/v1';
  }

  get apiKey() {
    return process.env.OPENAI_API_KEY;
  }

  async enhanceSearchQuery(searchTerm) {
    if (!this.apiKey || this.apiKey.trim() === '') {
      logger.info('🔄 Using fallback enhancement (no OpenAI key)');
      return this.getFallbackEnhancement(searchTerm);
    }

    try {
      logger.info(`🤖 Enhancing query: "${searchTerm}"`);

      const systemPrompt = `You are Hunta, an AI assistant that helps users find second-hand products across marketplaces like eBay and Gumtree.

Your task is to enhance search queries to improve marketplace search results.

Given a user's search term, provide:
1. Multiple optimized search terms that sellers typically use
2. Relevant product categories
3. Community forums where these items are discussed
4. Flags for special characteristics

Respond with valid JSON in this exact format:
{
  "original": "user input here",
  "search_terms": ["term1", "term2", "term3", "term4"],
  "categories": ["category1", "category2"],
  "forums": ["forum1", "forum2"],
  "flags": {
    "high_value_item": true/false,
    "common_scam_target": true/false,
    "likely_on_forums": true/false,
    "reseller_friendly": true/false
  }
}

Focus on terms that sellers actually use in listings, including:
- Brand names and model numbers
- Common abbreviations
- Alternative names
- Condition descriptors (used, pre-owned, second hand)
- Popular misspellings`;

      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: `Enhance this search query for second-hand marketplace search: "${searchTerm}"`
          }
        ],
        temperature: 0.3,
        max_tokens: 800,
        timeout: 30000
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      const content = response.data.choices[0].message.content.trim();
      
      // Clean and parse JSON response
      let cleanContent = content;
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const enhancement = JSON.parse(cleanContent);
      
      // Validate the response structure
      if (!enhancement.search_terms || !Array.isArray(enhancement.search_terms)) {
        throw new Error('Invalid OpenAI response: missing search_terms array');
      }

      logger.info(`✅ Query enhanced: ${enhancement.search_terms.length} terms generated`);
      
      return {
        original: searchTerm,
        search_terms: enhancement.search_terms.slice(0, 8), // Limit to 8 terms
        categories: enhancement.categories || [],
        forums: enhancement.forums || [],
        flags: {
          high_value_item: enhancement.flags?.high_value_item || false,
          common_scam_target: enhancement.flags?.common_scam_target || false,
          likely_on_forums: enhancement.flags?.likely_on_forums || false,
          reseller_friendly: enhancement.flags?.reseller_friendly || false
        }
      };

    } catch (error) {
      logger.error('❌ OpenAI enhancement error:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      
      // Return fallback enhancement on error
      return this.getFallbackEnhancement(searchTerm);
    }
  }

  getFallbackEnhancement(searchTerm) {
    logger.info('🔄 Using intelligent fallback query enhancement');
    
    const terms = [
      searchTerm,
      `used ${searchTerm}`,
      `${searchTerm} second hand`,
      `${searchTerm} pre-owned`,
      `${searchTerm} secondhand`
    ];

    // Add some basic intelligence to fallback
    const lowerTerm = searchTerm.toLowerCase();
    
    // Add brand-specific terms
    if (lowerTerm.includes('iphone') || lowerTerm.includes('apple')) {
      terms.push(`${searchTerm} unlocked`, `${searchTerm} refurbished`);
    }
    
    if (lowerTerm.includes('guitar') || lowerTerm.includes('bass')) {
      terms.push(`${searchTerm} electric`, `${searchTerm} acoustic`);
    }
    
    if (lowerTerm.includes('car') || lowerTerm.includes('vehicle')) {
      terms.push(`${searchTerm} auto`, `${searchTerm} motor`);
    }

    return {
      original: searchTerm,
      search_terms: terms.slice(0, 6),
      categories: ['general'],
      forums: ['reddit'],
      flags: {
        high_value_item: lowerTerm.includes('iphone') || lowerTerm.includes('macbook') || lowerTerm.includes('rolex'),
        common_scam_target: lowerTerm.includes('iphone') || lowerTerm.includes('designer') || lowerTerm.includes('luxury'),
        likely_on_forums: lowerTerm.includes('guitar') || lowerTerm.includes('vintage') || lowerTerm.includes('collectible'),
        reseller_friendly: true
      }
    };
  }
}

export const openaiService = new OpenAIService();