import React, { useEffect, useState } from 'react'
import type { ExperienceSnapshot, NativeBridge } from '../../packages/contracts'
import { StoredImage } from './StoredImage'
import { operationId } from './operation-id'

export function Feed({ bridge, snapshot, refresh, healthy, name, cardId, avatar }: { bridge: NativeBridge; snapshot: ExperienceSnapshot; refresh: () => Promise<void>; healthy: boolean; name: string; cardId: string; avatar?: string }) {
  const [expanded, setExpanded] = useState(false)
  const [initial] = useState(() => { try { return JSON.parse(localStorage.getItem(`hds-feed-draft-${cardId}`) || '{}') } catch { return {} } })
  const [text, setText] = useState<string>(typeof initial.text === 'string' ? initial.text : ''), [images, setImages] = useState<string[]>(Array.isArray(initial.images) ? initial.images.filter((id: unknown) => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id)).slice(0, 3) : []), [comment, setComment] = useState<{ postId: string; replyTo?: string } | null>(null), [reply, setReply] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
  useEffect(() => { try { localStorage.setItem(`hds-feed-draft-${cardId}`, JSON.stringify({ text, images })) } catch { setNotice('动态草稿暂时无法保存到本机') } }, [text, images, cardId])
  const act = async (action: string, payload: Record<string, unknown>, done?: () => void) => { setBusy(true); setNotice(''); try { const operation = operationId(localStorage, `hds-feed-operation-${cardId}`, { action, payload }); await bridge.rpc({ method: 'feed.mutate', payload: { ...payload, action, operationId: operation.id } }); operation.done(); done?.(); await refresh() } catch (e) { setNotice(String(e)) } finally { setBusy(false) } }
  const pick = async (source: 'gallery' | 'camera') => {
    setBusy(true); setNotice('')
    try {
      const selected = await bridge.pickImage({ limit: 3 - images.length, source })
      if (selected.cancelled) return
      const errors = (selected.errors ?? []).map(error => `第 ${error.index + 1} 张：${error.message}`)
      const picked = selected.images ?? (selected.dataUri ? [{ dataUri: selected.dataUri }] : [])
      for (const image of picked.slice(0, 3 - images.length)) {
        try {
          const id = ((await bridge.rpc({ method: 'images.upload', payload: image })).data as { id: string }).id
          setImages(previous => [...new Set([...previous, id])].slice(0, 3))
        } catch { errors.push('图片上传失败，已成功的图片仍保留') }
      }
      if (!picked.length && !errors.length) errors.push('图库未返回图片，请重新选择')
      if (selected.truncated) errors.push('最多添加 3 张图片，已保留选中的图片')
      setNotice(errors.join('；'))
    } catch (e) { setNotice(String(e)) } finally { setBusy(false) }
  }
  return <div className="feed-page"><section className="feed-compose"><button type="button" className="feed-compose-toggle" aria-expanded={expanded} aria-controls="feed-editor" onClick={() => setExpanded(value => !value)}><span>分享此刻{!expanded && (text.trim() || images.length > 0) && <small>有未发布的草稿</small>}</span><span aria-hidden="true">{expanded ? "−" : "＋"}</span></button>{expanded && <div id="feed-editor"><label className="sr-only" htmlFor="feed-draft">分享此刻</label><textarea id="feed-draft" maxLength={2000} rows={3} placeholder="写下此刻…" value={text} onChange={e => setText(e.target.value)} /><div className="feed-images">{images.map(id => <div key={id}><StoredImage id={id} bridge={bridge} /><button onClick={() => setImages(images.filter(v => v !== id))}>移除</button></div>)}</div><div className="feed-tools"><button disabled={!healthy || busy || images.length >= 3} onClick={() => void pick('gallery')}>相册</button><button disabled={!healthy || busy || images.length >= 3} onClick={() => void pick('camera')}>拍摄</button><button className="primary" disabled={!healthy || busy || (!text.trim() && !images.length)} onClick={() => void act('post', { content: text, images }, () => { setText(''); setImages([]); setExpanded(false) })}>发布</button></div></div>}</section>{(notice || !healthy) && <p role="status" className="caption">{notice || "唤醒故事后可发布与互动。"}</p>}
    {snapshot.posts.map(post => <article className="feed-post" key={post.id}><div className="feed-author"><span className="feed-avatar">{post.actor === "character" && avatar ? <img className="character-avatar" src={avatar} alt={`${name}的头像`} /> : post.actor === "user" ? "我" : name.slice(0, 1)}</span><div><strong>{post.actor === 'user' ? '我' : name}</strong><time>{new Date(post.at).toLocaleString('zh-CN')}</time></div></div><p className="feed-text">{post.content}</p><div className="feed-images">{post.images.map(id => <StoredImage key={id} id={id} bridge={bridge} />)}</div><div className="feed-tools"><button aria-pressed={post.likes.includes('user')} disabled={busy || !healthy} onClick={() => void act('like', { postId: post.id, enabled: !post.likes.includes('user') })}>{post.likes.includes('user') ? '♥ 已赞' : '♡ 点赞'}</button><button onClick={() => { setComment({ postId: post.id }); setReply('') }}>评论</button>{post.actor === 'user' && <button className="text-button" disabled={busy} onClick={() => void act('delete', { postId: post.id })}>删除</button>}</div>{post.likes.length > 0 && <div className="feed-likes">♥ {post.likes.map(actor => actor === 'user' ? '我' : name).join('、')}</div>}<div className="feed-comments">{post.comments.filter(c => !c.deleted).map(c => <div key={c.id}><button className="comment-body" onClick={() => { setComment({ postId: post.id, replyTo: c.id }); setReply('') }}><b>{c.actor === 'user' ? '我' : name}</b>{c.replyTo && ' 回复'}：{c.content}</button>{c.actor === 'user' && <button aria-label="删除评论" className="text-button" disabled={busy} onClick={() => void act('deleteComment', { postId: post.id, commentId: c.id })}>×</button>}</div>)}</div></article>)}
    {!snapshot.posts.length && <p className="quiet-empty">第一条动态，从你的今天开始。</p>}
    {comment && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-label="发表评论"><h2>{comment.replyTo ? '回复评论' : '发表评论'}</h2><textarea autoFocus rows={3} maxLength={1000} value={reply} onChange={e => setReply(e.target.value)} /><div className="actions"><button onClick={() => setComment(null)}>取消</button><button className="primary" disabled={busy || !healthy || !reply.trim()} onClick={() => void act('comment', { ...comment, content: reply }, () => { setComment(null); setReply('') })}>发送</button></div></div></div>}
  </div>
}
