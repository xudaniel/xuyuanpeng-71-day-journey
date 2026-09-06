"""Build a portable static site without third-party dependencies."""
from pathlib import Path
import shutil
root = Path(__file__).resolve().parents[1]
out = root / 'dist'
out.mkdir(exist_ok=True)
for name in ('index.html', 'styles.css', 'itinerary.js', 'app.js'):
    shutil.copy2(root / name, out / name)
shutil.copytree(root / 'assets', out / 'assets', dirs_exist_ok=True)
print('Static site built in dist/')
