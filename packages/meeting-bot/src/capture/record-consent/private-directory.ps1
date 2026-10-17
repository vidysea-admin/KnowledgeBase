param([Parameter(Mandatory=$true)][string]$TargetPath)
$ErrorActionPreference = 'Stop'
$target = [IO.Path]::GetFullPath($TargetPath)
if ($target.StartsWith('\\') -or (Test-Path -LiteralPath $target)) { throw 'New local directory required' }
# CreateDirectoryW atomically refuses an existing destination and applies the protected
# descriptor at creation. No temporarily inherited directory and no Set-Acl repair.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NativePrivateDirectory {
  [StructLayout(LayoutKind.Sequential)] public struct Attributes {
    public int Length; public IntPtr Descriptor;
    [MarshalAs(UnmanagedType.Bool)] public bool Inherit;
  }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool CreateDirectoryW(string path, ref Attributes attributes);
}
'@
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$descriptor = New-Object Security.AccessControl.RawSecurityDescriptor("O:${sid}G:${sid}D:P(A;OICI;FA;;;${sid})(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)")
$bytes = New-Object byte[] $descriptor.BinaryLength
$descriptor.GetBinaryForm($bytes, 0)
$pointer = [Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
try {
  [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $pointer, $bytes.Length)
  $attributes = New-Object NativePrivateDirectory+Attributes
  $attributes.Length = [Runtime.InteropServices.Marshal]::SizeOf($attributes)
  $attributes.Descriptor = $pointer
  $attributes.Inherit = $false
  if (-not [NativePrivateDirectory]::CreateDirectoryW($target, [ref]$attributes)) {
    throw 'Atomic new private directory creation refused'
  }
} finally { [Runtime.InteropServices.Marshal]::FreeHGlobal($pointer) }
