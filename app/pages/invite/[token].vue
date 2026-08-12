<script setup lang="ts">
definePageMeta({ layout: 'default' })
const route = useRoute()
const token = computed(() => String(route.params.token))
const error = shallowRef('')
const registered = shallowRef(false)
const { data: session, status } = await useFetch('/api/auth/get-session', {
  credentials: 'include',
})

const loginPath = computed(() => ({
  path: '/login',
  query: { redirect: `/invite/${encodeURIComponent(token.value)}` },
}))

async function acceptInvitation() {
  try {
    await useAPI('/api/auth/invitation-accept', {
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
        <Alert v-if="registered">
          <AlertTitle>{{ $t('invite.registered') }}</AlertTitle>
        </Alert>
        <Button v-if="registered" variant="outline" class="w-full" as-child>
          <NuxtLink :to="loginPath">
            {{ $t('invite.sign_in') }}
          </NuxtLink>
        </Button>
        <Button v-else-if="session" class="w-full" @click="acceptInvitation">
          {{ $t('invite.accept') }}
        </Button>
        <RegisterInvitationRegisterForm
          v-else-if="status !== 'pending'"
          :invitation-id="token"
          @registered="registered = true"
        />
        <Button
          v-if="!session && !registered && status !== 'pending'" variant="outline" class="
            w-full
          " as-child
        >
          <NuxtLink :to="loginPath">
            {{ $t('invite.sign_in') }}
          </NuxtLink>
        </Button>
      </CardContent>
    </Card>
  </div>
</template>
