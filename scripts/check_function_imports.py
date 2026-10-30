#!/usr/bin/env python3
"""校验 functions/ 下所有文件的导入名与导出名是否匹配。

node --check 只查语法，查不出「导入了不存在的导出」这类错误 ——
而这正是 Cloudflare Pages 打包失败的原因。
"""
import os, re, sys

# 仓库根 = 本脚本所在目录的上一级（跨平台，不硬编码路径）
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUNCS = os.path.join(BASE, 'functions')

EXPORT_RE = re.compile(r'^export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)', re.M)
EXPORT_CONST_RE = re.compile(r'^export\s+(?:const|let|var|class)\s+([A-Za-z0-9_$]+)', re.M)
EXPORT_LIST_RE = re.compile(r'^export\s*\{([^}]+)\}', re.M)
IMPORT_RE = re.compile(r'import\s+(?:([A-Za-z0-9_$]+)\s*,\s*)?(?:\{([^}]*)\})?\s*from\s*[\'"]([^\'"]+)[\'"]', re.S)
DEFAULT_IMPORT_RE = re.compile(r'import\s+([A-Za-z0-9_$]+)\s+from\s*[\'"]([^\'"]+)[\'"]')


def exports_of(path):
    src = open(path, encoding='utf-8', errors='ignore').read()
    names = set(EXPORT_RE.findall(src))
    names |= set(EXPORT_CONST_RE.findall(src))
    for group in EXPORT_LIST_RE.findall(src):
        for part in group.split(','):
            part = part.strip()
            if not part:
                continue
            names.add(part.split(' as ')[-1].strip())
    return names


def resolve(spec, from_file):
    if not spec.startswith('.'):
        return None
    base = os.path.normpath(os.path.join(os.path.dirname(from_file), spec))
    if os.path.isfile(base):
        return base
    if os.path.isfile(base + '.js'):
        return base + '.js'
    if os.path.isfile(os.path.join(base, 'index.js')):
        return os.path.join(base, 'index.js')
    return False


def walk(d):
    for e in os.scandir(d):
        if e.is_dir():
            yield from walk(e.path)
        elif e.name.endswith('.js'):
            yield e.path


def main():
    problems = 0
    checked = 0
    for f in walk(FUNCS):
        src = open(f, encoding='utf-8', errors='ignore').read()
        rel = os.path.relpath(f, BASE)

        for m in IMPORT_RE.finditer(src):
            default_name = m.group(1)
            named = m.group(2) or ''
            spec = m.group(3)
            target = resolve(spec, f)
            if target is None:
                continue  # 裸模块（node_modules），跳过
            if target is False:
                print(f'  ✗ {rel}: 找不到模块 {spec}')
                problems += 1
                continue
            avail = exports_of(target)
            wanted = []
            if default_name:
                wanted.append(default_name)
            for part in named.split(','):
                part = part.strip()
                if not part:
                    continue
                wanted.append(part.split(' as ')[0].strip())
            missing = [w for w in wanted if w not in avail]
            checked += 1
            if missing:
                print(f'  ✗ {rel}: 从 {spec} 导入了不存在的: {", ".join(missing)}')
                print(f'      该模块实际导出: {", ".join(sorted(avail)) or "(无)"}')
                problems += 1

        for m in DEFAULT_IMPORT_RE.finditer(src):
            spec = m.group(2)
            target = resolve(spec, f)
            if target is False:
                print(f'  ✗ {rel}: 找不到模块 {spec}')
                problems += 1

    print(f'\n检查了 {checked} 处导入，问题数: {problems}')
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
