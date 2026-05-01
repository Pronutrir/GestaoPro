param([string]$src, [string]$dst)

function Transform-Page($srcFile, $dstFile) {
  $c = [System.IO.File]::ReadAllText($srcFile)
  # 1. 'use client' no topo
  if (-not $c.StartsWith("'use client'")) { $c = "'use client';`n" + $c }
  # 2. Remover import AppLayout
  $c = $c -replace "import \{ AppLayout \} from `"@/components/AppLayout`";\r?\n", ""
  $c = $c -replace "import \{ AppLayout \} from '@/components/AppLayout';\r?\n", ""
  # 3. react-router-dom imports → next/navigation
  $c = $c -replace "import \{ useNavigate, useSearchParams \} from `"react-router-dom`";", "import { useRouter, useSearchParams } from 'next/navigation';"
  $c = $c -replace "import \{ useSearchParams, useNavigate \} from `"react-router-dom`";", "import { useSearchParams, useRouter } from 'next/navigation';"
  $c = $c -replace "import \{ useNavigate \} from `"react-router-dom`";", "import { useRouter } from 'next/navigation';"
  # 4. useToast → sonner
  $c = $c -replace "import \{ useToast \} from `"@/hooks/use-toast`";\r?\n", "import { toast } from 'sonner';`n"
  # 5. const navigate → const router
  $c = $c -replace "const navigate = useNavigate\(\);", "const router = useRouter();"
  # 6. Remover const { toast } = useToast()
  $c = $c -replace "[ \t]*const \{ toast \} = useToast\(\);\r?\n", ""
  # 7. navigate( → router.push(
  $c = $c -replace "(?<![a-zA-Z_\$])navigate\(", "router.push("
  # 8. toast calls destructive (com description)
  $c = $c -replace 'toast\(\{ title: "([^"]+)", description: ([^,\}]+), variant: "destructive" \}\)', 'toast.error("$1")'
  # 9. toast calls destructive simples
  $c = $c -replace 'toast\(\{ title: "([^"]+)", variant: "destructive" \}\)', 'toast.error("$1")'
  # 10. toast success
  $c = $c -replace 'toast\(\{ title: "([^"]+)", description: [^,\}]+ \}\)', 'toast.success("$1")'
  $c = $c -replace 'toast\(\{ title: "([^"]+)" \}\)', 'toast.success("$1")'
  # 11. AppLayout wrapper → remover e deixar conteúdo
  $c = $c -replace "<AppLayout[^>]*>(\r?\n)?", ""
  $c = $c -replace "</AppLayout>", ""
  [System.IO.File]::WriteAllText($dstFile, $c)
  Write-Host "OK: $dstFile"
}

$pages = @(
  @{src="Roadmap";dst="roadmap"},
  @{src="OKRs";dst="okrs"},
  @{src="TeamView";dst="team"},
  @{src="Settings";dst="settings"},
  @{src="CSC";dst="csc"},
  @{src="Investments";dst="investments"},
  @{src="QualityManagement";dst="quality"},
  @{src="Trash";dst="trash"},
  @{src="Timeline";dst="timeline"},
  @{src="Calendario";dst="calendar"},
  @{src="BlockedProjects";dst="blocked"},
  @{src="Reports";dst="reports"},
  @{src="Setup";dst="setup"}
)

foreach ($p in $pages) {
  $srcFile = "src\legacy\pages\$($p.src).tsx"
  $dstFile = "src\app\(dashboard)\$($p.dst)\page.tsx"
  Transform-Page $srcFile $dstFile
}
