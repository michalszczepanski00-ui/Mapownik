from pathlib import Path
import json
r=Path(__file__).resolve().parents[1]
p=json.loads((r/'data/source-profiles.json').read_text())['sources']
a=next(r.glob('app-*/data/catalog/sourceProfiles.js'))
a.write_text('// Generated from data/source-profiles.json. Rebuild with tools/build_source_profiles.py.\nexport const sourceProfiles = '+json.dumps(p,ensure_ascii=False,separators=(',',':'))+';\n')
