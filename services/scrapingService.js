import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger.js';

class ScrapingService {
  constructor() {
    this.scrapingBeeBaseUrl = 'https://app.scrapingbee.com/api/v1/
';
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

      const ebayUrl = `https://www.ebay.co.uk/sch/i.html?_nkw=${encodeURIComponent(searchTerm)}&_sop=12&_fsrp=1&LH_PrefLoc=3`;

      const params = {
        api_key: this.scrapingBeeApiKey,
        url: ebayUrl,
        render_js: 'false',
        premium_proxy: 'true',
        country_code: 'gb'
      };
      logger.info('ScrapingBee request params for eBay:', params);

      const response = await axios.get(this.scrapingBeeBaseUrl, { params, timeout: 45000 });

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

  async searchGumtree(searchTerm, location = '') {
    try {
      logger.info(`🌳 Searching Gumtree for: "${searchTerm}" in ${location}`);

      if (!this.scrapingBeeApiKey || this.scrapingBeeApiKey.trim() === '') {
        logger.warn('⚠️ ScrapingBee not configured, returning mock data for testing');
        return this.getMockGumtreeResults(searchTerm);
      }

      let gumtreeUrl = `https://www.gumtree.com/search?search_category=all&q=${encodeURIComponent(searchTerm)}`;
      if (location && location !== 'UK') {
        gumtreeUrl += `&search_location=${encodeURIComponent(location)}`;
      }

      const params = {
        api_key: this.scrapingBeeApiKey,
        url: gumtreeUrl,
        render_js: 'true',
        premium_proxy: 'true',
        country_code: 'gb'
      };
      logger.info('ScrapingBee request params for Gumtree:', params);

      const response = await axios.get(this.scrapingBeeBaseUrl, { params, timeout: 45000 });

      const $ = cheerio.load(response.data);
      const listings = [];

      $('.listing-link, .listing-item, [data-q="listing"]').each((index, element) => {
        if (index >= 15) return false;

        const $item = $(element);
        let title = $item.find('.listing-title, .listing-item-title, h2, h3').first().text().trim();
        let price = $item.find('.listing-price, .price, .ad-price').first().text().trim();
        let link = $item.find('a').first().attr('href');
        let image = $item.find('img').first().attr('src') || $item.find('img').first().attr('data-src');

        if (!title) title = $item.find('[data-q="listing-title"], .tileTitle').text().trim();
        if (!price) price = $item.find('[data-q="price"], .tilePrice').text().trim();
        if (!link) link = $item.attr('href') || $item.find('a[href*="/p/"]').attr('href');
        if (link && link.startsWith('/')) link = `https://www.gumtree.com${link}`;

        if (title && price && link) {
          listings.push({
            title: this.cleanTitle(title),
            price: this.cleanPrice(price),
            link,
            image: image || '',
            source: 'gumtree',
            description: title
          });
        }
      });

      logger.info(`✅ Found ${listings.length} Gumtree listings`);
      return listings;

    } catch (error) {
      logger.error(`❌ Gumtree search error for "${searchTerm}":`, {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        code: error.code,
        url: error.config?.url
      });
      return [];
    }
  }

  async searchFacebookMarketplace(searchTerm, location = '') {
    try {
      logger.info(`📘 Searching Facebook Marketplace for: "${searchTerm}" in ${location}`);

      if (!this.scrapingBeeApiKey || this.scrapingBeeApiKey.trim() === '') {
        logger.warn('⚠️ ScrapingBee not configured, returning mock data for testing');
        return this.getMockFacebookResults(searchTerm);
      }

      let facebookUrl = `https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(searchTerm)}`;
      if (location && location !== 'UK') {
        facebookUrl += `&exact=false`;
      }

      const params = {
        api_key: this.scrapingBeeApiKey,
        url: facebookUrl,
        render_js: 'true',
        premium_proxy: 'true',
        country_code: 'gb',
        wait: 3000
      };
      logger.info('ScrapingBee request params for Facebook Marketplace:', params);

      const response = await axios.get(this.scrapingBeeBaseUrl, { params, timeout: 60000 });

      const $ = cheerio.load(response.data);
      const listings = [];

      $('[data-testid="marketplace-item"], .marketplace-item, .feed-story-item').each((index, element) => {
        if (index >= 15) return false;

        const $item = $(element);
        let title = $item.find('span[dir="auto"]').first().text().trim();
        let price = $item.find('span').filter((i, el) => $(el).text().match(/[£$€]\d+/)).first().text().trim();
        let link = $item.find('a').first().attr('href');
        let image = $item.find('img').first().attr('src');

        if (link && link.startsWith('/')) link = `https://www.facebook.com${link}`;

        if (title && price && link) {
          listings.push({
            title: this.cleanTitle(title),
            price: this.cleanPrice(price),
            link,
            image: image || '',
            source: 'facebook',
            description: title
          });
        }
      });

      logger.info(`✅ Found ${listings.length} Facebook Marketplace listings`);
      return listings;

    } catch (error) {
      logger.error(`❌ Facebook Marketplace search error for "${searchTerm}":`, {
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

      const url = `https://www.cashconverters.co.uk/search?q=${encodeURIComponent(searchTerm)}`;

      const params = {
        api_key: this.scrapingBeeApiKey,
        url,
        render_js: 'true',
        premium_proxy: 'true',
        country_code: 'gb'
      };
      logger.info('ScrapingBee request params for CashConverters:', params);

      const response = await axios.get(this.scrapingBeeBaseUrl, { params, timeout: 45000 });

      const $ = cheerio.load(response.data);
      const listings = [];

      $('.product-tile, .product').each((index, element) => {
        if (index >= 15) return false;

        const $item = $(element);

        const title = $item.find('.product-title, .product-name').text().trim();
        const price = $item.find('.product-price, .price').text().trim();
        let link = $item.find('a').attr('href');
        let image = $item.find('img').attr('src') || $item.find('img').attr('data-src');

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
    return [
      {
        title: `${searchTerm} - Excellent Condition`,
        price: '£150',
        link: 'https://www.gumtree.com/p/mock-listing-1',
        image: 'https://images.pexels.com/photos/1751731/pexels-photo-1751731.jpeg',
        source: 'gumtree',
        description: `Used ${searchTerm} in excellent condition`
      },
      {
        title: `${searchTerm} - Good Deal`,
        price: '£120',
        link: 'https://www.gumtree.com/p/mock-listing-2',
        image: 'https://images.pexels.com/photos/1751731/pexels-photo-1751731.jpeg',
        source: 'gumtree',
        description: `Second-hand ${searchTerm} at great price`
      }
    ];
  }

  getMockEbayResults(searchTerm) {
    return [
      {
        title: `${searchTerm} - eBay Special`,
        price: '£180',
        link: 'https://www.ebay.com/itm/mock-listing-1',
        image: 'https://images.pexels.com/photos/1751731/pexels-photo-1751731.jpeg',
        source: 'ebay',
        description: `Pre-owned ${searchTerm} from eBay`
      }
    ];
  }

  getMockFacebookResults(searchTerm) {
    return [
      {
        title: `${searchTerm} - Facebook Find`,
        price: '£100',
        link: 'https://www.facebook.com/marketplace/item/mock-listing-1',
        image: 'https://images.pexels.com/photos/1751731/pexels-photo-1751731.jpeg',
        source: 'facebook',
        description: `Great ${searchTerm} from Facebook Marketplace`
      }
    ];
  }

  getMockCashConvertersResults(searchTerm) {
    return [
      {
        title: `${searchTerm} - CashConverters Mock`,
        price: '£99',
        link: 'https://www.cashconverters.co.uk/mock-listing-1',
        image: 'https://images.pexels.com/photos/1751731/pexels-photo-1751731.jpeg',
        source: 'cashconverters',
        description: `Mock listing for ${searchTerm} on CashConverters`
      }
    ];
  }
}

export const scrapingService = new ScrapingService();
