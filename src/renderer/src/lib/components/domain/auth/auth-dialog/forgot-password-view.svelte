<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { authStore } from '$lib/stores';

  let email = $state('');
  let error = $state<string | null>(null);
  let isSubmitting = $state(false);

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

    isSubmitting = true;
    const result = await authStore.forgotPassword(email);
    isSubmitting = false;

    if (!result.success) {
      error = result.error || 'Password reset request failed';
    }
    // On success, authStore.forgotPassword switches to reset-password view
  }

  function goToSignIn() {
    authStore.switchView('signin');
  }
</script>

<Dialog.Header>
  <Dialog.Title>Forgot Password</Dialog.Title>
  <Dialog.Description>
    Enter your email address and we'll send you a code to reset your password
  </Dialog.Description>
</Dialog.Header>

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

  {#if error}
    <p class="text-sm text-destructive">{error}</p>
  {/if}

  <Button type="submit" class="w-full" disabled={isSubmitting}>
    {#if isSubmitting}
      <LoaderCircle class="mr-2 size-4 animate-spin" />
      Sending code...
    {:else}
      Send Reset Code
    {/if}
  </Button>
</form>

<div class="text-center text-sm text-muted-foreground">
  <button
    type="button"
    class="text-muted-foreground hover:text-foreground text-xs"
    onclick={goToSignIn}
    disabled={isSubmitting}
  >
    Back to sign in
  </button>
</div>
