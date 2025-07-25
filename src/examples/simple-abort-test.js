import Sitemapper from '../assets/sitemapper.js';

async function testAbortController() {
  console.log('=== Simple AbortController Test ===\n');

  // Test with a URL that takes longer to respond or use a slower sitemap
  const abortController = new AbortController();
  
  const sitemapper = new Sitemapper({
    timeout: 30000,
    debug: true
  });

  console.log('Starting request...');
  
  const fetchPromise = sitemapper.fetch('https://httpbin.org/delay/5', {
    signal: abortController.signal
  });

  // Abort after 1 second
  setTimeout(() => {
    console.log('Aborting request...');
    abortController.abort();
  }, 1000);

  try {
    const result = await fetchPromise;
    console.log('Request completed unexpectedly:', result);
  } catch (error) {
    console.log('Request was aborted as expected:', error.name, error.message);
  }
}

// Test if AbortController works with already aborted signal
async function testPreAbortedSignal() {
  console.log('\n=== Pre-aborted Signal Test ===\n');
  
  const abortController = new AbortController();
  abortController.abort(); // Abort immediately
  
  const sitemapper = new Sitemapper({
    timeout: 30000,
    debug: true
  });

  try {
    const result = await sitemapper.fetch('https://www.google.com/sitemap.xml', {
      signal: abortController.signal
    });
    console.log('Request completed unexpectedly:', result);
  } catch (error) {
    console.log('Request was rejected as expected:', error.message);
  }
}

// Run the tests
testAbortController()
  .then(() => testPreAbortedSignal())
  .catch(console.error);