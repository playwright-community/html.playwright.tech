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

let messageCount = 0;
const responseCallbacks = new Map<number, (data: any) => void>();
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const listener = responseCallbacks.get(event.data.id);
  if (listener) {
    listener(event.data.payload);
    responseCallbacks.delete(event.data.id);
  }
});

function sendMessageToClient(client: Client, message: any): Promise<any> {
  return new Promise(resolve => {
    const id = ++messageCount;
    responseCallbacks.set(id, resolve);
    client.postMessage({ ...message, id });
  });
}

self.addEventListener('fetch', async (event) => {
  const url = new URL(event.request.url);
  if (url.pathname === '/report/upload') {
    const reportUrl = url.searchParams.get('url')!;
    return event.respondWith((async () => {
      const client = event.clientId ? await self.clients.get(event.clientId) : null;
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
      const dataURLs2blobURLs = await sendMessageToClient(client!, { type: 'dataFiles', dataFiles });
      await rewriteHTMLReportDataURLs(dataURLs2blobURLs);
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

async function rewriteHTMLReportDataURLs(mapping: Map<string, string>) {
  const record = responseCache.get('/report/index.html')!;
  let indexHTML = await record.blob.text();
  indexHTML = indexHTML.replace(/return`trace\/index\.html\?\${(e)\.map\(\(t,n\)=>`trace=\${new URL\(t\.path,window\.location\.href\)}`\)\.join\("&"\)}`/, (_: string, tracesVarName: string) => {
    return `
    const mapping = ${JSON.stringify(Object.fromEntries(mapping))};
    return '../trace/index.html?' + ${tracesVarName}.map((a, i) => {
      let traceURL = new URL(a.path, window.location.href).toString();
      if (traceURL in mapping)
        traceURL = mapping[traceURL];
      return 'trace=' + traceURL;
    }).join('&');
  `
  });
  responseCache.set('/report/index.html', {
    ...record,
    blob: new Blob([indexHTML], { type: 'text/html' }),
  });
}

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
