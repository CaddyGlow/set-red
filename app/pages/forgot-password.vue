<script setup lang="ts">
definePageMeta({ layout: false })
</script>

<template>
  <main class="grid min-h-svh place-items-center p-6">
    <Card class="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{{ $t('reset.request_title') }}</CardTitle>
        <CardDescription>{{ $t('reset.request_description') }}</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForgotPasswordForm />
      </CardContent>
    </Card>
  </main>
</template>
