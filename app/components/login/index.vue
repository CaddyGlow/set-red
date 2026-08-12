<script setup lang="ts">
const { cfAccessEnabled } = useRuntimeConfig().public

/**
 * Cloudflare Access challenges at the edge, so this must leave the client
 * router: a soft navigation would never reach Cloudflare.
 */
function continueWithAccess() {
  window.location.assign('/dashboard')
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>
        <h1 class="text-2xl font-medium text-balance">
          {{ $t('login.title') }}
        </h1>
      </CardTitle>
      <CardDescription>
        {{ $t('login.description') }}
      </CardDescription>
    </CardHeader>
    <CardContent class="grid gap-4">
      <LoginForm />
      <Button
        v-if="cfAccessEnabled"
        variant="outline"
        @click="continueWithAccess"
      >
        {{ $t('login.continue_with_access') }}
      </Button>
      <Button v-if="$config.public.authPublicSignupEnabled" variant="link" as-child>
        <NuxtLink to="/register">
          {{ $t('register.title') }}
        </NuxtLink>
      </Button>
    </CardContent>
  </Card>
</template>
