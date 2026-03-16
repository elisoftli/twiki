<script lang="ts">
  import type { Snippet } from 'svelte';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import Eye from '@lucide/svelte/icons/eye';
  import EyeOff from '@lucide/svelte/icons/eye-off';
  import { authStore } from '$lib/stores';

  let { infoAlert }: { infoAlert: Snippet } = $props();

  let email = $state('');
  let password = $state('');
  let error = $state<string | null>(null);
  let isSubmitting = $state(false);
  let showPassword = $state(false);

  // Simple email validation
  function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = null;

    if (!email.trim()) {
      error = 'Email is required';
      return;
    }

    if (!isValidEmail(email)) {
      error = 'Please enter a valid email address';
      return;
    }

    if (!password) {
      error = 'Password is required';
      return;
    }

    isSubmitting = true;
    const result = await authStore.signIn(email, password);
    isSubmitting = false;

    if (!result.success) {
      error = result.error || 'Sign in failed';
    }
  }

  function goToSignUp() {
    authStore.switchView('signup');
  }

  function goToForgotPassword() {
    authStore.switchView('forgot-password');
  }
</script>

<Dialog.Header>
  <Dialog.Title>Sign In</Dialog.Title>
</Dialog.Header>

{@render infoAlert()}

<form onsubmit={handleSubmit} class="space-y-4">
  <div>
    <Label for="email" class="mb-2 block">Email</Label>
    <Input
      id="email"
      type="email"
      placeholder="you@example.com"
      bind:value={email}
      disabled={isSubmitting}
    />
  </div>

  <div>
    <Label for="password" class="mb-2 block">Password</Label>
    <div class="relative">
      <Input
        id="password"
        type={showPassword ? 'text' : 'password'}
        placeholder="Enter your password"
        class="pr-9"
        bind:value={password}
        disabled={isSubmitting}
      />
      <button
        type="button"
        class="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-sm opacity-50 hover:opacity-100 hover:bg-muted p-0.5 transition-opacity"
        onclick={() => showPassword = !showPassword}
        title={showPassword ? 'Hide password' : 'Show password'}
        tabindex={-1}
      >
        {#if showPassword}
          <EyeOff class="size-4" />
        {:else}
          <Eye class="size-4" />
        {/if}
      </button>
    </div>
  </div>

  {#if error}
    <p class="text-sm text-destructive">{error}</p>
  {/if}

  <Button type="submit" class="w-full" disabled={isSubmitting}>
    {#if isSubmitting}
      <LoaderCircle class="mr-2 size-4 animate-spin" />
      Signing in...
    {:else}
      Sign In
    {/if}
  </Button>
</form>

<div class="text-center text-sm text-muted-foreground space-y-2">
  <div>
    Don't have an account?
    <button
      type="button"
      class="text-primary hover:underline font-medium"
      onclick={goToSignUp}
      disabled={isSubmitting}
    >
      Sign up
    </button>
  </div>
  <div>
    <button
      type="button"
      class="text-muted-foreground hover:text-foreground text-xs"
      onclick={goToForgotPassword}
      disabled={isSubmitting}
    >
      Forgot password?
    </button>
  </div>
</div>
