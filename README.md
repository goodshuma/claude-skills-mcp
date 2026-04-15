# claude-skills-mcp

LM Studio 等の MCP クライアントから、Claude Code 公式スキル（`~/.claude/skills/`）をそのまま利用可能にする MCP サーバー。

## 特徴

- Claude Code 公式スキル形式に準拠（`SKILL.md` + 任意のサポートファイル）
- `~/.claude/skills/` を自動スキャン（設定ファイル不要で起動可能）
- chokidar によるファイル監視で、スキル追加・変更を即検知
- 追加のスキャンパスを指定可能
- 単一ファイルのバンドル配布（`release/claude-skills-mcp.cjs`）

## ツール

| ツール | 用途 |
|---|---|
| `list_skills` | 利用可能なスキル一覧（name + description） |
| `get_skill` | SKILL.md 本文 + サポートファイル一覧 + frontmatter |
| `read_skill_file` | スキルディレクトリ内の任意ファイルを読む |

## 他のPCへの導入（最短手順）

Node.js 20+ がインストール済みの前提。

1. このリポジトリの [`release/claude-skills-mcp.cjs`](release/claude-skills-mcp.cjs) をダウンロード（または `git clone` 後に `release/` を取得）
2. 任意の場所に置く（例: `C:/Tools/claude-skills-mcp.cjs`）
3. LM Studio の `mcp.json`（`%USERPROFILE%/.lmstudio/mcp.json`）に追記:

   ```json
   {
     "mcpServers": {
       "claude-skills": {
         "command": "node",
         "args": ["C:/Tools/claude-skills-mcp.cjs"]
       }
     }
   }
   ```

4. LM Studio を再起動。`~/.claude/skills/` 配下のスキルが自動で見えます。

これだけ。`npm install` 等のビルド手順は不要です。

## ソースから開発する場合

```bash
git clone https://github.com/goodshuma/claude-skills-mcp.git
cd claude-skills-mcp
npm install
npm run bundle      # release/claude-skills-mcp.cjs を再生成
```

## 設定ファイル（任意）

`~/.claude/skills/` 以外もスキャンしたい場合のみ作成。

```json
{
  "additional_paths": [
    "I:/LMStudio/Skills"
  ]
}
```

`SKILLS_CONFIG` 環境変数でパスを渡す:

```json
{
  "mcpServers": {
    "claude-skills": {
      "command": "node",
      "args": ["C:/Tools/claude-skills-mcp.cjs"],
      "env": {
        "SKILLS_CONFIG": "C:/Tools/claude-skills-config.json"
      }
    }
  }
}
```

- `~/.claude/skills/` は常にスキャン対象
- `additional_paths[]` も同様にスキャン
- 同名スキル衝突時の優先: `~/.claude/skills/` > `additional_paths[0]` > ...

## スキル構造（公式 Claude Code 仕様）

```
skill-name/
├── SKILL.md          (必須、YAMLフロントマター + 本文)
└── ...               (任意のサポートファイル、構造自由)
```

### YAMLフロントマター

```yaml
---
name: skill-name
description: トリガー条件 + 何をするか
when_to_use: 追加のトリガー文脈（任意）
---
```

`description` + `when_to_use` の合計は 1,536 文字で切り詰め（公式仕様）。

## 推奨システムプロンプト

```
claude-skills ツールが使える場合:
- ユーザーのリクエスト処理前に list_skills を呼び、該当スキルがあれば get_skill で読み込む
- SKILL.md 内で特定ファイルが参照されていれば read_skill_file で取得
```

## 開発

```bash
npm run build         # TypeScript ビルド (dist/)
npm run bundle        # 単一ファイルバンドル生成 (release/claude-skills-mcp.cjs)
node test-fixtures/smoke-v4.mjs       # 実 ~/.claude/skills/ に対するスモーク
node test-fixtures/smoke-bundle.mjs   # バンドル経由のスモーク
```

## License

MIT
