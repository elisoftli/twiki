<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import { authStore } from '$lib/stores';

  let code = $state('');
  let error = $state<string | null>(null);
  let isSubmitting = $state(false);
  let isResending = $state(false);
  let resendCooldown = $state(0);
  let showEmailWarning = $state(authStore.emailWarning);

  // Countdown timer for resend cooldown
  let cooldownInterval: ReturnType<typeof setInterval> | null = null;

  function startCooldown() {
    resendCooldown = 60;
    if (cooldownInterval) clearInterval(cooldownInterval);
    cooldownInterval = setInterval(() => {
      resendCooldown--;
      if (resendCooldown <= 0) {
        if (cooldownInterval) {
          clearInterval(cooldownInterval);
          cooldownInterval = null;
        }
      }
    }, 1000);
  }

  // Clean up interval on component destroy
  $effect(() => {
    return () => {
      if (cooldownInterval) {
        clearInterval(cooldownInterval);
      }
    };
  });

  // Format code input - only allow digits
  function handleCodeInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const digitsOnly = input.value.replace(/\D/g, '').slice(0, 6);
    code = digitsOnly;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = null;

    if (code.length !== 6) {
      error = 'Please enter the 6-digit code';
      return;
    }

    isSubmitting = true;
    const result = await authStore.verify(code);
    isSubmitting = false;

    if (!result.success) {
      error = result.error || 'Verification failed';
    }
    // On success, authStore.verify closes dialog and executes pending tweak
  }

  async function handleResend() {
    if (resendCooldown > 0) return;

    isResending = true;
    const result = await authStore.resendCode();
    isResending = false;

    if (result.success) {
      startCooldown();
      showEmailWarning = false; // Clear warning after successful resend
    } else {
      error = result.error || 'Failed to resend code';
    }
  }

  function goToSignIn() {
    authStore.switchView('signin');
  }
</script>

<Dialog.Header>
  <Dialog.Title>Verify Your Email</Dialog.Title>
  <Dialog.Description>
    Enter the 6-digit code sent to your email address
  </Dialog.Description>
</Dialog.Header>

{#if showEmailWarning}
  <div class="flex items-start gap-3 rounded-md bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-600 dark:text-amber-400">
    <TriangleAlert class="size-4 shrink-0 mt-0.5" />
    <p>We had trouble sending your verification email. Please click "Resend code" to try again.</p>
  </div>
{/if}

<form onsubmit={handleSubmit} class="space-y-4">
  <div>
    <Label for="code" class="mb-2 block">Verification Code</Label>
    <Input
      id="code"
      type="text"
      inputmode="numeric"
      placeholder="000000"
      value={code}
      oninput={handleCodeInput}
      disabled={isSubmitting}
      class="text-center text-lg tracking-[0.5em] font-mono"
      maxlength={6}
    />
  </div>

  {#if error}
    <p class="text-sm text-destructive">{error}</p>
  {/if}

  <Button type="submit" class="w-full" disabled={code.length !== 6 || isSubmitting}>
    {#if isSubmitting}
      <LoaderCircle class="mr-2 size-4 animate-spin" />
      Verifying...
    {:else}
      Verify
    {/if}
  </Button>
</form>

<div class="text-center text-sm text-muted-foreground space-y-2">
  <div>
    Didn't receive the code?
    <button
      type="button"
      class="text-primary hover:underline font-medium disabled:text-muted-foreground disabled:no-underline"
      onclick={handleResend}
      disabled={resendCooldown > 0 || isResending}
    >
      {#if isResending}
        Sending...
      {:else if resendCooldown > 0}
        Resend in {resendCooldown}s
      {:else}
        Resend code
      {/if}
    </button>
  </div>
  <div>
    <button
      type="button"
      class="text-muted-foreground hover:text-foreground text-xs"
      onclick={goToSignIn}
      disabled={isSubmitting}
    >
      Back to sign in
    </button>
  </div>
</div>
