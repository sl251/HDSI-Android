import React from 'react'
import type { useChatHistory } from '../hooks/useChatHistory'
import { QuickStart } from '../QuickStart'
import { ChatComposer, type ChatComposerProps } from '../components/ChatComposer'
import { MessageList, type MessageListProps } from '../components/MessageList'
import { InlineWakeBar, WakeStage, type WakeStageProps } from '../components/WakeStage'

interface ChatPageProps {
  composer: ChatComposerProps
  thread: Pick<MessageListProps, 'userName' | 'messageFailures' | 'typing' | 'focusMessageDiagnostic' | 'newMessages' | 'toLatest'> & {
    history: Pick<ReturnType<typeof useChatHistory>,
      'messages' | 'displayMessages' | 'lastCharacterReplyTs' | 'setHistorySearch' | 'hasOlder' | 'loadingOlder' | 'loadOlder'>
  }
  quickStart?: React.ComponentProps<typeof QuickStart>
  wake: WakeStageProps
}

export function ChatPage({ quickStart, wake, composer, thread }: ChatPageProps) {
  const { history, typing } = thread
  const { bridge, selected, media, busy, healthy, delivery, snapshot } = composer
  const empty = !history.displayMessages.length && !snapshot.streams.length && delivery.requestState !== 'sending' && !typing
  return <>
    {quickStart && <QuickStart {...quickStart} />}
    {healthy && <div className="history-toolbar">
      <button className="text-button" onClick={() => history.setHistorySearch(true)}>查找聊天记录</button>
      {history.hasOlder && <button className="secondary" disabled={history.loadingOlder} onClick={() => void history.loadOlder()}>
        {history.loadingOlder ? '正在读取…' : '加载更早消息'}
      </button>}
    </div>}
    <div className="chat-stage">
      {empty ? (healthy ? <div className="chat-empty-spacer" aria-hidden="true" /> : <WakeStage {...wake} />) : (
        <MessageList
          {...thread} bridge={bridge} delivery={delivery} selected={selected} stickers={media.stickers}
          avatar={wake.avatar} characterName={wake.characterName} streams={snapshot.streams}
          busy={busy} healthy={healthy}
        >
          {wake.active && !healthy && <InlineWakeBar {...wake} />}
        </MessageList>
      )}
    </div>
    <ChatComposer {...composer} />
  </>
}
