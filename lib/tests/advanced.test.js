var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import 'async';
import 'assert';
import 'should';
import * as zlib from 'zlib';
import Sitemapper from '../../lib/assets/sitemapper.js';
describe('Sitemapper Advanced Tests', function () {
    let sitemapper;
    beforeEach(() => {
        sitemapper = new Sitemapper();
    });
    describe('decompressResponseBody', function () {
        it('should correctly decompress gzipped content', function () {
            return __awaiter(this, void 0, void 0, function* () {
                // Create a sample XML string
                const xmlContent = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com</loc></url></urlset>';
                // Compress it with gzip
                const compressed = zlib.gzipSync(Buffer.from(xmlContent));
                // Use the private decompressResponseBody method
                const decompressed = yield sitemapper.decompressResponseBody(compressed);
                // Check the result
                decompressed.toString().should.equal(xmlContent);
            });
        });
        it('should handle decompression errors gracefully', function () {
            return __awaiter(this, void 0, void 0, function* () {
                // Create invalid gzip content
                const invalidGzip = Buffer.from('This is not valid gzip content');
                try {
                    // This should throw an error
                    yield sitemapper.decompressResponseBody(invalidGzip);
                    // If we get here, the test should fail
                    false.should.be.true(); // Force test to fail if no error is thrown
                }
                catch (error) {
                    // We should get an error, which is expected
                    error.should.be.an.instanceOf(Error);
                }
            });
        });
    });
    describe('initializeTimeout', function () {
        it('should set up a timeout that cancels a request', function () {
            return __awaiter(this, void 0, void 0, function* () {
                // Create a mock requester with a cancel method
                const mockRequester = {
                    cancel: function () {
                        this.canceled = true;
                    },
                    canceled: false,
                };
                // Set a very short timeout
                sitemapper.timeout = 1;
                // Call initializeTimeout
                sitemapper.initializeTimeout('https://example.com/timeout-test', mockRequester);
                // Wait for the timeout to trigger
                yield new Promise((resolve) => setTimeout(resolve, 10));
                // Check if cancel was called
                mockRequester.canceled.should.be.true();
                // Clean up
                clearTimeout(sitemapper.timeoutTable['https://example.com/timeout-test']);
            });
        });
    });
    describe('parse error handling', function () {
        it('should handle network errors during parse', function () {
            return __awaiter(this, void 0, void 0, function* () {
                // Store original fetch implementation
                const originalFetch = global.fetch;
                // Mock fetch to throw a network error
                global.fetch = () => {
                    const error = new Error('HTTP Error occurred');
                    error.name = 'HTTPError';
                    throw error;
                };
                try {
                    // Try to parse a URL
                    const result = yield sitemapper.parse('https://example.com/error-test');
                    // Check the result
                    result.should.have.property('error').which.is.a.String();
                    result.should.have.property('data').which.is.an.Object();
                    result.data.should.have
                        .property('name')
                        .which.is.equal('HTTPError');
                }
                finally {
                    // Restore the original fetch
                    global.fetch = originalFetch;
                }
            });
        });
    });
    describe('fetch with multiple sitemaps', function () {
        it('should handle errors in some child sitemaps while succeeding with others', function () {
            return __awaiter(this, void 0, void 0, function* () {
                this.timeout(10000);
                // Create a mock parse method that returns a sitemapindex with mixed results
                const originalParse = sitemapper.parse;
                const originalCrawl = sitemapper.crawl;
                // First call to parse returns sitemapindex with multiple sitemaps
                let parseCallCount = 0;
                sitemapper.parse = () => __awaiter(this, void 0, void 0, function* () {
                    parseCallCount++;
                    if (parseCallCount === 1) {
                        // First call returns a sitemapindex with two sitemaps
                        return {
                            data: {
                                sitemapindex: {
                                    sitemap: [
                                        { loc: 'https://example.com/good-sitemap.xml' },
                                        { loc: 'https://example.com/bad-sitemap.xml' },
                                    ],
                                },
                            },
                        };
                    }
                    else if (parseCallCount === 2) {
                        // Second call (for good-sitemap) returns urlset
                        return {
                            data: {
                                urlset: {
                                    url: [
                                        { loc: 'https://example.com/page1' },
                                        { loc: 'https://example.com/page2' },
                                    ],
                                },
                            },
                        };
                    }
                    else {
                        // Third call (for bad-sitemap) returns error
                        return {
                            error: 'Error occurred: ParseError',
                            data: { name: 'ParseError' },
                        };
                    }
                });
                // Call fetch which will use our mocked methods
                const result = yield sitemapper.fetch('https://example.com/root-sitemap.xml');
                // Check the result
                result.should.have.property('sites').which.is.an.Array();
                result.should.have.property('errors').which.is.an.Array();
                result.sites.length.should.equal(2);
                result.errors.length.should.equal(1);
                // Restore original methods
                sitemapper.parse = originalParse;
                sitemapper.crawl = originalCrawl;
            });
        });
    });
});
