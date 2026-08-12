<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'

const { title, description } = useAppConfig()
</script>

<template>
  <div
    class="
      grid min-h-svh bg-background text-foreground
      lg:grid-cols-2
    "
  >
    <!-- Brand panel: hidden on small screens, where the form is the whole page -->
    <aside
      class="
        relative isolate hidden flex-col justify-between overflow-hidden
        border-r bg-muted/30 p-10
        lg:flex
      "
    >
      <div
        aria-hidden="true"
        class="
          pointer-events-none absolute inset-0 -z-10
          bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)]
          mask-[radial-gradient(ellipse_70%_60%_at_50%_40%,black,transparent)]
          bg-size-[56px_56px] opacity-60
        "
      />

      <NuxtLink
        to="/"
        :title="title"
        :aria-label="$t('layouts.links.home_aria_label')"
        class="flex w-fit items-center gap-2"
      >
        <BrandMark class="size-8" />
        <span class="text-xl font-black">{{ title }}</span>
      </NuxtLink>

      <p
        class="
          max-w-md text-2xl font-medium text-balance
          xl:text-3xl
        "
      >
        {{ description }}
      </p>

      <NuxtLink
        to="/"
        class="
          flex w-fit items-center gap-2 text-sm text-muted-foreground
          transition-colors
          hover:text-foreground
        "
      >
        <ArrowLeft aria-hidden="true" class="size-4" />
        {{ $t('layouts.links.home_aria_label') }}
      </NuxtLink>
    </aside>

    <main class="flex flex-col">
      <div class="flex items-center justify-between gap-4 p-6">
        <NuxtLink
          to="/"
          :title="title"
          :aria-label="$t('layouts.links.home_aria_label')"
          class="
            flex items-center gap-2
            lg:invisible
          "
        >
          <BrandMark class="size-7" />
          <span class="text-lg font-black">{{ title }}</span>
        </NuxtLink>
        <div class="flex items-center gap-2">
          <SwitchLanguage />
          <SwitchTheme />
        </div>
      </div>

      <div class="flex flex-1 items-center justify-center px-6 py-10">
        <div class="w-full max-w-sm">
          <slot />
        </div>
      </div>
    </main>
  </div>
</template>
