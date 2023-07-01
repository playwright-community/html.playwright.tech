/// <reference lib="WebWorker" />

import type zip from '@zip.js/zip.js';
// @ts-ignore
import zipImport from '@zip.js/zip.js/dist/zip-no-worker-inflate.min.js';

const zipjs = zipImport as typeof zip;

declare var self: ServiceWorkerGlobalScope;
export { };

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event: any) {
  event.waitUntil(self.clients.claim());
});

type Response = {
  blob: Blob;
  headers: { [key: string]: string };
};

let nextReportIndex = 0;
const reportResponses = new Map<string, Response>();
self.addEventListener('fetch', (event) => {
  console.log('Service Worker intercepting fetch event for:', event.request.url);
  const url = new URL(event.request.url);
  if (url.pathname === '/upload') {
    const reportUrl = url.searchParams.get('url')!;
    const currentIndex = nextReportIndex;
    nextReportIndex++;
    return event.respondWith((async () => {
      const reader = new zipjs.ZipReader(new zipjs.HttpReader(reportUrl, { mode: 'cors', preventHeadRequest: true } as any), { useWebWorkers: false });
      const entries = await reader.getEntries();
      for (const entry of entries) {
        if (entry.directory)
          continue;
        const blob = await entry.getData!(new zipjs.BlobWriter());
        const filename = `/report/${currentIndex}/${entry.filename}`
        reportResponses.set(filename, {
          blob,
          headers: {
            'Content-Type': filenameToMimeType(entry.filename),
          }
        });
      }
      return new Response(JSON.stringify({
        index: currentIndex,
      }))
    })());
  }
  console.log(reportResponses)
  if (reportResponses.has(url.pathname)) {
    const response = reportResponses.get(url.pathname)!;
    return event.respondWith(new Response(response.blob, {
      headers: response.headers,
    }));
  }
  return event.respondWith(fetch(event.request));
});

function filenameToMimeType(filename: string): string {
  if (filename.endsWith('.html'))
    return 'text/html';
  if (filename.endsWith('.js'))
    return 'application/javascript';
  if (filename.endsWith('.css'))
    return 'text/css';
  if (filename.endsWith('.png'))
    return 'image/png';
  if (filename.endsWith('.svg'))
    return 'image/svg+xml';
  if (filename.endsWith('.ttf'))
    return 'font/ttf';
  if (filename.endsWith('.woff'))
    return 'font/woff';
  if (filename.endsWith('.woff2'))
    return 'font/woff2';
  if (filename.endsWith('.zip'))
    return 'application/zip';
  console.log('Unknown mime type for ' + filename);
  return 'application/octet-stream';
}
