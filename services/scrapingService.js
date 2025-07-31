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

  async searchEbay(searchTerm, location = '') {
    try {
      logger.info(`🛒 Searching eBay for: "${searchTerm}" in ${location}`);

      if (!this.scrapingBeeApiKey || this.scrapingBeeApiKey.trim() === '') {
        logger.warn('⚠️ ScrapingBee not configured, returning mock data for testing');
        return this.getMockEbayResults(searchTerm);
      }

      const ebayUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(searchTerm)}&_sacat=0&LH_Sold=1&LH_Complete=1&rt=nc&_udlo=&_udhi=`;

      const response = await axios.get(this.scrapingBeeBaseUrl, {
        params: {
          api_key: this.scrapingBeeApiKey,
          url: ebayUrl,
          render_js: 'false',
          premium_proxy: 'true',
          country_code: 'us'
        },
        timeout: 45000
      });

      const $ = cheerio.load(response.data);
      const listings = [];

      // eBay search results selector
      $('.s-item').each((index, element) => {
        if (index >= 15) return false; // Limit to 15 results per search

        const $item = $(element);
        
        const title = $item.find('.s-item__title').text().trim();
        const price = $item.find('.s-item__price').text().trim();
        const link = $item.find('.s-item__link').attr('href');
        const image = $item.find('.s-item__image img').attr('src');

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

  async searchGumtree(searchTerm, location = '') {
    try {
      logger.info(`🌳 Searching Gumtree for: "${searchTerm}" in ${location}`);

      if (!this.scrapingBeeApiKey || this.scrapingBeeApiKey.trim() === '') {
        logger.warn('⚠️ ScrapingBee not configured, returning mock data for testing');
        return this.getMockGumtreeResults(searchTerm);
      }

      let gumtreeUrl = `https://www.gumtree.com/search?search_category=all&q=${encodeURIComponent(searchTerm)}`;
      
      // Add location filter if provided
      if (location && location !== 'UK') {
        gumtreeUrl += `&search_location=${encodeURIComponent(location)}`;
      }

      const response = await axios.get(this.scrapingBeeBaseUrl, {
        params: {
          api_key: this.scrapingBeeApiKey,
          url: gumtreeUrl,
          render_js: 'true',
          premium_proxy: 'true',
          country_code: 'gb'
        },
        timeout: 45000
      });

      const $ = cheerio.load(response.data);
      const listings = [];

      // Gumtree search results selectors
      $('.listing-link, .listing-item, [data-q="listing"]').each((index, element) => {
        if (index >= 15) return false; // Limit to 15 results per search

        const $item = $(element);
        
        let title = $item.find('.listing-title, .listing-item-title, h2, h3').first().text().trim();
        let price = $item.find('.listing-price, .price, .ad-price').first().text().trim();
        let link = $item.find('a').first().attr('href');
        let image = $item.find('img').first().attr('src') || $item.find('img').first().attr('data-src');

        // Alternative selectors if first attempt fails
        if (!title) {
          title = $item.find('[data-q="listing-title"], .tileTitle').text().trim();
        }
        if (!price) {
          price = $item.find('[data-q="price"], .tilePrice').text().trim();
        }
        if (!link) {
          link = $item.attr('href') || $item.find('a[href*="/p/"]').attr('href');
        }

        if (title && price && link) {
          // Ensure link is absolute
          if (link.startsWith('/')) {
            link = `https://www.gumtree.com${link}`;
          }

          listings.push({
            title: this.cleanTitle(title),
            price: this.cleanPrice(price),
            link: link,
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
      
      // Add location filter if provided
      if (location && location !== 'UK') {
        facebookUrl += `&exact=false`;
      }

      const response = await axios.get(this.scrapingBeeBaseUrl, {
        params: {
          api_key: this.scrapingBeeApiKey,
          url: facebookUrl,
          render_js: 'true',
          premium_proxy: 'true',
          country_code: 'gb',
          wait: 3000
        },
        timeout: 60000
      });

      const $ = cheerio.load(response.data);
      const listings = [];

      // Facebook Marketplace search results selectors
      $('[data-testid="marketplace-item"], .marketplace-item, .feed-story-item').each((index, element) => {
        if (index >= 15) return false; // Limit to 15 results per search

        const $item = $(element);
        
        let title = $item.find('span[dir="auto"]').first().text().trim();
        let price = $item.find('span').filter((i, el) => $(el).text().match(/[£$€]\d+/)).first().text().trim();
        let link = $item.find('a').first().attr('href');
        let image = $item.find('img').first().attr('src');

        if (title && price && link) {
          // Ensure link is absolute
          if (link.startsWith('/')) {
            link = `https://www.facebook.com${link}`;
          }

          listings.push({
            title: this.cleanTitle(title),
            price: this.cleanPrice(price),
            link: link,
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

  cleanTitle(title) {
    return title
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s\-.,()]/g, '')
      .trim()
      .substring(0, 200); // Limit length
  }

  cleanPrice(price) {
    // Extract price with currency symbol
    const priceMatch = price.match(/[£$€¥₹]\s*[\d,]+(?:\.\d{2})?|\d+(?:\.\d{2})?\s*[£$€¥₹]/);
    if (priceMatch) {
      return priceMatch[0].replace(/\s+/g, '');
    }
    
    // Fallback: extract just numbers and add currency
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
        image: 'https://images.pexels.com/photos/1751731/pexels-photo-1751731.jpeg?auto=compress&cs=tinysrgb&w=400',
        source: 'gumtree',
        description: `Used ${searchTerm} in excellent condition`
      },
      {
        title: `${searchTerm} - Good Deal`,
        price: '£120',
        link: 'https://www.gumtree.com/p/mock-listing-2',
        image: 'https://images.pexels.com/photos/1751731/pexels-photo-1751731.jpeg?auto=compress&cs=tinysrgb&w=400',
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
        image: 'https://images.pexels.com/photos/1751731/pexels-photo-1751731.jpeg?auto=compress&cs=tinysrgb&w=400',
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
        image: 'https://images.pexels.com/photos/1751731/pexels-photo-1751731.jpeg?auto=compress&cs=tinysrgb&w=400',
        source: 'facebook',
        description: `Great ${searchTerm} from Facebook Marketplace`
      }
    ];
  }
}

export const scrapingService = new ScrapingService();
