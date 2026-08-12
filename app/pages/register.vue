<script setup lang="ts">
definePageMeta({ layout: 'default' })
const { authPublicSignupEnabled } = useRuntimeConfig().public
if (!authPublicSignupEnabled)
  throw createError({ statusCode: 404, statusMessage: 'Not Found' })
</script>

<template>
  <div class="flex flex-1 items-center justify-center px-6 py-16">
    <Card class="w-full max-w-sm">
      <CardHeader><CardTitle>{{ $t('register.title') }}</CardTitle></CardHeader>
      <CardContent><RegisterRegisterForm /></CardContent>
    </Card>
  </div>
</template>
