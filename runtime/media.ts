import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function imageStore(directory: string) {
  const root = join(directory, 'images')
  mkdirSync(root, { recursive: true })
  const path = (id: string) => { if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('无效图片编号'); return join(root, `${id}.jpg`) }
  const register = (bytes: Buffer, limit: number) => {
    if (!bytes.length || bytes.length > limit) throw new Error('图片超过大小限制')
    const extension = bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ? 'jpg'
      : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'png'
      : /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString()) ? 'gif'
      : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' ? 'webp' : undefined
    if (!extension) throw new Error('不支持的图片格式')
    const id = createHash('sha256').update(bytes).digest('hex'), file = join(root, `${id}.${extension}`)
    if (!existsSync(file)) writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 })
    return { id }
  }
  return {
    save(dataUri: unknown) {
      if (typeof dataUri !== 'string' || dataUri.length > 700000) throw new Error('图片过大，请重新选择')
      const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUri)
      if (!match) throw new Error('仅支持选图后压缩的 JPEG 图片')
      const bytes = Buffer.from(match[1], 'base64')
      if (bytes.length < 4 || bytes.length > 500000 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217 || bytes.toString('base64') !== match[1]) throw new Error('无效 JPEG 图片')
      const id = createHash('sha256').update(bytes).digest('hex')
      if (!existsSync(path(id))) writeFileSync(path(id), bytes, { flag: 'wx', mode: 0o600 })
      return { id, dataUri }
    },
    // Keep sticker limits unchanged; generated images have a separate 16 MiB budget.
    registerSticker: (bytes: Buffer) => register(bytes, 10 * 1024 * 1024),
    registerGeneratedImage: (bytes: Buffer) => register(bytes, 16 * 1024 * 1024),
    get(id: string) {
      path(id) // Validate before any filesystem access.
      const extension = ['jpg', 'png', 'gif', 'webp'].find(ext => existsSync(join(root, `${id}.${ext}`)))
      if (!extension) throw new Error('图片暂时无法读取')
      return `data:image/${extension === 'jpg' ? 'jpeg' : extension};base64,${readFileSync(join(root, `${id}.${extension}`)).toString('base64')}`
    },
    requestId: () => randomUUID(),
  }
}
