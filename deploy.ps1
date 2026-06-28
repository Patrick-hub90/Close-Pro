# Déploiement Close-Pro : pousse en production ET garde le raccourci closepro.vercel.app à jour.
# Usage : .\deploy.ps1
$out = npx vercel@latest --prod --yes 2>&1 | Out-String
Write-Output $out
$dep = ([regex]::Match($out, 'https://close-[a-z0-9]+-charlesbaguidi03-3429s-projects\.vercel\.app')).Value
if ($dep) {
  npx vercel@latest alias set $dep closepro.vercel.app 2>&1 | Select-String "Success|Error"
} else {
  Write-Output "[deploy] URL de deploiement introuvable - reassigner closepro manuellement."
}
