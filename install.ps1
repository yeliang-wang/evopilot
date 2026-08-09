param(
  [string]$Dir = $env:EVOPILOT_INSTALL_DIR,
  [string]$Version = $env:EVOPILOT_INSTALL_VERSION,
  [string]$Package = $env:EVOPILOT_INSTALL_PACKAGE,
  [string]$PackageSpec = $env:EVOPILOT_INSTALL_PACKAGE_SPEC,
  [string]$ManifestUrl = $env:EVOPILOT_INSTALL_MANIFEST_URL,
  [switch]$Start,
  [switch]$Force,
  [switch]$SkipVerify,
  [switch]$SkipManifest,
  [switch]$DryRun,
  [switch]$Help
)

$ErrorActionPreference = "Stop"

if (-not $Version) { $Version = "2.5.0" }
if (-not $Dir) { $Dir = "evopilot-stack" }
if (-not $Package) { $Package = "create-evopilot" }
if (-not $ManifestUrl) { $ManifestUrl = "https://raw.githubusercontent.com/yeliang-wang/evopilot/v$Version/installers/manifest.json" }

function Show-Help {
  Write-Output @"
EvoPilot self-host installer for Windows PowerShell

Usage:
  .\install.ps1 [-Dir evopilot-stack] [-Start] [-Force] [-SkipVerify] [-SkipManifest] [-DryRun]

Environment:
  EVOPILOT_INSTALL_VERSION       create-evopilot version. Default: $Version
  EVOPILOT_INSTALL_DIR           output directory. Default: $Dir
  EVOPILOT_INSTALL_PACKAGE       npm package name. Default: $Package
  EVOPILOT_INSTALL_PACKAGE_SPEC  npm/npx package spec override. Default: manifest tarball URL, or $Package@$Version with -SkipManifest
  EVOPILOT_INSTALL_MANIFEST_URL  release manifest URL. Default: $ManifestUrl
"@
}

function Fail($Message) {
  Write-Error "install.ps1: $Message"
  exit 1
}

function Require-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Fail "$Name is required. Install Node.js 22+ before running this installer."
  }
}

function Assert-NodeVersion {
  $major = [int](& node -p "Number(process.versions.node.split('.')[0])")
  if ($major -lt 22) {
    Fail "Node.js 22+ is required. Current version: $(& node -v)"
  }
}

function Test-Manifest {
  if ($SkipManifest) { return $null }
  $tempFile = [System.IO.Path]::GetTempFileName()
  try {
    Invoke-WebRequest -Uri $ManifestUrl -OutFile $tempFile -UseBasicParsing
    $manifest = Get-Content $tempFile -Raw | ConvertFrom-Json
    if ($manifest.version -ne $Version) {
      Fail "manifest version $($manifest.version) does not match installer version $Version"
    }
    $packageEntry = $manifest.packages.$Package
    if (-not $packageEntry -or $packageEntry.version -ne $Version) {
      Fail "manifest package $Package does not pin version $Version"
    }
    if (-not $manifest.installers.'install.ps1'.sha256) {
      Fail "manifest must include install.ps1 checksum"
    }
    if ($packageEntry.packageSpec) { return $packageEntry.packageSpec }
    if ($packageEntry.tarballUrl) { return $packageEntry.tarballUrl }
    return "$Package@$Version"
  } finally {
    Remove-Item -Force $tempFile -ErrorAction SilentlyContinue
  }
}

if ($Help) {
  Show-Help
  exit 0
}

Require-Command node
Require-Command npm
Assert-NodeVersion
if (-not $PackageSpec) {
  if ($SkipManifest) {
    $PackageSpec = "$Package@$Version"
  } else {
    $PackageSpec = Test-Manifest
  }
} else {
  $null = Test-Manifest
}

$argsList = @("self-host", "--dir", $Dir, "--init-env")
if ($Start) { $argsList += "--start" }
if ($Force) { $argsList += "--force" }
if ($SkipVerify) { $argsList += "--skip-verify" }

if ($DryRun) {
  Write-Output ("npx --yes {0} {1}" -f $PackageSpec, ($argsList -join " "))
  exit 0
}

& npx --yes "$PackageSpec" @argsList
