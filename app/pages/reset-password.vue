<script setup lang="ts">
definePageMeta({ layout: 'auth' })
const route = useRoute()
const token = computed(() => typeof route.query.token === 'string' ? route.query.token : '')
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>{{ $t('reset.title') }}</CardTitle>
    </CardHeader>
    <CardContent class="grid gap-4">
      <LoginResetPasswordForm v-if="token" :token="token" />
      <Alert v-else variant="destructive">
        <AlertTitle>{{ $t('reset.invalid') }}</AlertTitle>
      </Alert>
      <Button variant="link" as-child>
        <NuxtLink to="/login">
          {{ $t('login.title') }}
        </NuxtLink>
      </Button>
    </CardContent>
  </Card>
</template>
