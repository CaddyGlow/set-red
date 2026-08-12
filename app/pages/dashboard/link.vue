<script setup lang="ts">
import type { DashboardLink } from '@/types/dashboard-links'
import { AlertCircle, Inbox } from '@lucide/vue'

definePageMeta({
  layout: 'dashboard',
})

const route = useRoute()
const router = useRouter()
const routeLinkId = computed(() => typeof route.query.id === 'string' ? route.query.id : '')
const linksStore = useDashboardLinksStore()
useDashboardAnalysisRouteState({ detail: true })

const link = shallowRef<DashboardLink | null>(null)
const loading = shallowRef(false)
const loadError = shallowRef(false)
const id = computed(() => link.value?.id)
let requestController: AbortController | undefined

const { countersMap, counterErrorIds, fetchCounters, resetCounters } = useLinkCounters()

provide(LINK_ID_KEY, id)
provide(LINKS_COUNTERS_MAP_KEY, countersMap)
provide(LINKS_COUNTER_ERROR_IDS_KEY, counterErrorIds)
provide(RETRY_LINK_COUNTERS_KEY, (counterId: string) => void fetchCounters([counterId]))

async function loadLink(currentId = routeLinkId.value) {
  requestController?.abort()
  link.value = null
  loadError.value = false
  resetCounters()
  if (!currentId) {
    await navigateTo('/dashboard/links', { replace: true })
    return
  }

  const controller = new AbortController()
  requestController = controller
  loading.value = true
  try {
    const data = await useAPI<DashboardLink>('/api/link/query', {
      signal: controller.signal,
      query: { id: currentId },
    })
    if (!controller.signal.aborted)
      link.value = data
  }
  catch (error) {
    if (controller.signal.aborted)
      return
    console.error(error)
    loadError.value = true
  }
  finally {
    if (requestController === controller)
      loading.value = false
  }
}

watch(routeLinkId, currentId => void loadLink(currentId), { immediate: true })
watch(id, (currentId) => {
  if (currentId)
    void fetchCounters([currentId])
})
onBeforeUnmount(() => requestController?.abort())

linksStore.onLinkUpdate(({ link: updatedLink, type }) => {
  if (updatedLink.id !== link.value?.id)
    return

  if (type === 'delete') {
    navigateTo('/dashboard/links', { replace: true })
  }
  else if (type === 'edit') {
    link.value = updatedLink
    if (updatedLink.id !== routeLinkId.value)
      void router.replace(getDashboardLinkDetailLocation(updatedLink.id, route.query))
  }
})
</script>

<template>
  <main class="space-y-6">
    <h1 class="sr-only">
      {{ link?.slug ? `${$t('links.group_title')}: ${link.slug}` : $t('links.group_title') }}
    </h1>
    <Teleport to="#dashboard-header-actions" defer>
      <DashboardDatePicker />
    </Teleport>

    <DashboardLinksLink
      v-if="link?.id"
      :link="link"
    />
    <DashboardAnalysis
      v-if="link?.id"
      :link="link"
    />
    <section
      v-else-if="loading"
      class="space-y-6"
      role="status"
      aria-live="polite"
    >
      <DashboardLinksLinkSkeleton />
      <DashboardAnalysisSkeleton />
      <span class="sr-only">{{ $t('dashboard.loading') }}</span>
    </section>
    <Alert v-else-if="loadError" variant="destructive" class="mx-auto max-w-xl">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>{{ $t('links.load_failed') }}</AlertTitle>
      <AlertDescription>
        <Button variant="link" size="sm" class="text-destructive" @click="loadLink()">
          {{ $t('common.try_again') }}
        </Button>
      </AlertDescription>
    </Alert>
    <Card v-else>
      <CardContent
        class="
          flex min-h-48 flex-col items-center justify-center gap-3 text-center
          text-muted-foreground
        "
      >
        <Inbox class="size-8" aria-hidden="true" />
        <p class="text-sm">
          {{ $t('links.no_results') }}
        </p>
      </CardContent>
    </Card>
  </main>
</template>
