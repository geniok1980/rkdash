import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 600;

const execFileAsync = promisify(execFile);

/**
 * Запускает `hermes update` на машине, где крутится Next.js.
 * Имеет смысл только если Hermes установлен в PATH и совпадает HERMES_HOME с целевым агентом.
 */
export async function POST() {
  const cmd = process.env.HERMES_CLI_PATH?.trim() || 'hermes';
  try {
    const { stdout, stderr } = await execFileAsync(cmd, ['update'], {
      timeout: 590_000,
      windowsHide: true,
      env: process.env
    });
    return NextResponse.json({
      ok: true,
      log: [stdout, stderr].filter(Boolean).join('\n')
    });
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException & { stdout?: Buffer; stderr?: Buffer };
    const log = [err.stdout?.toString(), err.stderr?.toString()].filter(Boolean).join('\n');
    return NextResponse.json(
      {
        ok: false,
        error: err.message || 'hermes update failed',
        code: err.code,
        log: log || undefined,
        hint: 'Убедись, что Hermes в PATH (или используй WSL/Linux), и что процесс Next имеет право вызывать hermes.'
      },
      { status: 500 }
    );
  }
}
