/**
 * Set process affinity utility - sets processor affinity for game processes
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import type { SetProcessAffinityParams, SetProcessAffinityResult } from './types';

const execAsync = promisify(exec);

export async function setProcessAffinity(params: SetProcessAffinityParams): Promise<SetProcessAffinityResult> {
  const { processName, affinityMask: customMask, waitForProcess = true, maxWaitSeconds = 30 } = params;

  const processNameWithExe = processName.endsWith('.exe') ? processName : `${processName}.exe`;
  const numCPUs = os.cpus().length;
  // Use custom mask if provided, otherwise all cores (e.g., 0xFF for 8 cores)
  const affinityMask = customMask ?? (1 << numCPUs) - 1;

  if (waitForProcess) {
    // Wait for process to start
    const startTime = Date.now();
    const maxWaitMs = maxWaitSeconds * 1000;
    let processFound = false;

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const { stdout } = await execAsync(`tasklist /FI "IMAGENAME eq ${processNameWithExe}" /FO CSV /NH`);
        if (stdout.includes(processNameWithExe)) {
          processFound = true;
          break;
        }
      } catch {
        // Process not found yet
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (!processFound) {
      throw new Error(`Process ${processNameWithExe} not found after waiting ${maxWaitSeconds} seconds`);
    }
  }

  // Use PowerShell to set affinity for all instances of the process
  // Semicolons are required as statement separators since newlines are replaced with spaces
  const psCommand = `
    $processes = Get-Process -Name "${processName}" -ErrorAction SilentlyContinue;
    if ($processes) {
      foreach ($proc in $processes) {
        $proc.ProcessorAffinity = ${affinityMask}
      };
      Write-Output "Set affinity for $($processes.Count) process(es)"
    } else {
      throw "Process not found"
    }
  `;

  await execAsync(`powershell -NoProfile -Command "${psCommand.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`);

  return {
    numCPUs,
    affinityMask,
  };
}
