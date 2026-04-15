# Claude Skills MCP Server 設計書 v4

## 1. 目的

LM Studio（およびMCP対応の他クライアント）から、Claude Code公式のスキルをそのまま利用可能にする。

## 2. スコープ

- 対応: Claude Code公式スキル形式（`SKILL.md` + 任意のサポートファイル）
- 対応スキル配置:
  - `~/.claude/skills/{skill-name}/SKILL.md` （personal, デフォルトスキャン対象）
  - `additional_paths` で指定された任意ディレクトリ配下の `{skill-name}/SKILL.md`（追加スキャン対象）
- 非対応: enterprise managed, plugin, `--add-dir`（Claude Code固有）、`.claude/commands/`

## 3. スキル構造（公式）

```
skill-name/
├── SKILL.md          (必須、YAMLフロントマター + Markdown本文)
├── ...任意の追加ファイル（.md, .py, .sh など、構造自由）
└── scripts/ or ...   （任意、SKILL.md 内から参照される）
```

`references/`, `assets/`, `evals/`, `hooks/` などの特別なサブディレクトリ名は**規約でなく単なる慣例**。サーバーは一律にファイル一覧として扱う。

### 3.1 YAMLフロントマター

全フィールド任意だが `description` 推奨。サーバーが認識するのは以下：

| Field | 用途 |
|---|---|
| `name` | スキル名。省略時はディレクトリ名を採用 |
| `description` | `list_skills` に出力。スキル選択の主要トリガー |
| `when_to_use` | 追加のトリガー文脈。`description` に連結して返す |
| `argument-hint` | 引数ヒント（情報のみ、サーバーは act しない） |
| `disable-model-invocation` | 情報のみ返す |
| `user-invocable` | 情報のみ返す |
| `allowed-tools` | 情報のみ返す |
| その他公式フィールド | frontmatter として生データを返す |

description/when_to_use の合計は 1,536文字まで（公式仕様準拠）で切り詰める。

## 4. 設定ファイル（任意）

```json
{
  "additional_paths": [
    "I:/LMStudio/Skills"
  ]
}
```

- 省略可。省略時は `~/.claude/skills/` のみスキャン
- `SKILLS_CONFIG` 環境変数で指定。指定されなければ設定なしで起動

### 4.1 LM Studio mcp.json

```json
{
  "mcpServers": {
    "claude-skills": {
      "command": "node",
      "args": ["C:/Claude/Projects/LMStudioToSkill/dist/index.js"]
    }
  }
}
```

設定ファイルが不要なら `env.SKILLS_CONFIG` も不要。

## 5. スキャン規則

起動時とファイル変更検知時に以下を実行：

1. `~/.claude/skills/` を列挙
2. `additional_paths[]` の各ディレクトリを列挙
3. 各ディレクトリの直下サブディレクトリで `SKILL.md` を持つものを「スキル」として登録
4. 同名衝突時の優先順位: `~/.claude/skills/` > `additional_paths[0]` > `additional_paths[1]` > ...

chokidar で全スキャン対象を再帰監視。ファイル追加・変更・削除でキャッシュ無効化。

## 6. MCPツール

### 6.1 `list_skills`

```yaml
name: list_skills
description: 利用可能なスキルの一覧（name + description）を取得する。コード生成前に呼び出し、該当スキルを選択する。

input: なし

output:
  type: array
  items:
    type: object
    properties:
      name: string
      description: string       # description + when_to_use（合計1,536文字でcut）
      location: string          # "personal" | "additional:{path}"
```

### 6.2 `get_skill`

```yaml
name: get_skill
description: 指定スキルのSKILL.md本文と、同ディレクトリ内のサポートファイル一覧を取得する。スキル使用前に必ず呼ぶ。

input:
  name: string (required)

output:
  type: object
  properties:
    name: string
    description: string
    frontmatter: object       # 生のfrontmatter全体
    content: string           # SKILL.md本文（フロントマター除く）
    files: array              # スキルディレクトリ内の全ファイル（SKILL.md 除く、再帰相対パス）
      items: string
```

### 6.3 `read_skill_file`

```yaml
name: read_skill_file
description: スキルディレクトリ内のサポートファイルを読む。SKILL.md の指示に従い、必要なファイルのみ取得する。

input:
  skill_name: string (required)
  path: string (required)      # スキルディレクトリからの相対パス

output:
  type: object
  properties:
    path: string
    content: string
```

パスは `..` を拒否し、スキルディレクトリから外に抜けないことを検証する。

## 7. エラーコード

| コード | 意味 |
|---|---|
| `SKILL_NOT_FOUND` | 指定スキル名が全スキャン対象に存在しない |
| `FILE_NOT_FOUND` | `read_skill_file` のパスが存在しない or スキル外 |
| `SCAN_PATH_INACCESSIBLE` | `additional_paths` の指定パスが存在しない |
| `CONFIG_ERROR` | `SKILLS_CONFIG` のJSON不正 |

## 8. 実装

### 8.1 技術スタック

| コンポーネント | 選択 |
|---|---|
| 言語 | TypeScript |
| ランタイム | Node.js 20+ |
| MCP SDK | @modelcontextprotocol/sdk |
| YAML | yaml |
| ファイル監視 | chokidar |

### 8.2 ディレクトリ構造

```
claude-skills-mcp/
├── src/
│   ├── index.ts
│   ├── server.ts
│   ├── tools/
│   │   ├── list-skills.ts
│   │   ├── get-skill.ts
│   │   └── read-skill-file.ts
│   ├── core/
│   │   ├── config.ts        # 任意のconfig.json読み込み
│   │   ├── scanner.ts       # スキャンロケーション列挙、SkillEntry構築
│   │   ├── skill.ts         # SKILL.mdパース、キャッシュ
│   │   ├── cache.ts
│   │   └── watcher.ts
│   └── types/
│       └── index.ts
├── config.example.json
├── package.json
└── tsconfig.json
```

### 8.3 frontmatter切り詰めロジック

```
combined = description + (when_to_use ? "\n" + when_to_use : "")
if (combined.length > 1536) combined = combined.slice(0, 1536)
return combined
```

## 9. 使用フロー

```
User → LM Studio → LLM:
  "Codexに相談するスキルある？"

LLM:
  1. list_skills()
     → [ { name: "codex-subscription", description: "..." }, ... ]
  2. get_skill("codex-subscription")
     → SKILL.md本文 + files一覧
  3. 必要に応じて read_skill_file(name, "scripts/run.sh") 等で補助ファイル取得
  4. 指示に従って実行
```

## 10. 参考

- [Claude Code Skills docs](https://code.claude.com/docs/en/skills)
- [Agent Skills open standard](https://agentskills.io)
- [Model Context Protocol](https://modelcontextprotocol.io/)
