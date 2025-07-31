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

  improveEbayImageUrl(url, $item) {
    if (!url && $item) {
      // Try to get higher-res image from srcset or data-src attributes
      const srcset = $item.find('.s-item__image img').attr('srcset');
      if (srcset) {
        const candidates = srcset.split(',').map(s => s.trim().split(' ')[0]);
        const highRes = candidates.find(c => c.includes('_1280.jpg')) 
                     || candidates.find(c => c.includes('_640.jpg')) 
                     || candidates.find(c => c.includes('_500.jpg')) 
                     || candidates.pop();
        if (highRes) return highRes;
      }
      const dataSrc = $item.find('.s-item__image img').attr('data-src');
      if (dataSrc) return dataSrc;
      return url;
    }

    // Replace common low-res suffixes with higher-res suffixes
    const replacements = ['_1280.jpg', '_640.jpg', '_500.jpg'];
    for (const suffix of replacements) {
      const candidate = url.replace(/_(32|64|96|140|180|225)\.jpg$/, suffix);
      if (candidate) return candidate;
    }

    return url;
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

        image = this.improveEbayImageUrl(image, $item);

        if (title && price && link && !title.toLowerCase().includes('shop on ebay')) {
          listings.push({
            title: this.cleanTitle(title),
            price: this.cleanPrice(price),
            link,
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

 async searchCashConverters(searchTerm, location = 'UK') {
  try {
    logger.info(`💰 Searching CashConverters for: "${searchTerm}" in ${location}`);

    if (!this.scrapingBeeApiKey || this.scrapingBeeApiKey.trim() === '') {
      logger.warn('⚠️ ScrapingBee not configured, returning mock data for testing');
      return this.getMockCashConvertersResults(searchTerm);
    }

    // Construct CashConverters search URL (example)
    const cashConvertersUrl = `https://www.cashconverters.co.uk/search?q=${encodeURIComponent(searchTerm)}`;

    const response = await axios.get('https://app.scrapingbee.com/api/v1/', {
      params: {
        api_key: this.scrapingBeeApiKey,
        url: cashConvertersUrl,
        render_js: 'true',       // maybe needed if page uses JS
        premium_proxy: 'true',
        country_code: 'gb',
        wait: 3000              // wait 3 seconds if needed for JS content
      },
      timeout: 45000
    });

    const $ = cheerio.load(response.data);
    const listings = [];

    // Parse listings — adapt selectors to CashConverters DOM structure
    $('.product-card').each((index, element) => {
      if (index >= 15) return false;

      const $item = $(element);
      const title = $item.find('.product-card__title').text().trim();
      const price = $item.find('.product-card__price').text().trim();
      let link = $item.find('a.product-card__link').attr('href');
      let image = $item.find('img.product-card__image').attr('src');

      if (link && link.startsWith('/')) {
        link = `https://www.cashconverters.co.uk${link}`;
      }

      if (title && price && link) {
        listings.push({
          title: this.cleanTitle(title),
          price: this.cleanPrice(price),
          link,
          image: image || '',
          source: 'cashconverters',
          description: title
        });
      }
    });

    logger.info(`✅ Found ${listings.length} CashConverters listings`);
    return listings;

  } catch (error) {
    logger.error(`❌ CashConverters search error for "${searchTerm}":`, {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      code: error.code,
      url: error.config?.url
    });
    return [];
  }
}


  // Placeholder: Add your existing searchGumtree method here
  async searchGumtree(searchTerm, location = '') {
    // existing code unchanged
  }

  // Placeholder: Add your existing searchFacebookMarketplace method here
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

  // Placeholder: Add your existing mock data methods here
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
