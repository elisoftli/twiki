<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Badge } from '$lib/components/ui/badge';
  import Cpu from '@lucide/svelte/icons/cpu';
  import MonitorCog from '@lucide/svelte/icons/monitor-cog';
  import MemoryStick from '@lucide/svelte/icons/memory-stick';
  import Monitor from '@lucide/svelte/icons/monitor';
  import Laptop from '@lucide/svelte/icons/laptop';
  import AlertCircle from '@lucide/svelte/icons/alert-circle';
  import { settingsStore } from '$lib/stores';
  import { formatBytes } from '$lib/utils/format.utils';
  import { StateCard } from '$lib/components/domain/common/state-card';
  import { SpecsGridSkeleton } from '$lib/components/domain/common/loading-skeleton';
  import { SpecCard } from '$lib/components/domain/system/spec-card';
  import { SPEC_POLLING_INTERVAL_MS } from '$lib/constants/animations.constants';
  import type { SystemSpecs, SystemSpecsStatus } from '../../../../main/interfaces/system-specs.interface';

  let specs = $state<SystemSpecs | null>(null);
  let status = $state<SystemSpecsStatus | null>(null);
  let isLoading = $state(true);
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  async function fetchSpecs(): Promise<boolean> {
    try {
      status = await window.api.systemSpecs.getStatus();

      if (status.isLoaded && !status.error) {
        specs = await window.api.systemSpecs.getSpecs();
        isLoading = false;
        return true;
      } else if (status.error) {
        isLoading = false;
        return true;
      }

      return false;
    } catch (err) {
      status = { isLoaded: false, isLoading: false, error: String(err) };
      isLoading = false;
      return true;
    }
  }

  onMount(async () => {
    const done = await fetchSpecs();

    if (!done) {
      pollInterval = setInterval(async () => {
        const finished = await fetchSpecs();
        if (finished && pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      }, SPEC_POLLING_INTERVAL_MS);
    }
  });

  onDestroy(() => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  });

  function toggleSpecVisibility(specType: 'showOs' | 'showCpu' | 'showGpu' | 'showDisplay'): void {
    const current = settingsStore.value?.specsVisibility ?? { showOs: true, showCpu: true, showGpu: true, showDisplay: true };
    window.api.updateSettings({
      specsVisibility: {
        ...current,
        [specType]: !current[specType],
      },
    });
  }

  function isSpecVisible(specType: 'showOs' | 'showCpu' | 'showGpu' | 'showDisplay'): boolean {
    return settingsStore.value?.specsVisibility?.[specType] ?? true;
  }
</script>

<div class="min-h-screen bg-background">
  <!-- Header -->
  <div class="border-b border-border/50 bg-card/50">
    <div class="px-8 py-8">
      <div class="flex items-center justify-between">
        <div class="space-y-1">
          <h1 class="text-3xl font-bold tracking-tight text-foreground">My Specs</h1>
          <p class="text-muted-foreground">
            {#if isLoading || status?.isLoading}
              Detecting your hardware...
            {:else if specs}
              View your specs and control what the Auto Tweaker sees
            {:else}
              Unable to detect system specifications
            {/if}
          </p>
        </div>
      </div>
    </div>
  </div>

  <!-- Content Area -->
  <div class="p-8">
    <div class="mx-auto max-w-7xl">
      {#if isLoading || status?.isLoading}
        <SpecsGridSkeleton />
      {:else if status?.error}
        <StateCard
          variant="error"
          icon={AlertCircle}
          title="Detection Error"
          description={status.error}
        />
      {:else if specs}
        <!-- Specs Grid -->
        <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <!-- CPU Card -->
          {#if specs.cpu}
            <SpecCard
              icon={Cpu}
              title="Processor"
              animationIndex={2}
              showVisibilityToggle={true}
              isVisible={isSpecVisible('showCpu')}
              onToggleVisibility={() => toggleSpecVisibility('showCpu')}
            >
              <div class="space-y-2">
                <div>
                  <p class="font-medium">{specs.cpu.brand}</p>
                  <p class="text-sm text-muted-foreground">{specs.cpu.manufacturer}</p>
                </div>
                <div class="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span class="text-muted-foreground">Cores:</span>
                    <span class="ml-1">{specs.cpu.physicalCores}</span>
                  </div>
                  <div>
                    <span class="text-muted-foreground">Threads:</span>
                    <span class="ml-1">{specs.cpu.cores}</span>
                  </div>
                  <div>
                    <span class="text-muted-foreground">Base:</span>
                    <span class="ml-1">{specs.cpu.speed} GHz</span>
                  </div>
                  <div>
                    <span class="text-muted-foreground">Max:</span>
                    <span class="ml-1">{specs.cpu.speedMax} GHz</span>
                  </div>
                </div>
              </div>
            </SpecCard>
          {/if}

          <!-- GPU Cards -->
          {#each specs.gpu as gpu, i (gpu.model + i)}
            <SpecCard
              icon={MonitorCog}
              title="Graphics{specs.gpu.length > 1 ? ` ${i + 1}` : ''}"
              animationIndex={3}
              showVisibilityToggle={i === 0}
              isVisible={isSpecVisible('showGpu')}
              onToggleVisibility={() => toggleSpecVisibility('showGpu')}
            >
              <div class="space-y-2">
                <div>
                  <p class="font-medium">{gpu.model}</p>
                  <p class="text-sm text-muted-foreground">{gpu.vendor}</p>
                </div>
                <div class="space-y-1 text-sm">
                  {#if gpu.vram > 0}
                    <div>
                      <span class="text-muted-foreground">VRAM:</span>
                      <span class="ml-1">{formatBytes(gpu.vram * 1024 * 1024)}</span>
                    </div>
                  {/if}
                  {#if gpu.driverVersion && gpu.driverVersion !== 'Unknown'}
                    <div>
                      <span class="text-muted-foreground">Driver:</span>
                      <span class="ml-1">{gpu.driverVersion}</span>
                    </div>
                  {/if}
                </div>
              </div>
            </SpecCard>
          {/each}

          <!-- Memory Card -->
          {#if specs.memory}
            <SpecCard
              icon={MemoryStick}
              title="Memory"
              animationIndex={4}
            >
              <div class="space-y-2">
                <div>
                  <p class="font-medium">{formatBytes(specs.memory.total)}</p>
                  <p class="text-sm text-muted-foreground">Total RAM</p>
                </div>
              </div>
            </SpecCard>
          {/if}

          <!-- OS Card -->
          {#if specs.os}
            <SpecCard
              icon={Laptop}
              title="Operating System"
              animationIndex={5}
              showVisibilityToggle={true}
              isVisible={isSpecVisible('showOs')}
              onToggleVisibility={() => toggleSpecVisibility('showOs')}
            >
              <div class="space-y-2">
                <div>
                  <p class="font-medium">{specs.os.distro}</p>
                </div>
                <div class="space-y-1 text-sm">
                  {#if specs.os.release}
                    <div>
                      <span class="text-muted-foreground">Version:</span>
                      <span class="ml-1">{specs.os.release}</span>
                    </div>
                  {/if}
                  {#if specs.os.build}
                    <div>
                      <span class="text-muted-foreground">Build:</span>
                      <span class="ml-1">{specs.os.build}</span>
                    </div>
                  {/if}
                  <div>
                    <span class="text-muted-foreground">Architecture:</span>
                    <span class="ml-1">{specs.os.arch}</span>
                  </div>
                </div>
              </div>
            </SpecCard>
          {/if}

          <!-- Display Card -->
          {#if specs.display && specs.display.displays.length > 0}
            <SpecCard
              icon={Monitor}
              title="Displays"
              animationIndex={6}
              showVisibilityToggle={true}
              isVisible={isSpecVisible('showDisplay')}
              onToggleVisibility={() => toggleSpecVisibility('showDisplay')}
            >
              <div class="space-y-3">
                {#each specs.display.displays as display, i (display.model + i)}
                  <div class="space-y-1">
                    <div class="flex items-center gap-2">
                      <p class="text-sm font-medium">{display.model || `Display ${i + 1}`}</p>
                      {#if display.main}
                        <Badge variant="secondary" class="text-xs">Primary</Badge>
                      {/if}
                    </div>
                    <div class="text-sm text-muted-foreground">
                      {#if display.resolutionX && display.resolutionY}
                        {display.resolutionX}x{display.resolutionY}
                        {#if display.currentRefreshRate}
                          @ {display.currentRefreshRate}Hz
                        {/if}
                      {/if}
                      {#if display.connection}
                        <span class="mx-1">|</span>
                        {display.connection}
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            </SpecCard>
          {/if}
        </div>
      {:else}
        <StateCard
          variant="empty"
          icon={Cpu}
          title="No Specs Available"
          description="System specifications could not be loaded. Try restarting the application."
        />
      {/if}
    </div>
  </div>
</div>
