<template>
  <Card class="w-full max-w-sm">
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
      <Button v-if="$config.public.authPublicSignupEnabled" variant="link" as-child>
        <NuxtLink to="/register">
          {{ $t('register.title') }}
        </NuxtLink>
      </Button>
    </CardContent>
  </Card>
</template>
