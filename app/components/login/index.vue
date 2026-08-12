<script setup lang="ts">
import { AlertCircle } from '@lucide/vue'

const { cfAccessEnabled, authEmailPasswordEnabled } = useRuntimeConfig().public

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
      <CardDescription v-if="authEmailPasswordEnabled">
        {{ $t('login.description') }}
      </CardDescription>
    </CardHeader>
    <CardContent class="grid gap-4">
      <!-- The form is only useful when the server accepts credential sign-in. -->
      <LoginForm v-if="authEmailPasswordEnabled" />

      <Button
        v-if="cfAccessEnabled"
        :variant="authEmailPasswordEnabled ? 'outline' : 'default'"
        @click="continueWithAccess"
      >
        {{ $t('login.continue_with_access') }}
      </Button>

      <Alert v-if="!authEmailPasswordEnabled && !cfAccessEnabled" variant="destructive">
        <AlertCircle aria-hidden="true" class="size-4" />
        <AlertTitle>{{ $t('login.no_method') }}</AlertTitle>
      </Alert>

      <Button v-if="authEmailPasswordEnabled && $config.public.authPublicSignupEnabled" variant="link" as-child>
        <NuxtLink to="/register">
          {{ $t('register.title') }}
        </NuxtLink>
      </Button>
    </CardContent>
  </Card>
</template>
