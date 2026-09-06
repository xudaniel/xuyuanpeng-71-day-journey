"""Build the same public files for GitHub Pages and Sites (no runtime dependencies)."""
from pathlib import Path
import shutil, json, base64, mimetypes
root=Path(__file__).resolve().parents[1]
build=root/'dist'
if build.exists(): shutil.rmtree(build)
out=build/'client'
out.mkdir(parents=True,exist_ok=True)
for name in ('index.html','styles.css','itinerary.js','app.js','daily-plan.js','features.js','shared.html','shared.css','shared.js','sw.js','manifest.webmanifest'):
    shutil.copy2(root/name,out/name)
shutil.copytree(root/'assets',out/'assets',dirs_exist_ok=True)
(out/'_headers').write_text('/shared.html\n  Cache-Control: private, no-store\n/api/*\n  Cache-Control: private, no-store\n/sw.js\n  Cache-Control: no-cache\n')
print('Public site built in dist/client/')

assets={}
for item in out.rglob('*'):
    if item.is_file() and item.name!='_headers':
        assets[item.relative_to(out).as_posix()]={'type':mimetypes.guess_type(item.name)[0] or 'application/octet-stream','body':base64.b64encode(item.read_bytes()).decode()}
(root/'server'/'assets.generated.js').write_text('export const publicAssets = '+json.dumps(assets)+';\n')
