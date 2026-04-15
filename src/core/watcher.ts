import chokidar from "chokidar";
import type { FSWatcher } from "chokidar";
import type { Cache } from "./cache.js";
import type { Scanner } from "./scanner.js";

export class SkillWatcher {
  private readonly watchers: FSWatcher[] = [];

  constructor(
    private readonly scanner: Scanner,
    private readonly cache: Cache,
  ) {}

  start(): void {
    for (const root of this.scanner.getRoots()) {
      const watcher = chokidar.watch(root.path, {
        ignored: (p) =>
          p.includes("node_modules") ||
          p.includes(`${root.path}/.git`) ||
          p.endsWith(".log"),
        ignoreInitial: true,
        persistent: true,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50,
        },
      });

      const invalidate = () => this.cache.invalidate();
      watcher.on("add", invalidate);
      watcher.on("change", invalidate);
      watcher.on("unlink", invalidate);
      watcher.on("addDir", invalidate);
      watcher.on("unlinkDir", invalidate);

      this.watchers.push(watcher);
    }
  }

  async stop(): Promise<void> {
    await Promise.all(this.watchers.map((w) => w.close()));
    this.watchers.length = 0;
  }
}
