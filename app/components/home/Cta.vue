<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'

const { documentation } = useAppConfig()
</script>

<template>
  <section
    class="
      relative isolate overflow-hidden bg-background py-16 text-foreground
      md:py-24
    "
  >
    <!-- Ambient background: soft grid fading out toward the section edges -->
    <div
      aria-hidden="true"
      class="
        pointer-events-none absolute inset-0 -z-10
        bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)]
        mask-[radial-gradient(ellipse_55%_60%_at_50%_50%,black,transparent)]
        bg-size-[56px_56px] opacity-60
      "
    />

    <div class="mx-auto max-w-6xl px-6">
      <div class="mx-auto max-w-2xl text-center">
        <h2
          class="
            text-3xl font-medium text-balance
            md:text-4xl
          "
        >
          {{ $t('home.cta.title') }}
        </h2>
        <p class="mt-4 text-pretty text-muted-foreground">
          {{ $t('home.cta.description') }}
        </p>

        <div class="mt-10 flex flex-wrap justify-center gap-2">
          <Button
            as-child
            size="lg"
          >
            <a
              :href="`${documentation}/guide/getting-started`"
              target="_blank"
              rel="noopener noreferrer"
              :title="$t('home.cta.button')"
            >
              {{ $t('home.cta.button') }}
              <ArrowRight aria-hidden="true" />
            </a>
          </Button>

          <Button
            as-child
            size="lg"
            variant="outline"
          >
            <NuxtLink to="/dashboard" :title="$t('dashboard.title')">
              {{ $t('dashboard.title') }}
            </NuxtLink>
          </Button>
        </div>
      </div>
    </div>
  </section>
</template>
