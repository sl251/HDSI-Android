import React from 'react'

export function QuickStart({ character, configured, tested, running, busy, select, configure, test, wake, compose, close }: {
  character?: string; configured: boolean; tested: boolean; running: boolean; busy: boolean;
  select: () => void; configure: () => void; test: () => void; wake: () => void; compose: () => void; close: () => void;
}) {
  const completed = Number(!!character) + Number(tested) + Number(running)
  return <section className="quick-start" aria-label="首次对话准备">
    <div className="section-title"><h2>从第一句话开始</h2><button className="text-button" onClick={close}>稍后再说</button></div>
    <p className="caption">准备进度 {completed}/3 · 完成后亲自发一句话，收到回复就完成初次体验。</p>
    <ol>
      <li><span><b>{character ? `已选择 ${character}` : '选择故事的主角'}</b><small>导入角色卡，或手动创建。</small></span><button className="secondary" disabled={busy} onClick={select}>{character ? '更换角色' : '选择角色'}</button></li>
      <li><span><b>{tested ? '聊天连接已测试' : '连接一个聊天模型'}</b><small>默认连接承担对话、记忆整理与内心活动；测试会产生少量 API 费用。</small></span><div className="actions"><button className="secondary" disabled={busy} onClick={configure}>{configured ? '修改连接' : '填写连接'}</button>{configured && <button className="secondary" disabled={busy} onClick={test}>{tested ? '重新测试' : '测试连接'}</button>}</div></li>
      <li><span><b>{running ? '故事已唤醒' : '唤醒故事'}</b><small>{running ? '在下方输入你想说的话。' : '首次唤醒会准备本机运行环境。'}</small></span><button className="primary" disabled={busy || !character || !configured} onClick={running ? compose : wake}>{running ? '去说第一句话' : '唤醒故事'}</button></li>
    </ol>
  </section>
}
