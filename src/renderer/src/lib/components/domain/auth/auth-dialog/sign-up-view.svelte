<script lang="ts">
  import type { Snippet } from 'svelte';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import Check from '@lucide/svelte/icons/check';
  import X from '@lucide/svelte/icons/x';
  import Eye from '@lucide/svelte/icons/eye';
  import EyeOff from '@lucide/svelte/icons/eye-off';
  import { authStore } from '$lib/stores';

  let { infoAlert }: { infoAlert: Snippet } = $props();

  let username = $state('');
  let email = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let error = $state<string | null>(null);
  let isSubmitting = $state(false);
  let showPassword = $state(false);

  // Validation patterns
  const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Password requirement checks
  const hasMinLength = $derived(password.length >= 8);
  const hasUppercase = $derived(/[A-Z]/.test(password));
  const hasLowercase = $derived(/[a-z]/.test(password));
  const hasNumber = $derived(/[0-9]/.test(password));
  const passwordsMatch = $derived(password === confirmPassword && confirmPassword.length > 0);
  const isPasswordValid = $derived(hasMinLength && hasUppercase && hasLowercase && hasNumber);

  // Form validation
  const isUsernameValid = $derived(USERNAME_PATTERN.test(username));
  const isEmailValid = $derived(EMAIL_PATTERN.test(email));
  const canSubmit = $derived(
    isUsernameValid && isEmailValid && isPasswordValid && passwordsMatch && !isSubmitting
  );

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = null;

    if (!isUsernameValid) {
      error = 'Username must be 3-20 characters, alphanumeric and underscore only';
      return;
    }

    if (!isEmailValid) {
      error = 'Please enter a valid email address';
      return;
    }

    if (!isPasswordValid) {
      error = 'Password does not meet requirements';
      return;
    }

    if (!passwordsMatch) {
      error = 'Passwords do not match';
      return;
    }

    isSubmitting = true;
    const result = await authStore.signUp(username, email, password);
    isSubmitting = false;

    if (!result.success) {
      error = result.error || 'Sign up failed';
    }
    // On success, authStore.signUp switches to verify view
  }

  function goToSignIn() {
    authStore.switchView('signin');
  }
</script>

<Dialog.Header>
  <Dialog.Title>Create Account</Dialog.Title>
</Dialog.Header>

{@render infoAlert()}

<form onsubmit={handleSubmit} class="space-y-4">
  <div>
    <Label for="username" class="mb-2 block">Username</Label>
    <Input
      id="username"
      type="text"
      placeholder="your_username"
      bind:value={username}
      disabled={isSubmitting}
    />
    {#if username && !isUsernameValid}
      <p class="text-xs text-muted-foreground mt-1.5">
        3-20 characters, letters, numbers, and underscore only
      </p>
    {/if}
  </div>

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
        placeholder="Create a password"
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
    {#if password}
      <div class="space-y-1 text-xs mt-1.5">
        <div class="flex items-center gap-1.5 {hasMinLength ? 'text-green-500' : 'text-muted-foreground'}">
          {#if hasMinLength}
            <Check class="size-3" />
          {:else}
            <X class="size-3" />
          {/if}
          At least 8 characters
        </div>
        <div class="flex items-center gap-1.5 {hasUppercase ? 'text-green-500' : 'text-muted-foreground'}">
          {#if hasUppercase}
            <Check class="size-3" />
          {:else}
            <X class="size-3" />
          {/if}
          One uppercase letter
        </div>
        <div class="flex items-center gap-1.5 {hasLowercase ? 'text-green-500' : 'text-muted-foreground'}">
          {#if hasLowercase}
            <Check class="size-3" />
          {:else}
            <X class="size-3" />
          {/if}
          One lowercase letter
        </div>
        <div class="flex items-center gap-1.5 {hasNumber ? 'text-green-500' : 'text-muted-foreground'}">
          {#if hasNumber}
            <Check class="size-3" />
          {:else}
            <X class="size-3" />
          {/if}
          One number
        </div>
      </div>
    {/if}
  </div>

  <div>
    <Label for="confirmPassword" class="mb-2 block">Confirm Password</Label>
    <div class="relative">
      <Input
        id="confirmPassword"
        type={showPassword ? 'text' : 'password'}
        placeholder="Confirm your password"
        class="pr-9"
        bind:value={confirmPassword}
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
    {#if confirmPassword && !passwordsMatch}
      <p class="text-xs text-destructive mt-1.5">Passwords do not match</p>
    {/if}
  </div>

  {#if error}
    <p class="text-sm text-destructive">{error}</p>
  {/if}

  <Button type="submit" class="w-full" disabled={!canSubmit}>
    {#if isSubmitting}
      <LoaderCircle class="mr-2 size-4 animate-spin" />
      Creating account...
    {:else}
      Sign Up
    {/if}
  </Button>
</form>

<div class="text-center text-sm text-muted-foreground">
  Already have an account?
  <button
    type="button"
    class="text-primary hover:underline font-medium"
    onclick={goToSignIn}
    disabled={isSubmitting}
  >
    Sign in
  </button>
</div>
