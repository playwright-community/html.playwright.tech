/// <reference lib="WebWorker" />

import type zip from '@zip.js/zip.js';
// @ts-ignore
import zipImport from '@zip.js/zip.js/dist/zip-no-worker-inflate.min.js';

const zipjs = zipImport as typeof zip;

declare var self: ServiceWorkerGlobalScope;
export { };

self.addEventListener('install',  () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

type Response = {
  blob: Blob;
  headers: { [key: string]: string };
};

const responseCache = new Map<string, Response>();
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname === '/report/upload') {
    const reportUrl = url.searchParams.get('url')!;
    return event.respondWith((async () => {
      const reader = new zipjs.ZipReader(new zipjs.HttpReader(reportUrl, { mode: 'cors', preventHeadRequest: true } as any), { useWebWorkers: false });
      const entries = await reader.getEntries();
      responseCache.clear()
      const dataFiles: { url: string, blob: Blob }[] = []
      for (const entry of entries) {
        if (entry.directory)
          continue;
        const blob: Blob = await entry.getData!(new zipjs.BlobWriter());
        const filename = `/report/${entry.filename}`
        responseCache.set(filename, {
          blob,
          headers: {
            'Content-Type': filenameToMimeType(entry.filename),
          }
        });
        if (entry.filename.startsWith('data/')) {
          dataFiles.push({ url: `${self.location.origin}/report/${entry.filename}`, blob });
        }
      }
      await writeTraceFilesToIndexDB(dataFiles)
      return new Response()
    })());
  }
  if (responseCache.has(url.pathname)) {
    const response = responseCache.get(url.pathname)!;
    return event.respondWith(new Response(response.blob, {
      headers: response.headers,
    }));
  }
  return event.respondWith(fetch(event.request));
});

const filenameToMimeTypeMapping = new Map<string, string>([
  ['html', 'text/html'],
  ['js', 'application/javascript'],
  ['css', 'text/css'],
  ['png', 'image/png'],
  ['svg', 'image/svg+xml'],
  ['ttf', 'font/ttf'],
  ['woff', 'font/woff'],
  ['woff2', 'font/woff2'],
  ['zip', 'application/zip'],
]);

function filenameToMimeType(filename: string): string {
  const extension = filename.split('.').pop() || '';
  if (filenameToMimeTypeMapping.has(extension))
    return filenameToMimeTypeMapping.get(extension)!;
  console.log('Unknown mime type for ' + filename);
  return 'application/octet-stream';
}

async function writeTraceFilesToIndexDB(files: { url: string, blob: Blob }[] ) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('playwright-report', 1);
    request.onerror = reject;
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('files');
    };
  });
  const tx = db.transaction('files', 'readwrite');
  const store = tx.objectStore('files');
  store.clear();
  for (const file of files)
    store.put(file.blob, file.url);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = reject;
  });
  db.close();
}
