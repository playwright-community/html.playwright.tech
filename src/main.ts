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
  const dropzone = document.getElementById('dropzone');
  if (!dropzone)
    return;
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer)
      e.dataTransfer.dropEffect = 'copy';
  });
  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (!e.dataTransfer)
      return;
    const blob = await fileToBlob(e.dataTransfer.files[0])
    const blobURL = URL.createObjectURL(blob);
    const params = new URLSearchParams({
      url: blobURL,
    });
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
  })
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
