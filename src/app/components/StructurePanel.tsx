import { useState } from 'react';
import type { TextAnalysis } from '../../core/api';
import type { Program, StageDef, SpriteDef, BodyItem, Stmt, FuncDef, EventDef } from '../../core/lang/ast';
import { typeToString } from '../../core/lang/ast';
import { printHat, printStmts, printExpr } from '../../core/lang/printer';
import { IconChevronDown, IconChevronRight } from './Icons';
import { t } from '../i18n';

interface Props {
  analysis: TextAnalysis | null;
}

type Kind = 'stage' | 'sprite' | 'var' | 'list' | 'costume' | 'sound' | 'def' | 'event' | 'config' | 'stmt';

interface Node {
  id: string;
  kind: Kind;
  kindLabel: string;
  label: string;
  sub?: string;
  children?: Node[];
}

const KIND_LABEL: Record<Kind, string> = {
  stage: t('ステージ', 'Stage'), sprite: t('スプライト', 'Sprite'), var: t('変数', 'Variable'), list: t('リスト', 'List'),
  costume: t('コスチューム', 'Costume'), sound: t('音', 'Sound'), def: t('定義', 'Definition'), event: t('イベント', 'Event'),
  config: t('設定', 'Setting'), stmt: t('文', 'Statement'),
};

function stmtNodes(stmts: Stmt[], prefix: string): Node[] {
  return stmts.map((s, i) => {
    const lines = printStmts([s], 0);
    const first = (lines[0] ?? '').trim();
    const rest = lines.length > 1 ? lines.slice(1).filter(l => l.trim()).map(l => l.trim()) : [];
    return {
      id: `${prefix}-s${i}`,
      kind: 'stmt' as Kind,
      kindLabel: KIND_LABEL.stmt,
      label: first.replace(/^#\s*/, '') || t('(空)', '(empty)'),
      sub: rest.length ? `${rest.length + 1} ${t('行', 'lines')}` : undefined,
      children: rest.length ? rest.map((r, j) => ({
        id: `${prefix}-s${i}-${j}`, kind: 'stmt' as Kind, kindLabel: '↳',
        label: r.replace(/^#\s*/, ''),
      })) : undefined,
    };
  });
}

function bodyNodes(body: BodyItem[], prefix: string): Node[] {
  const out: Node[] = [];
  body.forEach((item, i) => {
    const id = `${prefix}-${i}`;
    if (!('decl' in item)) return; // comment / pass はツリーに表示しない
    switch (item.decl) {
      case 'config':
        out.push({ id, kind: 'config', kindLabel: KIND_LABEL.config, label: `${item.key}: ${printExpr(item.value)}` });
        break;
      case 'var': {
        const tags: string[] = [];
        if (item.cloud) tags.push(t('クラウド変数', 'cloud variable'));
        if (item.monitor) tags.push(item.monitor.visible ? t('表示ON', 'visible') : t('表示OFF', 'hidden'));
        out.push({
          id, kind: 'var', kindLabel: KIND_LABEL.var,
          label: `${item.name}: ${typeToString(item.varType)}`,
          sub: `= ${printExpr(item.init)}${tags.length ? ' / ' + tags.join(', ') : ''}`,
        });
        break;
      }
      case 'list':
        out.push({
          id, kind: 'list', kindLabel: KIND_LABEL.list,
          label: `${item.name}: ${typeToString(item.varType)}`,
          sub: `${item.init.length} ${t('要素','items')}${item.monitor ? (item.monitor.visible ? t(' / 表示ON', ' / visible') : t(' / 表示OFF', ' / hidden')) : ''}`,
        });
        break;
      case 'costume':
        out.push({ id, kind: 'costume', kindLabel: KIND_LABEL.costume, label: item.name });
        break;
      case 'sound':
        out.push({ id, kind: 'sound', kindLabel: KIND_LABEL.sound, label: item.name });
        break;
      case 'def': {
        const d = item as FuncDef;
        const params = d.params.map(p => `${p.name}: ${typeToString(p.paramType)}`).join(', ');
        out.push({
          id, kind: 'def', kindLabel: KIND_LABEL.def,
          label: `${d.name}(${params})`,
          sub: `${d.warp ? t('ワープ実行 / ', 'warp / ') : ''}${d.body.length} ${t('文', 'statements')}`,
          children: stmtNodes(d.body, id),
        });
        break;
      }
      case 'event': {
        const e = item as EventDef;
        out.push({
          id, kind: 'event', kindLabel: KIND_LABEL.event,
          label: printHat(e.hat),
          sub: `${e.body.length} ${t('文', 'statements')}`,
          children: stmtNodes(e.body, id),
        });
        break;
      }
    }
  });
  return out;
}

function targetNode(kind: 'stage' | 'sprite', target: StageDef | SpriteDef, idx: number): Node {
  const name = target.decl === 'stage' ? ((target as StageDef).name ?? 'Stage') : (target as SpriteDef).name;
  return {
    id: `t${idx}`,
    kind,
    kindLabel: KIND_LABEL[kind],
    label: name,
    sub: `${target.body.filter(b => 'decl' in b && b.decl === 'event').length} ${t('スクリプト', 'scripts')}`,
    children: bodyNodes(target.body, `t${idx}`),
  };
}

function TreeNode({ node, depth }: { node: Node; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const hasKids = !!node.children?.length;
  return (
    <div className="tree-node">
      <div className="tree-row">
        <span className="tree-caret" onClick={() => hasKids && setOpen(!open)}>
          {hasKids ? (open ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />) : ''}
        </span>
        <span className={`tree-kind kind-${node.kind}`}>{node.kindLabel}</span>
        <span className="tree-label">{node.label}</span>
        {node.sub && <span className="tree-sub">{node.sub}</span>}
      </div>
      {hasKids && open && (
        <div className="tree-children">
          {node.children!.map(c => <TreeNode key={c.id} node={c} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}

export default function StructurePanel({ analysis }: Props) {
  const program: Program | null = analysis?.program ?? null;
  if (!program) {
    return <div className="panel-body"><div className="empty-note">{t('構造を表示するには、有効なコードを入力してください', 'Enter valid code to view its structure.')}</div></div>;
  }
  const targets: Node[] = [];
  if (program.stage) targets.push(targetNode('stage', program.stage, 0));
  program.sprites.forEach((s, i) => targets.push(targetNode('sprite', s, i + 1)));
  if (targets.length === 0) {
    return <div className="panel-body"><div className="empty-note">{t('stage: または sprite: ブロックがありません', 'No stage or sprite declarations found.')}</div></div>;
  }
  return (
    <div className="panel-body">
      <div className="tree">
        {targets.map(n => <TreeNode key={n.id} node={n} depth={0} />)}
      </div>
    </div>
  );
}
