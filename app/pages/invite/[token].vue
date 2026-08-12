<script setup lang="ts">
definePageMeta({ layout: 'default' })
const route = useRoute()
const token = computed(() => String(route.params.token))
const error = shallowRef('')

async function acceptInvitation() {
  try {
    await useAPI('/api/auth/organization/accept-invitation', {
      method: 'POST',
      body: { invitationId: token.value },
    })
    await navigateTo('/dashboard')
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}
</script>

<template>
  <div class="flex flex-1 items-center justify-center px-6 py-16">
    <Card class="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{{ $t('invite.title') }}</CardTitle>
        <CardDescription>{{ $t('invite.description') }}</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <Alert v-if="error" variant="destructive">
          <AlertTitle>{{ error }}</AlertTitle>
        </Alert>
        <Button class="w-full" @click="acceptInvitation">
          {{ $t('invite.accept') }}
        </Button>
      </CardContent>
    </Card>
  </div>
</template>
