import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger.js';

class ScrapingService {
  constructor() {
    this.scrapingBeeBaseUrl = 'https://app.scrapingbee.com/api/v1/';
  }

  get scrapingBeeApiKey() {
    return process.env.SCRAPINGBEE_API_KEY;
  }

  improveEbayImageUrl(url) {
    if (!url) return url;
    // Replace thumbnail size suffix with a larger image suffix
    return url.replace(/_(32|64)\.jpg$/, '_500.jpg');
  }

  async searchEbay(searchTerm, location = 'UK') {
    try {
      logger.info(`🛒 Searching eBay for: "${searchTerm}" in ${location}`);

      if (!this.scrapingBeeApiKey || this.scrapingBeeApiKey.trim() === '') {
        logger.warn('⚠️ ScrapingBee not configured, returning mock data for testing');
        return this.getMockEbayResults(searchTerm);
      }

      // UK eBay with location filter LH_PrefLoc=3 (UK only)
      const ebayUrl = `https://www.ebay.co.uk/sch/i.html?_nkw=${encodeURIComponent(searchTerm)}&_sop=12&_fsrp=1&LH_PrefLoc=3`;

      const response = await axios.get(this.scrapingBeeBaseUrl, {
        params: {
          api_key: this.scrapingBeeApiKey,
          url: ebayUrl,
          render_js: 'false',
          premium_proxy: 'true',
          country_code: 'gb'
        },
        timeout: 45000
      });

      const $ = cheerio.load(response.data);
      const listings = [];

      $('.s-item').each((index, element) => {
        if (index >= 15) return false;

        const $item = $(element);

        const title = $item.find('.s-item__title').text().trim();
        const price = $item.find('.s-item__price').text().trim();
        const link = $item.find('.s-item__link').attr('href');
        let image = $item.find('.s-item__image img').attr('src');

        image = this.improveEbayImageUrl(image);

        if (title && price && link && !title.toLowerCase().includes('shop on ebay')) {
          listings.push({
            title: this.cleanTitle(title),
            price: this.cleanPrice(price),
            link: link,
            image: image || '',
            source: 'ebay',
            description: title
          });
        }
      });

      logger.info(`✅ Found ${listings.length} eBay listings`);
      return listings;

    } catch (error) {
      logger.error(`❌ eBay search error for "${searchTerm}":`, {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        code: error.code,
        url: error.config?.url
      });
      return [];
    }
  }

  // Keep your existing methods unchanged below

  async searchGumtree(searchTerm, location = '') {
    // existing code unchanged
  }

  async searchFacebookMarketplace(searchTerm, location = '') {
    // existing code unchanged
  }

  cleanTitle(title) {
    return title
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s\-.,()]/g, '')
      .trim()
      .substring(0, 200);
  }

  cleanPrice(price) {
    const priceMatch = price.match(/[£$€¥₹]\s*[\d,]+(?:\.\d{2})?|\d+(?:\.\d{2})?\s*[£$€¥₹]/);
    if (priceMatch) {
      return priceMatch[0].replace(/\s+/g, '');
    }
    const numberMatch = price.match(/[\d,]+(?:\.\d{2})?/);
    if (numberMatch) {
      return `£${numberMatch[0]}`;
    }
    return price.trim().substring(0, 20);
  }

  getMockGumtreeResults(searchTerm) {
    // existing code unchanged
  }

  getMockEbayResults(searchTerm) {
    // existing code unchanged
  }

  getMockFacebookResults(searchTerm) {
    // existing code unchanged
  }
}

export const scrapingService = new ScrapingService();
