import { spaceDetailGroup, type SpacePage } from '../navigation'
import type { useAppNavigation } from '../hooks/useAppNavigation'

type Navigation = Pick<ReturnType<typeof useAppNavigation>, 'worldTab' | 'setWorldTab' | 'systemTab' | 'setSystemTab' | 'setSpacePage'>

const groups = {
  world: { label: '角色与故事分页', tabs: [['story', '角色与叙事'], ['library', '人格与角色库']] },
  system: { label: '备份、诊断与帮助分页', tabs: [['backup', '存档与设备'], ['diagnostics', '诊断与帮助']] },
  'visual-group': { label: '角色形象与视觉分页', tabs: [['avatar', '角色头像'], ['visual', '视觉档案与生图']] },
  'models-group': { label: '模型与任务分工分页', tabs: [['models', '模型连接'], ['tasks', '任务分工'], ['advanced', '高级与节奏']] },
  'appearance-group': { label: '界面个性化与通知分页', tabs: [['appearance', '界面与壁纸'], ['notifications', '消息通知']] },
} as const

interface TabGroupProps<T extends string> {
  group: { label: string; tabs: readonly (readonly [T, string])[] }
  active: T
  select: (tab: T) => void
}

function TabGroup<T extends string>({ group, active, select }: TabGroupProps<T>) {
  return <div className="space-subtabs" role="tablist" aria-label={group.label}>
    {group.tabs.map(([key, label]) => (
      <button key={key} type="button" role="tab" aria-selected={key === active} className={key === active ? 'is-active' : ''} onClick={() => select(key)}>
        {label}
      </button>
    ))}
  </div>
}

export function SpaceSubtabs({ page, navigation }: { page: SpacePage; navigation: Navigation }) {
  const group = spaceDetailGroup(page)
  if (group === 'world') return <TabGroup group={groups.world} active={navigation.worldTab} select={navigation.setWorldTab} />
  if (group === 'system') return <TabGroup group={groups.system} active={navigation.systemTab} select={navigation.setSystemTab} />
  if (group === 'visual-group' || group === 'models-group' || group === 'appearance-group') {
    return <TabGroup<SpacePage> group={groups[group]} active={page} select={navigation.setSpacePage} />
  }
  return null
}
