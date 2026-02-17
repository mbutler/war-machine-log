import fs from 'fs/promises';
import path from 'path';
import { LogEntry } from './types.ts';

export class Logger {
  constructor(private readonly dir: string) {}

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  async log(entry: LogEntry): Promise<void> {
    await this.ensureDir();
    const textLine = this.formatText(entry) + '\n';
    const jsonLine = JSON.stringify(this.formatJson(entry)) + '\n';

    await Promise.all([
      fs.appendFile(path.join(this.dir, 'events.log'), textLine, 'utf8'),
      fs.appendFile(path.join(this.dir, 'events.jsonl'), jsonLine, 'utf8'),
    ]);

    // Also surface to console for live viewing.
    process.stdout.write(textLine);
  }

  private formatText(entry: LogEntry): string {
    const ts = entry.worldTime.toISOString();
    const loc = entry.location ? ` @ ${entry.location}` : '';
    const actors = entry.actors?.length ? ` [${entry.actors.join(', ')}]` : '';
    const details = entry.details ? ` — ${entry.details}` : '';
    return `${ts} [${entry.category}]${loc}${actors} ${entry.summary}${details}`;
  }

  private formatJson(entry: LogEntry) {
    return {
      ...entry,
      worldTime: entry.worldTime.toISOString(),
      realTime: entry.realTime.toISOString(),
    };
  }
}

