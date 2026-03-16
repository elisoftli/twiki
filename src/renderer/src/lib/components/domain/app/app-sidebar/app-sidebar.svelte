<script lang="ts">
  import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubItem,
    SidebarMenuSubButton,
  } from '$lib/components/ui/sidebar';
  import { Gamepad2, History, Cpu, Settings, LoaderCircle, CircleCheck, CircleX, AlertTriangle, LogOut, User } from 'lucide-svelte';
  import { tweakDialogStore, lastVisitedGameStore, authStore, serviceStatusStore } from '$lib/stores';
  import { AppIcon } from '$lib/components/domain/app/app-icon';
  import { UpdaterStatusCard } from '$lib/components/domain/system/updater-status-card';
  import { StatusCard } from '$lib/components/domain/system/status-card';
  import { Button } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { version } from '../../../../../../../../package.json';

  interface Props {
    currentPath: string;
    currentTheme: string;
    onThemeChange: (theme: string) => void;
  }

  const { currentPath, currentTheme, onThemeChange }: Props = $props();

  const themes = ['claude', 'nature', 'summer', 'clean-slate', 'sunset-horizon'];

  // Sign out is blocked during active tweak
  const canSignOut = $derived(!tweakDialogStore.isRunning);

  async function handleSignOut() {
    if (!canSignOut) return;
    await authStore.signOut();
  }

  function handleSignIn() {
    authStore.openDialog('signin');
  }
</script>

<Sidebar>
  <SidebarHeader class="p-4">
    <div class="flex items-center gap-2">
      <div class="flex size-8 items-center justify-center rounded-lg bg-primary/10">
        <AppIcon class="size-4 text-primary" />
      </div>
      <span class="text-lg font-semibold tracking-tight">Twiki</span>
    </div>
  </SidebarHeader>
  <SidebarContent>
    <SidebarGroup>
      <SidebarMenu data-gp-sidebar>
        <SidebarMenuItem>
          <SidebarMenuButton isActive={currentPath === '/' || currentPath.startsWith('/game')}>
            {#snippet child({ props })}
              <a href="/" {...props}>
                <Gamepad2 class="size-4" />
                <span>My Games</span>
              </a>
            {/snippet}
          </SidebarMenuButton>

          {#if lastVisitedGameStore.game}
            {@const game = lastVisitedGameStore.game}
            <SidebarMenuSub class="mt-0.5">
              <SidebarMenuSubItem>
                <SidebarMenuSubButton
                  size="sm"
                >
                  {#snippet child({ props })}
                    <a href="/game/{game.id}" {...props}>
                      {#if game.posterPath}
                        <img
                          src="local-file:///{game.posterPath}"
                          alt={game.name}
                          class="size-5 rounded object-cover shrink-0"
                          draggable="false"
                        />
                      {:else}
                        <div class="size-5 rounded bg-muted flex items-center justify-center shrink-0">
                          <span class="text-xs font-medium text-muted-foreground">
                            {game.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      {/if}
                      <span class="truncate">{game.name}</span>
                    </a>
                  {/snippet}
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            </SidebarMenuSub>
          {/if}
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton isActive={currentPath === '/my-specs'}>
            {#snippet child({ props })}
              <a href="/my-specs" {...props}>
                <Cpu class="size-4" />
                <span>My Specs</span>
              </a>
            {/snippet}
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton isActive={currentPath === '/applied-tweaks'}>
            {#snippet child({ props })}
              <a href="/applied-tweaks" {...props}>
                <History class="size-4" />
                <span>Applied Tweaks</span>
              </a>
            {/snippet}
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton isActive={currentPath === '/settings'}>
            {#snippet child({ props })}
              <a href="/settings" {...props}>
                <Settings class="size-4" />
                <span>Settings</span>
              </a>
            {/snippet}
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  </SidebarContent>
  <SidebarFooter class="p-4 gap-3">
    <!-- Service status cards -->
    {#each serviceStatusStore.visibleEntries as entry (entry.id)}
      <StatusCard {entry} onDismiss={entry.dismissible ? (id) => serviceStatusStore.dismiss(id) : undefined} />
    {/each}

    <!-- Updater status card -->
    <UpdaterStatusCard />

    <!-- Minimized tweak card -->
    {#if tweakDialogStore.showSidebarCard}
      <button
        type="button"
        class="
          w-full flex items-center p-2.5 rounded-lg border border-border/50
          bg-card/50 transition-colors duration-200 ease-out
          hover:border-primary/60 cursor-pointer text-left"
        onclick={() => tweakDialogStore.restore()}
      >
        {#if tweakDialogStore.isRunning}
          <LoaderCircle class="size-4 shrink-0 text-blue-500 animate-spin" />
        {:else if tweakDialogStore.hasError}
          <CircleX class="size-4 shrink-0 text-red-500" />
        {:else if tweakDialogStore.hasWarning}
          <AlertTriangle class="size-4 shrink-0 text-amber-500" />
        {:else}
          <CircleCheck class="size-4 shrink-0 text-green-500" />
        {/if}
        <div class="flex flex-col items-center min-w-0 flex-1 overflow-hidden">
          <span class="text-xs text-muted-foreground">Applying tweak</span>
        </div>
      </button>
    {/if}

    <!-- Auth section -->
    {#if authStore.isAuthenticated && authStore.user}
      <div class="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-border/50 bg-card/50">
        <User class="size-4 shrink-0 text-muted-foreground" />
        <span class="text-xs truncate min-w-0 flex-1">{authStore.user.username}</span>
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="ghost"
                size="icon"
                class="size-7 shrink-0"
                onclick={handleSignOut}
                disabled={!canSignOut}
              >
                <LogOut class="size-3.5" />
              </Button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content side="top">
            {#if canSignOut}
              Sign out
            {:else}
              Cannot sign out while tweak is running
            {/if}
          </Tooltip.Content>
        </Tooltip.Root>
      </div>
    {:else}
      <button
        type="button"
        class="w-full flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-lg border border-border/50 bg-card/50 text-xs text-muted-foreground hover:text-foreground transition-colors duration-200 ease-out hover:border-primary/60 cursor-pointer"
        onclick={handleSignIn}
      >
        <User class="size-4" />
        Sign in
      </button>
    {/if}

    <!-- Theme picker -->
    <div class="flex justify-center gap-1.5">
      {#each themes as theme, i}
        <button
          type="button"
          class="size-4 rounded transition-all hover:scale-110 {currentTheme === theme ? 'ring-1 ring-foreground ring-offset-1 ring-offset-sidebar' : ''}"
          style="background-color: var(--{theme}-theme-picker-swatch-color)"
          onclick={() => onThemeChange(theme)}
          title={`Theme ${i + 1}`}
        ></button>
      {/each}
    </div>

    <!-- App version -->
    <div class="text-center text-xs leading-none text-muted-foreground">
      v{version}
    </div>
  </SidebarFooter>
</Sidebar>
