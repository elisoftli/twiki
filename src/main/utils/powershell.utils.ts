import { spawn } from 'child_process';
import type { DisplayInfo } from '../interfaces/system-specs.interface';
import { createLogger } from './logger.utils';

const logger = createLogger('PowerShellDisplay');

/**
 * PowerShell script that uses Windows API to get accurate display information.
 * This bypasses the systeminformation package's known issues with refresh rates.
 */
const DISPLAY_INFO_SCRIPT = `
$ErrorActionPreference = 'Stop'

$pinvokeCode = @"
using System;
using System.Runtime.InteropServices;
using System.Collections.Generic;

namespace DisplayInfo
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct DEVMODE
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string dmDeviceName;
        public short dmSpecVersion;
        public short dmDriverVersion;
        public short dmSize;
        public short dmDriverExtra;
        public int dmFields;
        public int dmPositionX;
        public int dmPositionY;
        public int dmDisplayOrientation;
        public int dmDisplayFixedOutput;
        public short dmColor;
        public short dmDuplex;
        public short dmYResolution;
        public short dmTTOption;
        public short dmCollate;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string dmFormName;
        public short dmLogPixels;
        public int dmBitsPerPel;
        public int dmPelsWidth;
        public int dmPelsHeight;
        public int dmDisplayFlags;
        public int dmDisplayFrequency;
        public int dmICMMethod;
        public int dmICMIntent;
        public int dmMediaType;
        public int dmDitherType;
        public int dmReserved1;
        public int dmReserved2;
        public int dmPanningWidth;
        public int dmPanningHeight;
    }

    [Flags]
    public enum DisplayDeviceStateFlags : int
    {
        AttachedToDesktop = 0x1,
        MultiDriver = 0x2,
        PrimaryDevice = 0x4,
        MirroringDriver = 0x8,
        VGACompatible = 0x10,
        Removable = 0x20,
        ModesPruned = 0x8000000,
        Remote = 0x4000000,
        Disconnect = 0x2000000
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct DISPLAY_DEVICE
    {
        public int cb;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string DeviceName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string DeviceString;
        public DisplayDeviceStateFlags StateFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string DeviceID;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string DeviceKey;
    }

    public class NativeMethods
    {
        [DllImport("user32.dll", CharSet = CharSet.Ansi)]
        public static extern bool EnumDisplayDevices(string lpDevice, uint iDevNum, ref DISPLAY_DEVICE lpDisplayDevice, uint dwFlags);

        [DllImport("user32.dll", CharSet = CharSet.Ansi)]
        public static extern bool EnumDisplaySettings(string lpszDeviceName, int iModeNum, ref DEVMODE lpDevMode);

        public const int ENUM_CURRENT_SETTINGS = -1;
    }

    public class DisplayInfoResult
    {
        public string DeviceName { get; set; }
        public string DeviceString { get; set; }
        public string MonitorDeviceID { get; set; }
        public bool IsPrimary { get; set; }
        public bool IsAttached { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }
        public int RefreshRate { get; set; }
    }

    public class DisplayEnumerator
    {
        public static List<DisplayInfoResult> GetDisplays()
        {
            var results = new List<DisplayInfoResult>();

            for (uint i = 0; i < 16; i++)
            {
                DISPLAY_DEVICE adapter = new DISPLAY_DEVICE();
                adapter.cb = Marshal.SizeOf(adapter);

                if (!NativeMethods.EnumDisplayDevices(null, i, ref adapter, 0))
                    break;

                if ((adapter.StateFlags & DisplayDeviceStateFlags.AttachedToDesktop) == 0)
                    continue;

                if ((adapter.StateFlags & DisplayDeviceStateFlags.MirroringDriver) != 0)
                    continue;

                // Find the active monitor for this adapter
                string monitorDeviceID = "";
                for (uint j = 0; j < 8; j++)
                {
                    DISPLAY_DEVICE monitor = new DISPLAY_DEVICE();
                    monitor.cb = Marshal.SizeOf(monitor);

                    if (!NativeMethods.EnumDisplayDevices(adapter.DeviceName, j, ref monitor, 0))
                        break;

                    // Check if this monitor is active (attached)
                    if ((monitor.StateFlags & DisplayDeviceStateFlags.AttachedToDesktop) != 0)
                    {
                        monitorDeviceID = monitor.DeviceID;
                        break;
                    }
                }

                var result = new DisplayInfoResult
                {
                    DeviceName = adapter.DeviceName,
                    DeviceString = adapter.DeviceString,
                    MonitorDeviceID = monitorDeviceID,
                    IsPrimary = (adapter.StateFlags & DisplayDeviceStateFlags.PrimaryDevice) != 0,
                    IsAttached = true
                };

                DEVMODE devMode = new DEVMODE();
                devMode.dmSize = (short)Marshal.SizeOf(devMode);

                if (NativeMethods.EnumDisplaySettings(adapter.DeviceName, NativeMethods.ENUM_CURRENT_SETTINGS, ref devMode))
                {
                    result.Width = devMode.dmPelsWidth;
                    result.Height = devMode.dmPelsHeight;
                    result.RefreshRate = devMode.dmDisplayFrequency;
                }

                results.Add(result);
            }

            return results;
        }
    }
}
"@

Add-Type -TypeDefinition $pinvokeCode -Language CSharp

$displays = [DisplayInfo.DisplayEnumerator]::GetDisplays()

$monitorIds = @{}
$monitorConnections = @{}

try {
    $wmiMonitors = Get-CimInstance -Namespace root\\wmi -ClassName WmiMonitorID -ErrorAction SilentlyContinue
    foreach ($mon in $wmiMonitors) {
        $instanceName = $mon.InstanceName
        $manufacturer = if ($mon.ManufacturerName) { [System.Text.Encoding]::ASCII.GetString($mon.ManufacturerName).Trim([char]0) } else { "" }
        $productCode = if ($mon.ProductCodeID) { [System.Text.Encoding]::ASCII.GetString($mon.ProductCodeID).Trim([char]0) } else { "" }
        $userFriendlyName = if ($mon.UserFriendlyName) { [System.Text.Encoding]::ASCII.GetString($mon.UserFriendlyName).Trim([char]0) } else { "" }

        $modelName = if ($userFriendlyName) { $userFriendlyName } elseif ($productCode) { "$manufacturer $productCode" } else { $manufacturer }
        $monitorIds[$instanceName] = $modelName
    }
} catch {}

try {
    $wmiConnections = Get-CimInstance -Namespace root\\wmi -ClassName WmiMonitorConnectionParams -ErrorAction SilentlyContinue
    foreach ($conn in $wmiConnections) {
        $instanceName = $conn.InstanceName
        $videoType = switch ($conn.VideoOutputTechnology) {
            0 { "Other" }
            1 { "HD15" }
            2 { "SVIDEO" }
            3 { "Composite" }
            4 { "Component" }
            5 { "DVI" }
            6 { "HDMI" }
            7 { "LVDS" }
            8 { "D-Jpn" }
            9 { "SDI" }
            10 { "DisplayPort" }
            11 { "DisplayPort" }
            12 { "UDI" }
            13 { "UDI" }
            14 { "SDTV" }
            15 { "Miracast" }
            16 { "Indirect" }
            0x80000000 { "Internal" }
            default { "Unknown" }
        }
        $monitorConnections[$instanceName] = $videoType
    }
} catch {}

$output = @()
foreach ($disp in $displays) {
    $model = "Unknown"
    $connection = $null

    # Match monitor DeviceID (format: MONITOR\{ID}\...) against WMI InstanceName (format: DISPLAY\{ID}\...)
    if ($disp.MonitorDeviceID -match 'MONITOR\\\\([^\\\\]+)') {
        $monitorPattern = $Matches[1]

        foreach ($key in $monitorIds.Keys) {
            if ($key -like "*$monitorPattern*") {
                $model = $monitorIds[$key]
                if ($monitorConnections.ContainsKey($key)) {
                    $connection = $monitorConnections[$key]
                }
                break
            }
        }
    }

    if ($model -eq "Unknown" -and $disp.DeviceString) {
        $model = $disp.DeviceString
    }

    $output += @{
        model = $model
        main = $disp.IsPrimary
        connection = $connection
        resolutionX = $disp.Width
        resolutionY = $disp.Height
        currentRefreshRate = $disp.RefreshRate
    }
}

$output | ConvertTo-Json -Compress
`;

/**
 * Executes a PowerShell script via stdin pipe to avoid command line length limits.
 * Returns a promise that resolves with stdout or rejects on error.
 */
function executePowerShellScript(script: string, timeoutMs: number = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      ps.kill();
      reject(new Error('PowerShell script timed out'));
    }, timeoutMs);

    ps.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    ps.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    ps.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`PowerShell exited with code ${code}: ${stderr}`));
      }
    });

    ps.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    // Write script to stdin and close it
    ps.stdin.write(script);
    ps.stdin.end();
  });
}

/**
 * Executes the PowerShell script to get display information using Windows API.
 * This provides accurate refresh rates for multi-monitor setups.
 *
 * @returns Array of DisplayInfo objects, or null if the script fails
 */
export async function getDisplayInfoFromPowerShell(): Promise<DisplayInfo[] | null> {
  try {
    const result = await executePowerShellScript(DISPLAY_INFO_SCRIPT);
    const parsed = JSON.parse(result.trim());

    // Handle single display (PowerShell returns object instead of array)
    const displays: DisplayInfo[] = Array.isArray(parsed) ? parsed : [parsed];

    // Validate and normalize the output
    return displays.map((d) => ({
      model: typeof d.model === 'string' ? d.model : 'Unknown',
      main: Boolean(d.main),
      connection: typeof d.connection === 'string' ? d.connection : null,
      resolutionX: typeof d.resolutionX === 'number' ? d.resolutionX : null,
      resolutionY: typeof d.resolutionY === 'number' ? d.resolutionY : null,
      currentRefreshRate: typeof d.currentRefreshRate === 'number' ? d.currentRefreshRate : null,
    }));
  } catch (error) {
    logger.error('Failed to get display info from PowerShell:', error);
    return null;
  }
}
