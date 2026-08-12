<script setup lang="ts">
import { Globe2, KeyRound, Settings2, Users } from '@lucide/vue'

interface NavItem {
  title: string
  url: string
  icon: Component
  isActive: boolean
}

const { title } = useAppConfig()
const { isActive } = useDashboardRoute()
const { can } = useAuthSession()

const platformItems = computed<NavItem[]>(() => [
  {
    title: 'nav.links',
    url: '/dashboard/links',
    icon: DASHBOARD_ROUTES.links.icon,
    isActive: isActive('links'),
  },
  {
    title: 'nav.analysis',
    url: '/dashboard/analysis',
    icon: DASHBOARD_ROUTES.analysis.icon,
    isActive: isActive('analysis'),
  },
  {
    title: 'nav.realtime',
    url: '/dashboard/realtime',
    icon: DASHBOARD_ROUTES.realtime.icon,
    isActive: isActive('realtime'),
  },
  {
    title: 'nav.check',
    url: '/dashboard/check',
    icon: DASHBOARD_ROUTES.check.icon,
    isActive: isActive('check'),
  },
])

const settingsItems = computed<NavItem[]>(() => [
  {
    title: 'nav.migrate',
    url: '/dashboard/migrate',
    icon: DASHBOARD_ROUTES.migrate.icon,
    isActive: isActive('migrate'),
  },
  ...(can('workspace.settings')
    ? [{
        title: 'workspace.nav.settings',
        url: '/dashboard/settings/workspace',
        icon: Settings2,
        isActive: useRoute().path === '/dashboard/settings/workspace',
      }]
    : []),
  ...(can('domains.write')
    ? [{
        title: 'workspace.nav.domains',
        url: '/dashboard/settings/domains',
        icon: Globe2,
        isActive: useRoute().path === '/dashboard/settings/domains',
      }]
    : []),
  ...(can('members.invite')
    ? [{
        title: 'workspace.nav.members',
        url: '/dashboard/settings/members',
        icon: Users,
        isActive: useRoute().path === '/dashboard/settings/members',
      }]
    : []),
  ...(can('apiKeys.own') || can('apiKeys.manage')
    ? [{
        title: 'workspace.nav.api_keys',
        url: '/dashboard/settings/api-keys',
        icon: KeyRound,
        isActive: useRoute().path === '/dashboard/settings/api-keys',
      }]
    : []),
])
</script>

<template>
  <Sidebar collapsible="icon" variant="inset">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" as-child>
            <NuxtLink
              to="/" :title="title"
            >
              <div
                class="
                  flex aspect-square size-8 items-center justify-center
                  rounded-full
                "
              >
                <img
                  src="/sink.png"
                  alt=""
                  width="32"
                  height="32"
                  class="size-8 rounded-full"
                >
              </div>
              <div class="grid flex-1 text-left text-sm/tight">
                <span class="truncate font-medium">{{ title }}</span>
                <span class="truncate text-xs">{{ $t('sidebar.subtitle') }}</span>
              </div>
            </NuxtLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
    <SidebarContent>
      <DashboardSidebarNavMain :platform-items="platformItems" :settings-items="settingsItems" />
      <DashboardSidebarNavSecondary class="mt-auto" />
    </SidebarContent>
    <SidebarFooter>
      <DashboardSidebarNavUser />
    </SidebarFooter>
  </Sidebar>
</template>
