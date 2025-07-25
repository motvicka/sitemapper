# AbortController Support in Sitemapper

Sitemapper nyní podporuje `AbortController` pro zrušení HTTP requestů během stahování sitemap. Tato funkcionalita vám umožňuje kontrolovat a zastavit procesy stahování sitemap z vašeho vlastního kódu.

## Použití

### 1. AbortController přes constructor

```javascript
import Sitemapper from 'sitemapper';

const abortController = new AbortController();

const sitemapper = new Sitemapper({
  url: 'https://example.com/sitemap.xml',
  timeout: 30000,
  signal: abortController.signal  // Předání AbortSignal
});

// Spuštění stahování
const fetchPromise = sitemapper.fetch();

// Zrušení po 5 sekundách
setTimeout(() => {
  abortController.abort();
}, 5000);

try {
  const result = await fetchPromise;
  console.log('Sitemap stažena:', result.sites.length, 'URLs');
} catch (error) {
  if (error.message === 'Request was aborted') {
    console.log('Stahování bylo zrušeno');
  } else {
    console.error('Chyba:', error.message);
  }
}
```

### 2. AbortController přes fetch() metodu

```javascript
import Sitemapper from 'sitemapper';

const abortController = new AbortController();
const sitemapper = new Sitemapper();

// Předání AbortSignal přímo do fetch()
const fetchPromise = sitemapper.fetch('https://example.com/sitemap.xml', {
  signal: abortController.signal
});

// Zrušení po 3 sekundách
setTimeout(() => {
  console.log('Zastavuji stahování...');
  abortController.abort();
}, 3000);

try {
  const result = await fetchPromise;
  console.log('Úspěšně staženo:', result.sites.length, 'URLs');
} catch (error) {
  console.log('Stahování zrušeno:', error.message);
}
```

### 3. Okamžité zrušení (pre-aborted signal)

```javascript
import Sitemapper from 'sitemapper';

const abortController = new AbortController();
abortController.abort(); // Zrušení ještě před spuštěním

const sitemapper = new Sitemapper();

try {
  const result = await sitemapper.fetch('https://example.com/sitemap.xml', {
    signal: abortController.signal
  });
} catch (error) {
  console.log('Request byl okamžitě zrušen:', error.message);
  // Vypíše: "Request byl okamžitě zrušen: Request was aborted"
}
```

### 4. Reaktivní zrušení na uživatelskou akci

```javascript
import Sitemapper from 'sitemapper';

function downloadSitemap(url, onProgress) {
  const abortController = new AbortController();
  const sitemapper = new Sitemapper({ debug: true });
  
  // Simulace progress handling
  const progressInterval = setInterval(() => {
    onProgress('Stahuji sitemap...');
  }, 1000);
  
  const fetchPromise = sitemapper.fetch(url, {
    signal: abortController.signal
  });
  
  fetchPromise
    .then(result => {
      clearInterval(progressInterval);
      onProgress(`Dokončeno: ${result.sites.length} URLs nalezeno`);
    })
    .catch(error => {
      clearInterval(progressInterval);
      if (error.message === 'Request was aborted') {
        onProgress('Stahování zrušeno uživatelem');
      } else {
        onProgress(`Chyba: ${error.message}`);
      }
    });
  
  // Vrátí funkci pro zrušení
  return () => {
    console.log('Zastavuji stahování...');
    abortController.abort();
  };
}

// Použití
const cancelDownload = downloadSitemap(
  'https://example.com/sitemap.xml',
  (message) => console.log(message)
);

// Zrušení po 5 sekundách
setTimeout(cancelDownload, 5000);
```

## Technické detaily

### Jak to funguje

1. **AbortSignal integration**: AbortSignal se předává přes všechny úrovně (`fetch()` → `crawl()` → `parse()`)
2. **HTTP request cancellation**: Signal se předává do `got` HTTP knihovny která nativně podporuje AbortController
3. **Timeout cleanup**: Při abortu se automaticky čistí všechny timeouty
4. **Concurrent requests**: Signal se propaguje do všech současně běžících requestů při parsování sitemap indexů
5. **Error handling**: AbortError se re-throwuje aby ho mohl zachytit volající kód

### Error handling

Když je request abortován, knihovna vyhodí error s `message === 'Request was aborted'`. Je důležité tento error správně zachytit:

```javascript
try {
  const result = await sitemapper.fetch(url, { signal });
} catch (error) {
  if (error.message === 'Request was aborted') {
    // Request byl úmyslně zrušen
    console.log('Stahování zrušeno');
  } else {
    // Jiný typ chyby (síť, parsing, atd.)
    console.error('Chyba při stahování:', error.message);
  }
}
```

### Výkon a kompatibilita

- AbortController je podporován ve všech moderních prostředích (Node.js 16+, moderní browsers)
- Nezasahuje do výkonu pokud se nepoužívá (signal parametr je optional)
- Kompatibilní se všemi existujícími funkcemi knihovny
- Funguje s concurrent requests při parsování sitemap indexů

## Známá omezení

1. **Rychlé requesty**: Velmi rychlé HTTP requesty se mohou dokončit dříve než se aktivuje abort
2. **Network timeouts**: AbortController funguje nezávisle na `timeout` option - oba mechanismy mohou být aktivní současně
3. **Retry logic**: Abort zruší také retry attempts - request se nezopakuje po abortu

## Příklady pro různé případy použití

### CLI aplikace s možností zrušení

```javascript
import Sitemapper from 'sitemapper';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const abortController = new AbortController();
const sitemapper = new Sitemapper({ 
  signal: abortController.signal,
  debug: true 
});

console.log('Stahování sitemap... (stiskněte Enter pro zrušení)');

rl.on('line', () => {
  console.log('Zastavuji...');
  abortController.abort();
  rl.close();
});

try {
  const result = await sitemapper.fetch('https://example.com/sitemap.xml');
  console.log(`Dokončeno: ${result.sites.length} URLs`);
} catch (error) {
  console.log('Zrušeno:', error.message);
} finally {
  rl.close();
}
```

### Web aplikace s progress indikátorem

```javascript
// Frontend kód
function downloadSitemapWithProgress(url) {
  const abortController = new AbortController();
  
  return {
    promise: fetch('/api/sitemap', {
      method: 'POST',
      signal: abortController.signal,
      body: JSON.stringify({ url }),
      headers: { 'Content-Type': 'application/json' }
    }),
    abort: () => abortController.abort()
  };
}

// Backend API endpoint
app.post('/api/sitemap', async (req, res) => {
  const abortController = new AbortController();
  
  req.on('close', () => {
    abortController.abort();
  });
  
  try {
    const sitemapper = new Sitemapper({
      signal: abortController.signal
    });
    const result = await sitemapper.fetch(req.body.url);
    res.json(result);
  } catch (error) {
    if (error.message === 'Request was aborted') {
      res.status(499).json({ error: 'Request cancelled by client' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});
```