import Sitemapper from '../assets/sitemapper.js';

async function demonstrateAbortController() {
  console.log('=== AbortController Demonstration ===\n');

  // Example 1: Using AbortController with fetch() method
  console.log('1. Testing AbortController with fetch() method:');
  const abortController1 = new AbortController();
  
  // Create sitemapper instance
  const sitemapper1 = new Sitemapper({
    timeout: 30000,
    debug: true
  });

  // Start the request
  const fetchPromise = sitemapper1.fetch('https://www.google.com/sitemap.xml', {
    signal: abortController1.signal
  });

  // Abort after 100ms
  setTimeout(() => {
    console.log('Aborting request after 100ms...');
    abortController1.abort();
  }, 100);

  try {
    const result = await fetchPromise;
    console.log('Request completed:', result.sites.length, 'sites found');
  } catch (error) {
    console.log('Request aborted:', error.message);
  }

  console.log('\n');

  // Example 2: Using AbortController in constructor
  console.log('2. Testing AbortController via constructor:');
  const abortController2 = new AbortController();
  
  const sitemapper2 = new Sitemapper({
    url: 'https://www.google.com/sitemap.xml',
    timeout: 30000,
    debug: true,
    signal: abortController2.signal
  });

  // Start the request
  const fetchPromise2 = sitemapper2.fetch();

  // Abort after 200ms
  setTimeout(() => {
    console.log('Aborting request after 200ms...');
    abortController2.abort();
  }, 200);

  try {
    const result = await fetchPromise2;
    console.log('Request completed:', result.sites.length, 'sites found');
  } catch (error) {
    console.log('Request aborted:', error.message);
  }

  console.log('\n');

  // Example 3: Successful request (no abort)
  console.log('3. Testing successful request (no abort):');
  const sitemapper3 = new Sitemapper({
    timeout: 30000,
    debug: false
  });

  try {
    const result = await sitemapper3.fetch('https://www.google.com/sitemap.xml');
    console.log('Request completed successfully:', result.sites.length, 'sites found');
  } catch (error) {
    console.log('Request failed:', error.message);
  }
}

// Run the demonstration
demonstrateAbortController().catch(console.error);