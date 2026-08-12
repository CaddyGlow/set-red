<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
const { workspaces, setActiveWorkspace } = useAuthSession()

async function selectWorkspace(id: string) {
  await setActiveWorkspace(id)
  await navigateTo('/dashboard/links')
}
</script>

<template>
  <main class="mx-auto max-w-2xl space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">
        {{ $t('workspace.select.title') }}
      </h1>
      <p class="text-muted-foreground">
        {{ $t('workspace.select.description') }}
      </p>
    </div>
    <Card v-for="workspace in workspaces" :key="workspace.id" size="sm">
      <CardHeader>
        <CardTitle>{{ workspace.name }}</CardTitle>
        <CardDescription>{{ workspace.role }}</CardDescription>
        <CardAction>
          <Button @click="selectWorkspace(workspace.id)">
            {{ $t('workspace.select.title') }}
          </Button>
        </CardAction>
      </CardHeader>
    </Card>
  </main>
</template>
