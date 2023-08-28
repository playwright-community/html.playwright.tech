import './style.css'

if (!('serviceWorker' in navigator))
  alert("Service Worker not supported");
if (!('indexedDB' in window))
  alert("IndexedDB not supported");
if (!('localStorage' in window))
  alert("localStorage not supported");

(async () => {
  window.localStorage.setItem('is-playwright-report', 'true')
  await navigator.serviceWorker.register('service-worker.js');
  await navigator.serviceWorker.ready;
  {
    // Convert TraceViewer Blob from SW to Blob URLs. (We can't create the URLs in SW.)
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data.type === 'dataFiles') {
        const dataFiles = event.data.dataFiles as { url: string, blob: Blob }[];
        const url2blobURL = new Map<string, string>();
        for (const { url, blob } of dataFiles)
          url2blobURL.set(url, URL.createObjectURL(blob));
        event.source?.postMessage({ type: 'url2blobURL', payload: url2blobURL, id: event.data.id });
      }
    });
  }
  const dropzone = document.getElementById('dropzone');
  if (!dropzone)
    return;
  dropzone.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.addEventListener('change', async () => {
      await sendToBackend(input.files![0]);
    });
    input.click();
  });
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer)
      e.dataTransfer.dropEffect = 'copy';
  });
  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (!e.dataTransfer)
      return;
    await sendToBackend(e.dataTransfer.files[0]);
  });
  async function sendToBackend(file: File) {
    const reportBlob = await fileToBlob(file)
    const reportBlobURL = URL.createObjectURL(reportBlob);
    const params = new URLSearchParams({ url: reportBlobURL });
    const uploadingBox = document.getElementById('uploading-box')!;
    uploadingBox.style.display = 'block';
    try {
      await fetch(`upload?${params}`, {
        method: 'POST',
      });
    } finally {
      uploadingBox.style.display = 'none';
    }
    window.open('/report/index.html', '_blank');
  }
})();

function fileToBlob(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(new Blob([reader.result as ArrayBuffer]));
    };
    reader.onerror = () => {
      reject(reader.error);
    };
    reader.readAsArrayBuffer(file);
  });
}
