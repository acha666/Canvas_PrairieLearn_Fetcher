declare const unsafeWindow: Window | undefined;

export type OutputFileHandle = FileSystemFileHandle | null;

export async function pickOutputFile(): Promise<OutputFileHandle> {
  let openPicker: typeof showOpenFilePicker | undefined;

  if (typeof unsafeWindow !== "undefined" && "showOpenFilePicker" in unsafeWindow) {
    openPicker = (unsafeWindow as Window & { showOpenFilePicker: typeof showOpenFilePicker }).showOpenFilePicker?.bind(unsafeWindow);
  } else if (typeof showOpenFilePicker !== "undefined") {
    openPicker = showOpenFilePicker;
  }

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
  if (!handle.queryPermission || !handle.requestPermission) return true;
  const status = await handle.queryPermission({ mode: "readwrite" });
  if (status === "granted") return true;
  const result = await handle.requestPermission({ mode: "readwrite" });
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
