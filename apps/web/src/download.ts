export function download(filename: string, data: BlobPart | Uint8Array, type: string): void {
  const part = data instanceof Uint8Array ? (data.slice().buffer as ArrayBuffer) : data;
  const url = URL.createObjectURL(new Blob([part], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
