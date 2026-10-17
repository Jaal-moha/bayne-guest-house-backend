#!/usr/bin/env python3
"""Register the on-prem runner using an already authenticated repository admin."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tarfile
import urllib.request


def github(path, method='GET'):
    result = subprocess.run(['gh', 'api', '--method', method, path],
                            capture_output=True, text=True)
    if result.returncode:
        raise SystemExit('GitHub refused runner registration. Authenticate a repository '
                         'owner/admin with gh first. No token was displayed.')
    return json.loads(result.stdout)


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', required=True, help='GitHub owner/repository')
    args = parser.parse_args()
    repo = args.repo
    root = Path.home() / '.local/share/almis/runner'
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    if (root / '.runner').exists():
        existing = json.loads((root / '.runner').read_text())
        if existing.get('gitHubUrl', '').rstrip('/').lower() != f'https://github.com/{repo}'.lower():
            raise SystemExit('Runner is registered to another repository. Remove that registration first.')
        print('Runner is already registered. Start it with ' + str(root / 'run.sh'))
        return
    # Check authorization before downloading anything. Keep the token out of logs.
    registration = github(f'repos/{repo}/actions/runners/registration-token', 'POST')
    release = github('repos/actions/runner/releases/latest')
    asset = next(a for a in release['assets']
                 if a['name'].startswith('actions-runner-linux-x64-') and a['name'].endswith('.tar.gz'))
    digest = asset.get('digest', '')
    if not digest.startswith('sha256:'):
        raise SystemExit('Release has no SHA-256 digest; verify the runner archive manually.')
    archive = root / asset['name']
    cached = False
    if archive.exists() and archive.stat().st_size == asset['size']:
        with archive.open('rb') as downloaded:
            cached = hashlib.file_digest(downloaded, 'sha256').hexdigest() == digest.removeprefix('sha256:')
    if not cached:
        with urllib.request.urlopen(asset['browser_download_url'], timeout=60) as source, archive.open('wb') as output:
            while chunk := source.read(1024 * 1024):
                output.write(chunk)
    with archive.open('rb') as downloaded:
        actual = hashlib.file_digest(downloaded, 'sha256').hexdigest()
    if actual != digest.removeprefix('sha256:'):
        raise SystemExit('Runner download checksum failed.')
    with tarfile.open(archive) as package:
        package.extractall(root, filter='data')
    # The runner accepts inputs through ACTIONS_RUNNER_INPUT_* environment variables.
    environment = {**os.environ, 'ACTIONS_RUNNER_INPUT_TOKEN': registration['token']}
    subprocess.run([str(root / 'config.sh'), '--unattended', '--url', f'https://github.com/{repo}',
                    '--name', 'almis-onprem', '--labels', 'almis-onprem', '--work', '_work'],
                   cwd=root, env=environment, check=True)
    print('Registered. Start the runner with ' + str(root / 'run.sh'))
    print('Run it under the same host user with Docker and cf CLI access. Configure a service for reboot persistence.')


if __name__ == '__main__':
    main()
