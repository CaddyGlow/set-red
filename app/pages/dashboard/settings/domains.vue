<script setup lang="ts">
import type { Domain } from '#shared/schemas/domain'

definePageMeta({ layout: 'dashboard' })
const domains = await useAPI<Domain[]>('/api/domains')
const domainList = ref(domains)
const selected = ref<Domain | null>(null)

function handleSaved(domain: Domain) {
  domainList.value = domainList.value.map(current => current.id === domain.id ? domain : current)
  selected.value = null
}
</script>

<template>
  <main class="space-y-6">
    <h1 class="text-2xl font-semibold">
      {{ $t('workspace.domains.title') }}
    </h1>
    <div
      class="
        grid gap-4
        md:grid-cols-2
      "
    >
      <Card v-for="domain in domainList" :key="domain.id" size="sm">
        <CardHeader>
          <CardTitle>{{ domain.hostname }}</CardTitle>
          <CardDescription>{{ domain.status }}</CardDescription>
          <CardAction>
            <div class="flex items-center gap-2">
              <Badge v-if="domain.isPrimary">
                {{ $t('workspace.domains.primary') }}
              </Badge>
              <Button variant="outline" size="sm" @click="selected = domain">
                {{ $t('workspace.domains.edit') }}
              </Button>
            </div>
          </CardAction>
        </CardHeader>
      </Card>
    </div>
    <ResponsiveModal :open="selected !== null" :title="$t('workspace.domains.edit_title')" @update:open="!$event && (selected = null)">
      <WorkspaceDomainForm v-if="selected" :domain="selected" @saved="handleSaved" />
    </ResponsiveModal>
  </main>
</template>
