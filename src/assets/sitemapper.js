/**
 * Sitemap Parser
 *
 * Copyright (c) 2024 Sean Thomas Burke
 * Licensed under the MIT license.
 * @author Sean Burke <@seantomburke>
 */

import { XMLParser } from 'fast-xml-parser';
import got from 'got';
import zlib from 'zlib';
import pLimit from 'p-limit';
import isGzip from 'is-gzip';

/**
 * @typedef {Object} Sitemapper
 */
export default class Sitemapper {
  /**
   * Construct the Sitemapper class
   *
   * @params {Object} options to set
   * @params {string} [options.url] - the Sitemap url (e.g https://wp.seantburke.com/sitemap.xml)
   * @params {Timeout} [options.timeout] - @see {timeout}
   * @params {boolean} [options.debug] - Enables/Disables additional logging
   * @params {integer} [options.concurrency] - The number of concurrent sitemaps to crawl (e.g. 2 will crawl no more than 2 sitemaps at the same time)
   * @params {integer} [options.retries] - The maximum number of retries to attempt when crawling fails (e.g. 1 for 1 retry, 2 attempts in total)
   * @params {boolean} [options.rejectUnauthorized] - If true (default), it will throw on invalid certificates, such as expired or self-signed ones.
   * @params {lastmod} [options.lastmod] - the minimum lastmod value for urls
   * @params {hpagent.HttpProxyAgent|hpagent.HttpsProxyAgent} [options.proxyAgent] - instance of npm "hpagent" HttpProxyAgent or HttpsProxyAgent to be passed to npm "got"
   * @params {Array<RegExp>} [options.exclusions] - Array of regex patterns to exclude URLs
   * @params {AbortSignal} [options.signal] - AbortSignal to cancel the request
   *
   * @example let sitemap = new Sitemapper({
   *   url: 'https://wp.seantburke.com/sitemap.xml',
   *   timeout: 15000,
   *   lastmod: 1630693759,
   *   exclusions: [/foo.com/, /bar.xml/], // Filters out URLs matching these patterns
   *   signal: abortController.signal // For cancellation support
   *  });
   */
  constructor(options) {
    const settings = options || { requestHeaders: {} };
    this.url = settings.url;
    this.timeout = settings.timeout || 15000;
    this.timeoutTable = {};
    this.lastmod = settings.lastmod || 0;
    this.requestHeaders = settings.requestHeaders;
    this.debug = settings.debug;
    this.concurrency = settings.concurrency || 10;
    this.retries = settings.retries || 0;
    this.rejectUnauthorized =
      settings.rejectUnauthorized === false ? false : true;
    this.fields = settings.fields || false;
    this.proxyAgent = settings.proxyAgent || {};
    this.exclusions = settings.exclusions || [];
    this.signal = settings.signal;
  }

  /**
   * Gets the sites from a sitemap.xml with a given URL
   *
   * @public
   * @param {string} [url] - the Sitemaps url (e.g https://wp.seantburke.com/sitemap.xml)
   * @param {Object} [options] - Additional options for this request
   * @param {AbortSignal} [options.signal] - AbortSignal to cancel the request
   * @returns {Promise<SitesData>}
   * @example sitemapper.fetch('example.xml')
   *  .then((sites) => console.log(sites));
   * @example sitemapper.fetch('example.xml', { signal: abortController.signal })
   *  .then((sites) => console.log(sites));
   */
  async fetch(url = this.url, options = {}) {
    // Use signal from options or fallback to instance signal
    const signal = options.signal || this.signal;

    // Check if already aborted
    if (signal && signal.aborted) {
      throw new Error('Request was aborted');
    }

    // initialize empty variables
    let results = {
      url: '',
      sites: [],
      errors: [],
    };

    // attempt to set the variables with the crawl
    if (this.debug) {
      // only show if it's set
      if (this.lastmod) {
        console.debug(`Using minimum lastmod value of ${this.lastmod}`);
      }
    }

    try {
      // crawl the URL
      results = await this.crawl(url, 0, signal);
    } catch (e) {
      // show errors that may occur
      if (this.debug) {
        console.error(e);
      }

      // Re-throw abort errors
      if (e.name === 'AbortError' || e.message === 'Request was aborted') {
        throw e;
      }
    }

    return {
      url,
      sites: results.sites || [],
      errors: results.errors || [],
    };
  }

  /**
   * Get the timeout
   *
   * @example console.log(sitemapper.timeout);
   * @returns {Timeout}
   */
  static get timeout() {
    return this.timeout;
  }

  /**
   * Set the timeout
   *
   * @public
   * @param {Timeout} duration
   * @example sitemapper.timeout = 15000; // 15 seconds
   */
  static set timeout(duration) {
    this.timeout = duration;
  }

  /**
   * Get the lastmod minimum value
   *
   * @example console.log(sitemapper.lastmod);
   * @returns {number}
   */
  static get lastmod() {
    return this.lastmod;
  }

  /**
   * Set the lastmod minimum value
   *
   * @public
   * @param {number} timestamp
   * @example sitemapper.lastmod = 1630694181; // Unix timestamp
   */
  static set lastmod(timestamp) {
    this.lastmod = timestamp;
  }

  /**
   *
   * @param {string} url - url for making requests. Should be a link to a sitemaps.xml
   * @example sitemapper.url = 'https://wp.seantburke.com/sitemap.xml'
   */
  static set url(url) {
    this.url = url;
  }

  /**
   * Get the url to parse
   * @returns {string}
   * @example console.log(sitemapper.url)
   */
  static get url() {
    return this.url;
  }

  /**
   * Setter for the debug state
   * @param {boolean} option - set whether to show debug logs in output.
   * @example sitemapper.debug = true;
   */
  static set debug(option) {
    this.debug = option;
  }

  /**
   * Getter for the debug state
   * @returns {boolean}
   * @example console.log(sitemapper.debug)
   */
  static get debug() {
    return this.debug;
  }

  /**
   * Requests the URL and uses fast-xml-parser to parse through and find the data
   *
   * @private
   * @param {string} [url] - the Sitemaps url (e.g https://wp.seantburke.com/sitemap.xml)
   * @param {AbortSignal} [signal] - AbortSignal to cancel the request
   * @returns {Promise<ParseData>}
   */
  async parse(url = this.url, signal = null) {
    // Check if already aborted
    if (signal && signal.aborted) {
      throw new Error('Request was aborted');
    }

    // setup the response options for the got request
    const requestOptions = {
      method: 'GET',
      resolveWithFullResponse: true,
      gzip: true,
      responseType: 'buffer',
      headers: this.requestHeaders,
      https: {
        rejectUnauthorized: this.rejectUnauthorized,
      },
      agent: this.proxyAgent,
    };

    // Add AbortSignal if provided
    if (signal) {
      requestOptions.signal = signal;
    }

    try {
      // create a request Promise with the url and request options
      const requester = got.get(url, requestOptions);

      // initialize the timeout method based on the URL, and pass the request object.
      this.initializeTimeout(url, requester, signal);

      // get the response from the requester promise
      const response = await requester;

      // if the response does not have a successful status code then clear the timeout for this url.
      if (!response || response.statusCode !== 200) {
        clearTimeout(this.timeoutTable[url]);
        return { error: response.error, data: response };
      }

      let responseBody;

      if (isGzip(response.rawBody)) {
        responseBody = await this.decompressResponseBody(response.body);
      } else {
        responseBody = response.body;
      }

      // Parse XML using fast-xml-parser
      const parser = new XMLParser({
        isArray: (tagName) =>
          ['sitemap', 'url'].some((value) => value === tagName),
        removeNSPrefix: true,
      });

      const data = parser.parse(responseBody.toString());

      // return the results
      return { error: null, data };
    } catch (error) {
      // Clear timeout on any error
      clearTimeout(this.timeoutTable[url]);

      // If the request was aborted
      if (
        error.name === 'AbortError' ||
        error.message === 'Request was aborted'
      ) {
        throw error; // Re-throw abort errors to be handled by caller
      }

      // If the request was canceled notify the user of the timeout
      if (error.name === 'CancelError') {
        return {
          error: `Request timed out after ${this.timeout} milliseconds for url: '${url}'`,
          data: error,
        };
      }

      // If an HTTPError include error http code
      if (error.name === 'HTTPError') {
        return {
          error: `HTTP Error occurred: ${error.message}`,
          data: error,
        };
      }

      // Otherwise notify of another error
      return {
        error: `Error occurred: ${error.name}`,
        data: error,
      };
    }
  }

  /**
   * Timeouts are necessary for large xml trees. This will cancel the call if the request is taking
   * too long, but will still allow the promises to resolve.
   *
   * @private
   * @param {string} url - url to use as a hash in the timeoutTable
   * @param {Promise} requester - the promise that creates the web request to the url
   * @param {AbortSignal} [signal] - AbortSignal to listen for cancellation
   */
  initializeTimeout(url, requester, signal = null) {
    // this will throw a CancelError which will be handled in the parent that calls this method.
    this.timeoutTable[url] = setTimeout(() => requester.cancel(), this.timeout);

    // If AbortSignal is provided, listen for abort events
    if (signal) {
      const abortHandler = () => {
        clearTimeout(this.timeoutTable[url]);
        requester.cancel();
      };

      if (signal.aborted) {
        abortHandler();
      } else {
        signal.addEventListener('abort', abortHandler, { once: true });
      }
    }
  }

  /**
   * Recursive function that will go through a sitemaps tree and get all the sites
   *
   * @private
   * @param {string} url - the Sitemaps url (e.g https://wp.seantburke.com/sitemap.xml)
   * @param {integer} retryIndex - number of retry attempts fro this URL (e.g. 0 for 1st attempt, 1 for second attempty etc.)
   * @returns {Promise<SitesData>}
   */
  async crawl(url, retryIndex = 0, signal = null) {
    try {
      const { error, data } = await this.parse(url, signal);
      // The promise resolved, remove the timeout
      clearTimeout(this.timeoutTable[url]);

      if (error) {
        // Handle errors during sitemap parsing / request
        // Retry on error until you reach the retry limit set in the settings
        if (retryIndex < this.retries) {
          if (this.debug) {
            console.log(
              `(Retry attempt: ${retryIndex + 1} / ${
                this.retries
              }) ${url} due to ${data.name} on previous request`
            );
          }
          return this.crawl(url, retryIndex + 1, signal);
        }

        if (this.debug) {
          console.error(
            `Error occurred during "crawl('${url}')":\n\r Error: ${error}`
          );
        }

        // Fail and log error
        return {
          sites: [],
          errors: [
            {
              type: data.name,
              message: error,
              url,
              retries: retryIndex,
            },
          ],
        };
      } else if (data && data.urlset && data.urlset.url) {
        // Handle URLs found inside the sitemap
        if (this.debug) {
          console.debug(`Urlset found during "crawl('${url}')"`);
        }

        // Convert single object to array if needed
        const urlArray = Array.isArray(data.urlset.url)
          ? data.urlset.url
          : [data.urlset.url];

        // Begin filtering the urls
        const sites = urlArray
          .filter((site) => {
            if (this.lastmod === 0) return true;
            if (site.lastmod === undefined) return false;
            const modified = new Date(site.lastmod).getTime();

            return modified >= this.lastmod;
          })
          .filter((site) => {
            return !this.isExcluded(site.loc);
          })
          .map((site) => {
            if (!this.fields) {
              return site.loc;
            } else {
              let fields = {};
              if (this.fields.sitemap) {
                fields.sitemap = url;
              }
              for (const [field, active] of Object.entries(this.fields)) {
                if (active && site[field]) {
                  fields[field] = site[field];
                }
              }
              return fields;
            }
          });

        return {
          sites,
          errors: [],
        };
      } else if (data && data.sitemapindex) {
        // Handle child sitemaps found inside the active sitemap
        if (this.debug) {
          console.debug(`Additional sitemap found during "crawl('${url}')"`);
        }
        // Map each child url into a promise to create an array of promises
        const sitemap = data.sitemapindex.sitemap
          .map((map) => map.loc)
          .filter((url) => {
            return !this.isExcluded(url);
          });

        // Parse all child urls within the concurrency limit in the settings
        const limit = pLimit(this.concurrency);
        const promiseArray = sitemap.map((site) =>
          limit(() => this.crawl(site, 0, signal))
        );

        // Make sure all the promises resolve then filter and reduce the array
        const results = await Promise.all(promiseArray);
        const sites = results
          .filter((result) => result.errors.length === 0)
          .reduce((prev, { sites }) => [...prev, ...sites], []);
        const errors = results
          .filter((result) => result.errors.length !== 0)
          .reduce((prev, { errors }) => [...prev, ...errors], []);

        return {
          sites,
          errors,
        };
      }

      // Retry on error until you reach the retry limit set in the settings
      if (retryIndex < this.retries) {
        if (this.debug) {
          console.log(
            `(Retry attempt: ${retryIndex + 1} / ${
              this.retries
            }) ${url} due to ${data.name} on previous request`
          );
        }
        return this.crawl(url, retryIndex + 1, signal);
      }
      if (this.debug) {
        console.error(`Unknown state during "crawl('${url})'":`, error, data);
      }

      // Fail and log error
      return {
        sites: [],
        errors: [
          {
            url,
            type: data.name || 'UnknownStateError',
            message: 'An unknown error occurred.',
            retries: retryIndex,
          },
        ],
      };
    } catch (e) {
      if (this.debug) {
        this.debug && console.error(e);
      }

      // Re-throw abort errors
      if (e.name === 'AbortError' || e.message === 'Request was aborted') {
        throw e;
      }
    }
  }

  /**
   * Gets the sites from a sitemap.xml with a given URL
   *
   * @deprecated
   * @param {string} url - url to query
   * @param {getSitesCallback} callback - callback for sites and error
   * @callback
   */
  async getSites(url = this.url, callback) {
    console.warn(
      '\r\nWarning:',
      'function .getSites() is deprecated, please use the function .fetch()\r\n'
    );

    let err = {};
    let sites = [];
    try {
      const response = await this.fetch(url);
      sites = response.sites;
    } catch (error) {
      err = error;
    }
    return callback(err, sites);
  }

  /**
   * Decompress the gzipped response body using zlib.gunzip
   *
   * @param {Buffer} body - body of the gzipped file
   * @returns {boolean}
   */
  async decompressResponseBody(body) {
    return await new Promise((resolve, reject) => {
      const buffer = Buffer.from(body);
      zlib.gunzip(buffer, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  }

  /**
   * Checks if a urls is excluded based on the exclusion patterns.
   *
   * @param {string} url - The URL to check.
   * @returns {boolean} Returns true if the urls is excluded, false otherwise.
   */
  isExcluded(url) {
    if (this.exclusions.length === 0) return false;
    return this.exclusions.some((pattern) => pattern.test(url));
  }
}

/**
 * Callback for the getSites method
 *
 * @callback getSitesCallback
 * @param {Object} error - error from callback
 * @param {Array} sites - an Array of sitemaps
 */

/**
 * Timeout in milliseconds
 *
 * @typedef {number} Timeout
 * the number of milliseconds before all requests timeout. The promises will still resolve so
 * you'll still receive parts of the request, but maybe not all urls
 * default is 15000 which is 15 seconds
 */

/**
 * Resolve handler type for the promise in this.parse()
 *
 * @typedef {Object} ParseData
 *
 * @property {Error} error that either comes from fast-xml-parser or `got` or custom error
 * @property {Object} data
 * @property {string} data.url - URL of sitemap
 * @property {Array} data.urlset - Array of returned URLs
 * @property {string} data.urlset.url - single Url
 * @property {Object} data.sitemapindex - index of sitemap
 * @property {string} data.sitemapindex.sitemap - Sitemap
 * @example {
 *   error: 'There was an error!'
 *   data: {
 *     url: 'https://linkedin.com',
 *     urlset: [{
 *       url: 'https://www.linkedin.com/project1'
 *     },[{
 *       url: 'https://www.linkedin.com/project2'
 *     }]
 *   }
 * }
 */

/**
 * Resolve handler type for the promise in this.parse()
 *
 * @typedef {Object} SitesData
 *
 * @property {string} url - the original url used to query the data
 * @property {SitesArray} sites
 * @property {ErrorDataArray} errors
 * @example {
 *   url: 'https://linkedin.com/sitemap.xml',
 *   sites: [
 *     'https://linkedin.com/project1',
 *     'https://linkedin.com/project2'
 *   ],
 *   errors: [
 *      {
 *        type: 'CancelError',
 *        url: 'https://www.walmart.com/sitemap_tp1.xml',
 *        retries: 0
 *      },
 *      {
 *        type: 'HTTPError',
 *        url: 'https://www.walmart.com/sitemap_tp2.xml',
 *        retries: 0
 *      },
 *   ]
 * }
 */

/**
 * An array of urls
 *
 * @typedef {string[]} SitesArray
 * @example [
 *   'https://www.google.com',
 *   'https://www.linkedin.com'
 * ]
 */

/**
 * An array of Error data objects
 *
 * @typedef {ErrorData[]} ErrorDataArray
 * @example [
 *    {
 *      type: 'CancelError',
 *      url: 'https://www.walmart.com/sitemap_tp1.xml',
 *      retries: 0
 *    },
 *    {
 *      type: 'HTTPError',
 *      url: 'https://www.walmart.com/sitemap_tp2.xml',
 *      retries: 0
 *    },
 * ]
 */

/**
 * An object containing details about the errors which occurred during the crawl
 *
 * @typedef {Object} ErrorData
 *
 * @property {string} type - The error type which was returned
 * @property {string} url - The sitemap URL which returned the error
 * @property {number} errors - The total number of retries attempted after receiving the first error
 * @example {
 *    type: 'CancelError',
 *    url: 'https://www.walmart.com/sitemap_tp1.xml',
 *    retries: 0
 * }
 */
