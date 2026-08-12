<script setup lang="ts">
definePageMeta({ layout: 'auth' })
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>{{ $t('reset.request_title') }}</CardTitle>
      <CardDescription>{{ $t('reset.request_description') }}</CardDescription>
    </CardHeader>
    <CardContent class="grid gap-4">
      <LoginForgotPasswordForm />
      <Button variant="link" as-child>
        <NuxtLink to="/login">
          {{ $t('login.title') }}
        </NuxtLink>
      </Button>
    </CardContent>
  </Card>
</template>
