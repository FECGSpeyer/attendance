# Edge Functions automatisch auf den VPS

Jeder Push auf `main`, der `supabase/functions/**` ändert, startet den Workflow
`.github/workflows/deploy-functions.yml` (von Hand: Actions → „Deploy Edge
Functions“ → „Run workflow“). Er packt `supabase/functions/` und schickt das
Archiv per SSH an den VPS. Dort nimmt das Skript `attendix-deploy-functions`
es entgegen:

- kopiert jeden Function-Ordner nach `volumes/functions/<name>/` (Dateien, die
  im Repo gelöscht wurden, verschwinden auch dort),
- lässt `main/` (Router mit der `PUBLIC_FUNCTIONS`-Ausnahme) und aus diesem
  Repo `synonyms-gpt` (die Fassung aus dem Flutter-Repo ist die gültige) in Ruhe,
- löscht keine Function-Ordner, die nicht im Upload sind (Flutter-Functions),
- startet `docker compose restart functions` nur, wenn sich etwas geändert hat,
  und prüft danach, dass der Container wieder läuft.

Neue Secrets für Functions kommen weiterhin von Hand in die `.env` des Stacks
(danach `docker compose up -d --force-recreate functions`). Eine neue Function,
die ohne JWT erreichbar sein muss, gehört zusätzlich in `PUBLIC_FUNCTIONS` in
`volumes/functions/main/index.ts`.

## Einrichtung (einmalig, als root auf dem VPS)

```bash
# 1. Skript installieren (läuft als root, deshalb nicht automatisch aktualisiert)
cd /opt/stack/attendix/attendance && git pull
install -o root -g root -m 755 deploy/vps/functions/attendix-deploy-functions /usr/local/sbin/

# 2. deploy darf genau dieses Skript als root starten
echo 'deploy ALL=(root) NOPASSWD: /usr/local/sbin/attendix-deploy-functions' > /etc/sudoers.d/attendix-functions
chmod 440 /etc/sudoers.d/attendix-functions
visudo -c

# 3. Eigener Schlüssel, der nur dieses Skript auslösen kann
ssh-keygen -t ed25519 -N '' -C functions-deploy -f /root/functions-deploy
echo "command=\"sudo -n /usr/local/sbin/attendix-deploy-functions \\\"\$SSH_ORIGINAL_COMMAND\\\"\",restrict $(cat /root/functions-deploy.pub)" \
  >> /home/deploy/.ssh/authorized_keys
cat /root/functions-deploy      # Inhalt → GitHub-Secret VPS_FUNCTIONS_SSH_KEY
rm /root/functions-deploy /root/functions-deploy.pub
```

GitHub-Secrets im Repo `FECGSpeyer/attendance` (Settings → Secrets and
variables → Actions): `VPS_HOST`, `VPS_USER` (= `deploy`),
`VPS_FUNCTIONS_SSH_KEY`, optional `VPS_KNOWN_HOSTS` (Ausgabe von
`ssh-keyscan <VPS-IP>`).

Fehlen die Secrets, endet der Workflow grün mit einer Warnung und deployt nichts.
