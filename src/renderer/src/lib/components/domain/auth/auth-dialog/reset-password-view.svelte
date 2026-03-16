<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import Check from '@lucide/svelte/icons/check';
  import X from '@lucide/svelte/icons/x';
  import Eye from '@lucide/svelte/icons/eye';
  import EyeOff from '@lucide/svelte/icons/eye-off';
  import { authStore } from '$lib/stores';

  let code = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');
  let error = $state<string | null>(null);
  let isSubmitting = $state(false);
  let isResending = $state(false);
  let resendCooldown = $state(0);
  let showPassword = $state(false);
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

  // Password requirement checks
  const hasMinLength = $derived(newPassword.length >= 8);
  const hasUppercase = $derived(/[A-Z]/.test(newPassword));
  const hasLowercase = $derived(/[a-z]/.test(newPassword));
  const hasNumber = $derived(/[0-9]/.test(newPassword));
  const passwordsMatch = $derived(newPassword === confirmPassword && confirmPassword.length > 0);
  const isPasswordValid = $derived(hasMinLength && hasUppercase && hasLowercase && hasNumber);

  const canSubmit = $derived(
    code.length === 6 && isPasswordValid && passwordsMatch && !isSubmitting
  );

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = null;

    if (code.length !== 6) {
      error = 'Please enter the 6-digit code';
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
    const result = await authStore.resetPassword(code, newPassword);
    isSubmitting = false;

    if (!result.success) {
      error = result.error || 'Password reset failed';
    }
    // On success, authStore.resetPassword switches to signin view
  }

  async function handleResend() {
    if (resendCooldown > 0) return;

    isResending = true;
    const result = await authStore.resendResetCode();
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

  function goToForgotPassword() {
    authStore.switchView('forgot-password');
  }
</script>

<Dialog.Header>
  <Dialog.Title>Reset Your Password</Dialog.Title>
  <Dialog.Description>
    Enter the 6-digit code sent to {authStore.pendingResetEmail || 'your email'} and choose a new password
  </Dialog.Description>
</Dialog.Header>

{#if showEmailWarning}
  <div class="flex items-start gap-3 rounded-md bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-600 dark:text-amber-400">
    <TriangleAlert class="size-4 shrink-0 mt-0.5" />
    <p>We had trouble sending your reset email. Please click "Resend code" to try again.</p>
  </div>
{/if}

<form onsubmit={handleSubmit} class="space-y-4">
  <div>
    <Label for="code" class="mb-2 block">Reset Code</Label>
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

  <div>
    <Label for="newPassword" class="mb-2 block">New Password</Label>
    <div class="relative">
      <Input
        id="newPassword"
        type={showPassword ? 'text' : 'password'}
        placeholder="Create a new password"
        class="pr-9"
        bind:value={newPassword}
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
    {#if newPassword}
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
        placeholder="Confirm your new password"
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
      Resetting password...
    {:else}
      Reset Password
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
  <div class="flex justify-center gap-4">
    <button
      type="button"
      class="text-muted-foreground hover:text-foreground text-xs"
      onclick={goToForgotPassword}
      disabled={isSubmitting}
    >
      Try different email
    </button>
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
