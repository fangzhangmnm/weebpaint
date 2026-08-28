import argparse, json, glob, re, os, sys
# 人类语料抽取（出处核查用）。两个通道缺一不可：
#   ① type=user 的文本回合；② type=queue-operation 的 enqueue（用户在 AI 干活时排队塞的消息）。
# ②是 2026-08-25 补的——2026-08-21 审计只扫①，把「E1 E2 E3批准」「禁用云的时候应该所有用户路线都走
# blockbench模式」等排队原话全漏了，产生过一起「伪造用户原话」冤案（详 WeebPaint
# ai-docs/20260821-opus-round-rollback-and-security-handoff.md 的 2026-08-25 更正节）。
SKIP = re.compile(r'<system-reminder>|<command-name>|<local-command|tool_use_error|\[Request interrupted|<ide_opened_file>|<task-notification>')
def extract(files, out):
    n = 0
    with open(out, 'w') as o:
        for fp in sorted(files, key=os.path.getmtime):
            for line in open(fp, encoding='utf-8', errors='replace'):
                try: d = json.loads(line)
                except: continue
                if d.get('isSidechain'): continue
                texts = []
                if d.get('type') == 'user':
                    c = d.get('message', {}).get('content')
                    if isinstance(c, str): texts = [c]
                    elif isinstance(c, list): texts = [b.get('text','') for b in c if isinstance(b,dict) and b.get('type')=='text']
                elif d.get('type') == 'queue-operation' and d.get('operation') == 'enqueue':
                    # remove/dequeue 是投递记账，内容与 enqueue 重复，只取 enqueue
                    c = d.get('content')
                    if isinstance(c, str): texts = [c]
                for t in texts:
                    t = t.strip()
                    if t and not SKIP.search(t):
                        o.write('### ' + t + '\n\n'); n += 1
    return n
base = os.path.expanduser('~/.claude/projects')
# 2026-08-28 前这里裸拿 sys.argv[1]：agent 用 --help/--list 探用法，输出目录字面叫「--help」落在
# WeebPaint 仓根，被 add -A 扫进公开仓（transcript 语料外泄，当天历史重写清除）。故：
#   ① argparse——--help 是帮助，未知旗标报错；② 输出目录落在任何 git 仓内一律拒绝（语料只许去 tmp/私有归档）。
ap = argparse.ArgumentParser(description='人类语料抽取（出处核查用），输出每项目一个 md')
ap.add_argument('outdir', nargs='?', default=os.path.join(os.environ.get('CLAUDE_JOB_DIR') or '/tmp', 'tmp', 'userlogs'),
                help='输出目录（默认 $CLAUDE_JOB_DIR/tmp/userlogs；不许指到 git 仓内）')
outdir = os.path.abspath(ap.parse_args().outdir)
p = outdir
while True:
    if os.path.exists(os.path.join(p, '.git')):
        sys.exit(f'拒绝：输出目录 {outdir} 在 git 仓 {p} 内——语料不直接抽进任何 repo（2026-08-28 外泄教训）；先抽到 tmp，要归档再人为拷进私有语料仓')
    parent = os.path.dirname(p)
    if parent == p: break
    p = parent
os.makedirs(outdir, exist_ok=True)
# 迁移史：2026-08-18 JupyterLocal→WSL，前缀换家；两个都认、同名合并（否则后扫的覆盖先扫的，语料静默变半截）
PREFIXES = ('-home-fangzhangmnm-jupyter-20260601-PWAProjects', '-mnt-d-JupyterLocal-20260601-PWAProjects')
groups = {}
for d in sorted(os.listdir(base)):
    if not d.startswith(PREFIXES): continue
    name = re.sub(r'.*PWAProjects-*', '', d) or 'CLUSTER-ROOT'
    groups.setdefault(name, []).extend(glob.glob(os.path.join(base, d, '*.jsonl')))
for name, files in sorted(groups.items()):
    # 同一 session 迁移时被拷进过两个前缀目录 → 按文件名去重，取字节多的（内容是前缀关系，长者全包含）
    by_id = {}
    for f in files:
        k = os.path.basename(f)
        if k not in by_id or os.path.getsize(f) > os.path.getsize(by_id[k]): by_id[k] = f
    files = list(by_id.values())
    if not files: continue
    n = extract(files, os.path.join(outdir, name + '.md'))
    print(f'{name}: {n} msgs')
