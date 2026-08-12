<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'

const { title, description } = useAppConfig()
const { authPublicSignupEnabled } = useRuntimeConfig().public
</script>

<template>
  <section class="relative isolate bg-background text-foreground">
    <!-- Ambient background: soft grid fading into the page surface -->
    <div
      aria-hidden="true"
      class="
        pointer-events-none absolute inset-0 -z-10
        bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)]
        mask-[radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]
        bg-size-[56px_56px] opacity-60
      "
    />

    <div
      class="
        mx-auto flex max-w-3xl flex-col items-center px-6 py-20 text-center
        md:py-28
      "
    >
      <BrandMark class="size-14" :title="`${title} Logo`" />

      <h1
        class="
          mt-8 text-4xl font-medium text-balance
          md:text-6xl
        "
      >
        {{ title }}
      </h1>
      <p
        class="
          mt-6 max-w-xl text-lg text-pretty text-muted-foreground
          md:text-xl
        "
      >
        {{ description }}
      </p>

      <div
        class="
          mt-10 flex w-full flex-col items-stretch justify-center gap-2
          sm:w-auto sm:flex-row sm:items-center
        "
      >
        <Button
          v-if="authPublicSignupEnabled"
          as-child
          size="lg"
        >
          <NuxtLink to="/register">
            <span class="text-nowrap">{{ $t('register.title') }}</span>
            <ArrowRight aria-hidden="true" />
          </NuxtLink>
        </Button>
        <Button
          as-child
          size="lg"
          :variant="authPublicSignupEnabled ? 'outline' : 'default'"
        >
          <NuxtLink to="/login">
            <span class="text-nowrap">{{ $t('login.title') }}</span>
          </NuxtLink>
        </Button>
      </div>
    </div>
  </section>
</template>
