from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parent.parent
source = root / 'build' / 'addon'
manifest = json.loads((source / 'manifest.json').read_text(encoding='utf-8'))
output = root / 'dist' / ('zotero-moonlight-' + manifest['version'] + '.xpi')
output.parent.mkdir(exist_ok=True)
files = ['bootstrap.js', 'content/settings.js', 'content/settings.xhtml', 'manifest.json', 'moonlight.js']
files += [f'content/icons/icon-{size}.png' for size in [16, 32, 48, 96, 128, 256]]
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    # Explicit contents prevent stale build files or test harnesses from shipping.
    for relative in files:
        file = source / relative
        info = zipfile.ZipInfo(relative, (2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, file.read_bytes())
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert set(files) == set(archive.namelist())
    assert set(manifest['icons'].values()) <= set(archive.namelist())
digest = hashlib.sha256(output.read_bytes()).hexdigest()
(output.parent / 'SHA256SUMS').write_text(f'{digest}  {output.name}\n', encoding='utf-8')
print(f'Built {output.name} ({output.stat().st_size} bytes)')
