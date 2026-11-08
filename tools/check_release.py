#!/usr/bin/env python3
"""Portable release gate: AST, ESM parsing, inline scripts, Bash and local asset graph.
Node and Python are required; PHP is checked if available. Never downloads packages.
"""
from pathlib import Path
import ast
from html.parser import HTMLParser
import json
import re
import shutil
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
failures=[];counts={};skipped=[]
def fail(path,message):failures.append({'file':str(path.relative_to(ROOT)),'error':message})
class Scripts(HTMLParser):
    def __init__(self):super().__init__();self.parts=[];self.active=None
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='script' and not attrs.get('src') and attrs.get('type','') not in ('importmap','application/json'):
            self.active=[]
    def handle_data(self,data):
        if self.active is not None:self.active.append(data)
    def handle_endtag(self,tag):
        if tag=='script' and self.active is not None:
            self.parts.append(''.join(self.active));self.active=None

def syntax_js(path,text):
    result=subprocess.run(['node','--input-type=module','--check'],input=text,text=True,capture_output=True)
    # Some hosted Node wrappers can return 0 while reporting parser errors.
    if result.returncode or 'SyntaxError' in result.stderr:fail(path,result.stderr[:2000])

if not shutil.which('node'):raise SystemExit('Node.js is required.')
for suffix in ('py','js','sh','php','html'):
    paths=[p for p in ROOT.rglob('*.'+suffix) if 'vendor' not in p.relative_to(ROOT).parts and '__pycache__' not in p.parts]
    counts[suffix]=len(paths)
    for p in paths:
        text=p.read_text(encoding='utf-8-sig')
        if suffix=='py':
            try:ast.parse(text)
            except SyntaxError as exc:fail(p,str(exc))
        elif suffix=='js':syntax_js(p,text)
        elif suffix=='sh':
            if shutil.which('bash'):
                r=subprocess.run(['bash','-n',str(p)],capture_output=True,text=True)
                if r.returncode:fail(p,r.stderr)
            else:skipped.append('Bash unavailable')
        elif suffix=='php':
            if shutil.which('php'):
                r=subprocess.run(['php','-l',str(p)],capture_output=True,text=True)
                if r.returncode:fail(p,r.stderr+r.stdout)
            elif 'PHP unavailable' not in skipped:skipped.append('PHP unavailable')
        elif suffix=='html':
            parser=Scripts();parser.feed(text)
            for part in parser.parts:syntax_js(p,part)
version=(ROOT/'VERSION.txt').read_text().strip()
app=ROOT/('app-'+version)
if not app.is_dir():fail(ROOT/'VERSION.txt','Missing versioned application directory')
for p in app.rglob('*.js'):
    for relative in re.findall(r'''(?:from\s*|import\s*\()\s*["'](\.[^"']+)["']''',p.read_text()):
        target=(p.parent/relative.split('?',1)[0]).resolve()
        if not target.is_file():fail(p,'Missing import: '+relative)
# 19.30.0-1: pliki vendor są „immutable” — zmiana treści bez zmiany adresu nie dotrze do przeglądarek.
import hashlib
lock_path=ROOT/'tools'/'vendor-lock.json'
vendor_now={p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((ROOT/'vendor').rglob('*')) if p.is_file()}
if '--update-vendor-lock' in sys.argv:
    lock_path.write_text(json.dumps(vendor_now,indent=1,ensure_ascii=False)+'\n')
elif lock_path.is_file():
    expected=json.loads(lock_path.read_text())
    for path in set(expected).symmetric_difference(vendor_now): fail(ROOT/path,'Niezgodny zestaw plików vendor')
    for path,digest in expected.items():
        if path in vendor_now and vendor_now[path]!=digest:
            fail(ROOT/path,'Plik vendor zmieniony pod tym samym adresem — przeglądarki trzymają starą wersję (immutable). Zmień adres (nowy katalog lub ?v=), potem: check_release.py --update-vendor-lock')
else:fail(lock_path,'Brak tools/vendor-lock.json — utwórz: check_release.py --update-vendor-lock')
print(json.dumps({'version':version,'checked':counts,'failures':failures,'skipped':sorted(set(skipped))},ensure_ascii=False,indent=2))
raise SystemExit(bool(failures))
