<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
interface ApiKey { id: string, name: string | null, start: string | null, createdAt: string }
const keys = ref(await useAPI<ApiKey[]>('/api/workspaces/api-keys'))
const { auth } = useAuthSession()
const open = ref(false)
const createdKey = ref<{ id: string, key: string, name: string } | null>(null)

async function handleCreated(result: { id: string, key: string, name: string }) {
  createdKey.value = result
  keys.value = await useAPI<ApiKey[]>('/api/workspaces/api-keys')
}

function handleRevoked(id: string) {
  keys.value = keys.value.filter(key => key.id !== id)
}
</script>

<template>
  <main class="space-y-6">
    <div class="flex items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">
        {{ $t('workspace.api_keys.title') }}
      </h1>
      <Button @click="open = true">
        {{ $t('workspace.api_keys.create') }}
      </Button>
    </div>
    <Card>
      <CardContent class="divide-y">
        <div
          v-for="key in keys" :key="key.id" class="
            flex items-center justify-between py-4
          "
        >
          <div>
            <p class="font-medium">
              {{ key.name }}
            </p><p
              class="font-mono text-sm text-muted-foreground"
            >
              {{ key.start }}••••••••
            </p>
          </div>
          <WorkspaceApiKeyRevokeDialog :id="key.id" :name="key.name ?? key.start ?? key.id" @revoked="handleRevoked" />
        </div>
      </CardContent>
    </Card>
    <ResponsiveModal v-model:open="open" :title="$t('workspace.api_keys.create_title')">
      <div v-if="createdKey" class="space-y-3">
        <p class="text-sm text-muted-foreground">
          {{ $t('workspace.api_keys.secret_once') }}
        </p>
        <code class="block rounded-md bg-muted p-3 text-sm break-all">{{ createdKey.key }}</code>
        <Button @click="open = false; createdKey = null">
          {{ $t('common.close') }}
        </Button>
      </div>
      <WorkspaceApiKeyForm v-else :permissions="auth?.permissions ?? []" @created="handleCreated" />
    </ResponsiveModal>
  </main>
</template>
