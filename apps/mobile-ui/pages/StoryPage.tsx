import type { ComponentProps, RefObject } from 'react'
import type { SchedulingStatus } from '../../../packages/contracts'
import { Icon } from '../components/Icon'
import type { WakeStageProps } from '../components/WakeStage'
import { MemoryTools, type Fact } from '../MemoryTools'
import type { StoryDetail } from '../navigation'

export interface StorySnapshot {
  story?: {
    status: string
    setting?: { character?: { name?: string } }
    state?: { alterSystem?: { emotionalOffset?: { description: string; direction: string } | null } }
  }
  schedulingStatus?: SchedulingStatus[]
  entries: { id: number; content: string; occurredAt: string; kind: string }[]
  facts: Fact[]
  memories: { id: number; content: string; summary?: string }[]
  intents?: ComponentProps<typeof MemoryTools>['intents']
  overlay?: { state: Record<string, unknown> }
  promptTrace: string[]
}

interface StoryPageProps extends Pick<ComponentProps<typeof MemoryTools>, 'bridge' | 'busy' | 'act' | 'refresh'> {
  guideRef: RefObject<HTMLDivElement>
  detail: StoryDetail
  setDetail: (detail: StoryDetail) => void
  story: StorySnapshot | null
  selected: string
  wake: WakeStageProps
  wakeStatusNote: string
  editSetting: () => void
  toLatest: () => void
}

export function StoryPage({ guideRef, detail, setDetail, story, selected, wake, wakeStatusNote, editSetting, toLatest, bridge, busy, act, refresh }: StoryPageProps) {
  const { runtime, transitioning, active, runtimeLabel, wakeActionLabel, chatWakeDisabled, triggerPrimaryWake, cancelInstall } = wake
  const paused = story?.story?.status === 'paused'
  return <>
    <div className="tabs" ref={guideRef}>
      <button className={detail === 'story' ? 'active' : ''} onClick={() => setDetail('story')}>故事时间线</button>
      <button className={detail === 'memory' ? 'active' : ''} onClick={() => setDetail('memory')}>长期记忆</button>
      <button className={detail === 'mind' ? 'active' : ''} onClick={() => setDetail('mind')}>此刻心绪</button>
    </div>
    {runtime?.state !== 'healthy' ? <div className={`wake-panel ${transitioning ? 'waking' : ''}`} role="status">
      <div><b>{active?.card.name || '故事'} · {runtimeLabel}</b>{wakeStatusNote && <p>{wakeStatusNote}</p>}</div>
      {transitioning ? <progress aria-label={runtimeLabel} /> : <button className="primary wake-button" disabled={chatWakeDisabled} onClick={triggerPrimaryWake}>{wakeActionLabel}<Icon name="arrow" /></button>}
      {runtime?.state === 'installing' && <button className="text-button" onClick={cancelInstall}>取消准备</button>}
      {runtime?.error && <p className="error">{runtime.error}</p>}
    </div> : <>
      <div className="inline-actions">
        <button onClick={editSetting}>修改故事设定</button>
        <button onClick={toLatest}>回到最新</button>
        <button onClick={() => act(async () => { await refresh() })}>刷新</button>
        <button onClick={() => act(async () => { await bridge.rpc({ method: paused ? 'story.resume' : 'story.pause' }); await refresh() }, '故事状态已更新。')}>{paused ? '恢复故事' : '暂停故事'}</button>
      </div>
      {detail === 'story' ? <div className="timeline">
        {story?.entries.filter(entry => entry.kind === 'script' || entry.kind === 'setup').map(entry => <article key={entry.id} data-read-anchor={`entry-${entry.id}`}>
          <time>{new Date(entry.occurredAt).toLocaleString('zh-CN')}</time><p>{entry.content}</p>
        </article>)}
        {!story?.entries.some(entry => entry.kind === 'script') && <p className="quiet-empty">还没有生成生活剧本。对话后可在这里查看。</p>}
      </div> : detail === 'mind' ? <div className="mind-card">
        <span className="eyebrow">INNER WEATHER</span><h2>{active?.card.name || '角色'}的心绪</h2>
        <p>{story?.story?.state?.alterSystem?.emotionalOffset?.description || '心绪还没有留下记录。随着故事继续，这里会记下细微的变化。'}</p>
      </div> : <div className="timeline">
        <MemoryTools key={selected} cardId={selected} bridge={bridge} facts={story?.facts || []} intents={story?.intents || []} schedulingStatus={story?.schedulingStatus || []} paused={paused} overlay={story?.overlay?.state || {}} busy={busy} act={act} refresh={refresh} />
        {story?.memories.map(memory => <article key={`memory-${memory.id}`} data-read-anchor={`memory-${memory.id}`}><span className="eyebrow">压缩记忆 #{memory.id}</span><p>{memory.summary || memory.content}</p></article>)}
        {!story?.facts.length && !story?.memories.length && <p className="quiet-empty">经历积累后，记忆会在这里出现。</p>}
      </div>}
    </>}
  </>
}
