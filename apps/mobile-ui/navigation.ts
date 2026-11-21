export const spaceEntries = [
  { key: 'world', label: '角色与故事', caption: '角色库、修改人设、故事设定与记忆', title: '角色与故事' },
  { key: 'avatar', label: '角色形象与视觉', caption: '头像生成、固定外观、参考图与自主生图', title: '角色形象与视觉' },
  { key: 'visual', label: '角色视觉档案', caption: '固定外观、参考图与自主生图', title: '角色形象与视觉' },
  { key: 'chat', label: '聊天与输入', caption: '回车发送、流式回复、消息合并与表情包', title: '聊天与输入' },
  { key: 'voice', label: '角色语音与音色', caption: '角色说话的音色、合成与用量', title: '角色语音与音色' },
  { key: 'life', label: '持续生活', caption: '主动联系、情绪天气与后台运行', title: '持续生活' },
  { key: 'models', label: '模型与任务分工', caption: '服务连接、模型指派、检索与高级节奏', title: '模型与任务分工' },
  { key: 'tasks', label: '任务分工', caption: '对话、记忆、图片识别与检索', title: '模型与任务分工' },
  { key: 'advanced', label: '高级设置', caption: '后台预算、生成参数与世界节奏', title: '模型与任务分工' },
  { key: 'media', label: '语音识别与生图', caption: '独立服务、免费渠道与模型', title: '语音识别与生图' },
  { key: 'appearance', label: '界面个性化与通知', caption: '壁纸、字体、阅读样式与消息提醒', title: '界面个性化与通知' },
  { key: 'notifications', label: '消息通知', caption: '回复提醒与系统权限', title: '界面个性化与通知' },
  { key: 'system', label: '备份、诊断与帮助', caption: '存档、消息诊断、组件维护与引导', title: '备份、诊断与帮助' },
] as const
export type SpacePage = typeof spaceEntries[number]['key']

export const spaceSections: { title: string; keys: readonly SpacePage[]; includeInbox?: boolean }[] = [
  { title: '角色与叙事', keys: ['world', 'avatar'] },
  { title: '对话与日常', keys: ['chat', 'voice', 'life'], includeInbox: true },
  { title: '模型与多模态', keys: ['models', 'media'] },
  { title: '外观与系统', keys: ['appearance', 'system'] },
]
export type Page = 'feed' | 'chat' | 'inbox' | 'cards' | 'story' | 'settings'
export const tabs = ['chat', 'story', 'feed', 'settings'] as const
export type Tab = typeof tabs[number]
export const labels: Record<Page, string> = { feed: '动态', chat: '故事', inbox: '信箱', cards: '角色', story: '见闻', settings: '空间' }

export type StoryDetail = 'story' | 'memory' | 'mind'

export function spaceDetailGroup(page: SpacePage) {
  switch (page) {
    case 'avatar':
    case 'visual':
      return 'visual-group'
    case 'models':
    case 'tasks':
    case 'advanced':
      return 'models-group'
    case 'appearance':
    case 'notifications':
      return 'appearance-group'
    default:
      return page
  }
}
