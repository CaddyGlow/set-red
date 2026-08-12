<script setup lang="ts">
definePageMeta({ layout: false })
const route = useRoute()
const token = computed(() => typeof route.query.token === 'string' ? route.query.token : '')
</script>

<template>
  <main class="grid min-h-svh place-items-center p-6">
    <Card class="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{{ $t('reset.title') }}</CardTitle>
      </CardHeader>
      <CardContent>
        <LoginResetPasswordForm v-if="token" :token="token" />
        <Alert v-else variant="destructive">
          <AlertTitle>{{ $t('reset.invalid') }}</AlertTitle>
        </Alert>
      </CardContent>
    </Card>
  </main>
</template>
