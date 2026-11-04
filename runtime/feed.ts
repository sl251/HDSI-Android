import { join } from 'node:path'
import { atomicState } from './atomic-state'
import type { FeedPost, FeedComment } from '../packages/contracts/experience'

type Actor = 'user' | 'character'
type FeedEvent = { seq: number; at: string; postId: string; kind: string; actor: Actor; detail: string }
type State = { posts: FeedPost[]; events: FeedEvent[]; sequence: number; observed: number; actions: string[] }
export function feedStore(directory: string) {
  const store = atomicState<State>(join(directory, 'feed.json'), () => ({ posts: [], events: [], sequence: 0, observed: 0, actions: [] }))
  const text = (value: unknown, max = 2000) => { if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('动态内容为空或过长'); return value.trim() }
  const event = (s: State, postId: string, actor: Actor, kind: string, detail: string) => { s.events.push({ seq: ++s.sequence, at: new Date().toISOString(), postId, actor, kind, detail }); s.events = s.events.slice(-200) }
  const target = (s: State, id: unknown) => { const post = s.posts.find(p => p.id === id && !p.deleted); if (!post) throw new Error('动态已删除或不属于当前故事'); return post }
  return {
    list: () => store.read().posts.filter(p => !p.deleted).slice(-200).reverse(),
    revision: () => store.read().sequence,
    observed: () => store.read().observed,
    attachImages(postId: string, images: string[]) {
      return store.change(s => {
        const post = s.posts.find(p => p.id === postId && p.actor === 'character')
        if (!post) return false
        // Deleting a post while its image is generating must not recreate it.
        if (post.deleted) return true
        const next = [...new Set([...post.images, ...images.filter(id => /^[a-f0-9]{64}$/.test(id))])].slice(0, 3)
        if (JSON.stringify(next) !== JSON.stringify(post.images)) { post.images = next; event(s, post.id, 'character', '添加配图', '') }
        return true
      })
    },
    observe: (through: number) => store.change(s => { s.observed = Math.max(s.observed, Math.min(through, s.sequence)) }),
    mutate(actor: Actor, action: string, payload: Record<string, unknown>, operationId: string) {
      if (!/^[\w:-]{8,160}$/.test(operationId)) throw new Error('动态操作编号无效')
      return store.change(s => {
        if (s.actions.includes(operationId)) return { duplicate: true }
        let id = String(payload.postId ?? '')
        if (action === 'post') {
          const images = Array.isArray(payload.images) ? payload.images.filter((v): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)).slice(0, 3) : []
          const content = images.length && !payload.content ? '' : text(payload.content)
          id = operationId
          if (s.posts.some(p => p.id === id)) return { duplicate: true }
          s.posts.push({ id, actor, content, images, at: new Date().toISOString(), likes: [], comments: [] })
          event(s, id, actor, '发布动态', content)
        } else {
          const post = target(s, id)
          if (action === 'like') {
            const enabled = payload.enabled === true
            if (post.likes.includes(actor) !== enabled) {
              post.likes = enabled ? [...post.likes, actor] : post.likes.filter(v => v !== actor)
              event(s, id, actor, enabled ? '点赞' : '取消点赞', '')
            }
          } else if (action === 'comment') {
            if (post.comments.some(c => c.id === operationId)) return { duplicate: true }
            if (post.comments.filter(c => !c.deleted).length >= 300) throw new Error('此动态评论已满')
            const replyTo = payload.replyTo ? String(payload.replyTo) : undefined
            if (replyTo && !post.comments.some(c => c.id === replyTo && !c.deleted)) throw new Error('回复目标已不存在')
            const comment: FeedComment = { id: operationId, actor, content: text(payload.content, 1000), replyTo, at: new Date().toISOString() }
            post.comments.push(comment); event(s, id, actor, '评论', comment.content)
          } else if (action === 'delete') {
            if (post.actor !== actor) throw new Error('只能删除自己的动态')
            post.deleted = true; event(s, id, actor, '删除动态', '')
          } else if (action === 'deleteComment') {
            const comment = post.comments.find(c => c.id === payload.commentId && c.actor === actor && !c.deleted)
            if (!comment) throw new Error('只能删除自己的评论')
            comment.deleted = true; event(s, id, actor, '删除评论', '')
          } else throw new Error('未知动态操作')
        }
        s.actions.push(operationId); s.actions = s.actions.slice(-2000)
        return { id }
      })
    },
    context() {
      const s = store.read()
      const changes = s.events.filter(e => e.seq > s.observed).slice(-16)
      const recentIds = [...new Set([...s.posts.filter(p => !p.deleted).slice(-6).map(p => p.id), ...changes.map(e => e.postId)])].slice(-6)
      return { through: s.sequence, changes: changes.map(e => ({ ...e, detail: e.detail.slice(0, 180) })), posts: recentIds.map(id => s.posts.find(p => p.id === id && !p.deleted)).filter((p): p is FeedPost => !!p).map(p => ({ ...p, content: p.content.slice(0, 600), truncated: p.content.length > 600, comments: p.comments.filter(c => !c.deleted).slice(-4).map(c => ({ ...c, content: c.content.slice(0, 180) })), userLiked: p.likes.includes('user') })) }
    },
  }
}
