export async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onerror = () => reject(new Error('Failed to read file'))
    fr.onload = () => resolve(String(fr.result))
    fr.readAsDataURL(file)
  })
}

export function assertImageFile(file: File, maxMb = 8) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Not an image file')
  }
  const maxBytes = maxMb * 1024 * 1024
  if (file.size > maxBytes) {
    throw new Error(`Image is too large (>${maxMb}MB)`)
  }
}
