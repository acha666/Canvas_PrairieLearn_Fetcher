declare const unsafeWindow: Window | undefined;

export type OutputFileHandle = FileSystemFileHandle | null;

export async function pickOutputFile(): Promise<OutputFileHandle> {
  const maybeWindow =
    typeof unsafeWindow !== "undefined"
      ? (unsafeWindow as unknown as { showOpenFilePicker?: (...args: unknown[]) => Promise<FileSystemFileHandle[]> })
      : undefined;
  const openPicker =
    maybeWindow?.showOpenFilePicker?.bind(maybeWindow) ??
    (window as unknown as { showOpenFilePicker?: (...args: unknown[]) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker?.bind(
      window as unknown as Window
    );
  if (!openPicker) {
    return null;
  }
  try {
    const [handle] = await openPicker({
      multiple: false,
      types: [
        {
          description: "Text",
          accept: { "text/plain": [".txt", ".md", ".log", ".c", ".cpp"] },
        },
      ],
      excludeAcceptAllOption: false,
    });
    return handle;
  } catch {
    return null;
  }
}

export async function ensureReadWrite(handle: FileSystemFileHandle): Promise<boolean> {
  const anyHandle = handle as unknown as {
    queryPermission?: (opts: { mode: "read" | "readwrite" }) => Promise<PermissionState | "granted" | "denied" | "prompt">;
    requestPermission?: (opts: { mode: "read" | "readwrite" }) => Promise<PermissionState | "granted" | "denied" | "prompt">;
  };

  if (!anyHandle.queryPermission || !anyHandle.requestPermission) return true;
  const status = await anyHandle.queryPermission({ mode: "readwrite" });
  if (status === "granted") return true;
  const result = await anyHandle.requestPermission({ mode: "readwrite" });
  return result === "granted";
}

export async function writeTextFile(handle: FileSystemFileHandle, text: string): Promise<void> {
  const ok = await ensureReadWrite(handle);
  if (!ok) throw new Error("Permission not granted for the output file");
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

export function fileName(handle: OutputFileHandle): string {
  return handle?.name ?? "not selected";
}
