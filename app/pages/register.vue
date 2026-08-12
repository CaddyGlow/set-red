<script setup lang="ts">
definePageMeta({ layout: 'auth' })
const { authPublicSignupEnabled } = useRuntimeConfig().public
if (!authPublicSignupEnabled)
  throw createError({ statusCode: 404, statusMessage: 'Not Found' })
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>
        <h1 class="text-2xl font-medium text-balance">
          {{ $t('register.title') }}
        </h1>
      </CardTitle>
    </CardHeader>
    <CardContent class="grid gap-4">
      <RegisterRegisterForm />
      <Button variant="link" as-child>
        <NuxtLink to="/login">
          {{ $t('login.title') }}
        </NuxtLink>
      </Button>
    </CardContent>
  </Card>
</template>
