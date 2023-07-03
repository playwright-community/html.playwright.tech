import './style.css'

if (!('serviceWorker' in navigator))
  alert("Service Worker not supported");

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
    const blobUrl = URL.createObjectURL(blob);
    await fetch('upload?url=' + blobUrl, {
      method: 'POST',
    });
    window.open('/report/index.html', '_blank');
  })
})();

function fileToBlob(file: File): Promise<Blob> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(new Blob([reader.result as ArrayBuffer]));
    };
    reader.readAsArrayBuffer(file);
  });
}
