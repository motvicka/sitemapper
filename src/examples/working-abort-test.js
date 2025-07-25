import Sitemapper from '../assets/sitemapper.js';

async function testWorkingAbort() {
  console.log('=== Working AbortController Test ===\n');

  // Test 1: Abort before starting
  console.log('1. Testing pre-aborted signal:');
  const preAbortController = new AbortController();
  preAbortController.abort();
  
  try {
    const sitemapper1 = new Sitemapper({ debug: false });
    await sitemapper1.fetch('https://www.google.com/sitemap.xml', {
      signal: preAbortController.signal
    });
    console.log('ERROR: Request should have been aborted');
  } catch (error) {
    console.log('✓ Correctly aborted before starting:', error.message);
  }

  console.log('\n2. Testing abort during execution:');
  
  // Test 2: Use constructor with signal
  const abortController2 = new AbortController();
  const sitemapper2 = new Sitemapper({
    signal: abortController2.signal,
    debug: false,
    timeout: 30000
  });

  // Start request
  const promise2 = sitemapper2.fetch('https://www.google.com/sitemap.xml');
  
  // Abort very quickly (before any significant work is done)
  setTimeout(() => {
    console.log('Aborting request immediately...');
    abortController2.abort();
  }, 1);

  try {
    const result = await promise2;
    console.log('Request completed unexpectedly with', result.sites.length, 'sites');
  } catch (error) {
    console.log('✓ Request was aborted during execution:', error.message);
  }

  console.log('\n3. Testing successful completion:');
  
  // Test 3: Let a request complete normally
  try {
    const sitemapper3 = new Sitemapper({ debug: false });
    const result = await sitemapper3.fetch('https://wp.seantburke.com/sitemap.xml');
    console.log('✓ Request completed successfully with', result.sites.length, 'sites');
  } catch (error) {
    console.log('Request failed:', error.message);
  }
}

testWorkingAbort().catch(console.error);