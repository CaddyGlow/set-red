<script setup lang="ts">
import { GitFork, Star } from '@lucide/vue'
import NumberFlow from '@number-flow/vue'

const { github } = useAppConfig()
const { rawStats } = useGithubStats()
</script>

<template>
  <section
    class="
      bg-background py-16 text-foreground
      md:py-24
    "
  >
    <div
      class="
        mx-auto grid max-w-6xl items-center gap-10 px-6
        md:grid-cols-2 md:gap-16
      "
    >
      <div
        class="
          space-y-4 text-center
          md:text-left
        "
      >
        <h2
          class="
            text-3xl font-medium text-balance
            md:text-4xl
          "
        >
          {{ $t('home.stats.title') }}
        </h2>
        <p class="text-pretty text-muted-foreground">
          {{ $t('home.stats.subtitle') }}
        </p>
        <Button
          as-child
          variant="outline"
        >
          <a
            :href="github"
            target="_blank"
            rel="noopener noreferrer"
            :title="$t('home.hero.github_repo')"
          >
            {{ $t('home.hero.github_repo') }}
          </a>
        </Button>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <Card>
          <CardContent class="space-y-3 text-center">
            <Star
              aria-hidden="true" class="mx-auto size-5 text-muted-foreground"
            />
            <ClientOnly>
              <template #fallback>
                <Skeleton class="mx-auto h-10 w-20" />
              </template>
              <NumberFlow
                class="
                  block text-4xl font-semibold tabular-nums
                  md:text-5xl
                "
                :value="rawStats.stars"
              />
            </ClientOnly>
            <p class="text-sm text-muted-foreground">
              {{ $t('home.stats.stars') }}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent class="space-y-3 text-center">
            <GitFork
              aria-hidden="true" class="mx-auto size-5 text-muted-foreground"
            />
            <ClientOnly>
              <template #fallback>
                <Skeleton class="mx-auto h-10 w-20" />
              </template>
              <NumberFlow
                class="
                  block text-4xl font-semibold tabular-nums
                  md:text-5xl
                "
                :value="rawStats.forks"
              />
            </ClientOnly>
            <p class="text-sm text-muted-foreground">
              {{ $t('home.stats.forks') }}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  </section>
</template>
